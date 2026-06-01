// js/live/player.js — 學生端控制器(v2:ICC 四選一 + round)
import {
  joinRoom, watchRoom, submitAnswer, watchMyAnswer,
} from './firebase-live.js';
import { isValidPin } from './pin.js';

const $ = (id) => document.getElementById(id);
const TIME_LIMIT_MS = 20000;

let pin = null, room = null, mode = null, categories = [];
let answeredKey = null, qStart = 0, myAnswerUnsub = null, roomUnsub = null;

const keyOf = (q) => `${q.round}_${q.index}`;

// 1. 加入碼
$('pin-go').onclick = async () => {
  const v = $('pin').value.trim();
  if (!isValidPin(v)) { $('pin-err').textContent = '請輸入 4 位數字'; return; }
  pin = v;
  if (roomUnsub) roomUnsub();
  roomUnsub = watchRoom(pin, onRoom);
};

function onRoom(data) {
  if (!data) { $('pin-err').textContent = '找不到這個房間'; return; }
  room = data; mode = data.mode; categories = data.categories || [];
  if ($('join-pin').classList.contains('live-hidden')) { renderState(); return; }
  $('join-pin').classList.add('live-hidden');
  $('join-id').classList.remove('live-hidden');
  if (mode === 'group') {
    $('id-prompt').textContent = '選擇你的組別';
    $('name').classList.add('live-hidden');
    const grid = $('group-grid'); grid.classList.remove('live-hidden');
    grid.innerHTML = '';
    for (let g = 1; g <= 6; g++) {
      const b = document.createElement('button');
      b.className = 'live-btn'; b.textContent = `第 ${g} 組`; b.dataset.group = g;
      b.onclick = () => { grid.querySelectorAll('button').forEach((x) => x.classList.remove('is-sel')); b.classList.add('is-sel'); b.dataset.sel = '1'; };
      grid.appendChild(b);
    }
  }
}

// 2. 取名 / 選組 → 加入
$('id-go').onclick = async () => {
  let name = '', group = '';
  if (mode === 'group') {
    const sel = $('group-grid').querySelector('button[data-sel="1"]');
    if (!sel) { alert('請先選組別'); return; }
    group = sel.dataset.group;
  } else {
    name = $('name').value.trim() || '匿名偵查員';
  }
  await joinRoom(pin, { name, group });
  $('join-id').classList.add('live-hidden');
  $('play').classList.remove('live-hidden');
  renderState();
};

// 3. 依房間狀態渲染
function renderState() {
  if (!room) return;
  const st = room.state, q = room.currentQuestion;
  if (st === 'question' && q) {
    if (answeredKey !== keyOf(q)) showQuestion(q);
  } else if (st === 'reveal' && q) {
    showReveal(q);
  } else { // lobby / locked / ended
    $('waiting').classList.remove('live-hidden');
    $('question').classList.add('live-hidden');
    $('result').classList.add('live-hidden');
    $('waiting').querySelector('h2').textContent =
      st === 'ended' ? '挑戰結束,看大螢幕排行榜!' :
      st === 'locked' ? '時間到,等待公布…' : '等待老師出題…';
  }
}

function showQuestion(q) {
  $('waiting').classList.add('live-hidden');
  $('result').classList.add('live-hidden');
  $('question').classList.remove('live-hidden');
  $('q-img').src = `../${q.image}`;
  qStart = performance.now();
  const grid = $('cat-grid'); grid.innerHTML = '';
  if (q.options) {
    // ICC 四選一
    for (const o of q.options) {
      const b = document.createElement('button');
      b.className = 'live-cat-btn live-cat-btn--icc';
      b.innerHTML = `<span class="opt-emoji">${o.emoji}</span>${o.name}`;
      b.onclick = () => choose(q, String(o.id), b);
      grid.appendChild(b);
    }
  } else {
    // 5 大類
    for (const c of categories) {
      const b = document.createElement('button');
      b.className = 'live-cat-btn';
      b.style.background = c.color;
      b.textContent = c.label;
      b.onclick = () => choose(q, c.key, b);
      grid.appendChild(b);
    }
  }
}

async function choose(q, choice, btn) {
  const k = keyOf(q);
  if (answeredKey === k) return;
  answeredKey = k;
  const timeMs = Math.min(TIME_LIMIT_MS, performance.now() - qStart);
  $('cat-grid').querySelectorAll('button').forEach((x) => { x.disabled = true; });
  btn.classList.add('is-chosen');
  await submitAnswer(pin, { index: q.index, round: q.round, choice, timeMs });
}

function showReveal(q) {
  $('question').classList.add('live-hidden');
  $('waiting').classList.add('live-hidden');
  const r = $('result'); r.classList.remove('live-hidden');
  let correctLabel = '';
  if (q.options) {
    const o = q.options.find((x) => String(x.id) === q.correct);
    correctLabel = o ? `${o.emoji} ${o.name}` : '';
  } else {
    const c = categories.find((x) => x.key === q.correct);
    correctLabel = c ? c.label : '';
  }
  r.innerHTML = `<h2>正解:${correctLabel}</h2><p id="my-pts">計分中…</p>`;
  if (myAnswerUnsub) myAnswerUnsub();
  myAnswerUnsub = watchMyAnswer(pin, q.index, q.round, (a) => {
    if (!a) { $('my-pts').textContent = '這題你沒有作答'; return; }
    const ok = a.choice === q.correct;
    $('my-pts').textContent = a.points == null ? '計分中…'
      : (ok ? `答對!+${a.points} 分` : '答錯了,下一題加油');
  });
}
