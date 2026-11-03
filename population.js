(() => {
  'use strict';
  const data = window.POPULATION_ATLAS;
  const state = { group: '全部', sex: 'pair', query: '', selected: [], detail: null, view: 'full' };
  const $ = id => document.getElementById(id);
  const grid = $('grid'), dialog = $('viewer');
  const groups = ['全部', '亚洲', '非洲', '欧洲', '美洲', '大洋洲'];
  const requestedGroup = new URLSearchParams(location.search).get('group');
  if (groups.includes(requestedGroup)) state.group = requestedGroup;
  const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const zoomIcon = '<svg class="zoom-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/></svg>';
  const sexLabel = sex => sex === 'female' ? '女性' : '男性';
  const copyTimers = new WeakMap();
  let returnFocus = null, toastTimer;
  const find = id => data.regions.find(item => item.id === id);
  function toast(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2600);
  }
  function setRadio(container, key, value) {
    container.querySelectorAll('[role="radio"]').forEach(button => {
      const active = button.dataset[key] === value;
      const changed = button.getAttribute('aria-checked') !== String(active);
      button.setAttribute('aria-checked', String(active)); button.tabIndex = active ? 0 : -1;
      if (active && changed) playFeedback(button, 'chip-confirm');
    });
  }
  function playFeedback(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }
  function roving(container) {
    if (container.dataset.kbInit) return;
    container.dataset.kbInit = '1';
    container.addEventListener('keydown', event => {
      if (!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
      const buttons = [...container.querySelectorAll('[role="radio"]')];
      const index = buttons.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
        (index + (['ArrowRight','ArrowDown'].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus(); buttons[next].click();
    });
  }
  function visibleAssets(item) { return item.assets.filter(asset => state.sex === 'pair' || asset.sex === state.sex); }
  function render() {
    const results = data.regions.filter(item => (state.group === '全部' || item.group === state.group) &&
      `${item.label} ${item.search} ${item.info.definition} ${item.info.portraits.map(p => p.features.join(' ')).join(' ')}`.toLowerCase().includes(state.query.toLowerCase().trim()));
    $('count').textContent = `${results.length} 个入口 · ${results.length * (state.sex === 'pair' ? 2 : 1)} 张图例`;
    grid.classList.toggle('single', state.sex !== 'pair'); $('empty').hidden = results.length > 0;
    grid.innerHTML = results.map((item, index) => `<article class="region-card" style="--delay:${Math.min(index, 7) * 35}ms">
      <div class="card-heading"><div><span class="number">${esc(item.number)} / ${esc(item.group)}</span><h3>${esc(item.label)}</h3></div>
      <button type="button" class="select-card" data-select="${esc(item.id)}" aria-pressed="${state.selected.includes(item.id)}" aria-label="选择${esc(item.label)}加入并排观察">${state.selected.includes(item.id) ? '已选择 ✓' : '＋ 对照'}</button></div>
      <div class="pair-images">${visibleAssets(item).map(asset => `<button type="button" class="portrait-button" data-open="${esc(item.id)}" data-focus-sex="${asset.sex}" aria-label="放大${esc(item.label)}${sexLabel(asset.sex)}图例"><img src="${esc(asset.src)}" width="840" height="840" loading="lazy" decoding="async" alt="${esc(item.label)}背景的 AI ${sexLabel(asset.sex)}个体图例"><span>${sexLabel(asset.sex)}</span>${zoomIcon}</button>`).join('')}</div>
      <div class="card-footer"><small>${item.isNew ? '待审新图' : 'AI 个体示意'}</small><button type="button" class="detail-button" data-open="${esc(item.id)}" aria-label="查看${esc(item.label)}详情">细看结构 ↗</button></div></article>`).join('');
    updateTray();
  }
  function updateTray() {
    $('tray').hidden = state.selected.length === 0; $('selection-label').textContent = `已选 ${state.selected.length} / 2`;
    $('selection-names').textContent = state.selected.map(id => find(id).label).join(' / ');
    $('compare').disabled = state.selected.length !== 2;
  }
  function select(id) {
    if (state.selected.includes(id)) state.selected = state.selected.filter(value => value !== id);
    else if (state.selected.length < 2) state.selected.push(id);
    else { toast('已选两组，请先取消一组。'); return; }
    grid.querySelectorAll('[data-select]').forEach(button => {
      const active = state.selected.includes(button.dataset.select);
      button.setAttribute('aria-pressed', String(active)); button.textContent = active ? '已选择 ✓' : '＋ 对照';
    }); updateTray();
  }
  function imageFigure(item, asset, locator = false) {
    return `<figure><div class="photo-window"><img src="${esc(asset.src)}" width="840" height="840" alt="${esc(item.label)}${sexLabel(asset.sex)}个体图例" data-sex="${asset.sex}" ${Object.entries(asset.details).map(([key, src]) => `data-${key}="${esc(src)}"`).join(' ')}></div><figcaption><span class="portrait-caption">${sexLabel(asset.sex)} · AI 个体示意</span>${locator ? `<span class="part-map" hidden aria-hidden="true"><span class="map-photo"><img src="${esc(asset.src)}" width="840" height="840" alt="" loading="lazy"><span class="part-locator"></span></span><span class="map-label">部位定位示意</span></span>` : ''}</figcaption></figure>`;
  }
  function openModal() {
    returnFocus = document.activeElement;
    if (typeof dialog.showModal !== 'function') { toast('请用支持弹窗的新版本浏览器打开图鉴。'); return; }
    dialog.showModal(); $('close-viewer').focus();
  }
  const views = {
    full: ['全貌', '男女图例已统一取景尺度与眼线位置。先看整体轮廓，再查看局部；脸形和表情仍保留个体差异。'],
    eye: ['眼部', '观察上睑褶皱、内眦形态与眼裂方向。这里展示的是该个体，不是地域特征结论。'],
    nose: ['鼻部', '观察鼻梁走向、鼻尖和鼻翼的相对位置。正面图不能充分呈现鼻根高度。'],
    lip: ['唇部', '观察唇峰、上下唇比例和嘴角。微笑、唇色和光线会影响可见轮廓。']
  };
  function knowledgeContent(item, assets) {
    const info = item.info;
    const sourceIds = [...new Set([...info.sourceIds, ...info.commonSourceIds])];
    return `<section class="definition-block" aria-label="科普定义">
      <div class="knowledge-heading"><h3>科普定义</h3><span>${esc(info.type)}</span></div>
      <p>${esc(info.definition)}</p><p class="scope"><b>本轮范围：</b>${esc(info.scope)}</p>
      <p class="clarification">${esc(info.clarification)}</p>
      <details class="source-block"><summary>国籍、地域、族群、祖源有什么区别？</summary><p>${esc(window.POPULATION_INFO.overview)}</p></details>
      <details class="source-block"><summary>定义依据与适用范围</summary><ul>${sourceIds.map(id => {
        const source = window.POPULATION_INFO.sources[id];
        return `<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ↗</a><small>${esc(source.supports)}</small></li>`;
      }).join('')}</ul><p>文献支持定义与使用边界，不验证 AI 图例是否代表该人群。资料核对：2026-11-02。</p></details>
      </section><section class="feature-section" aria-label="图例特征与 prompt">
      <h3>图例特征与 prompt</h3><p class="feature-note">${esc(window.POPULATION_INFO.promptNote)}</p>
      <div class="feature-grid">${assets.map(asset => {
        const portrait = info.portraits.find(p => p.sex === asset.sex);
        return `<article class="feature-card"><h4>${sexLabel(asset.sex)} · 可见特征</h4>
          <ul>${portrait.features.map(feature => `<li>${esc(feature)}</li>`).join('')}</ul>
          <details class="prompt-block"><summary>展开外观 prompt</summary>
            <label for="prompt-${asset.sex}">中文外观 prompt</label>
            <textarea id="prompt-${asset.sex}" readonly rows="7" spellcheck="false">${esc(portrait.appearancePrompt)}</textarea>
            <div class="copy-actions"><button type="button" class="copy-prompt" data-copy="${asset.sex}">复制外观 prompt</button>
              <span class="copy-stamp" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 12 2 2 4-4"></path><circle cx="12" cy="12" r="9"></circle></svg>已复制</span>
              <span class="copy-status sr-only" role="status" aria-live="polite"></span></div>
            <p class="context-prompt">${esc(portrait.backgroundPrompt)}</p>
          </details></article>`;
      }).join('')}</div></section>`;
  }
  function openDetail(id, focusSex) {
    const item = find(id); state.detail = id; state.view = 'full';
    const sex = focusSex || state.sex;
    $('viewer-title').textContent = `${item.label} · 个体观察`;
    $('viewer-content').innerHTML = `<div class="detail-controls"><div class="chips" id="detail-sex" role="radiogroup" aria-label="详情图例选择">${['pair','female','male'].map(value => `<button type="button" role="radio" data-value="${value}" aria-checked="${value === sex}" tabindex="${value === sex ? 0 : -1}">${value === 'pair' ? '男女配对' : sexLabel(value)}</button>`).join('')}</div><div class="chips" id="detail-view" role="radiogroup" aria-label="观察部位">${Object.entries(views).map(([value, info]) => `<button type="button" role="radio" data-value="${value}" aria-checked="${value === 'full'}" tabindex="${value === 'full' ? 0 : -1}">${info[0]}</button>`).join('')}</div></div><div class="detail-portraits" id="detail-images"></div><p class="observation" id="observation" role="status" aria-live="polite"></p><div id="detail-knowledge"></div><p class="dialog-note">定义有资料依据；图例特征仅描述这张 AI 图片，人群比例与平均测量值未提供。${item.note ? `<br>${esc(item.note)}` : ''}</p>`;
    let detailSex = sex;
    function paintImages() {
      const assets = item.assets.filter(asset => detailSex === 'pair' || asset.sex === detailSex);
      $('detail-images').innerHTML = assets.map(asset => imageFigure(item, asset, true)).join('');
      $('detail-knowledge').innerHTML = knowledgeContent(item, assets);
      $('detail-images').style.gridTemplateColumns = assets.length === 1 ? 'minmax(0, 480px)' : '';
      $('detail-images').style.justifyContent = 'center'; applyView();
    }
    function applyView(animate = false) {
      $('observation').textContent = views[state.view][1];
      $('detail-images').dataset.view = state.view;
      $('detail-images').querySelectorAll('.photo-window img').forEach(image => {
        const figure = image.closest('figure');
        const windowElement = image.closest('.photo-window');
        windowElement.classList.remove('focus-confirm');
        image.onload = () => {
          if (animate && image.isConnected && dialog.open) playFeedback(windowElement, 'focus-confirm');
        };
        image.src = image.dataset[state.view];
        image.width = state.view === 'full' ? 840 : 960;
        image.height = state.view === 'full' ? 840 : state.view === 'nose' ? 720 : 540;
        image.alt = `${item.label}${sexLabel(image.dataset.sex)} · ${views[state.view][0]}${state.view === 'full' ? '图例' : '特写'}`;
        figure.querySelector('.portrait-caption').textContent =
          `${sexLabel(image.dataset.sex)} · ${views[state.view][0]}${state.view === 'full' ? ' · AI 个体示意' : '特写'}`;
        const map = figure.querySelector('.part-map');
        map.hidden = state.view === 'full';
        map.dataset.view = state.view;
        map.querySelector('.map-label').textContent = `${views[state.view][0]}定位示意`;
        if (animate && image.complete && image.naturalWidth > 0) playFeedback(windowElement, 'focus-confirm');
      });
    }
    $('detail-sex').addEventListener('click', event => {
      const button = event.target.closest('[data-value]'); if (!button) return;
      button.focus(); detailSex = button.dataset.value; setRadio($('detail-sex'), 'value', detailSex); paintImages();
    });
    $('detail-view').addEventListener('click', event => {
      const button = event.target.closest('[data-value]'); if (!button) return;
      button.focus(); const changed = state.view !== button.dataset.value;
      state.view = button.dataset.value; setRadio($('detail-view'), 'value', state.view); applyView(changed);
    });
    $('detail-knowledge').addEventListener('click', async event => {
      const button = event.target.closest('[data-copy]'); if (!button || button.disabled) return;
      const field = $(`prompt-${button.dataset.copy}`);
      const actions = button.closest('.copy-actions');
      const status = actions.querySelector('.copy-status');
      clearTimeout(copyTimers.get(button)); actions.classList.remove('is-confirmed');
      status.textContent = '';
      button.disabled = true; button.setAttribute('aria-busy', 'true');
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(field.value);
        if (!button.isConnected || !dialog.open) return;
        button.textContent = '已复制';
        status.textContent = `${sexLabel(button.dataset.copy)}外观 prompt 已复制。`;
        playFeedback(actions, 'is-confirmed');
        copyTimers.set(button, setTimeout(() => {
          actions.classList.remove('is-confirmed');
          button.textContent = '复制外观 prompt';
        }, 1600));
      } catch (error) {
        if (!field.isConnected || !dialog.open) return;
        field.focus(); field.select();
        button.textContent = '已选中，可按 ⌘C / Ctrl+C 复制';
        status.textContent = '自动复制未完成，已选中 prompt，可按 ⌘C / Ctrl+C 复制。';
      } finally {
        button.disabled = false; button.removeAttribute('aria-busy');
      }
    });
    roving($('detail-sex')); roving($('detail-view')); paintImages(); openModal();
  }
  function compare() {
    if (state.selected.length !== 2) return;
    $('viewer-title').textContent = '两组图例 · 并排观察';
    $('viewer-content').innerHTML = `<div class="compare-layout">${state.selected.map(id => {
      const item = find(id);
      return `<section class="compare-panel"><h3>${esc(item.label)}</h3><div class="detail-portraits">${visibleAssets(item).map(asset => imageFigure(item, asset)).join('')}</div></section>`;
    }).join('')}</div><p class="dialog-note">图例已统一取景尺度，表情仍有差异。请比较具体结构，不把个体差异推断为整个人群的差异。本图鉴不提供测量或统计结论。</p>`;
    openModal();
  }
  function reset() {
    state.query = ''; state.group = '全部'; state.sex = 'pair'; $('search').value = '';
    setRadio($('groups'), 'group', state.group); setRadio($('sex'), 'sex', state.sex);
    render(); $('search').focus();
  }
  $('groups').innerHTML = groups.map(group => `<button type="button" role="radio" data-group="${group}" aria-checked="${group === state.group}" tabindex="${group === state.group ? 0 : -1}">${group}</button>`).join('');
  $('groups').addEventListener('click', event => { const button = event.target.closest('[data-group]'); if (!button) return; state.group = button.dataset.group; setRadio($('groups'), 'group', state.group); render(); });
  $('sex').addEventListener('click', event => { const button = event.target.closest('[data-sex]'); if (!button) return; state.sex = button.dataset.sex; setRadio($('sex'), 'sex', state.sex); render(); });
  $('search').addEventListener('input', event => { state.query = event.target.value; render(); });
  $('search').addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); state.query = ''; $('search').value = ''; render(); }
    if (event.key === 'Enter') { event.preventDefault(); grid.querySelector('.portrait-button')?.focus(); }
  });
  grid.addEventListener('click', event => {
    const selectButton = event.target.closest('[data-select]'); if (selectButton) { selectButton.focus(); select(selectButton.dataset.select); return; }
    const openButton = event.target.closest('[data-open]'); if (openButton) { openButton.focus(); openDetail(openButton.dataset.open, openButton.dataset.focusSex); }
  });
  $('compare').addEventListener('click', () => { $('compare').focus(); compare(); });
  $('clear-selection').addEventListener('click', () => { state.selected = []; render(); $('search').focus(); });
  $('reset').addEventListener('click', reset); $('empty-reset').addEventListener('click', reset);
  $('close-viewer').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); });
  dialog.addEventListener('click', event => { if (event.target !== dialog) return; const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !dialog.open) { event.preventDefault(); $('search').focus(); }
  });
  grid.addEventListener('error', event => {
    if (event.target.tagName === 'IMG') { event.target.alt = '图片读取失败，请刷新页面'; event.target.closest('.portrait-button').style.minHeight = '120px'; }
  }, true);
  roving($('groups')); roving($('sex')); render();
})();
