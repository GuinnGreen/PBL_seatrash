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

  // Student identity + test mode (pretest|posttest), set after showIdentityForm()
  let student = { cls: null, seat: null };
  let mode = null;

  const RECORDS_KEY = 'pbl-game-records';
  const $ = (sel) => document.querySelector(sel);

  function loadRecords() {
    try { return JSON.parse(localStorage.getItem(RECORDS_KEY) || '[]'); }
    catch (_) { return []; }
  }
  function saveRecord(rec) {
    const all = loadRecords();
    const i = all.findIndex(r =>
      r.cls === rec.cls && r.seat === rec.seat && r.mode === rec.mode);
    if (i >= 0) all[i] = rec; else all.push(rec);
    localStorage.setItem(RECORDS_KEY, JSON.stringify(all));
  }
  function findRecord(cls, seat, m) {
    return loadRecords().find(r =>
      r.cls === cls && r.seat === seat && r.mode === m) || null;
  }
  // Auto-detect mode based on this student's prior records on this device.
  function determineMode(cls, seat) {
    if (findRecord(cls, seat, 'pretest')) return 'posttest';
    return 'pretest';
  }

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

    // Persist this attempt as a student record (per-device localStorage).
    const record = {
      cls: student.cls,
      seat: student.seat,
      mode,
      score,
      answered,
      total: ROUNDS,
      perCatStats: JSON.parse(JSON.stringify(perCatStats)),
      timestamp: new Date().toISOString(),
    };
    saveRecord(record);

    // Cloud sync (fire-and-forget; surface success/fail in UI).
    let cloudSyncStatus = 'pending';
    if (window.OG && typeof window.OG.syncRecord === 'function') {
      window.OG.syncRecord(record).then(res => {
        cloudSyncStatus = res.ok ? 'ok' : (res.reason || 'failed');
        const el = document.getElementById('cloud-sync-status');
        if (!el) return;
        if (res.ok) {
          el.innerHTML = '<span style="color:#047857;">✓ 已上傳到老師那邊</span>';
        } else if (res.reason === 'not-configured') {
          el.innerHTML = '<span style="color:var(--ink-soft);">（雲同步未設定，僅存在本機）</span>';
        } else {
          el.innerHTML = '<span style="color:var(--c-hazard);">⚠ 上傳失敗，請告訴老師你的成績</span>';
        }
      });
    }

    // Compare to pretest if this is a posttest run.
    let progressBlock = '';
    if (mode === 'posttest') {
      const pre = findRecord(student.cls, student.seat, 'pretest');
      if (pre) {
        const diff = score - pre.score;
        const sign = diff > 0 ? '+' : (diff < 0 ? '' : '±');
        const color = diff > 0 ? 'var(--accent)' : diff < 0 ? 'var(--c-hazard)' : 'var(--ink-soft)';
        const word = diff > 0 ? '進步' : diff < 0 ? '退步' : '持平';
        progressBlock = `
          <p style="font-size:13px; letter-spacing:0.1em; text-transform:uppercase; color:${color}; font-weight:700; margin-top:6px;">
            前測 ${pre.score} / ${ROUNDS} → 後測 ${score} / ${ROUNDS} · ${word} ${sign}${Math.abs(diff)} 題
          </p>`;
      }
    } else {
      progressBlock = `
        <p style="font-size:13px; letter-spacing:0.1em; text-transform:uppercase; color:var(--ink-soft);">
          前測成績已存 · 學完後回來玩後測比較進步
        </p>`;
    }

    const modeLabel = mode === 'pretest' ? 'Pretest · 前測' : 'Posttest · 後測';
    const headline = mode === 'pretest' ? '前測完成' : '後測完成';

    main.innerHTML = `
      <header class="page-head">
        <span class="kicker">${modeLabel}</span>
        <h1>${headline}</h1>
        <p class="dek">${weakMsg}</p>
        <p style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase; color:var(--ink-soft); margin-top:8px;">
          ${student.cls} · 座號 ${student.seat}
        </p>
      </header>
      <div class="result">
        <div class="score">${score}<small> / ${ROUNDS}</small></div>
        ${progressBlock}
        <p id="cloud-sync-status" style="font-size:12px; letter-spacing:0.06em; margin-top:4px;"><span style="color:var(--ink-soft);">⏳ 上傳中…</span></p>
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
          ${mode === 'pretest'
            ? `<a class="btn btn-primary" href="${ROOT}items/">下一步：認識實物 →</a>
               <a class="btn btn-ghost" href="${ROOT}">回首頁</a>`
            : `<a class="btn btn-primary" href="${ROOT}action/">下一步：行動 →</a>
               <button class="btn btn-ghost" id="play-again">重玩後測</button>`}
        </div>
      </div>
    `;
    const again = document.getElementById('play-again');
    if (again) again.addEventListener('click', startRound);
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

  function showIdentityForm() {
    document.querySelector('main').innerHTML = `
      <header class="page-head">
        <span class="kicker">Sign In · 身份登錄</span>
        <h1>分類遊戲</h1>
        <p class="dek">先輸入你的班級和座號，老師最後會收齊全班的成績。</p>
      </header>
      <form class="game-form" id="identity-form" novalidate>
        <label class="game-form__field">
          <span class="game-form__label">班級</span>
          <input type="text" name="cls" id="cls" required maxlength="10"
                 placeholder="例如：505" autocomplete="off"
                 inputmode="numeric" list="cls-options">
          <datalist id="cls-options">
            <option value="501"></option>
            <option value="502"></option>
            <option value="503"></option>
            <option value="504"></option>
            <option value="505"></option>
            <option value="506"></option>
            <option value="507"></option>
            <option value="508"></option>
          </datalist>
        </label>
        <label class="game-form__field">
          <span class="game-form__label">座號</span>
          <input type="number" name="seat" id="seat" required min="1" max="40"
                 inputmode="numeric" placeholder="1 - 40">
        </label>
        <p class="game-form__hint" id="form-hint">系統會自動分辨你是<strong>前測</strong>（第一次玩）還是<strong>後測</strong>（學完後再玩）。</p>
        <button type="submit" class="btn btn-primary">確認 →</button>
      </form>
    `;
    document.getElementById('identity-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const cls = document.getElementById('cls').value.trim();
      const seat = parseInt(document.getElementById('seat').value, 10);
      if (!cls || !seat || seat < 1 || seat > 40) {
        document.getElementById('form-hint').innerHTML =
          '<strong style="color:var(--c-hazard);">請輸入有效的班級與 1-40 的座號。</strong>';
        return;
      }
      student = { cls, seat };
      mode = determineMode(cls, seat);
      // If both modes already done, ask before overwriting posttest.
      if (mode === 'posttest' && findRecord(cls, seat, 'posttest')) {
        if (!confirm('你已完成前測 + 後測。要重玩後測（會覆蓋舊成績）嗎？')) {
          return;
        }
      }
      showStart();
    });
  }

  function showStart() {
    const isPre = mode === 'pretest';
    const headline = isPre ? '前測 · 先看看你目前的了解' : '後測 · 看看你進步多少';
    const kicker = isPre ? 'Pretest · 前測' : 'Posttest · 後測';
    const dek = isPre
      ? '輸入完了。先別怕，這是「前測」——告訴老師你目前對海廢分類的掌握程度，課後再玩一次比較進步。'
      : '上次的前測分數已經存好。這次玩完，系統會直接告訴你進步多少。';
    document.querySelector('main').innerHTML = `
      <header class="page-head">
        <span class="kicker">${kicker}</span>
        <h1>${headline}</h1>
        <p class="dek">${dek}</p>
        <p style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase; color:var(--ink-soft); margin-top:8px;">
          ${student.cls} · 座號 ${student.seat}
        </p>
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
    showIdentityForm();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
