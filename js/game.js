// 海廢分類遊戲：拖拉卡片到 5 個分類筐，即時對錯回饋
// 不依賴外部函式庫 — 用原生 PointerEvents（iPad Safari 友善）

(function () {
  const ROUNDS = 30;
  const FEEDBACK_OK_MS = 700;
  const FEEDBACK_WRONG_MS = 1800;

  // game/ is always one level deep, so root is one up
  const ROOT = '../';

  let dataset = null;
  let pool = [];
  let current = null;
  let score = 0;
  let answered = 0;
  let perCatStats = {};

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
    const r = await fetch(`${ROOT}data/items.json`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`items.json HTTP ${r.status}`);
    return r.json();
  }

  function buildBins() {
    const cats = dataset.categories;
    const order = ['beverage', 'food', 'fishing', 'hazard', 'other'];
    const emojis = {
      beverage: '🔵', food: '🟢', fishing: '🟡', hazard: '🔴', other: '⚪',
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
      <img src="${ROOT}${current.filename}" alt="${current.label}" draggable="false">
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
      ? `你最常分錯：<strong style="color:${cats[weakest].color}">${cats[weakest].label}</strong>（${perCatStats[weakest].correct}/${perCatStats[weakest].asked}）`
      : `你五類都分對了，太強了！`;

    const tip = weakest === 'fishing'
      ? '漁業用具在我們安平特別多（蚵棚浮具），下次淨灘多注意。'
      : weakest === 'hazard'
      ? '危險物品要小心，淨灘時不能徒手撿，要叫老師。'
      : weakest === 'food'
      ? '食物包裝最容易跟其他混淆——記得：「裝食物」就是這類。'
      : weakest === 'beverage'
      ? '飲料容器是台灣海廢前 5 名，記住：瓶/罐/杯/蓋。'
      : '繼續加油，下次淨灘記錄會用更細的 ICC 20 項。';

    const bestKey = `og_best_${ROUNDS}`;
    const prevBest = parseInt(localStorage.getItem(bestKey) || '0', 10);
    const isNewRecord = score > prevBest;
    if (isNewRecord) localStorage.setItem(bestKey, String(score));

    main.innerHTML = `
      <header class="page-head">
        <span class="kicker">Result</span>
        <h1>測驗結束</h1>
        <p class="dek">${weakMsg}</p>
      </header>
      <div class="result">
        <div class="score">${score}<small> / ${ROUNDS}</small></div>
        ${isNewRecord ? '<p style="font-size:13px; letter-spacing:0.1em; text-transform:uppercase; color:var(--accent); font-weight:700;">New best</p>'
                      : (prevBest > 0 ? `<p style="font-size:13px; letter-spacing:0.1em; text-transform:uppercase; color:var(--ink-soft);">Personal best · ${prevBest} / ${ROUNDS}</p>` : '')}
        <p style="font-size:16px; max-width:var(--measure); margin:12px auto 0;">${tip}</p>
        <div class="breakdown">
          ${order.map(k => `
            <div class="stat-card" style="background:${cats[k].color}">
              ${cats[k].label}
              <span class="num">${perCatStats[k].correct}/${perCatStats[k].asked}</span>
            </div>
          `).join('')}
        </div>
        <div class="actions">
          <button class="btn btn-primary" id="play-again">再測一次</button>
          <a class="btn btn-ghost" href="${ROOT}icc/">看 ICC 對照 →</a>
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
    const bestKey = `og_best_${ROUNDS}`;
    const prevBest = parseInt(localStorage.getItem(bestKey) || '0', 10);
    document.querySelector('main').innerHTML = `
      <header class="page-head">
        <span class="kicker">Part 03 &nbsp;/&nbsp; The Test</span>
        <h1>分類測驗</h1>
        <p class="dek">把照片拖進對應的分類筐。30 題、即時回饋、隨時可重來。</p>
      </header>
      <div class="start-screen">
        <h2>規則</h2>
        <ul class="rules">
          <li>螢幕中央會出現一張海廢照片</li>
          <li>用手指<strong>拖到下面 5 個顏色筐</strong>之一</li>
          <li>答對 → 加 1 分，下一張</li>
          <li>答錯 → 顯示正確答案，再下一張</li>
          <li>共 30 題</li>
        </ul>
        ${prevBest > 0 ? `<p style="margin:0 0 20px; font-size:13px; letter-spacing:0.1em; text-transform:uppercase; color:var(--ink-soft);">Personal best · ${prevBest} / ${ROUNDS}</p>` : ''}
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
