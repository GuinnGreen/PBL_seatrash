// js/live/host.js — 老師主控台控制器(v2:難度/題數/模式、ICC、重玩)
import {
  createRoom, watchPlayers, pushQuestion, lockAnswers,
  revealQuestion, endGame, watchAnswers, getAnswersOnce, applyScores, resetScores,
} from './firebase-live.js';
import { pickLivePool } from './sampling.js';
import { scoreAnswer, aggregateGroups } from './scoring.js';
import { buildIccOptions } from './icc.js';

const $ = (id) => document.getElementById(id);
const TIME_LIMIT_MS = 20000;
const ALL_CATS = ['beverage', 'food', 'fishing', 'hazard', 'other'];

let pin = null, mode = null, difficulty = null, count = 10;
let categories = [], iccItems = [], rawItems = [];
let questionSet = [], index = -1, round = 0;
let players = [], curAnswers = [], answersUnsub = null, playersUnsub = null, boardFinal = false;

// --- 設定流程:難度 → 題數 → 模式 ---
$('setup-difficulty').addEventListener('click', (e) => {
  const b = e.target.closest('[data-difficulty]'); if (!b) return;
  difficulty = b.dataset.difficulty;
  $('setup-difficulty').classList.add('live-hidden');
  $('setup-count').classList.remove('live-hidden');
});
$('setup-count').addEventListener('click', (e) => {
  const b = e.target.closest('[data-count]'); if (!b) return;
  count = Number(b.dataset.count);
  $('setup-count').classList.add('live-hidden');
  $('setup-mode').classList.remove('live-hidden');
});
$('setup-mode').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]'); if (!b) return;
  start(b.dataset.mode);
});

async function loadData() {
  const data = await (await fetch('../data/items.live.json')).json();
  categories = Object.entries(data.categories).map(([key, v]) => ({ key, label: v.label, color: v.color }));
  rawItems = data.items;
  if (difficulty === 'icc') {
    iccItems = await (await fetch('../data/icc-items.json')).json();
  }
}

// 依難度/題數抽一批題;icc 模式排除 other,並為每題預先產生四選項
function resample() {
  if (difficulty === 'icc') {
    const pool = rawItems.filter((i) => i.category !== 'other');
    const cats = ['beverage', 'food', 'fishing', 'hazard'];
    questionSet = pickLivePool(pool, cats, count).map((q) => ({
      ...q, _options: buildIccOptions(q.icc_item, iccItems),
    }));
  } else {
    questionSet = pickLivePool(rawItems, ALL_CATS, count);
  }
}

async function start(selMode) {
  mode = selMode;
  await loadData();
  resample();
  const { pin: p } = await createRoom({ mode, categories, difficulty });
  pin = p;
  $('setup').classList.add('live-hidden');
  $('lobby').classList.remove('live-hidden');
  $('pin-display').textContent = pin;
  $('join-url').textContent = location.origin + location.pathname.replace('host.html', '');
  playersUnsub = watchPlayers(pin, (list) => {
    players = list;
    $('player-count').textContent = list.length;
    $('player-list').innerHTML = list
      .map((p) => `<div class="live-chip">${mode === 'group' ? '第' + p.group + '組' : (p.name || '匿名')}</div>`)
      .join('');
    if (!$('board').classList.contains('live-hidden')) renderBoard();
  });
}

$('start').onclick = () => { $('lobby').classList.add('live-hidden'); $('stage').classList.remove('live-hidden'); nextQuestion(); };

async function nextQuestion() {
  index += 1;
  if (index >= questionSet.length) return showBoard(true);
  const q = questionSet[index];
  curAnswers = [];
  $('q-progress').textContent = `第 ${index + 1} / ${questionSet.length} 題`;
  $('s-img').src = `../${q.filename}`;
  $('answered-count').textContent = '已作答 0';
  $('dist').classList.add('live-hidden');
  $('lock').classList.remove('live-hidden');
  $('reveal').classList.add('live-hidden');
  $('next').classList.add('live-hidden');
  const options = difficulty === 'icc' ? q._options : null;
  await pushQuestion(pin, { index, round, image: q.filename, options });
  if (answersUnsub) answersUnsub();
  answersUnsub = watchAnswers(pin, index, round, (list) => {
    curAnswers = list;
    $('answered-count').textContent = `已作答 ${list.length}`;
  });
}

$('lock').onclick = async () => {
  await lockAnswers(pin);
  $('lock').classList.add('live-hidden');
  $('reveal').classList.remove('live-hidden');
};

$('reveal').onclick = async () => {
  const q = questionSet[index];
  const correct = difficulty === 'icc' ? String(q.icc_item) : q.category;
  const answers = await getAnswersOnce(pin, index, round);
  const scored = answers.map((a) => ({
    id: a.id, uid: a.uid,
    points: scoreAnswer({ correct: a.choice === correct, timeMs: a.timeMs, timeLimitMs: TIME_LIMIT_MS }),
  }));
  if (scored.length) await applyScores(pin, scored);
  const options = difficulty === 'icc' ? q._options : null;
  await revealQuestion(pin, { index, round, image: q.filename, options, correct });
  renderDistribution(q, correct, answers);
  $('reveal').classList.add('live-hidden');
  $('next').classList.remove('live-hidden');
  showBoard(false);
};

function renderDistribution(q, correct, answers) {
  let cells;
  if (difficulty === 'icc') {
    const counts = {};
    q._options.forEach((o) => { counts[String(o.id)] = 0; });
    for (const a of answers) counts[a.choice] = (counts[a.choice] || 0) + 1;
    const max = Math.max(1, ...Object.values(counts));
    cells = q._options.map((o) => {
      const n = counts[String(o.id)] || 0;
      const mark = String(o.id) === correct ? ' ✅' : '';
      return `<div class="dist-row">${o.emoji} ${o.name}${mark}
        <div class="live-bar" style="width:${(n / max) * 100}%"></div> ${n}</div>`;
    }).join('');
  } else {
    const counts = {};
    for (const c of categories) counts[c.key] = 0;
    for (const a of answers) counts[a.choice] = (counts[a.choice] || 0) + 1;
    const max = Math.max(1, ...Object.values(counts));
    cells = categories.map((c) => {
      const n = counts[c.key] || 0;
      const mark = c.key === correct ? ' ✅' : '';
      return `<div class="dist-row">${c.label}${mark}
        <div class="live-bar" style="width:${(n / max) * 100}%;background:${c.color}"></div> ${n}</div>`;
    }).join('');
  }
  $('dist').innerHTML = cells;
  $('dist').classList.remove('live-hidden');
}

$('next').onclick = () => { $('board').classList.add('live-hidden'); nextQuestion(); };

function showBoard(final) {
  boardFinal = final;
  renderBoard();
  $('board').classList.remove('live-hidden');
  $('board-actions').classList.toggle('live-hidden', !final);
  if (final) $('stage').classList.add('live-hidden');
  if (final) endGame(pin);
}

function renderBoard() {
  let rows;
  if (mode === 'group') {
    const totals = aggregateGroups(players);
    rows = Object.entries(totals).sort((a, b) => b[1] - a[1])
      .map(([g, s], i) => ({ name: `第 ${g} 組`, score: s, rank: i + 1 }));
  } else {
    rows = players.slice().sort((a, b) => (b.score || 0) - (a.score || 0))
      .map((p, i) => ({ name: p.name || '匿名', score: p.score || 0, rank: i + 1 }));
  }
  $('board-title').textContent = boardFinal ? '🏆 最終排行榜' : '目前排行榜';
  $('board-list').innerHTML = rows.slice(0, 12)
    .map((r) => `<div class="live-rank ${r.rank === 1 ? 'live-rank--first' : ''}">${r.rank}. ${r.name}<br>${r.score}</div>`)
    .join('');
}

// --- 重玩 ---
$('replay').onclick = async () => {
  await resetScores(pin, players.map((p) => p.uid));
  round += 1;
  index = -1;
  resample();
  $('board').classList.add('live-hidden');
  $('stage').classList.remove('live-hidden');
  nextQuestion();
};
$('home').onclick = async () => {
  await endGame(pin);
  if (answersUnsub) answersUnsub();
  if (playersUnsub) playersUnsub();
  pin = null; index = -1; round = 0; players = [];
  $('board').classList.add('live-hidden');
  $('lobby').classList.add('live-hidden');
  $('stage').classList.add('live-hidden');
  $('setup').classList.remove('live-hidden');
  $('setup-count').classList.add('live-hidden');
  $('setup-mode').classList.add('live-hidden');
  $('setup-difficulty').classList.remove('live-hidden');
};
