/* Face Atlas: shared filter, observation and verified clipboard feedback. */
(() => {
  'use strict';
  if (window.ATLAS_FEEDBACK) return;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  }[c]));
  const timers = new WeakMap();
  const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>';
  function replay(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }
  function promptHTML(text) {
    return `<div class="detail-box full atlas-prompt-box"><div class="atlas-prompt-heading"><span>标签 Prompt</span><span class="atlas-copy-actions"><button type="button" class="atlas-copy-button" data-atlas-copy>复制 Prompt</button><span class="atlas-copy-stamp" aria-hidden="true">${check}已复制</span></span></div><p data-atlas-prompt>${esc(text)}</p><span class="atlas-copy-status atlas-sr-only" role="status" aria-live="polite"></span></div>`;
  }
  async function copyPrompt(button, text, options = {}) {
    if (button.disabled) return false;
    const actions = button.closest('.atlas-copy-actions');
    const box = button.closest('.atlas-prompt-box');
    const status = options.status || box?.querySelector('.atlas-copy-status');
    const originalLabel = button.dataset.copyLabel || button.textContent;
    button.dataset.copyLabel = originalLabel;
    clearTimeout(timers.get(button));
    actions?.classList.remove('is-confirmed');
    if (status) status.textContent = '';
    if (!String(text).trim()) {
      if (status) status.textContent = '当前没有可复制的 Prompt。';
      return false;
    }
    const dialog = button.closest('dialog');
    const current = () => button.isConnected && (!dialog || dialog.open);
    let temporary = null;
    let copied = false;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(String(text));
        copied = true;
      } catch (_) {
        if (!current()) return false;
        const field = options.field || document.createElement('textarea');
        if (!options.field) {
          temporary = field;
          field.className = 'atlas-sr-only';
          field.setAttribute('aria-hidden', 'true');
          field.value = String(text);
          field.readOnly = true;
          (dialog || document.body).appendChild(field);
        }
        field.focus({ preventScroll: true });
        field.select();
        try { copied = document.execCommand('copy') === true; } catch (_) { copied = false; }
      }
      if (!current()) return copied;
      if (copied) {
        button.textContent = '已复制';
        if (status) status.textContent = 'Prompt 已复制。';
        if (actions) replay(actions, 'is-confirmed');
        timers.set(button, setTimeout(() => {
          actions?.classList.remove('is-confirmed');
          button.textContent = originalLabel;
        }, 1600));
      } else {
        if (options.field) {
          options.field.focus({ preventScroll: true });
          options.field.select();
        } else {
          const paragraph = box?.querySelector('[data-atlas-prompt]');
          if (paragraph) {
            paragraph.tabIndex = -1;
            paragraph.focus({ preventScroll: true });
            const range = document.createRange();
            range.selectNodeContents(paragraph);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }
        button.textContent = '手动复制';
        if (status) status.textContent = '自动复制未完成。已选中 Prompt，可按 ⌘C / Ctrl+C 复制。';
      }
      return copied;
    } finally {
      temporary?.remove();
      button.disabled = false;
      button.removeAttribute('aria-busy');
      if (copied && current()) button.focus({ preventScroll: true });
    }
  }

  // Centers belong to these existing individual portraits, not to face-shape definitions.
  const coreCenters = [[.48,.61,.71],[.47,.59,.68],[.48,.61,.70],[.48,.61,.70]];
  const shapeCenters = [
    [.47,.59,.68],[.49,.61,.72],[.45,.57,.67],[.54,.67,.77],
    [.46,.59,.68],[.47,.60,.68],[.51,.64,.74],[.57,.70,.80],
    [.51,.64,.75],[.50,.62,.73],[.52,.65,.76],[.56,.69,.79]
  ];
  function referenceHTML(example) {
    if (!example) return '';
    const filename = example.file.split('?')[0].split('/').pop();
    const col = Math.round(parseFloat(example.x) * 3 / 100);
    const row = Math.round(parseFloat(example.y) * 2 / 100);
    const centers = filename === 'face-core-grid.webp' && row === 0
      ? coreCenters[col] : filename === 'face-shapes-2-grid.webp' ? shapeCenters[row * 4 + col] : null;
    if (!centers) return '';
    const style = `--sheet:url('${esc(example.file)}');--x:${esc(example.x)};--y:${esc(example.y)}`;
    return `<section class="atlas-observer" data-atlas-observer data-view="full" data-centers="${centers.join(',')}" style="${style}">
      <div class="atlas-observe-controls" role="radiogroup" aria-label="图例观察部位">${[['full','全貌'],['eye','眼部'],['nose','鼻部'],['lip','唇部']].map(([value,label]) => `<button type="button" class="atlas-observe-button" role="radio" data-atlas-view="${value}" aria-checked="${value === 'full'}" tabindex="${value === 'full' ? 0 : -1}">${label}</button>`).join('')}</div>
      <div class="atlas-reference-window" role="img" aria-label="${esc(example.alt)}"><div class="atlas-reference-scene"></div></div>
      <div class="atlas-observe-context"><div class="atlas-reference-thumb" aria-hidden="true"><span class="atlas-reference-locator"></span></div><p data-atlas-observe-note role="status" aria-live="polite">全貌 · AI 辅助个体图例；先看轮廓，再观察局部。</p></div>
      <p class="atlas-reference-note">定位框表示观察范围；放大不增加原图细节，也不代表这一脸型的固定五官。</p>
    </section>`;
  }
  function observe(root, value) {
    const config = {
      full: { label:'全貌', center:.5, scale:1, aspect:'1', width:1, height:1, note:'AI 辅助个体图例；先看轮廓，再观察局部。' },
      eye: { label:'眼部', index:0, scale:2, aspect:'16 / 9', width:.5, height:.28, note:'观察眼裂、眼角与上眼睑；五官只描述这一图例。' },
      nose: { label:'鼻部', index:1, scale:3, aspect:'4 / 3', width:.33, height:.25, note:'观察鼻梁、鼻尖和鼻翼；鼻根高度需要侧面补充。' },
      lip: { label:'唇部', index:2, scale:2.8, aspect:'16 / 9', width:.36, height:.20, note:'观察唇峰、唇缘与上下唇比例；表情会改变形态。' }
    }[value];
    if (!config) return;
    const changed = root.dataset.view !== value;
    const centers = root.dataset.centers.split(',').map(Number);
    const center = value === 'full' ? config.center : centers[config.index];
    root.dataset.view = value;
    root.style.setProperty('--focus-y', `${center * 100}%`);
    root.style.setProperty('--focus-scale', config.scale);
    root.style.setProperty('--focus-aspect', config.aspect);
    const locator = root.querySelector('.atlas-reference-locator');
    locator.style.width = `${config.width * 100}%`;
    locator.style.height = `${config.height * 100}%`;
    locator.style.transform = `translate(${(1 - config.width) * 32}px,${(center - config.height / 2) * 64}px)`;
    root.querySelectorAll('[data-atlas-view]').forEach(button => {
      const active = button.dataset.atlasView === value;
      button.setAttribute('aria-checked', String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && changed) replay(button, 'atlas-chip-confirm');
    });
    root.querySelector('.atlas-reference-window').setAttribute('aria-label', `${config.label}放大 · AI 个体图例`);
    root.querySelector('[data-atlas-observe-note]').textContent = `${config.label} · ${config.note}`;
    if (changed) replay(root.querySelector('.atlas-reference-window'), 'atlas-focus-confirm');
  }
  document.addEventListener('click', event => {
    const copy = event.target.closest('[data-atlas-copy]');
    if (copy) {
      const text = copy.closest('.atlas-prompt-box')?.querySelector('[data-atlas-prompt]')?.textContent;
      if (text != null) void copyPrompt(copy, text);
    }
    const view = event.target.closest('[data-atlas-view]');
    if (view) {
      view.focus({ preventScroll: true });
      observe(view.closest('[data-atlas-observer]'), view.dataset.atlasView);
    }
  });
  document.addEventListener('keydown', event => {
    const button = event.target.closest('[data-atlas-view]');
    if (!button || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const root = button.closest('[data-atlas-observer]');
    const buttons = [...root.querySelectorAll('[data-atlas-view]')];
    const index = buttons.indexOf(button);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (['ArrowRight','ArrowDown'].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].click();
  });
  // Capture the selection before existing handlers rebuild the filter group.
  document.addEventListener('click', event => {
    const button = event.target.closest('.chip, .beauty-chip, .body-chip');
    if (!button) return;
    const container = button.parentElement;
    const value = button.dataset.value;
    const changed = button.getAttribute('aria-pressed') !== 'true';
    queueMicrotask(() => {
      if (!container.isConnected) return;
      const selected = [...container.querySelectorAll('button')].find(candidate => candidate.dataset.value === value && candidate.getAttribute('aria-pressed') === 'true');
      if (!selected) return;
      if (changed) replay(selected, 'atlas-chip-confirm');
      selected.focus({ preventScroll: true });
    });
  }, true);
  window.ATLAS_FEEDBACK = { promptHTML, copyPrompt, referenceHTML };
})();
