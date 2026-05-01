// 海廢分類遊戲：拖拉卡片到 5 個分類筐，即時對錯回饋
// 不依賴 SortableJS — 用原生 PointerEvents（iPad Safari 友善）

(function () {
  const ROUNDS = 30;          // 每輪題數
  const FEEDBACK_OK_MS = 700;
  const FEEDBACK_WRONG_MS = 1800;

  let dataset = null;         // items.json
  let pool = [];              // 待答題目
  let current = null;         // 目前卡片資料
  let score = 0;
  let answered = 0;
  let perCatStats = {};       // {beverage: {asked, correct}, ...}

  const $ = (sel) => document.querySelector(sel);

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async function loadData() {
    const prefix = (window.OG && window.OG.pathPrefix && window.OG.pathPrefix()) || '';
    const r = await fetch(`${prefix}/data/items.json`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`items.json HTTP ${r.status}`);
    return r.json();
  }

  function buildBins() {
    const cats = dataset.categories;
    const order = ['beverage', 'food', 'fishing', 'hazard', 'other'];
    const emojis = {
      beverage: '🔵',
      food: '🟢',
      fishing: '🟡',
      hazard: '🔴',
      other: '⚪',
    };
    const iccHints = {
      beverage: '寶特瓶 / 罐 / 杯',
      food: '袋 / 吸管 / 餐具',
      fishing: '網 / 繩 / 浮球',
      hazard: '針筒 / 菸蒂 / 牙刷',
      other: '碎片 / 不明物',
    };
    const bins = $('#bins');
    bins.innerHTML = order.map(key => `
      <div class="bin bin-${key}" data-cat="${key}" role="button" tabindex="0" aria-label="放到 ${cats[key].label}">
        <div class="emoji">${emojis[key]}</div>
        <div>${cats[key].label}</div>
        <div class="icc-hint">${iccHints[key]}</div>
      </div>
    `).join('');
  }

  function pickPool() {
    perCatStats = {};
    for (const k of Object.keys(dataset.categories)) {
      perCatStats[k] = { asked: 0, correct: 0 };
    }
    const all = shuffle(dataset.items.filter(it => it.category && it.label));
    pool = all.slice(0, ROUNDS);
  }

  function renderCard() {
    const stage = $('#stage');
    stage.innerHTML = '';
    if (!current) return;
    const card = document.createElement('div');
    card.className = 'card no-select';
    card.id = 'current-card';
    card.innerHTML = `
      <img src="${current.filename}" alt="${current.label}" draggable="false">
      <div class="label-hint">這是什麼？拖到下面正確的分類筐</div>
    `;
    stage.appendChild(card);

    const fb = document.createElement('div');
    fb.className = 'feedback';
    fb.id = 'feedback';
    fb.innerHTML = `<div class="icon"></div><div class="text"></div>`;
    stage.appendChild(fb);

    attachDrag(card);
  }

  function attachDrag(card) {
    let dragging = false;
    let startX = 0, startY = 0;
    let origLeft = 0, origTop = 0;
    let lastBin = null;

    function bins() { return Array.from(document.querySelectorAll('.bin')); }

    function onDown(e) {
      e.preventDefault();
      dragging = true;
      const point = e.touches ? e.touches[0] : e;
      startX = point.clientX;
      startY = point.clientY;
      const rect = card.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      card.style.position = 'fixed';
      card.style.left = `${origLeft}px`;
      card.style.top  = `${origTop}px`;
      card.style.zIndex = 1000;
      card.classList.add('dragging');
      try { card.setPointerCapture && e.pointerId && card.setPointerCapture(e.pointerId); } catch (_) {}
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      const point = e.touches ? e.touches[0] : e;
      const dx = point.clientX - startX;
      const dy = point.clientY - startY;
      card.style.left = `${origLeft + dx}px`;
      card.style.top  = `${origTop + dy}px`;

      const x = point.clientX, y = point.clientY;
      let hit = null;
      for (const b of bins()) {
        const r = b.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          hit = b;
          break;
        }
      }
      if (hit !== lastBin) {
        if (lastBin) lastBin.classList.remove('hover');
        if (hit) hit.classList.add('hover');
        lastBin = hit;
      }
    }

    function onUp(e) {
      if (!dragging) return;
      dragging = false;
      card.classList.remove('dragging');
      const point = (e.changedTouches && e.changedTouches[0]) || e;
      const x = point.clientX, y = point.clientY;
      let hit = null;
      for (const b of bins()) {
        const r = b.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          hit = b;
          break;
        }
      }
      if (lastBin) lastBin.classList.remove('hover');
      lastBin = null;
      if (hit) {
        const cat = hit.getAttribute('data-cat');
        evaluateAnswer(cat);
      } else {
        // snap back
        card.style.transition = 'left 0.2s ease, top 0.2s ease';
        card.style.left = `${origLeft}px`;
        card.style.top = `${origTop}px`;
        setTimeout(() => {
          card.style.transition = '';
          card.style.position = '';
          card.style.left = '';
          card.style.top = '';
          card.style.zIndex = '';
        }, 200);
      }
    }

    // Pointer events (modern; covers mouse + touch on iPad Safari 13+)
    card.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }

  function evaluateAnswer(chosenCat) {
    if (!current) return;
    const correct = chosenCat === current.category;
    answered++;
    perCatStats[current.category].asked++;
    if (correct) {
      score++;
      perCatStats[current.category].correct++;
    }

    const fb = $('#feedback');
    const cats = dataset.categories;
    if (correct) {
      fb.classList.add('show', 'correct');
      fb.querySelector('.icon').textContent = '✓';
      fb.querySelector('.text').textContent = `+1 分　${current.label}`;
    } else {
      fb.classList.add('show', 'wrong');
      fb.querySelector('.icon').textContent = '✗';
      fb.querySelector('.text').textContent =
        `這是「${current.label}」→ ${cats[current.category].label}`;
    }

    updateBar();

    setTimeout(() => {
      fb.classList.remove('show', 'correct', 'wrong');
      next();
    }, correct ? FEEDBACK_OK_MS : FEEDBACK_WRONG_MS);
  }

  function updateBar() {
    $('#score').textContent = `${score}`;
    $('#progress').textContent = `${answered} / ${ROUNDS}`;
  }

  function next() {
    current = pool.shift();
    if (!current) {
      showResult();
      return;
    }
    renderCard();
  }

  function showResult() {
    const main = $('main');
    const cats = dataset.categories;
    const order = ['beverage', 'food', 'fishing', 'hazard', 'other'];

    let weakest = null;
    let weakestRate = 1.1;
    for (const k of order) {
      const s = perCatStats[k];
      if (s.asked === 0) continue;
      const rate = s.correct / s.asked;
      if (rate < weakestRate) {
        weakestRate = rate;
        weakest = k;
      }
    }
    const weakMsg = weakest && weakestRate < 1
      ? `你最常分錯的是 <strong style="color:${cats[weakest].color}">${cats[weakest].label}</strong>（${perCatStats[weakest].correct}/${perCatStats[weakest].asked}）`
      : `你五類都分對了，太強了！`;

    const tip = weakest === 'fishing'
      ? '漁業用具在我們安平特別多（蚵棚浮具），下次淨灘多注意。'
      : weakest === 'hazard'
      ? '危險物品要小心，淨灘時不能徒手撿，要叫老師。'
      : '繼續加油，下次淨灘記錄會用更細的 ICC 20 項。';

    main.innerHTML = `
      <div class="result">
        <h2>遊戲結束</h2>
        <div class="score">${score}<small> / ${ROUNDS}</small></div>
        <p style="font-size:18px;">${weakMsg}<br><span style="color:var(--ink-soft); font-size:15px;">${tip}</span></p>
        <div class="breakdown">
          ${order.map(k => `
            <div class="stat-card" style="background:${cats[k].color}">
              ${cats[k].label}
              <span class="num">${perCatStats[k].correct}/${perCatStats[k].asked}</span>
            </div>
          `).join('')}
        </div>
        <div class="actions">
          <button class="btn btn-primary" id="play-again">再玩一次</button>
          <a class="btn btn-ghost" href="/icc/">看 ICC 對照 →</a>
        </div>
      </div>
    `;
    document.getElementById('play-again').addEventListener('click', startRound);
    if (window.OG && window.OG.renderFooter) window.OG.renderFooter();
  }

  function startRound() {
    score = 0;
    answered = 0;
    pickPool();
    document.querySelector('main').innerHTML = `
      <div class="page-head">
        <h1>分類遊戲</h1>
        <p>把卡片拖到正確的分類筐。<strong>30 題</strong>，看你能答對幾題！</p>
      </div>
      <div class="game-bar">
        <div class="stat">⭐ <strong id="score">0</strong> 分</div>
        <div class="stat" id="progress">0 / ${ROUNDS}</div>
      </div>
      <div class="game-stage" id="stage"></div>
      <div class="bins" id="bins"></div>
    `;
    buildBins();
    next();
  }

  function showStart() {
    document.querySelector('main').innerHTML = `
      <div class="page-head">
        <h1>分類遊戲</h1>
      </div>
      <div class="start-screen">
        <h2>規則</h2>
        <ul class="rules">
          <li>📦 螢幕中央會出現一張海廢照片</li>
          <li>👆 拖到下面 5 個顏色筐中的一個</li>
          <li>✓ 對 → 加 1 分，下一張</li>
          <li>✗ 錯 → 告訴你答案，下一張</li>
          <li>🎯 共 30 題，看你能答對幾題</li>
        </ul>
        <button class="btn btn-primary" id="start-btn">開始 →</button>
      </div>
    `;
    document.getElementById('start-btn').addEventListener('click', startRound);
  }

  async function init() {
    try {
      dataset = await loadData();
    } catch (err) {
      document.querySelector('main').innerHTML = `
        <div class="callout callout--warn">
          <h4>無法載入題目</h4>
          <p>請確認 <code>data/items.json</code> 已生成。${err.message}</p>
        </div>
      `;
      return;
    }
    if (!dataset.items || dataset.items.length < 5) {
      document.querySelector('main').innerHTML = `
        <div class="callout callout--warn">
          <h4>題目太少</h4>
          <p>items.json 只有 ${dataset.items?.length || 0} 題，至少要 5 題才能玩。</p>
        </div>
      `;
      return;
    }
    showStart();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
