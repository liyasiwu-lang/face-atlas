(() => {
  const { tags, confusions, applications, dimensionGuides = {} } = window.FACE_ATLAS_DATA;
  const examples = window.ATLAS_EXAMPLES?.face || {};
  const examplesById = window.ATLAS_EXAMPLES_BY_ID?.face || {};
  const $ = (s) => document.querySelector(s);
  const partColors = ['#6f35a5','#2656e8','#ee684f','#b42363','#008f85','#735c0f','#9347a5','#0b7895','#a33a2b','#536b12','#75468a'];
  const parts = [...new Set(tags.map(t => t.part))];
  const types = [...new Set(tags.map(t => t.type))];
  let activePart = '全部';
  let activeType = '全部';
  let visible = 24;
  let selectedCompare = 0;
  let activeCompareGroup = '脸型矩阵';
  let tagDialogNav = null;

  $('#tag-total').textContent = tags.length;
  $('#face-example-count').textContent = tags.filter(tag=>examplesById[tag.id]||examples[tag.name]).length;

  function exampleVisual(tag, large=false) {
    const ex = examplesById[tag.id] || examples[tag.name];
    if (!ex) return `<div class="example-pending${large?' large':''}" aria-label="${escapeHTML(tag.name)}图例制作中"><span>图例制作中</span><small>已预留独立图例位</small></div>`;
    return `<figure class="example-figure${large?' large':''}"><div class="example-sprite" role="img" aria-label="${escapeHTML(ex.alt)}" style="--sheet:url('${escapeHTML(ex.file)}');--x:${ex.x};--y:${ex.y}"></div>${large?'<figcaption>研究校准的 AI 辅助图例 · 只表示核心结构，不替代多角度观察</figcaption>':''}</figure>`;
  }

  function makeChips(container, values, active, handler) {
    container.innerHTML = ['全部', ...values].map(v => `<button class="chip" type="button" aria-pressed="${v === active}" tabindex="${v === active ? 0 : -1}" data-value="${v}">${v}</button>`).join('');
    container.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => handler(btn.dataset.value)));
    if (!container.dataset.kbInit) {
      container.dataset.kbInit = '1';
      container.addEventListener('keydown', e => {
        const btn = e.target.closest('button');
        if (!btn || !container.contains(btn)) return;
        const buttons = [...container.querySelectorAll('button')];
        const idx = buttons.indexOf(btn);
        if (idx < 0) return;
        let next = -1;
        switch (e.key) {
          case 'ArrowRight':
          case 'ArrowDown': next = (idx + 1) % buttons.length; break;
          case 'ArrowLeft':
          case 'ArrowUp': next = (idx - 1 + buttons.length) % buttons.length; break;
          case 'Home': next = 0; break;
          case 'End': next = buttons.length - 1; break;
        }
        if (next >= 0) {
          e.preventDefault();
          buttons[next].focus();
          buttons[next].click();
        }
      });
    }
  }

  function renderFilters() {
    makeChips($('#part-filters'), parts, activePart, value => { activePart = value; visible = 24; renderFilters(); renderTags(); });
    makeChips($('#type-filters'), types, activeType, value => { activeType = value; visible = 24; renderFilters(); renderTags(); });
  }

  function normalizeSearchText(value) {
    return String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function aliasValues(tag) {
    if (!tag.alias || tag.alias === '—') return [];
    return tag.alias
      .split(/[、,，/；;]+/)
      .map(normalizeSearchText)
      .filter(Boolean);
  }

  function searchRank(tag, query) {
    const name = normalizeSearchText(tag.name);
    const aliases = aliasValues(tag);
    const english = normalizeSearchText(tag.en);
    const keywords = tag.keywords.split(/[,，]+/).map(normalizeSearchText).filter(Boolean);
    if (name === query) return 0;
    if (aliases.includes(query)) return 1;
    if (english === query) return 2;
    if (name.startsWith(query)) return 3;
    if (aliases.some(value => value.startsWith(query))) return 4;
    if (keywords.includes(query)) return 5;
    if (name.includes(query)) return 6;
    if (aliases.some(value => value.includes(query))) return 7;
    if (english.includes(query)) return 8;
    if (`${tag.part} ${tag.dimension}`.toLowerCase().includes(query)) return 9;
    return 10;
  }

  function filteredTags() {
    const query = normalizeSearchText($('#search-input').value);
    let list = tags.filter(t => {
      const inPart = activePart === '全部' || t.part === activePart;
      const inType = activeType === '全部' || t.type === activeType;
      const haystack = normalizeSearchText([t.name,t.alias,t.en,t.part,t.dimension,t.definition,fieldValue(t,'definitionMethod'),fieldValue(t,'confusion'),t.keywords].join(' '));
      return inPart && inType && (!query || haystack.includes(query));
    });
    const sort = $('#sort-select').value;
    if (query && sort === 'default') {
      list = list
        .map((tag, index) => ({ tag, index, rank: searchRank(tag, query) }))
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
        .map(item => item.tag);
    }
    if (sort === 'name') list = list.slice().sort((a,b) => a.name.localeCompare(b.name,'zh-CN'));
    if (sort === 'dimension') list = list.slice().sort((a,b) => (a.part+a.dimension).localeCompare(b.part+b.dimension,'zh-CN'));
    return list;
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function fieldValue(tag, field) {
    return tag[field] || dimensionGuides[`${tag.part}::${tag.dimension}`]?.[field] || '';
  }

  function provenanceHTML(tag) {
    const record = window.FACE_ATLAS_PROVENANCE?.resolve(tag, 'face');
    if (!record) return '';
    const links = record.sources.map(source => {
      const external = source.url.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<li><a href="${escapeHTML(source.url)}"${external}>${escapeHTML(source.title)}</a><span>${escapeHTML(source.scope)}</span></li>`;
    }).join('');
    return `<section class="provenance-panel" aria-labelledby="face-provenance-title">
      <div class="provenance-heading">
        <div><span>资料治理</span><h3 id="face-provenance-title">${escapeHTML(record.reviewLabel)}</h3></div>
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

  function openTag(tag) {
    const alias = tag.alias && tag.alias !== '—' ? `<span class="alias-line">别名：${escapeHTML(tag.alias)}</span>` : '';
    $('#dialog-content').innerHTML = `<div class="dialog-inner">
      ${exampleVisual(tag,true)}
      <p class="dialog-eyebrow">${escapeHTML(tag.part)} · ${escapeHTML(tag.dimension)} · ${escapeHTML(tag.id)}</p>
      <h2 id="dialog-title">${escapeHTML(tag.name)}</h2>
      <p class="dialog-en">${escapeHTML(tag.en)}</p>${alias}
      <p class="dialog-definition">${escapeHTML(tag.definition)}</p>
      <div class="detail-grid">
        <div class="detail-box"><span>维度观察方法</span><p>${escapeHTML(fieldValue(tag,'view'))}</p></div>
        <div class="detail-box"><span>标签类型</span><p>${escapeHTML(tag.type)}</p></div>
        ${fieldValue(tag,'definitionMethod')?`<div class="detail-box full"><span>维度判定方法</span><p>${escapeHTML(fieldValue(tag,'definitionMethod'))}</p></div>`:''}
        <div class="detail-box full"><span>互斥 / 共存规则</span><p>${escapeHTML(tag.coexist)}</p></div>
        <div class="detail-box full"><span>维度易混边界</span><p>${escapeHTML(fieldValue(tag,'confusion'))}</p></div>
        <div class="detail-box full"><span>维度美妆应用</span><p>${escapeHTML(fieldValue(tag,'makeup'))}</p></div>
        <div class="detail-box full"><span>标签 Prompt</span><p>${escapeHTML(tag.prompt)}</p></div>
      </div>
      ${provenanceHTML(tag)}
      <p class="kbd-hint">键盘：← → 切换上一条/下一条，Esc 关闭</p>
    </div>`;
    const list = filteredTags();
    const idx = list.findIndex(t => t.id === tag.id);
    tagDialogNav = idx >= 0 ? { list, index: idx } : null;
    const dialog=$('#tag-dialog');
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
    $('#result-count').textContent = list.length;
    $('#empty-state').hidden = list.length !== 0;
    $('#tag-grid').innerHTML = list.slice(0,visible).map(tag => {
      const color = partColors[parts.indexOf(tag.part) % partColors.length];
      return `<button class="tag-card" type="button" data-id="${tag.id}" style="--card-accent:${color}">
        ${exampleVisual(tag)}
        <span class="card-meta"><span>${escapeHTML(tag.part)}</span><span>${escapeHTML(tag.dimension)}</span></span>
        <h3>${escapeHTML(tag.name)}</h3>
        <span class="english">${escapeHTML(tag.en)}</span>
        <p class="definition">${escapeHTML(tag.definition)}</p>
        <span class="arrow" aria-hidden="true">↗</span>
      </button>`;
    }).join('');
    $('#tag-grid').querySelectorAll('.tag-card').forEach(card => card.addEventListener('click', () => openTag(tags.find(t => t.id === card.dataset.id))));
    $('#load-more').hidden = list.length <= visible;
  }

  function renderCompare() {
    const groups = [...new Set(confusions.map(item => item.group || '其他对照'))];
    if (!groups.includes(activeCompareGroup)) activeCompareGroup = groups[0];
    $('#compare-filters').innerHTML = groups.map(group => {
      const count = confusions.filter(item => (item.group || '其他对照') === group).length;
      return `<button type="button" aria-pressed="${group===activeCompareGroup}" tabindex="${group===activeCompareGroup?0:-1}" data-group="${escapeHTML(group)}">${escapeHTML(group)} <span>${count}</span></button>`;
    }).join('');
    $('#compare-filters').querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      activeCompareGroup = button.dataset.group;
      selectedCompare = 0;
      renderCompare();
    }));
    if (!$('#compare-filters').dataset.kbInit) {
      $('#compare-filters').dataset.kbInit = '1';
      $('#compare-filters').addEventListener('keydown', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const buttons = [...$('#compare-filters').querySelectorAll('button')];
        const idx = buttons.indexOf(btn);
        if (idx < 0) return;
        let next = -1;
        switch (e.key) {
          case 'ArrowRight':
          case 'ArrowDown': next = (idx + 1) % buttons.length; break;
          case 'ArrowLeft':
          case 'ArrowUp': next = (idx - 1 + buttons.length) % buttons.length; break;
          case 'Home': next = 0; break;
          case 'End': next = buttons.length - 1; break;
        }
        if (next >= 0) {
          e.preventDefault();
          buttons[next].focus();
          buttons[next].click();
        }
      });
    }
    const matrix = confusions.filter(item => (item.group || '其他对照') === activeCompareGroup);
    selectedCompare = Math.min(selectedCompare, matrix.length - 1);
    $('#compare-list').setAttribute('aria-label', activeCompareGroup);
    $('#compare-list').innerHTML = matrix.map((c,i) => `<button id="compare-tab-${i}" class="compare-tab" role="tab" type="button" aria-selected="${i===selectedCompare}" aria-controls="compare-detail" tabindex="${i===selectedCompare?0:-1}" data-index="${i}">${escapeHTML(c.pair)}</button>`).join('');
    const item = matrix[selectedCompare];
    $('#compare-detail').setAttribute('aria-labelledby',`compare-tab-${selectedCompare}`);
    $('#compare-detail').innerHTML = `<span class="compare-badge">${escapeHTML(activeCompareGroup)} · ${String(selectedCompare+1).padStart(2,'0')} / ${String(matrix.length).padStart(2,'0')}</span>
      <h3>${escapeHTML(item.pair)}</h3>
      <div class="compare-block"><span>核心区别</span><p>${escapeHTML(item.difference)}</p></div>
      <div class="compare-block tip-block"><span>最快判断</span><p>${escapeHTML(item.tip)}</p></div>`;
    const tabs=[...$('#compare-list').querySelectorAll('button')];
    tabs.forEach((btn,index) => {
      btn.addEventListener('click', () => { selectedCompare = Number(btn.dataset.index); renderCompare(); });
      btn.addEventListener('keydown', event => {
        if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        let next=index;
        if (['ArrowUp','ArrowLeft'].includes(event.key)) next=(index-1+tabs.length)%tabs.length;
        if (['ArrowDown','ArrowRight'].includes(event.key)) next=(index+1)%tabs.length;
        if (event.key==='Home') next=0;
        if (event.key==='End') next=tabs.length-1;
        selectedCompare=next; renderCompare(); $(`#compare-tab-${next}`).focus();
      });
    });
  }

  function renderApplications(index=0) {
    $('#application-tabs').innerHTML = applications.map((a,i) => `<button id="application-tab-${i}" class="app-tab" role="tab" type="button" aria-selected="${i===index}" aria-controls="application-detail" tabindex="${i===index?0:-1}" data-index="${i}">${escapeHTML(a.part)}</button>`).join('');
    const item = applications[index];
    $('#application-detail').setAttribute('aria-labelledby',`application-tab-${index}`);
    $('#application-detail').innerHTML = `<div><small>${escapeHTML(item.use)}</small><h3>${escapeHTML(item.part)}</h3></div><p>${escapeHTML(item.method)}</p><p class="warning"><b>关键提醒</b><br>${escapeHTML(item.warning)}</p>`;
    const tabs=[...$('#application-tabs').querySelectorAll('button')];
    tabs.forEach((btn,tabIndex) => {
      btn.addEventListener('click', () => renderApplications(Number(btn.dataset.index)));
      btn.addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        let next=tabIndex;
        if (event.key==='ArrowLeft') next=(tabIndex-1+tabs.length)%tabs.length;
        if (event.key==='ArrowRight') next=(tabIndex+1)%tabs.length;
        if (event.key==='Home') next=0;
        if (event.key==='End') next=tabs.length-1;
        renderApplications(next); $(`#application-tab-${next}`).focus();
      });
    });
  }

  function openDeepLinkedTag() {
    const params = new URLSearchParams(window.location.search);
    const target = params.get('tag');
    if (!target) return;
    const normalizedTarget = normalizeSearchText(target);
    const idMatch = tags.find(item => normalizeSearchText(item.id) === normalizedTarget);
    const nameMatches = tags.filter(item => normalizeSearchText(item.name) === normalizedTarget);
    const aliasMatches = tags.filter(item => aliasValues(item).includes(normalizedTarget));
    const tag = idMatch
      || (nameMatches.length === 1 ? nameMatches[0] : null)
      || (aliasMatches.length === 1 ? aliasMatches[0] : null);
    if (!tag) return;
    activePart = '全部';
    activeType = '全部';
    visible = 24;
    $('#search-input').value = tag.name;
    renderFilters();
    renderTags();
    openTag(tag);
    requestAnimationFrame(() => document.querySelector(`[data-id="${CSS.escape(tag.id)}"]`)?.scrollIntoView({block:'center'}));
  }

  $('#search-input').addEventListener('input', () => { visible = 24; renderTags(); });
  $('#search-input').addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      $('#search-input').value = '';
      visible = 24;
      renderTags();
      $('#search-input').blur();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const first = $('#tag-grid').querySelector('.tag-card');
      if (first) { first.focus(); }
      else {
        const input = $('#search-input');
        input.classList.remove('search-shake');
        void input.offsetWidth;
        input.classList.add('search-shake');
      }
    }
  });
  $('#sort-select').addEventListener('change', renderTags);
  $('#load-more').addEventListener('click', () => { visible += 24; renderTags(); });
  $('#reset-button').addEventListener('click', () => { activePart='全部'; activeType='全部'; $('#search-input').value=''; visible=24; renderFilters(); renderTags(); $('#search-input').focus(); });
  $('.dialog-close').addEventListener('click', () => $('#tag-dialog').close());
  $('#tag-dialog').addEventListener('click', e => { if (e.target === $('#tag-dialog')) $('#tag-dialog').close(); });
  $('#tag-dialog').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.target.matches('input,textarea,select,[contenteditable="true"]')) return;
    if (!tagDialogNav || tagDialogNav.list.length < 2) return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    tagDialogNav.index = (tagDialogNav.index + dir + tagDialogNav.list.length) % tagDialogNav.list.length;
    openTag(tagDialogNav.list[tagDialogNav.index]);
  });
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#search-input').focus(); }
  });

  (function bindGridNav() {
    const grid = $('#tag-grid');
    grid.addEventListener('keydown', e => {
      if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
      const items = [...grid.querySelectorAll('.tag-card')].filter(el => el.offsetParent !== null);
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

  renderFilters(); renderTags(); renderCompare(); renderApplications(); openDeepLinkedTag();
})();
