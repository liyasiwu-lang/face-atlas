/* Face Atlas · 孟菲斯试点互动层（仅试点页加载，不依赖/不修改业务逻辑） */
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- 1. 撞色阅读进度条 ---------- */
  const rail = document.createElement('div');
  rail.className = 'progress-rail';
  const bar = document.createElement('div');
  bar.className = 'progress-bar';
  rail.appendChild(bar);
  document.body.appendChild(rail);
  function updateProgress() {
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, doc.scrollTop / max) : 0) + ')';
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();

  /* ---------- 2. Hero 几何视差（鼠标 + 滚动） ---------- */
  const decor = $$('.memphis-decor span');
  const depths = [0.35, 0.6, 0.45, 0.55, 0.28, 0.7];
  decor.forEach((el, i) => el.dataset.depth = depths[i % depths.length]);
  if (!reduceMotion && finePointer) {
    const hero = $('.hero');
    if (hero) {
      let mx = 0, my = 0, ticking = false;
      hero.addEventListener('mousemove', (e) => {
        const r = hero.getBoundingClientRect();
        mx = (e.clientX - r.left) / r.width - 0.5;
        my = (e.clientY - r.top) / r.height - 0.5;
        if (!ticking) { requestAnimationFrame(applyParallax); ticking = true; }
      }, { passive: true });
      hero.addEventListener('mouseleave', () => { mx = 0; my = 0; applyParallax(); });
      function applyParallax() {
        ticking = false;
        const sy = Math.min(window.scrollY, 700);
        decor.forEach(el => {
          const d = parseFloat(el.dataset.depth);
          el.style.translate = `${(-mx * d * 34).toFixed(1)}px ${(-my * d * 26 - sy * d * 0.12).toFixed(1)}px`;
        });
      }
      window.addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(applyParallax); ticking = true; } }, { passive: true });
    }
  }

  /* ---------- 3. Hero 标题逐字拆分（hover 弹跳用） ---------- */
  const heroH1 = $('#hero-title');
  if (heroH1) {
    let ci = 0;
    function splitNode(node) {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          [...child.textContent].forEach(ch => {
            if (/\s/.test(ch)) { frag.appendChild(document.createTextNode(ch)); return; }
            const s = document.createElement('span');
            s.className = 'ch';
            s.textContent = ch;
            s.style.setProperty('--ci', ci++);
            frag.appendChild(s);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1) { splitNode(child); }
      });
    }
    splitNode(heroH1);
  }

  /* ---------- 4. 数字滚动计数 ---------- */
  const stats = $$('.stats strong');
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const el = en.target;
        io.unobserve(el);
        const target = parseInt(el.textContent.replace(/\D/g, ''), 10) || 0;
        const dur = 1100, t0 = performance.now();
        (function tick(now) {
          const p = Math.min(1, (now - t0) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased);
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
      });
    }, { threshold: 0.6 });
    stats.forEach(el => io.observe(el));
  }

  /* ---------- 5-7. 全站卡片：错峰弹入 / 3D 倾斜 / 点击粒子 ---------- */
  const CARD_SEL = '.tag-card, .beauty-card, .comparison-card, .body-card, .history-card';
  const GRID_SEL = '#tag-grid, #beauty-grid, #body-grid, #history-list';
  const grids = $$(GRID_SEL).filter(Boolean);

  const colors = ['var(--lime)', 'var(--coral)', 'var(--violet)', 'var(--pink)', 'var(--cobalt)'];
  const shapes = ['c-circle', 'c-square', 'c-ring'];
  function burst(x, y, n, host) {
    if (reduceMotion) return;
    const layer = (host && host.open) ? host : document.body;
    for (let i = 0; i < (n || 12); i++) {
      const c = document.createElement('span');
      const shape = shapes[i % shapes.length];
      c.className = 'confetti ' + shape;
      if (shape === 'c-ring') c.style.color = colors[i % colors.length];
      else c.style.background = colors[i % colors.length];
      const ang = (Math.PI * 2 * i) / (n || 12) + Math.random() * 0.5;
      const dist = 55 + Math.random() * 75;
      c.style.left = x + 'px';
      c.style.top = y + 'px';
      c.style.setProperty('--tx', Math.cos(ang) * dist + 'px');
      c.style.setProperty('--ty', Math.sin(ang) * dist + 'px');
      c.style.setProperty('--rot', (Math.random() * 540 - 270) + 'deg');
      layer.appendChild(c);
      requestAnimationFrame(() => c.classList.add('go'));
      setTimeout(() => c.remove(), 800);
    }
  }
  window.__memphisBurst = burst;

  grids.forEach(grid => {
    /* 5. 错峰弹入 */
    if (!reduceMotion && 'IntersectionObserver' in window) {
      const revealIO = new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (en.isIntersecting) { en.target.classList.add('in'); revealIO.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px' });
      const seen = new WeakSet();
      function armCards() {
        $$(CARD_SEL, grid).forEach((card, i) => {
          if (seen.has(card)) return;
          seen.add(card);
          card.classList.add('reveal');
          card.style.setProperty('--d', Math.min(i, 14) * 42 + 'ms');
          revealIO.observe(card);
        });
      }
      new MutationObserver(armCards).observe(grid, { childList: true });
      armCards();
    }

    /* 6. 3D 倾斜 */
    if (finePointer && !reduceMotion) {
      grid.addEventListener('mousemove', (e) => {
        const card = e.target.closest(CARD_SEL);
        if (!card || !grid.contains(card)) return;
        const r = card.getBoundingClientRect();
        const rx = ((e.clientY - r.top) / r.height - 0.5) * -7;
        const ry = ((e.clientX - r.left) / r.width - 0.5) * 8;
        card.classList.add('tilting');
        card.style.transform = `perspective(720px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(5px)`;
      }, { passive: true });
      grid.addEventListener('mouseover', (e) => {
        const card = e.target.closest(CARD_SEL);
        if (card) card.classList.add('tilting');
      });
      grid.addEventListener('mouseout', (e) => {
        const card = e.target.closest(CARD_SEL);
        if (card && (!e.relatedTarget || !card.contains(e.relatedTarget))) {
          card.classList.remove('tilting');
          card.style.transform = '';
        }
      });
    }

    /* 7. 点击粒子 */
    if (!reduceMotion) {
      grid.addEventListener('click', (e) => {
        const card = e.target.closest(CARD_SEL);
        if (card) burst(e.clientX, e.clientY, 12, $('#tag-dialog') || $('#beauty-dialog') || $('#body-dialog'));
      });
    }
  });

  /* ---------- 8. 磁吸按钮 ---------- */
  if (finePointer && !reduceMotion) {
    $$('.hero-cta .btn').forEach(btn => {
      btn.addEventListener('mousemove', (e) => {
        const r = btn.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        btn.style.transform = `translate(${dx * 0.22}px,${dy * 0.3}px)`;
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    });
  }

  /* ---------- 9. 打开标签时盖印章 ---------- */
  const dialog = $('#tag-dialog');
  if (dialog && !reduceMotion) {
    new MutationObserver(() => {
      if (!dialog.open) return;
      dialog.querySelectorAll('.memphis-stamp').forEach(s => s.remove());
      const stamp = document.createElement('div');
      stamp.className = 'memphis-stamp';
      stamp.innerHTML = 'FACE<br>ATLAS<br>已查阅 ✓';
      const place = () => {
        stamp.style.left = Math.min(window.innerWidth - 150, window.innerWidth * 0.62) + 'px';
        stamp.style.top = '26%';
      };
      place();
      dialog.appendChild(stamp);
      requestAnimationFrame(() => requestAnimationFrame(() => stamp.classList.add('go')));
      setTimeout(() => stamp.remove(), 900);
    }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  }

  /* ---------- 10. Logo 三连击彩蛋 ---------- */
  const logoMark = $('.brand-mark');
  if (logoMark && !reduceMotion) {
    let clicks = 0, timer = null;
    logoMark.addEventListener('click', () => {
      clicks++;
      clearTimeout(timer);
      timer = setTimeout(() => { clicks = 0; }, 900);
      if (clicks >= 3) {
        clicks = 0;
        logoMark.classList.remove('easter');
        void logoMark.offsetWidth;
        logoMark.classList.add('easter');
        const r = logoMark.getBoundingClientRect();
        window.__memphisBurst && window.__memphisBurst(r.left + r.width / 2, r.top + r.height / 2, 18);
        setTimeout(() => logoMark.classList.remove('easter'), 950);
      }
    });
  }
})();
