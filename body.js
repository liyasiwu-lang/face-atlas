(() => {
  const DATA = window.BODY_ATLAS_DATA;
  const EXAMPLES = window.BODY_ATLAS_EXAMPLES || {};
  if (!DATA) return;

  const $ = selector => document.querySelector(selector);
  const groups = [...new Set(DATA.tags.map(item => item.group))];
  const types = [...new Set(DATA.tags.map(item => item.type))];
  const compareGroups = [...new Set(DATA.comparisons.map(item => item.group))];
  const groupColors = ['#6f35a5','#1f6a6a','#b44762','#315d9b','#8a5c17','#536b12'];
  let activeGroup = '全部';
  let activeType = '全部';
  let activeCompareGroup = '全部';
  let visible = 24;
  let selectedCompare = 0;
  let bodyDialogNav = null;

  const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    "'":'&#39;',
    '"':'&quot;'
  }[char]));

  function exampleVisual(item, large = false) {
    const example = EXAMPLES[item.name];
    if (!example) {
      return `<div class="body-example-pending${large ? ' large' : ''}" aria-label="${escapeHTML(item.name)}图例制作中"><span>图例制作中</span></div>`;
    }
    const guide = example.guide
      ? `<span class="body-example-guide guide-${escapeHTML(example.guide)}" aria-hidden="true"><i></i><b></b><em></em></span>`
      : '';
    return `<figure class="body-example${large ? ' large' : ''}">
      <div class="body-example-sprite" role="img" aria-label="${escapeHTML(example.alt)}" style="--sheet:url('${escapeHTML(example.file)}');--x:${example.x};--y:${example.y};--size:${escapeHTML(example.size || '400% 300%')}">${guide}</div>
      ${large ? '<figcaption>AI 辅助比例图例 · 只表示标签核心关系，不代表唯一身形</figcaption>' : ''}
    </figure>`;
  }

  function makeChips(target, values, active, onPick) {
    target.innerHTML = ['全部', ...values].map(value => (
      `<button type="button" class="body-chip" aria-pressed="${value === active}" tabindex="${value === active ? 0 : -1}" data-value="${escapeHTML(value)}">${escapeHTML(value)}</button>`
    )).join('');
    target.querySelectorAll('button').forEach(button => button.addEventListener('click', () => onPick(button.dataset.value)));
    if (!target.dataset.kbInit) {
      target.dataset.kbInit = '1';
      target.addEventListener('keydown', event => {
        const button = event.target.closest('button');
        if (!button || !target.contains(button)) return;
        const buttons = [...target.querySelectorAll('button')];
        const index = buttons.indexOf(button);
        if (index < 0) return;
        let next = -1;
        switch (event.key) {
          case 'ArrowRight':
          case 'ArrowDown': next = (index + 1) % buttons.length; break;
          case 'ArrowLeft':
          case 'ArrowUp': next = (index - 1 + buttons.length) % buttons.length; break;
          case 'Home': next = 0; break;
          case 'End': next = buttons.length - 1; break;
        }
        if (next >= 0) {
          event.preventDefault();
          buttons[next].focus();
          buttons[next].click();
        }
      });
    }
  }

  function renderFilters() {
    makeChips($('#body-group-filters'), groups, activeGroup, value => {
      activeGroup = value;
      visible = 24;
      renderFilters();
      renderTags();
    });
    makeChips($('#body-type-filters'), types, activeType, value => {
      activeType = value;
      visible = 24;
      renderFilters();
      renderTags();
    });
  }

  function filteredTags() {
    const query = $('#body-search-input').value.trim().toLowerCase();
    let list = DATA.tags.filter(item => {
      const groupMatch = activeGroup === '全部' || item.group === activeGroup;
      const typeMatch = activeType === '全部' || item.type === activeType;
      const searchable = [
        item.id,item.name,item.alias,item.en,item.group,item.dimension,item.definition,item.confusion,item.keywords
      ].join(' ').toLowerCase();
      return groupMatch && typeMatch && (!query || searchable.includes(query));
    });
    const sort = $('#body-sort').value;
    if (query && sort === 'default') {
      const score = item => {
        const id = item.id.toLowerCase();
        const name = item.name.toLowerCase();
        const aliases = String(item.alias || '').toLowerCase().split(/[、，,;/\s]+/).filter(Boolean);
        if (id === query || name === query) return 0;
        if (aliases.includes(query)) return 1;
        if (name.startsWith(query) || aliases.some(alias => alias.startsWith(query))) return 2;
        if (name.includes(query) || aliases.some(alias => alias.includes(query))) return 3;
        return 4;
      };
      list = list.map((item, index) => ({item, index, score:score(item)}))
        .sort((a,b) => a.score - b.score || a.index - b.index)
        .map(record => record.item);
    }
    if (sort === 'name') list = list.slice().sort((a,b) => a.name.localeCompare(b.name,'zh-CN'));
    if (sort === 'group') list = list.slice().sort((a,b) => (a.group + a.dimension).localeCompare(b.group + b.dimension,'zh-CN'));
    return list;
  }

  function provenanceHTML(item) {
    const record = window.FACE_ATLAS_PROVENANCE?.resolve(item, 'body');
    if (!record) return '';
    const links = record.sources.map(source => {
      const external = source.url.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<li><a href="${escapeHTML(source.url)}"${external}>${escapeHTML(source.title)}</a><span>${escapeHTML(source.scope)}</span></li>`;
    }).join('');
    return `<section class="provenance-panel" aria-labelledby="body-provenance-title">
      <div class="provenance-heading">
        <div><span>资料治理</span><h3 id="body-provenance-title">${escapeHTML(record.reviewLabel)}</h3></div>
        <time datetime="${escapeHTML(record.reviewedAt)}">${escapeHTML(record.reviewedAt)}</time>
      </div>
      <p>${escapeHTML(record.reviewNote)}</p>
      <details>
        <summary>查看适用来源与边界</summary>
        <ul>${links}</ul>
        <a class="provenance-method-link" href="./methodology.html">完整方法论与修订规则 →</a>
      </details>
    </section>`;
  }

  function openTag(item) {
    const alias = item.alias ? `<span class="body-alias">别名：${escapeHTML(item.alias)}</span>` : '';
    $('#body-dialog-content').innerHTML = `<div class="dialog-inner">
      ${exampleVisual(item,true)}
      <p class="dialog-eyebrow">${escapeHTML(item.id)} · ${escapeHTML(item.group)} · ${escapeHTML(item.dimension)}</p>
      <h2 id="body-dialog-title">${escapeHTML(item.name)}</h2>
      <p class="dialog-en">${escapeHTML(item.en)}</p>
      ${alias}
      <p class="dialog-definition">${escapeHTML(item.definition)}</p>
      <div class="detail-grid">
        <div class="detail-box"><span>建议观察</span><p>${escapeHTML(item.view)}</p></div>
        <div class="detail-box"><span>标签性质</span><p>${escapeHTML(item.type)}</p></div>
        <div class="detail-box full"><span>共存规则</span><p>${escapeHTML(item.coexist)}</p></div>
        <div class="detail-box full"><span>容易混淆</span><p>${escapeHTML(item.confusion)}</p></div>
        <div class="detail-box full"><span>服装与版型应用</span><p>${escapeHTML(item.application)}</p></div>
        <div class="detail-box full"><span>标签 Prompt</span><p>${escapeHTML(item.prompt)}</p></div>
      </div>
      ${provenanceHTML(item)}
      <p class="kbd-hint">键盘：← → 切换上一条/下一条，Esc 关闭</p>
    </div>`;
    const list = filteredTags();
    const idx = list.findIndex(t => t.id === item.id);
    bodyDialogNav = idx >= 0 ? { list, index: idx } : null;
    const dialog=$('#body-dialog');
    if (!dialog.open) {
      const trigger=document.activeElement;
      dialog.addEventListener('close',()=>{ if(trigger && trigger.isConnected) trigger.focus(); },{once:true});
      dialog.showModal();
    }
    const closeBtn = dialog.querySelector('.dialog-close');
    if (closeBtn) closeBtn.focus();
  }

  function renderTags() {
    const list = filteredTags();
    $('#body-result-count').textContent = list.length;
    $('#body-empty').hidden = list.length !== 0;
    $('#body-grid').innerHTML = list.slice(0,visible).map(item => {
      const accent = groupColors[groups.indexOf(item.group) % groupColors.length];
      return `<button type="button" class="body-card" data-id="${item.id}" style="--body-accent:${accent}">
        ${exampleVisual(item)}
        <span class="body-card-meta"><span>${escapeHTML(item.group)}</span><span>${escapeHTML(item.type)}</span></span>
        <h3>${escapeHTML(item.name)}</h3>
        <span class="body-card-en">${escapeHTML(item.en)}</span>
        <p>${escapeHTML(item.definition)}</p>
        <span class="body-card-arrow" aria-hidden="true">↗</span>
      </button>`;
    }).join('');
    $('#body-grid').querySelectorAll('.body-card').forEach(card => {
      card.addEventListener('click', () => openTag(DATA.tags.find(item => item.id === card.dataset.id)));
    });
    $('#body-load-more').hidden = list.length <= visible;
  }

  function renderCompare() {
    const tabList = $('#body-compare-tabs');
    const previousScrollTop = tabList.scrollTop;
    const comparisons = activeCompareGroup === '全部'
      ? DATA.comparisons
      : DATA.comparisons.filter(item => item.group === activeCompareGroup);
    selectedCompare = Math.min(selectedCompare, comparisons.length - 1);
    tabList.innerHTML = comparisons.map((item,index) => (
      `<button id="body-compare-tab-${index}" type="button" role="tab" aria-selected="${index === selectedCompare}" aria-controls="body-compare-detail" tabindex="${index===selectedCompare?0:-1}" data-index="${index}">${escapeHTML(item.pair)}</button>`
    )).join('');
    const item = comparisons[selectedCompare];
    $('#body-compare-detail').setAttribute('aria-labelledby',`body-compare-tab-${selectedCompare}`);
    $('#body-compare-detail').innerHTML = `
      <span>${escapeHTML(item.group)} · 易混对照 ${String(selectedCompare + 1).padStart(2,'0')}</span>
      <h3>${escapeHTML(item.pair)}</h3>
      <div><b>核心区别</b><p>${escapeHTML(item.difference)}</p></div>
      <div class="body-compare-tip"><b>最快判断</b><p>${escapeHTML(item.tip)}</p></div>
    `;
    const tabs=[...tabList.querySelectorAll('button')];
    tabs.forEach((button,index) => {
      button.addEventListener('click', () => {
        selectedCompare = Number(button.dataset.index);
        renderCompare();
        $(`#body-compare-tab-${selectedCompare}`).focus();
      });
      button.addEventListener('keydown', event => {
        if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        let next=index;
        if (['ArrowUp','ArrowLeft'].includes(event.key)) next=(index-1+tabs.length)%tabs.length;
        if (['ArrowDown','ArrowRight'].includes(event.key)) next=(index+1)%tabs.length;
        if (event.key==='Home') next=0;
        if (event.key==='End') next=tabs.length-1;
        selectedCompare=next; renderCompare(); $(`#body-compare-tab-${next}`).focus();
      });
    });
    tabList.scrollTop = previousScrollTop;
    const selectedTab = tabs[selectedCompare];
    if (selectedTab) {
      const listRect = tabList.getBoundingClientRect();
      const tabRect = selectedTab.getBoundingClientRect();
      if (tabRect.top < listRect.top) tabList.scrollTop += tabRect.top - listRect.top;
      if (tabRect.bottom > listRect.bottom) tabList.scrollTop += tabRect.bottom - listRect.bottom;
    }
  }

  function initCompareFilter() {
    const select = $('#body-compare-group');
    const options = ['全部', ...compareGroups];
    select.innerHTML = options.map(group => {
      const count = group === '全部'
        ? DATA.comparisons.length
        : DATA.comparisons.filter(item => item.group === group).length;
      const label = group === '全部' ? '全部对照' : group;
      return `<option value="${escapeHTML(group)}">${escapeHTML(label)}（${count}）</option>`;
    }).join('');
    select.addEventListener('change', () => {
      activeCompareGroup = select.value;
      selectedCompare = 0;
      $('#body-compare-tabs').scrollTop = 0;
      renderCompare();
    });
  }

  function initVolumeTabs() {
    const tabs = [...document.querySelectorAll('[data-volume-tab]')];
    if (!tabs.length) return;
    const activate = (tab, moveFocus = false) => {
      tabs.forEach(item => {
        const active = item === tab;
        item.setAttribute('aria-selected', String(active));
        item.tabIndex = active ? 0 : -1;
        const panel = document.querySelector(`#body-volume-panel-${item.dataset.volumeTab}`);
        if (panel) panel.hidden = !active;
      });
      if (moveFocus) tab.focus();
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(tab));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        let next = index;
        if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        activate(tabs[next], true);
      });
    });
  }

  function openDeepLink() {
    const target = new URLSearchParams(window.location.search).get('tag');
    if (!target) return;
    const idMatch=DATA.tags.find(tag=>tag.id===target);
    const nameMatches=DATA.tags.filter(tag=>tag.name===target);
    const item=idMatch || (nameMatches.length===1 ? nameMatches[0] : null);
    if (!item) return;
    activeGroup = '全部';
    activeType = '全部';
    visible = 24;
    $('#body-search-input').value = item.name;
    renderFilters();
    renderTags();
    openTag(item);
    requestAnimationFrame(() => document.querySelector(`[data-id="${CSS.escape(item.id)}"]`)?.scrollIntoView({block:'center'}));
  }

  function restoreHashPosition() {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    const scroll = () => requestAnimationFrame(() => target.scrollIntoView({block:'start'}));
    if (document.readyState === 'complete') scroll();
    else window.addEventListener('load', scroll, {once:true});
  }

  $('#body-tag-total').textContent = DATA.tags.length;
  $('#body-group-total').textContent = groups.length;
  $('#body-example-total').textContent = DATA.tags.filter(item => EXAMPLES[item.name]).length;
  $('#body-search-input').addEventListener('input', () => {
    visible = 24;
    renderTags();
  });
  $('#body-search-input').addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      $('#body-search-input').value = '';
      visible = 24;
      renderTags();
      $('#body-search-input').blur();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const first = $('#body-grid').querySelector('.body-card');
      if (first) { first.focus(); }
      else {
        const input = $('#body-search-input');
        input.classList.remove('search-shake');
        void input.offsetWidth;
        input.classList.add('search-shake');
      }
    }
  });
  $('#body-sort').addEventListener('change', renderTags);
  $('#body-load-more').addEventListener('click', () => {
    visible += 24;
    renderTags();
  });
  $('#body-reset').addEventListener('click', () => {
    activeGroup = '全部';
    activeType = '全部';
    visible = 24;
    $('#body-search-input').value = '';
    renderFilters();
    renderTags();
    $('#body-search-input').focus();
  });
  $('.body-dialog .dialog-close').addEventListener('click', () => $('#body-dialog').close());
  $('#body-dialog').addEventListener('click', event => {
    if (event.target === $('#body-dialog')) $('#body-dialog').close();
  });
  $('#body-dialog').addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (event.target.matches('input,textarea,select,[contenteditable="true"]')) return;
    if (!bodyDialogNav || bodyDialogNav.list.length < 2) return;
    event.preventDefault();
    const dir = event.key === 'ArrowRight' ? 1 : -1;
    bodyDialogNav.index = (bodyDialogNav.index + dir + bodyDialogNav.list.length) % bodyDialogNav.list.length;
    openTag(bodyDialogNav.list[bodyDialogNav.index]);
  });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      $('#body-search-input').focus();
    }
  });

  (function bindGridNav() {
    const grid = $('#body-grid');
    grid.addEventListener('keydown', e => {
      if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
      const items = [...grid.querySelectorAll('.body-card')].filter(el => el.offsetParent !== null);
      if (!items.length) return;
      const current = items.findIndex(el => el.contains(e.target) || el === e.target);
      if (current < 0) return;
      e.preventDefault();
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length || 1;
      const total = items.length;
      const rows = Math.ceil(total / cols);
      const row = Math.floor(current / cols);
      const col = current % cols;
      let next;
      if (e.key === 'ArrowRight') next = (current + 1) % total;
      else if (e.key === 'ArrowLeft') next = (current - 1 + total) % total;
      else if (e.key === 'ArrowDown') next = Math.min(((row + 1) % rows) * cols + col, total - 1);
      else next = Math.min(((row - 1 + rows) % rows) * cols + col, total - 1);
      items[next].focus();
    });
  })();

  renderFilters();
  renderTags();
  initCompareFilter();
  renderCompare();
  initVolumeTabs();
  openDeepLink();
  restoreHashPosition();
})();
