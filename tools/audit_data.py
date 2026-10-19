#!/usr/bin/env python3
"""Audit Face Atlas data modules without requiring Node.js."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
ASSET_EXTENSIONS = (".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp", ".woff", ".woff2", ".ttf")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
ID_RE = re.compile(r"^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$")
URL_RE = re.compile(r"https?://[^\s'\"`<>]+")


class Audit:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.warnings: list[str] = []
        self.passes: list[str] = []

    def fail(self, message: str) -> None:
        self.failures.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def passed(self, message: str) -> None:
        self.passes.append(message)

    def require(self, condition: bool, message: str) -> None:
        if not condition:
            self.fail(message)

    def report(self) -> int:
        for message in self.passes:
            print(f"PASS {message}")
        for message in self.warnings:
            print(f"WARN {message}")
        for message in self.failures:
            print(f"FAIL {message}")
        print(
            f"\nSUMMARY {len(self.passes)} passed, "
            f"{len(self.warnings)} warnings, {len(self.failures)} failures"
        )
        return 1 if self.failures else 0


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def load_json_assignment(relative_path: str, prefix: str) -> dict[str, Any]:
    text = read_text(relative_path).strip()
    if not text.startswith(prefix):
        raise ValueError(f"{relative_path} does not start with {prefix!r}")
    payload = text[len(prefix):].strip()
    if payload.endswith(";"):
        payload = payload[:-1]
    if prefix.endswith("(") and payload.endswith(")"):
        payload = payload[:-1]
    value = json.loads(payload)
    if not isinstance(value, dict):
        raise ValueError(f"{relative_path} assignment is not an object")
    return value


def duplicates(values: Iterable[str]) -> list[str]:
    counts = Counter(value for value in values if value)
    return sorted(value for value, count in counts.items() if count > 1)


def missing_fields(item: dict[str, Any], fields: Iterable[str]) -> list[str]:
    return [
        field
        for field in fields
        if field not in item
        or item[field] is None
        or (isinstance(item[field], str) and not item[field].strip())
    ]


def audit_unique_records(
    audit: Audit,
    label: str,
    records: list[dict[str, Any]],
    required: Iterable[str],
    name_scope_fields: tuple[str, ...] = (),
) -> None:
    audit.require(all(isinstance(item, dict) for item in records), f"{label}: every record must be an object")
    duplicate_ids = duplicates(str(item.get("id", "")) for item in records)
    duplicate_names = duplicates(
        "\x1f".join([*(str(item.get(field, "")) for field in name_scope_fields), str(item.get("name", ""))])
        for item in records
    )
    audit.require(not duplicate_ids, f"{label}: duplicate IDs: {', '.join(duplicate_ids)}")
    audit.require(not duplicate_names, f"{label}: duplicate names in the same scope: {', '.join(duplicate_names)}")
    for index, item in enumerate(records):
        missing = missing_fields(item, required)
        if missing:
            audit.fail(f"{label}[{index}] {item.get('id', '<no-id>')}: missing {', '.join(missing)}")
        item_id = str(item.get("id", ""))
        if item_id and not ID_RE.fullmatch(item_id):
            audit.fail(f"{label}[{index}]: malformed ID {item_id!r}")
    if not duplicate_ids and not duplicate_names:
        audit.passed(f"{label}: {len(records)} records have unique IDs and names")


def audit_definition_prompts(
    audit: Audit,
    label: str,
    records: list[dict[str, Any]],
    definition_field: str = "definition",
) -> None:
    short: list[str] = []
    unsynced: list[str] = []
    for item in records:
        definition = str(item.get(definition_field, "")).strip()
        prompt = str(item.get("prompt", "")).strip()
        if len(definition) < 20:
            short.append(str(item.get("id", "?")))
        normalized_definition = definition.rstrip("。；; ")
        if normalized_definition and normalized_definition not in prompt:
            unsynced.append(str(item.get("id", "?")))
    audit.require(not short, f"{label}: definitions shorter than 20 characters: {', '.join(short[:20])}")
    audit.require(not unsynced, f"{label}: prompts do not contain current definitions: {', '.join(unsynced[:20])}")
    if not short and not unsynced:
        audit.passed(f"{label}: definitions and prompts are complete and synchronized")


def audit_face(audit: Audit, data: dict[str, Any]) -> None:
    tags = data.get("tags", [])
    confusions = data.get("confusions", [])
    guides = data.get("dimensionGuides", [])
    applications = data.get("applications", [])
    audit_unique_records(
        audit,
        "face.tags",
        tags,
        ("id", "part", "dimension", "name", "en", "type", "definition", "prompt"),
    )
    audit_definition_prompts(audit, "face.tags", tags)

    names = {item["name"] for item in tags if item.get("name")}
    seen_pairs: set[tuple[str, str]] = set()
    for index, item in enumerate(confusions):
        missing = missing_fields(item, ("pair", "difference", "tip"))
        if missing:
            audit.fail(f"face.confusions[{index}]: missing {', '.join(missing)}")
            continue
        pair = item["pair"]
        endpoints = pair if isinstance(pair, list) else re.split(r"\s+vs\s+", str(pair))
        if len(endpoints) != 2:
            audit.fail(f"face.confusions[{index}]: invalid pair {pair!r}")
            continue
        left, right = (str(value).strip() for value in endpoints)
        for endpoint in (left, right):
            if endpoint not in names:
                audit.fail(f"face.confusions[{index}]: unknown endpoint {endpoint!r}")
        key = tuple(sorted((left, right)))
        if key in seen_pairs:
            audit.fail(f"face.confusions[{index}]: duplicate or reversed pair {left!r} / {right!r}")
        seen_pairs.add(key)
    if len(seen_pairs) == len(confusions):
        audit.passed(f"face.confusions: {len(confusions)} valid, unique pairs")

    audit.require(all(isinstance(item, str) and item.strip() for item in guides), "face.dimensionGuides: empty or invalid guide")
    audit.require(not duplicates(str(item) for item in guides), "face.dimensionGuides: duplicate guides")
    audit.require(all(item.get("part") and item.get("use") for item in applications), "face.applications: missing part or use")
    audit.passed(
        f"face collections loaded: {len(tags)} tags, {len(guides)} guides, {len(applications)} applications"
    )


def audit_beauty(audit: Audit, data: dict[str, Any]) -> None:
    specs = {
        "products": ("id", "category", "name", "en", "form", "finish", "description", "prompt"),
        "shades": ("id", "kind", "name", "en", "family", "hex", "description", "prompt"),
        "finishes": ("id", "dimension", "name", "en", "definition", "prompt"),
        "styles": ("id", "family", "name", "en", "definition", "prompt"),
        "nails": ("id", "dimension", "name", "en", "definition", "prompt"),
    }
    for key, required in specs.items():
        records = data.get(key, [])
        scope = ("category",) if key == "products" else ("kind",) if key == "shades" else ()
        audit_unique_records(audit, f"beauty.{key}", records, required, scope)
        if key in {"finishes", "styles", "nails"}:
            audit_definition_prompts(audit, f"beauty.{key}", records)

    for item in data.get("shades", []):
        if not HEX_RE.fullmatch(str(item.get("hex", ""))):
            audit.fail(f"beauty.shades {item.get('id', '?')}: invalid hex {item.get('hex')!r}")

    counts = data.get("meta", {}).get("counts", {})
    for key in specs:
        expected = counts.get(key)
        actual = len(data.get(key, []))
        audit.require(expected == actual, f"beauty.meta.counts.{key}: expected {expected}, actual {actual}")
    audit.passed("beauty.meta counts match collection lengths")


def parse_static_ids(text: str, pattern: str) -> list[str]:
    return re.findall(pattern, text, flags=re.MULTILINE)


def audit_static_modules(audit: Audit) -> None:
    body_text = read_text("body-data.js")
    body_ids = parse_static_ids(body_text, r"\btag\(\s*['\"]([^'\"]+)['\"]")
    body_names = parse_static_ids(body_text, r"\btag\(\s*['\"][^'\"]+['\"]\s*,(?:\s*['\"][^'\"]*['\"]\s*,){2}\s*['\"]([^'\"]+)['\"]")
    audit.require(len(body_ids) == 98, f"body.tags: expected 98 static records, found {len(body_ids)}")
    audit.require(not duplicates(body_ids), f"body.tags: duplicate IDs: {', '.join(duplicates(body_ids))}")
    audit.require(not duplicates(body_names), f"body.tags: duplicate names: {', '.join(duplicates(body_names))}")
    required_body_references = {
        "自然肩线",
        "中位腰线",
        "中位髋曲线",
        "臂展比例均衡",
        "手臂长度均衡",
        "上臂前臂分段均衡",
        "大腿小腿量感均衡",
        "四肢量感中等",
        "肩部相对较宽",
        "中等肩宽",
        "肩部相对较窄",
        "髋部相对较宽",
        "髋部相对较窄",
        "上下髋量感均衡",
    }
    missing_body_references = sorted(required_body_references - set(body_names))
    audit.require(
        not missing_body_references,
        f"body.tags: missing required references: {', '.join(missing_body_references)}",
    )
    body_dimension_names: dict[str, set[str]] = {}
    for dimension, name in re.findall(
        r"\btag\(\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'([^']+)'\s*,\s*'([^']+)'",
        body_text,
    ):
        body_dimension_names.setdefault(dimension, set()).add(name)
    required_dimension_sets = {
        "肩部宽度": {"肩部相对较宽", "中等肩宽", "肩部相对较窄"},
        "髋部宽度": {"髋部相对较宽", "中等髋宽", "髋部相对较窄"},
        "量感位置": {"上髋量感较强", "上下髋量感均衡", "下髋量感较强"},
    }
    for dimension, expected_names in required_dimension_sets.items():
        actual_names = body_dimension_names.get(dimension, set())
        audit.require(
            actual_names == expected_names,
            f"body.tags: {dimension} must contain {', '.join(sorted(expected_names))}",
        )
    audit.passed(f"body.tags: {len(body_ids)} static IDs are unique")

    body_relation_rows = re.findall(
        r"\btag\(\s*'([^']+)'\s*,(?:\s*'[^']*'\s*,){2}\s*'([^']*)'\s*,\s*'([^']*)'"
        r"\s*,(?:\s*'[^']*'\s*,){4}\s*'([^']*)'\s*,\s*'([^']*)'",
        body_text,
    )
    noncanonical_references: set[str] = set()
    for source_id, _, _, coexist, confusion in body_relation_rows:
        for target_id, target_name, target_aliases, _, _ in body_relation_rows:
            if source_id == target_id:
                continue
            aliases = [value.strip() for value in re.split(r"[、，,/]", target_aliases) if len(value.strip()) >= 2]
            for field, relation_text in (("coexist", coexist), ("confusion", confusion)):
                for alias in aliases:
                    if alias in relation_text and target_name not in relation_text:
                        noncanonical_references.add(f"{source_id}.{field}: {alias} -> {target_name}")
    coexist_shorthands = {
        "高腰": "高腰线",
        "低腰": "低腰线",
        "高髋": "高髋曲线",
        "低髋": "低髋曲线",
        "长腿": "腿部相对较长",
        "短腿": "腿部相对较短",
        "长臂": "手臂相对较长",
        "短臂": "手臂相对较短",
        "H形": "H形轮廓",
        "A形": "A形轮廓",
        "V形": "V形轮廓",
        "X形": "X形轮廓",
        "8形": "8形轮廓",
        "柔和X形": "柔和X形轮廓",
        "圆肩": "圆缓肩部",
    }
    for source_id, _, _, coexist, _ in body_relation_rows:
        for shorthand, canonical in coexist_shorthands.items():
            if shorthand in coexist and canonical not in coexist:
                noncanonical_references.add(f"{source_id}.coexist: {shorthand} -> {canonical}")
    audit.require(
        not noncanonical_references,
        "body.tags: noncanonical relationship references: " + ", ".join(sorted(noncanonical_references)),
    )
    if not noncanonical_references:
        audit.passed("body.tags: coexistence and confusion references use canonical names")

    sources_text = read_text("sources-data.js")
    source_ids = set(re.findall(r"^\s{4}'([^']+)':\s*\{", sources_text, re.MULTILINE))
    body_module_match = re.search(
        r"\n    body:\s*\{(.*?)\n    \},\n    beauty:\s*\{",
        sources_text,
        re.DOTALL,
    )
    audit.require(body_module_match is not None, "sources.body: module configuration is missing")
    if body_module_match:
        body_module_text = body_module_match.group(1)
        default_match = re.search(r"defaultSources:\s*\[([^\]]*)\]", body_module_text)
        default_source_ids = set(re.findall(r"'([^']+)'", default_match.group(1))) if default_match else set()
        rule_matches = re.findall(
            r"match:\s*item\s*=>\s*\[([^\]]+)\]\.includes\(item\.dimension\),\s*"
            r"sources:\s*\[([^\]]+)\]",
            body_module_text,
        )
        dimension_source_rules: dict[str, list[set[str]]] = {}
        referenced_source_ids = set(default_source_ids)
        for dimension_block, source_block in rule_matches:
            dimensions = re.findall(r"'([^']+)'", dimension_block)
            rule_source_ids = set(re.findall(r"'([^']+)'", source_block))
            referenced_source_ids.update(rule_source_ids)
            for dimension in dimensions:
                dimension_source_rules.setdefault(dimension, []).append(rule_source_ids)
        body_dimensions = set(body_dimension_names)
        uncovered_dimensions = sorted(body_dimensions - set(dimension_source_rules))
        unknown_dimensions = sorted(set(dimension_source_rules) - body_dimensions)
        overlapping_dimensions = sorted(
            dimension for dimension, matches in dimension_source_rules.items() if len(matches) != 1
        )
        unknown_source_ids = sorted(referenced_source_ids - source_ids)
        audit.require(
            not uncovered_dimensions,
            f"sources.body: dimensions without explicit source rules: {', '.join(uncovered_dimensions)}",
        )
        audit.require(
            not unknown_dimensions,
            f"sources.body: rules reference unknown dimensions: {', '.join(unknown_dimensions)}",
        )
        audit.require(
            not overlapping_dimensions,
            f"sources.body: dimensions must match exactly one rule: {', '.join(overlapping_dimensions)}",
        )
        audit.require(
            not unknown_source_ids,
            f"sources.body: unknown source IDs: {', '.join(unknown_source_ids)}",
        )
        audit.require(
            bool(default_source_ids),
            "sources.body: at least one default editorial source is required",
        )
        if not uncovered_dimensions and not unknown_dimensions and not overlapping_dimensions and not unknown_source_ids:
            audit.passed(
                f"sources.body: {len(body_dimensions)} dimensions have one explicit rule and valid source IDs"
            )
        methodology_text = read_text("methodology.html")
        documented_body_sources: dict[str, list[set[str]]] = {}
        for dimension_block, source_block in re.findall(
            r'data-body-dimensions="([^"]+)"\s+data-body-sources="([^"]+)"',
            methodology_text,
        ):
            documented_sources = {value for value in source_block.split("|") if value}
            for dimension in dimension_block.split("|"):
                if dimension:
                    documented_body_sources.setdefault(dimension, []).append(documented_sources)
        undocumented_dimensions = sorted(body_dimensions - set(documented_body_sources))
        unknown_documented_dimensions = sorted(set(documented_body_sources) - body_dimensions)
        duplicate_documented_dimensions = sorted(
            dimension for dimension, rows in documented_body_sources.items() if len(rows) != 1
        )
        mismatched_documented_sources: list[str] = []
        for dimension in sorted(body_dimensions & set(documented_body_sources)):
            expected_sources = default_source_ids | dimension_source_rules.get(dimension, [set()])[0]
            actual_sources = documented_body_sources[dimension][0]
            if actual_sources != expected_sources:
                mismatched_documented_sources.append(
                    f"{dimension}: expected {'|'.join(sorted(expected_sources))}, "
                    f"found {'|'.join(sorted(actual_sources))}"
                )
        audit.require(
            not undocumented_dimensions,
            f"methodology.body: dimensions missing from source matrix: {', '.join(undocumented_dimensions)}",
        )
        audit.require(
            not unknown_documented_dimensions,
            f"methodology.body: source matrix has unknown dimensions: {', '.join(unknown_documented_dimensions)}",
        )
        audit.require(
            not duplicate_documented_dimensions,
            f"methodology.body: dimensions must appear once: {', '.join(duplicate_documented_dimensions)}",
        )
        audit.require(
            not mismatched_documented_sources,
            "methodology.body: source sets differ from rules: " + "; ".join(mismatched_documented_sources),
        )
        if (
            not undocumented_dimensions
            and not unknown_documented_dimensions
            and not duplicate_documented_dimensions
            and not mismatched_documented_sources
        ):
            audit.passed("methodology.body: source matrix matches all 20 dimension rules")

    body_examples_text = read_text("body-examples.js")
    example_names: list[str] = []
    for block in re.findall(r"addSheet\('[^']+',\s*\[(.*?)\]\);", body_examples_text, re.DOTALL):
        example_names.extend(re.findall(r"'([^']+)'", block))
    for block in re.findall(r"addGuides\(\s*\{(.*?)\}\);", body_examples_text, re.DOTALL):
        example_names.extend(re.findall(r"'([^']+)'\s*:", block))
    example_names.extend(re.findall(r"'([^']+)'\s*,\s*\d+", body_examples_text))
    missing_examples = sorted(set(body_names) - set(example_names))
    orphan_examples = sorted(set(example_names) - set(body_names))
    audit.require(not duplicates(example_names), f"body.examples: duplicate names: {', '.join(duplicates(example_names))}")
    audit.require(not missing_examples, f"body.examples: tags without examples: {', '.join(missing_examples)}")
    audit.require(not orphan_examples, f"body.examples: examples without tags: {', '.join(orphan_examples)}")
    if not duplicates(example_names) and not missing_examples and not orphan_examples:
        audit.passed(f"body.examples: {len(example_names)} examples cover every body tag")

    body_comparisons = re.findall(
        r"\{group:'([^']+)',pair:'([^']+)',difference:'([^']+)',tip:'([^']+)'\}",
        body_text,
    )
    allowed_body_groups = {
        "整体轮廓",
        "肩部结构",
        "躯干与腰线",
        "髋部与骨盆",
        "纵向比例",
        "四肢比例",
    }
    body_name_set = set(body_names)
    body_pair_keys: set[tuple[str, str]] = set()
    body_endpoint_counts = {name: 0 for name in body_names}
    comparison_groups: set[str] = set()
    for index, (group, pair, difference, tip) in enumerate(body_comparisons):
        comparison_groups.add(group)
        if group not in allowed_body_groups:
            audit.fail(f"body.comparisons[{index}]: unknown group {group!r}")
        endpoints = re.split(r"\s+vs\s+", pair)
        if len(endpoints) != 2:
            audit.fail(f"body.comparisons[{index}]: invalid pair {pair!r}")
            continue
        left, right = (value.strip() for value in endpoints)
        for endpoint in (left, right):
            if endpoint not in body_name_set:
                audit.fail(f"body.comparisons[{index}]: unknown endpoint {endpoint!r}")
            else:
                body_endpoint_counts[endpoint] += 1
        key = tuple(sorted((left, right)))
        if key in body_pair_keys:
            audit.fail(f"body.comparisons[{index}]: duplicate or reversed pair {left!r} / {right!r}")
        body_pair_keys.add(key)
        if len(difference.strip()) < 20 or len(tip.strip()) < 20:
            audit.fail(f"body.comparisons[{index}]: difference or tip is too short")
    audit.require(
        len(body_comparisons) >= 77,
        f"body.comparisons: expected at least 77 records, found {len(body_comparisons)}",
    )
    audit.require(
        comparison_groups == allowed_body_groups,
        "body.comparisons: group coverage does not match the six body regions",
    )
    if len(body_pair_keys) == len(body_comparisons):
        audit.passed(f"body.comparisons: {len(body_comparisons)} valid, unique pairs")
    uncovered_body_names = sorted(name for name, count in body_endpoint_counts.items() if count == 0)
    audit.require(
        not uncovered_body_names,
        f"body.comparisons: tags without comparison coverage: {', '.join(uncovered_body_names)}",
    )
    required_comparison_chains = [
        ("肩宽于髋", "肩髋等宽", "肩窄于髋"),
        ("平直肩线", "自然肩线", "下斜肩线"),
        ("长躯干", "均衡躯干比例", "短躯干"),
        ("高腰线", "中位腰线", "低腰线"),
        ("腰部内收明显", "腰部内收中等", "腰部内收较小"),
        ("高髋曲线", "中位髋曲线", "低髋曲线"),
        ("上髋量感较强", "上下髋量感均衡", "下髋量感较强"),
        ("髋部相对较宽", "中等髋宽", "髋部相对较窄"),
        ("腿部相对较长", "上下身比例均衡", "腿部相对较短"),
        ("大腿段相对较长", "大腿小腿分段均衡", "小腿段相对较长"),
        ("臂展相对较长", "臂展比例均衡", "臂展相对较短"),
        ("手臂相对较长", "手臂长度均衡", "手臂相对较短"),
        ("前臂相对较长", "上臂前臂分段均衡", "上臂相对较长"),
        ("大腿量感相对较强", "大腿小腿量感均衡", "小腿量感相对较强"),
        ("四肢线条纤细", "四肢量感中等", "四肢线条饱满"),
        ("肩部相对较宽", "中等肩宽", "肩部相对较窄"),
        ("头大身小", "头身比例均衡", "头小身长"),
        ("手指偏长", "手指长度均衡", "手指偏短"),
        ("手掌偏宽", "手掌宽度均衡", "手掌偏窄"),
        ("足部偏长", "足长均衡", "足部偏短"),
        ("肩斜角较大", "肩斜角适中", "肩斜角较小"),
        ("腰臀比偏大", "腰臀比适中", "腰臀比偏小"),
        ("腰段偏长", "腰段适中", "腰段偏短"),
        ("手腕相对较细", "中等腕围", "手腕相对较粗"),
        ("小腿肚位置偏高", "小腿肚位置适中", "小腿肚位置偏低"),
        ("前掌相对较宽", "前掌宽度适中", "前掌相对较窄"),
    ]
    missing_chain_pairs: list[str] = []
    for first, middle, last in required_comparison_chains:
        for left, right in ((first, middle), (middle, last)):
            if tuple(sorted((left, right))) not in body_pair_keys:
                missing_chain_pairs.append(f"{left} vs {right}")
    audit.require(
        not missing_chain_pairs,
        f"body.comparisons: incomplete three-level chains: {', '.join(missing_chain_pairs)}",
    )
    if not uncovered_body_names and not missing_chain_pairs:
        audit.passed("body.comparisons: every tag is covered and all three-level chains are complete")

    catalog_text = read_text("brand-products-data.js")
    expansion_text = read_text("brand-products-expansion.js")
    directory_text = read_text("brand-directory-expansion.js")
    brand_ids = parse_static_ids(catalog_text, r"\bbrand\(\s*['\"]([^'\"]+)['\"]")
    base_product_ids = parse_static_ids(catalog_text, r"\bproduct\(\s*['\"]([^'\"]+)['\"]")
    expansion_product_ids = parse_static_ids(expansion_text, r"\bproduct\(\s*['\"]([^'\"]+)['\"]")
    product_ids = base_product_ids + expansion_product_ids
    category_ids = parse_static_ids(catalog_text, r"\{\s*id:\s*['\"]([^'\"]+)['\"]\s*,\s*name:")
    audit.require(not duplicates(brand_ids), f"catalog.brands: duplicate IDs: {', '.join(duplicates(brand_ids))}")
    audit.require(not duplicates(product_ids), f"catalog.products: duplicate IDs: {', '.join(duplicates(product_ids))}")
    audit.require(not duplicates(category_ids), f"catalog.categories: duplicate IDs: {', '.join(duplicates(category_ids))}")
    legacy_text = read_text("brand-data.js")
    legacy_ids = parse_static_ids(legacy_text, r"\{\s*id:\s*['\"]([^'\"]+)['\"]")
    expansion_brand_ids = parse_static_ids(directory_text, r"\bbrand\(\s*['\"]([^'\"]+)['\"]")
    directory_ids = legacy_ids + expansion_brand_ids
    audit.require(not duplicates(directory_ids), f"brand directory: duplicate IDs: {', '.join(duplicates(directory_ids))}")

    base_brand_refs = parse_static_ids(
        catalog_text,
        r"\bproduct\(\s*['\"][^'\"]+['\"]\s*,\s*['\"]([^'\"]+)['\"]",
    )
    expansion_brand_refs = parse_static_ids(
        expansion_text,
        r"\bproduct\(\s*['\"][^'\"]+['\"]\s*,\s*['\"]([^'\"]+)['\"]",
    )
    unknown_base_brands = sorted(set(base_brand_refs) - set(brand_ids))
    unknown_expansion_brands = sorted(set(expansion_brand_refs) - set(directory_ids))
    audit.require(not unknown_base_brands, f"base products reference unknown brands: {', '.join(unknown_base_brands)}")
    audit.require(
        not unknown_expansion_brands,
        f"expanded products reference unknown directory brands: {', '.join(unknown_expansion_brands)}",
    )
    audit.passed(
        f"catalog static IDs: {len(brand_ids)} base brands, {len(product_ids)} products, "
        f"{len(category_ids)} categories; {len(directory_ids)} directory brands"
    )

    image_data = load_json_assignment("brand-product-images.js", "window.BRAND_PRODUCT_IMAGES = Object.freeze(")
    catalog_product_ids = set(product_ids)
    image_ids = set(image_data)
    missing_images = sorted(catalog_product_ids - image_ids)
    orphan_images = sorted(image_ids - catalog_product_ids)
    audit.require(not missing_images, f"catalog products without image records: {', '.join(missing_images)}")
    audit.require(not orphan_images, f"image records without catalog products: {', '.join(orphan_images)}")
    for product_id, record in image_data.items():
        missing = missing_fields(record, ("status", "checkedAt", "pageUrl", "imageUrl", "localFile"))
        if missing:
            audit.fail(f"brand-product-images {product_id}: missing {', '.join(missing)}")
    audit.passed(f"brand-product-images: {len(image_data)} records map to catalog products")


def valid_url(value: str) -> bool:
    parsed = urlparse(value.rstrip(".,);]"))
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def valid_date(value: str) -> bool:
    if not DATE_RE.fullmatch(value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def audit_urls_dates_and_assets(audit: Audit) -> None:
    source_files = sorted(ROOT.glob("*.js")) + sorted(ROOT.glob("*.html")) + sorted(ROOT.glob("*.css"))
    malformed_urls: list[str] = []
    malformed_dates: list[str] = []
    referenced_assets: set[Path] = set()

    for path in source_files:
        text = path.read_text(encoding="utf-8")
        for raw_url in URL_RE.findall(text):
            if not valid_url(raw_url):
                malformed_urls.append(f"{path.name}:{raw_url}")
        for value in re.findall(
            r"(?:updatedAt|reviewedAt|verifiedAt|checkedAt)\s*[:=]\s*['\"]([^'\"]+)['\"]",
            text,
        ):
            if not valid_date(value):
                malformed_dates.append(f"{path.name}:{value}")
        for raw_path in re.findall(r"['\"](\./assets/[^'\"]+)['\"]", text):
            relative = raw_path.split("?", 1)[0]
            if relative.lower().endswith(ASSET_EXTENSIONS):
                referenced_assets.add((ROOT / relative).resolve())
        if path.name in {"examples-data.js", "body-examples.js"}:
            for filename in re.findall(r"['\"]([^/'\"]+\.(?:avif|gif|jpe?g|png|svg|webp))['\"]", text, re.I):
                referenced_assets.add((ROOT / "assets" / "examples" / filename).resolve())

    audit.require(not malformed_urls, f"malformed URLs: {', '.join(malformed_urls[:20])}")
    audit.require(not malformed_dates, f"malformed dates: {', '.join(malformed_dates[:20])}")
    missing_assets = sorted(path for path in referenced_assets if not path.is_file())
    audit.require(
        not missing_assets,
        "missing local assets: " + ", ".join(str(path.relative_to(ROOT)) for path in missing_assets[:20]),
    )

    all_assets = {path.resolve() for path in (ROOT / "assets").rglob("*") if path.is_file()}
    unused_assets = sorted(all_assets - referenced_assets)
    if unused_assets:
        preview = ", ".join(str(path.relative_to(ROOT)) for path in unused_assets[:8])
        audit.warn(f"{len(unused_assets)} local assets are not statically referenced (sample: {preview})")
    audit.passed(
        f"static references: {len(referenced_assets)} local assets exist; URL and date formats are valid"
    )


def audit_internal_links(audit: Audit) -> None:
    html_files = sorted(ROOT.glob("*.html"))
    element_ids: dict[str, set[str]] = {}
    pages: dict[str, str] = {}
    for path in html_files:
        text = path.read_text(encoding="utf-8")
        pages[path.name] = text
        element_ids[path.name] = set(re.findall(r"\bid\s*=\s*[\"']([^\"']+)[\"']", text))

    external_prefixes = ("http://", "https://", "mailto:", "tel:", "data:", "//")
    link_re = re.compile(r"(?:href|src)\s*=\s*[\"']([^\"']+)[\"']")
    broken: list[str] = []
    checked = 0

    def resolve_ref(source_name: str, raw: str, origin: str) -> None:
        nonlocal checked
        if raw.startswith(external_prefixes) or raw in {"#", ""}:
            return
        checked += 1
        target, _, fragment = raw.partition("#")
        target = target.split("?", 1)[0]
        page_name = source_name
        if target:
            target_path = (ROOT / source_name).parent / target
            if not target_path.is_file():
                broken.append(f"{origin}: {raw!r} -> missing file")
                return
            if target_path.suffix.lower() != ".html":
                return
            page_name = target_path.name
        if fragment and fragment not in element_ids.get(page_name, set()):
            broken.append(f"{origin}: {raw!r} -> missing anchor #{fragment} in {page_name}")

    for name, text in pages.items():
        static_text = re.sub(r"<script\b.*?</script>", "", text, flags=re.DOTALL | re.IGNORECASE)
        for raw in link_re.findall(static_text):
            if "${" in raw:
                continue
            resolve_ref(name, raw.strip(), name)

    sources_text = read_text("sources-data.js")
    for raw in re.findall(r"url:\s*[\"'](\.[^\"']+)[\"']", sources_text):
        if "${" in raw:
            continue
        resolve_ref("sources-data.js", raw.lstrip("./"), "sources-data.js")

    audit.require(not broken, "internal links broken: " + "; ".join(broken[:20]))
    if not broken:
        audit.passed(f"internal links: {checked} page/anchor references resolve across {len(html_files)} pages")


def audit_html_accessibility(audit: Audit) -> None:
    problems: list[str] = []
    checked_controls = 0

    label_block_re = re.compile(r"<label\b[^>]*>(.*?)</label>", re.DOTALL | re.IGNORECASE)
    control_re = re.compile(r"<(?:input|select|textarea)\b[^>]*>", re.IGNORECASE)
    attr_re = re.compile(r"(\w[\w-]*)\s*=\s*[\"']([^\"']*)[\"']")

    for path in sorted(ROOT.glob("*.html")):
        name = path.name
        raw = path.read_text(encoding="utf-8")
        if not re.search(r"<html\b[^>]*\blang\s*=", raw, re.IGNORECASE):
            problems.append(f"{name}: <html> is missing lang")
        title = re.search(r"<title\b[^>]*>([^<]+)</title>", raw, re.IGNORECASE)
        if not title or not title.group(1).strip():
            problems.append(f"{name}: missing non-empty <title>")

        text = re.sub(r"<script\b.*?</script>", "", raw, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r"<style\b.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)

        ids = re.findall(r"\bid\s*=\s*[\"']([^\"']+)[\"']", text)
        ids_set = set(ids)
        for dup in sorted({x for x in ids if ids.count(x) > 1}):
            problems.append(f"{name}: duplicate id {dup!r}")

        h1_count = len(re.findall(r"<h1\b", text, re.IGNORECASE))
        if h1_count != 1:
            problems.append(f"{name}: expected exactly one <h1>, found {h1_count}")

        label_for = set(re.findall(r"<label\b[^>]*\bfor\s*=\s*[\"']([^\"']+)[\"']", text, re.IGNORECASE))
        labeled_spans = [m.span(1) for m in label_block_re.finditer(text) if control_re.search(m.group(1))]

        for match in re.finditer(r"<img\b([^>]*)>", text, re.IGNORECASE):
            if not re.search(r"\balt\s*=", match.group(1)):
                problems.append(f"{name}: <img> missing alt near offset {match.start()}")

        for match in re.finditer(r"<(a|button)\b([^>]*)>(.*?)</\1>", text, re.DOTALL | re.IGNORECASE):
            tag, attrs, inner = match.group(1), match.group(2), match.group(3)
            if re.search(r"\baria-hidden\s*=\s*[\"']true[\"']", attrs):
                continue
            has_aria = re.search(r"\baria-label(?:ledby)?\s*=\s*[\"']\s*\S", attrs)
            has_text = re.sub(r"<[^>]+>", "", inner).strip()
            has_alt_img = re.search(r"<img\b[^>]*\balt\s*=\s*[\"']\s*\S", inner, re.IGNORECASE)
            if not (has_aria or has_text or has_alt_img):
                problems.append(f"{name}: <{tag}> has no accessible name near offset {match.start()}")

        for match in control_re.finditer(text):
            tag_text = match.group(0)
            attrs = dict((k.lower(), v) for k, v in attr_re.findall(tag_text))
            input_type = attrs.get("type", "").lower()
            if tag_text.lower().startswith("<input") and input_type in {"hidden", "submit", "button", "reset", "image"}:
                continue
            if input_type in {"submit", "button", "reset"}:
                continue
            control_id = attrs.get("id", "")
            start = match.start()
            wrapped = any(lo <= start <= hi for lo, hi in labeled_spans)
            labeled = bool(attrs.get("aria-label", "").strip()) or bool(attrs.get("aria-labelledby", "").strip())
            labeled = labeled or bool(control_id and control_id in label_for) or wrapped
            checked_controls += 1
            if not labeled:
                control_tag = tag_text[1:].split(maxsplit=1)[0].rstrip(">").lower()
                problems.append(f"{name}: form control <{control_tag}> is unlabeled near offset {start}")

        # --- ARIA structure checks ---
        # role="img" requires an accessible name (aria-label or aria-labelledby).
        for match in re.finditer(r"<[^>]*\brole\s*=\s*[\"']img[\"'][^>]*>", text, re.IGNORECASE):
            tag = match.group(0)
            if not re.search(r"\baria-label(?:ledby)?\s*=\s*[\"']\s*\S", tag, re.IGNORECASE):
                problems.append(f"{name}: role=\"img\" without accessible name near offset {match.start()}")

        # aria-labelledby references must resolve to an existing id in the same page.
        for match in re.finditer(r"\baria-labelledby\s*=\s*[\"']([^\"']+)[\"']", text, re.IGNORECASE):
            for ref in match.group(1).split():
                if ref not in ids_set:
                    problems.append(f"{name}: aria-labelledby references missing id {ref!r} near offset {match.start()}")

        # role="radiogroup" needs an accessible name; every role="radio" inside it
        # must carry aria-checked so assistive tech can report selection state.
        for rg in re.finditer(r"<[^>]*\brole\s*=\s*[\"']radiogroup[\"'][^>]*>", text, re.IGNORECASE):
            if not re.search(r"\baria-label(?:ledby)?\s*=\s*[\"']\s*\S", rg.group(0), re.IGNORECASE):
                problems.append(f"{name}: role=\"radiogroup\" without accessible name near offset {rg.start()}")
        for radio in re.finditer(r"<[^>]*\brole\s*=\s*[\"']radio[\"'][^>]*>", text, re.IGNORECASE):
            if not re.search(r"\baria-checked\s*=", radio.group(0), re.IGNORECASE):
                problems.append(f"{name}: role=\"radio\" missing aria-checked near offset {radio.start()}")

    audit.require(not problems, "html accessibility issues: " + "; ".join(problems[:20]))
    if not problems:
        audit.passed(f"html accessibility: ids, names, labels, alt text and headings are valid in {len(list(ROOT.glob('*.html')))} pages ({checked_controls} controls)")


def audit_body_prose_terms(audit: Audit) -> None:
    """Canonical-name governance for explanatory prose fields.

    Unlike coexist/confusion (checked in audit_static_modules), these fields are
    free text, so detection uses leftmost-longest matching to avoid substring
    false positives (X形 inside 柔和X形, 长臂 inside 长臂展), exempts the owning
    tag and comparison endpoints, and treats 高腰/低腰 + garment word as clothing
    terminology rather than the 高腰线/低腰线 body tags. Search keywords are
    allowed to keep aliases and are deliberately excluded.
    """
    body_text = read_text("body-data.js")

    rows: list[list[str]] = []
    parse_errors: list[str] = []
    for line_no, line in enumerate(body_text.splitlines(), 1):
        match = re.match(r"\s*tag\((.*)\),?\s*$", line)
        if not match:
            continue
        parts = [part.strip() for part in match.group(1).split("','")]
        if parts:
            parts[0] = parts[0].lstrip("'")
            parts[-1] = parts[-1].rstrip("'")
        if len(parts) != 13:
            parse_errors.append(f"line {line_no}: expected 13 fields, found {len(parts)}")
            continue
        rows.append(parts)
    if parse_errors:
        audit.fail("body.prose-terms: malformed tag() rows: " + "; ".join(parse_errors[:10]))
        return
    if len(rows) != 98:
        audit.fail(f"body.prose-terms: expected 98 tag rows, found {len(rows)}")

    shorthands = {
        "高腰": "高腰线", "低腰": "低腰线", "高髋": "高髋曲线", "低髋": "低髋曲线",
        "长腿": "腿部相对较长", "短腿": "腿部相对较短",
        "长臂": "手臂相对较长", "短臂": "手臂相对较短",
        "H形": "H形轮廓", "A形": "A形轮廓", "V形": "V形轮廓",
        "X形": "X形轮廓", "8形": "8形轮廓", "柔和X形": "柔和X形轮廓",
        "圆肩": "圆缓肩部",
    }
    garment_chars = set("服裤裙衣")

    term_to_canon: dict[str, str] = {}
    for row in rows:
        name = row[3]
        term_to_canon[name] = name
        for alias in re.split(r"[、，,/]", row[4]):
            alias = alias.strip()
            if len(alias) >= 2:
                term_to_canon.setdefault(alias, name)
    for short, canon in shorthands.items():
        term_to_canon.setdefault(short, canon)

    ordered_terms = sorted(term_to_canon, key=len, reverse=True)
    term_re = re.compile("|".join(re.escape(term) for term in ordered_terms))
    all_names = {row[3] for row in rows}

    def find_violations(text: str, self_name: str | None = None, endpoints: set[str] | None = None) -> set[str]:
        endpoints = endpoints or set()
        present = {name for name in all_names if name in text}
        found: set[str] = set()
        for match in term_re.finditer(text):
            word = match.group(0)
            canon = term_to_canon[word]
            if canon == self_name or canon in endpoints or canon in present:
                continue
            if word in ("高腰", "低腰") and match.end() < len(text) and text[match.end()] in garment_chars:
                continue
            found.add(f"{word} -> {canon}")
        return found

    violations: list[str] = []
    prose_fields = ((7, "definition"), (8, "view"), (11, "application"))
    for row in rows:
        for index, label in prose_fields:
            for hit in sorted(find_violations(row[index], self_name=row[3])):
                violations.append(f"{row[0]}.{label}: {hit}")

    comparisons = re.findall(
        r"\{group:'([^']+)',pair:'([^']+)',difference:'([^']+)',tip:'([^']+)'\}",
        body_text,
    )
    for pair, difference, tip in ((c[1], c[2], c[3]) for c in comparisons):
        endpoints = set(re.split(r"\s+vs\s+", pair))
        for label, text in (("difference", difference), ("tip", tip)):
            for hit in sorted(find_violations(text, endpoints=endpoints)):
                violations.append(f"comparison {pair} .{label}: {hit}")

    audit.require(
        not violations,
        "body.prose-terms: noncanonical references in prose: " + ", ".join(sorted(violations)[:20]),
    )
    if not violations and len(rows) == 62:
        audit.passed("body.prose-terms: definitions, application notes and comparison text use canonical tag names")


def audit_asset_cache_versions(audit: Audit) -> None:
    ref_re = re.compile(r"(?:href|src)\s*=\s*[\"'](\.[^\"']+\.(?:js|css))(?:\?v=([^\"']+))?[\"']", re.IGNORECASE)
    versions: dict[str, dict[str, set[str]]] = {}
    for path in sorted(ROOT.glob("*.html")):
        for match in ref_re.finditer(path.read_text(encoding="utf-8")):
            ref, version = match.group(1), match.group(2)
            target = (path.parent / ref.split("?", 1)[0]).resolve()
            if not version or not target.is_file():
                continue
            key = str(target.relative_to(ROOT))
            versions.setdefault(key, {}).setdefault(version, set()).add(path.name)

    divergent: list[str] = []
    for key, by_version in sorted(versions.items()):
        if len(by_version) > 1:
            detail = "; ".join(
                f"{version} on {','.join(sorted(pages))}" for version, pages in sorted(by_version.items())
            )
            divergent.append(f"{key}: {detail}")
    audit.require(not divergent, "asset cache versions diverge across pages: " + " | ".join(divergent[:12]))
    if not divergent:
        audit.passed(
            f"asset cache versions: versioned js/css references are consistent across pages ({len(versions)} assets)"
        )


def audit_cross_module_consistency(audit: Audit, face: dict[str, Any], beauty: dict[str, Any]) -> None:
    """Lock in hygiene that is currently clean but not yet enforced.

    - Face aliases must be unique search handles (no two tags share an alias).
    - Face keywords must contain the tag name and every alias.
    - Face and beauty prompts must contain both the record name and its en name.
    - Face tag type and selected beauty category/status fields must stay within
      their declared controlled vocabularies, so typos cannot silently ship.
    """
    face_tags = face.get("tags", [])
    issues: list[str] = []

    alias_to_names: dict[str, list[str]] = {}
    for tag in face_tags:
        name = str(tag.get("name", ""))
        for alias in re.split(r"[、，,/]", str(tag.get("alias", ""))):
            alias = alias.strip()
            if len(alias) < 2 or alias == "—":
                continue
            alias_to_names.setdefault(alias, []).append(name)
    for alias, names in alias_to_names.items():
        if len(names) > 1:
            issues.append(f"face.alias: {alias!r} shared by {', '.join(sorted(names))}")

    for tag in face_tags:
        tag_id = str(tag.get("id", "?"))
        name = str(tag.get("name", ""))
        keywords = str(tag.get("keywords", ""))
        prompt = str(tag.get("prompt", ""))
        en = str(tag.get("en", ""))
        if name not in keywords:
            issues.append(f"face.keywords: {tag_id} missing own name {name!r}")
        for alias in re.split(r"[、，,/]", str(tag.get("alias", ""))):
            alias = alias.strip()
            if len(alias) >= 2 and alias != "—" and alias not in keywords:
                issues.append(f"face.keywords: {tag_id} missing alias {alias!r}")
        if name not in prompt:
            issues.append(f"face.prompt: {tag_id} does not contain name {name!r}")
        if en and en not in prompt:
            issues.append(f"face.prompt: {tag_id} does not contain en {en!r}")

    allowed_face_types = {
        "状态型", "结构型", "分类型", "测量型", "比例型", "形态型",
        "状态/颜色型", "颜色型", "测量/结构型", "颜色/比例型", "关系型",
        "立体型", "立体/关系型", "颜色/状态型", "立体/测量型", "结构/动态型",
    }
    for tag in face_tags:
        tag_type = str(tag.get("type", ""))
        if tag_type not in allowed_face_types:
            issues.append(f"face.type: {tag.get('id','?')} has unknown type {tag_type!r}")

    beauty_specs = ("products", "shades", "finishes", "styles", "nails")
    for key in beauty_specs:
        for record in beauty.get(key, []):
            record_id = str(record.get("id", "?"))
            name = str(record.get("name", ""))
            en = str(record.get("en", ""))
            prompt = str(record.get("prompt", ""))
            if name and name not in prompt:
                issues.append(f"beauty.{key}.prompt: {record_id} does not contain name {name!r}")
            if en and en not in prompt:
                issues.append(f"beauty.{key}.prompt: {record_id} does not contain en {en!r}")

    allowed_beauty = {
        ("products", "status"): {"通用术语"},
        ("products", "area"): {"底妆", "面颊", "眼部", "眉部", "唇部", "身体与创意", "美甲"},
        ("shades", "status"): {"通用参考", "通用色名"},
        ("shades", "kind"): {"底妆色阶", "唇部", "面颊", "修容", "古铜", "高光", "眼部", "美甲"},
    }
    for (key, field), allowed in allowed_beauty.items():
        for record in beauty.get(key, []):
            value = record.get(field)
            if value not in allowed:
                issues.append(f"beauty.{key}.{field}: {record.get('id','?')} has unknown value {value!r}")

    audit.require(not issues, "cross-module consistency issues: " + "; ".join(issues[:20]))
    if not issues:
        audit.passed(
            f"cross-module consistency: face aliases/keywords/prompts/types and beauty prompts/vocabularies are valid "
            f"({len(face_tags)} face tags, {sum(len(beauty.get(k, [])) for k in beauty_specs)} beauty records)"
        )


def audit_comparison_coverage(audit: Audit, face: dict[str, Any], beauty: dict[str, Any]) -> None:
    """Face confusion and beauty comparison coverage gates.

    - Every face tag of type 分类型 must appear in at least one confusion pair,
      because discrete categories are where users need disambiguation most.
    - Face confusion count must not regress below the established baseline.
    - Beauty comparison endpoints must resolve to finishes or nails names.
    - Beauty finishes dimension 妆效 and nails dimensions 甲型/长度 must be
      fully covered by comparisons (these are the disambiguation-heavy groups).
    """
    face_tags = face.get("tags", [])
    categorical = {t["name"] for t in face_tags if str(t.get("type")) == "分类型"}
    covered = set()
    for confusion in face.get("confusions", []):
        for endpoint in re.split(r"\s+vs\s+", str(confusion.get("pair", ""))):
            covered.add(endpoint.strip())
    missing = sorted(categorical - covered)
    audit.require(
        not missing,
        f"face.confusions: 分类型 tags not covered by any confusion: {', '.join(missing[:15])}",
    )

    confusion_count = len(face.get("confusions", []))
    audit.require(
        confusion_count >= 375,
        f"face.confusions: count {confusion_count} regressed below baseline 375",
    )

    beauty_names = {r["name"] for r in beauty.get("finishes", [])} | {r["name"] for r in beauty.get("nails", [])}
    beauty_comparisons = beauty.get("comparisons", [])
    bad_endpoints: list[str] = []
    for comp in beauty_comparisons:
        for endpoint in re.split(r"\s+vs\s+", str(comp.get("pair", ""))):
            name = endpoint.strip()
            if name not in beauty_names:
                bad_endpoints.append(name)
    audit.require(
        not bad_endpoints,
        "beauty.comparisons: unknown endpoints: " + ", ".join(sorted(set(bad_endpoints))[:15]),
    )

    comp_covered = set()
    for comp in beauty_comparisons:
        for endpoint in re.split(r"\s+vs\s+", str(comp.get("pair", ""))):
            comp_covered.add(endpoint.strip())
    required_groups = [
        ("finishes", "妆效"),
        ("nails", "甲型"),
        ("nails", "长度"),
    ]
    beauty_missing: list[str] = []
    for key, dimension in required_groups:
        for record in beauty.get(key, []):
            if str(record.get("dimension")) == dimension and record["name"] not in comp_covered:
                beauty_missing.append(f"{key}.{record['name']}")
    audit.require(
        not beauty_missing,
        "beauty.comparisons: disambiguation groups not fully covered: " + ", ".join(beauty_missing[:15]),
    )

    if not missing and not bad_endpoints and not beauty_missing and confusion_count >= 375:
        audit.passed(
            f"comparison coverage: {len(categorical)} face categorical tags covered, "
            f"{confusion_count} face confusions, {len(beauty_comparisons)} beauty comparisons "
            f"({len(comp_covered)} unique beauty names)"
        )


def audit_face_sources_methodology(audit: Audit) -> None:
    """Face source rules must match the methodology source matrix.

    Type-based rules (item.type in [...]) and dimension-based rules
    (item.dimension in [...]) in sources-data.js must each have a matching
    data-face-types / data-face-dimensions row in methodology.html with the
    same source IDs. The part-based rule (脸型与整体轮廓 / 面部比例与侧貌)
    is folded into the 测量型/比例型 type row because those parts' tags carry
    those types, so it is not separately audited here.
    """
    sources_text = read_text("sources-data.js")
    source_ids = set(re.findall(r"^\s{4}'([^']+)':\s*\{", sources_text, re.MULTILINE))
    face_module_match = re.search(
        r"\n    face:\s*\{(.*?)\n    \},\n    body:\s*\{",
        sources_text,
        re.DOTALL,
    )
    audit.require(face_module_match is not None, "sources.face: module configuration is missing")
    if not face_module_match:
        return
    face_module_text = face_module_match.group(1)

    type_rules: list[tuple[set[str], set[str]]] = []
    dimension_rules: list[tuple[set[str], set[str]]] = []
    for values, field, sources in re.findall(
        r"match:\s*item\s*=>\s*\[([^\]]+)\]\.includes\(item\.(type|dimension)\),\s*sources:\s*\[([^\]]+)\]",
        face_module_text,
    ):
        value_set = {v.strip().strip("'\"") for v in values.split(",") if v.strip()}
        source_set = {s.strip().strip("'\"") for s in sources.split(",") if s.strip()}
        if source_set - source_ids:
            audit.fail(f"sources.face: unknown source IDs: {', '.join(sorted(source_set - source_ids))}")
            return
        (type_rules if field == "type" else dimension_rules).append((value_set, source_set))

    methodology_text = read_text("methodology.html")
    documented_types: dict[str, set[str]] = {}
    for type_block, source_block in re.findall(
        r'data-face-types="([^"]+)"\s+data-face-sources="([^"]+)"',
        methodology_text,
    ):
        src = {v for v in source_block.split("|") if v}
        for tp in type_block.split("|"):
            if tp:
                documented_types[tp] = src

    type_issues: list[str] = []
    for types, sources in type_rules:
        for tp in sorted(types):
            if tp not in documented_types:
                type_issues.append(f"type {tp!r} missing from matrix")
            elif documented_types[tp] != sources:
                type_issues.append(
                    f"type {tp!r}: expected {'|'.join(sorted(sources))}, found {'|'.join(sorted(documented_types[tp]))}"
                )
    audit.require(not type_issues, "methodology.face type matrix: " + "; ".join(type_issues))

    documented_dimensions: dict[str, set[str]] = {}
    for dim_block, source_block in re.findall(
        r'data-face-dimensions="([^"]+)"\s+data-face-sources="([^"]+)"',
        methodology_text,
    ):
        src = {v for v in source_block.split("|") if v}
        for dim in dim_block.split("|"):
            if dim:
                documented_dimensions[dim] = documented_dimensions.get(dim, set()) | src

    dim_issues: list[str] = []
    for dims, sources in dimension_rules:
        for dim in sorted(dims):
            if dim not in documented_dimensions:
                dim_issues.append(f"dimension {dim!r} missing from matrix")
            elif not sources.issubset(documented_dimensions[dim]):
                dim_issues.append(
                    f"dimension {dim!r}: expected {'|'.join(sorted(sources))}, found {'|'.join(sorted(documented_dimensions[dim]))}"
                )
    audit.require(not dim_issues, "methodology.face dimension matrix: " + "; ".join(dim_issues))

    if not type_issues and not dim_issues:
        audit.passed(
            f"methodology.face: source matrix matches {len(type_rules)} type rules and {len(dimension_rules)} dimension rules"
        )


def audit_relationship_consistency(audit: Audit, face: dict[str, Any], beauty: dict[str, Any]) -> None:
    """Cross-record relationship consistency gates.

    1. Beauty product category must map to its declared area via the established
       category→area mapping, so a 粉底 cannot be filed under 眼部 by mistake.
    2. Face confusion endpoints must be valid tag names (already checked) and,
       when they span two facial parts, the parts must be an anatomically adjacent
       pair from the allowlist. Same-part pairs are always allowed.
    """
    category_area = {
        "妆前产品": "底妆", "粉底": "底妆", "遮瑕与校色": "底妆", "定妆与补妆": "底妆",
        "腮红": "面颊", "修容与古铜": "面颊", "高光": "面颊",
        "眼影": "眼部", "眼线": "眼部", "睫毛与假睫毛": "眼部",
        "眉部产品": "眉部",
        "唇色产品": "唇部", "唇部辅助与护理": "唇部",
        "身体与舞台彩妆": "身体与创意",
        "甲油与凝胶": "美甲", "底胶、封层与护理": "美甲", "装饰材料与甲片": "美甲",
    }
    bad_products: list[str] = []
    for product in beauty.get("products", []):
        category = product.get("category")
        expected = category_area.get(category)
        if expected is None:
            bad_products.append(f"{product.get('id')}: unknown category {category!r}")
        elif product.get("area") != expected:
            bad_products.append(
                f"{product.get('id')}: category {category!r} expects area {expected!r}, found {product.get('area')!r}"
            )
    audit.require(not bad_products, "beauty.category-area: " + "; ".join(bad_products[:15]))

    name_to_part = {str(t["name"]): str(t["part"]) for t in face.get("tags", [])}
    allowed_cross_parts = {
        frozenset({"下巴与下颌", "脸型与整体轮廓"}),
        frozenset({"眉毛", "眼部"}),
        frozenset({"鼻部", "颧骨、脸颊与面中"}),
        frozenset({"眼部", "颧骨、脸颊与面中"}),
        frozenset({"肤色与皮肤状态", "眼部"}),
        frozenset({"肤色与皮肤状态", "颧骨、脸颊与面中"}),
    }
    bad_confusions: list[str] = []
    for confusion in face.get("confusions", []):
        endpoints = [ep.strip() for ep in re.split(r"\s+vs\s+", str(confusion.get("pair", "")))]
        parts = {name_to_part.get(ep) for ep in endpoints}
        parts.discard(None)
        if len(parts) > 1 and frozenset(parts) not in allowed_cross_parts:
            bad_confusions.append(f"{confusion.get('pair')}: parts {sorted(parts)} not adjacent")
    audit.require(not bad_confusions, "face.confusions: non-adjacent part pairs: " + "; ".join(bad_confusions[:15]))

    if not bad_products and not bad_confusions:
        audit.passed(
            f"relationship consistency: {len(beauty.get('products', []))} products match category→area, "
            f"all {len(face.get('confusions', []))} confusion pairs use same or adjacent facial parts"
        )


# Variable names used inside examples-data.js before being assigned to ATLAS_EXAMPLES groups.
_EXAMPLES_VAR_MAP = {
    "face": "face",
    "product": "products",
    "finish": "finishes",
    "style": "styles",
    "nail": "nails",
}
# Each recognize mode maps to the data groups it draws candidate labels from.
# "face" examples and "body" tags are special; beauty groups come from BEAUTY_ATLAS_DATA.
_RECOGNIZE_MODE_GROUPS = {
    "face": ["face_examples"],
    "body": ["body_tags", "body_examples"],
    "makeup": ["styles", "finishes", "products", "shades"],
    "product": ["products", "finishes", "shades"],
    "nail": ["nails", "shades"],
}


def audit_recognize_data(audit: Audit, face: dict[str, Any], beauty: dict[str, Any]) -> None:
    """Recognize (识图实验室) data integration gates.

    1. Every example key declared in examples-data.js must resolve to a real tag or
       product/finish/style/nail name in the corresponding data source, so the
       recognize page never shows an example card pointing at a non-existent label.
    2. Every recognize mode (face/body/makeup/product/nail) must find non-empty data
       in each group it depends on, so no mode renders an empty candidate list.
    """
    body_text = read_text("body-data.js")
    body_names = parse_static_ids(
        body_text,
        r"\btag\(\s*['\"][^'\"]+['\"]\s*,(?:\s*['\"][^'\"]*['\"]\s*,){2}\s*['\"]([^'\"]+)['\"]",
    )
    examples_text = read_text("examples-data.js")
    example_keys: dict[str, set[str]] = {g: set() for g in _EXAMPLES_VAR_MAP.values()}
    example_keys["shades"] = set()
    block_pattern = re.compile(
        r"\[\s*(\[[^\]]*\](?:\s*,\s*\[[^\]]*\])*\s*,?)\s*\]\s*\.forEach\(\(\[name,col,row,alt\]\)\s*=>\s*(\w+)\[name\]",
        re.DOTALL,
    )
    for match in block_pattern.finditer(examples_text):
        group = _EXAMPLES_VAR_MAP.get(match.group(2))
        if group is None:
            continue
        example_keys[group].update(re.findall(r"\[\s*'([^']+)'", match.group(1)))
    # addFaceSheet('file', [names], suffix) assigns to face[name] by index.
    for match in re.finditer(r"addFaceSheet\('[^']+',\s*\[([^\]]*)\]", examples_text, re.DOTALL):
        example_keys["face"].update(re.findall(r"'([^']+)'", match.group(1)))
    # face['canonical'] = face['source'] aliases reuse an example under another tag.
    for match in re.finditer(r"face\['([^']+)'\]\s*=\s*face\['([^']+)'\]", examples_text):
        if match.group(2) in example_keys["face"]:
            example_keys["face"].add(match.group(1))
    # addProductSheet/addStyleSheet/addNailSheet assign to product/style/nail[name] by index.
    for helper, group in (("addProductSheet", "products"), ("addStyleSheet", "styles"), ("addNailSheet", "nails")):
        for match in re.finditer(rf"{helper}\('[^']+',\s*\[([^\]]*)\]", examples_text, re.DOTALL):
            example_keys[group].update(re.findall(r"'([^']+)'", match.group(1)))
    # addShadeSheet('file', [['id',col,row,'alt'], ...]) assigns to shade[id] by index.
    for match in re.finditer(r"addShadeSheet\('[^']+',\s*\[(.*?)\]\);", examples_text, re.DOTALL):
        example_keys["shades"].update(re.findall(r"\[\s*'([^']+)'", match.group(1)))

    source_names = {
        "face": {str(t["name"]) for t in face.get("tags", [])},
        "products": {str(p["name"]) for p in beauty.get("products", [])},
        "finishes": {str(p["name"]) for p in beauty.get("finishes", [])},
        "styles": {str(p["name"]) for p in beauty.get("styles", [])},
        "nails": {str(p["name"]) for p in beauty.get("nails", [])},
        "shades": {str(p["id"]) for p in beauty.get("shades", [])},
    }
    orphan_examples: list[str] = []
    for group, keys in example_keys.items():
        orphans = sorted(keys - source_names[group])
        for name in orphans:
            orphan_examples.append(f"{group}:{name}")
    audit.require(
        not orphan_examples,
        "recognize.examples: keys not found in data source: " + "; ".join(orphan_examples[:20]),
    )

    # Every categorical (分类型) face tag must have an example sheet, because the
    # recognize page's face mode lists examples as primary visual references.
    categorical_names = {
        str(t["name"]) for t in face.get("tags", []) if str(t.get("type", "")) == "分类型"
    }
    uncovered_face = sorted(categorical_names - example_keys["face"])
    audit.require(
        not uncovered_face,
        "recognize.face-examples: categorical tags without examples: " + ", ".join(uncovered_face[:20]),
    )

    # Every beauty product / finish / style / nail / shade must have an example sheet,
    # so recognize's makeup/product/nail modes never show a label without a visual.
    uncovered_beauty: list[str] = []
    for group in ("products", "finishes", "styles", "nails", "shades"):
        missing = sorted(source_names[group] - example_keys[group])
        for name in missing:
            uncovered_beauty.append(f"{group}:{name}")
    audit.require(
        not uncovered_beauty,
        "recognize.beauty-examples: items without examples: " + "; ".join(uncovered_beauty[:20]),
    )

    body_examples_text = read_text("body-examples.js")
    body_example_names: list[str] = []
    for block in re.findall(r"addSheet\('[^']+',\s*\[(.*?)\]\);", body_examples_text, re.DOTALL):
        body_example_names.extend(re.findall(r"'([^']+)'", block))
    for block in re.findall(r"addGuides\(\s*\{(.*?)\}\);", body_examples_text, re.DOTALL):
        body_example_names.extend(re.findall(r"'([^']+)'\s*:", block))
    body_example_names.extend(re.findall(r"'([^']+)'\s*,\s*\d+", body_examples_text))

    group_sizes = {
        "face_examples": len(example_keys["face"]),
        "body_tags": len(body_names),
        "body_examples": len(set(body_example_names)),
        "styles": len(beauty.get("styles", [])),
        "finishes": len(beauty.get("finishes", [])),
        "products": len(beauty.get("products", [])),
        "shades": len(beauty.get("shades", [])),
        "nails": len(beauty.get("nails", [])),
    }
    empty_groups: list[str] = []
    for mode, groups in _RECOGNIZE_MODE_GROUPS.items():
        for group in groups:
            if group_sizes.get(group, 0) == 0:
                empty_groups.append(f"{mode}/{group}")
    audit.require(not empty_groups, "recognize.modes: empty data groups: " + ", ".join(empty_groups))

    if not orphan_examples and not uncovered_face and not uncovered_beauty and not empty_groups:
        audit.passed(
            f"recognize: {sum(len(v) for v in example_keys.values())} example keys resolve to data sources, "
            f"127 face + {sum(len(source_names[g]) for g in ('products','finishes','styles','nails','shades'))} beauty items covered, "
            f"all 5 modes have non-empty candidate groups"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--strict-warnings", action="store_true", help="return non-zero when warnings exist")
    args = parser.parse_args()
    audit = Audit()

    try:
        face = load_json_assignment("data.js", "window.FACE_ATLAS_DATA=")
        beauty = load_json_assignment("beauty-data.js", "window.BEAUTY_ATLAS_DATA=")
        audit_face(audit, face)
        audit_beauty(audit, beauty)
        audit_static_modules(audit)
        audit_urls_dates_and_assets(audit)
        audit_internal_links(audit)
        audit_html_accessibility(audit)
        audit_body_prose_terms(audit)
        audit_asset_cache_versions(audit)
        audit_cross_module_consistency(audit, face, beauty)
        audit_comparison_coverage(audit, face, beauty)
        audit_face_sources_methodology(audit)
        audit_relationship_consistency(audit, face, beauty)
        audit_recognize_data(audit, face, beauty)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        audit.fail(f"audit could not load data: {error}")

    result = audit.report()
    if args.strict_warnings and audit.warnings:
        return 2
    return result


if __name__ == "__main__":
    sys.exit(main())
