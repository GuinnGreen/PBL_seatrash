// js/live/host.js — 老師主控台控制器
import {
  createRoom, watchPlayers, pushQuestion, lockAnswers,
  revealQuestion, endGame, watchAnswers, applyScores,
} from './firebase-live.js';
import { pickLivePool } from './sampling.js';
import { scoreAnswer, aggregateGroups } from './scoring.js';

const $ = (id) => document.getElementById(id);
const TIME_LIMIT_MS = 20000;
const QUESTIONS = 10;

let pin = null, mode = null, categories = [], questionSet = [], index = -1;
let players = [], curAnswers = [], answersUnsub = null;

async function loadPool() {
  const res = await fetch('../data/items.live.json');
  const data = await res.json();
  categories = Object.entries(data.categories).map(([key, v]) => ({ key, label: v.label, color: v.color }));
  const catKeys = categories.map((c) => c.key);
  questionSet = pickLivePool(data.items, catKeys, QUESTIONS);
}

async function start(selMode) {
  mode = selMode;
  await loadPool();
  const { pin: p } = await createRoom({ mode, categories });
  pin = p;
  $('setup').classList.add('live-hidden');
  $('lobby').classList.remove('live-hidden');
  $('pin-display').textContent = pin;
  $('join-url').textContent = location.origin + location.pathname.replace('host.html', '');
  watchPlayers(pin, (list) => {
    players = list;
    $('player-count').textContent = list.length;
    $('player-list').innerHTML = list
      .map((p) => `<div class="live-cat-btn" style="background:#475569">${mode === 'group' ? '第' + p.group + '組' : (p.name || '匿名')}</div>`)
      .join('');
  });
}

$('mode-individual').onclick = () => start('individual');
$('mode-group').onclick = () => start('group');

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
  await pushQuestion(pin, index, q.filename);
  if (answersUnsub) answersUnsub();
  answersUnsub = watchAnswers(pin, index, (list) => {
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
  const correct = q.category;
  // 計分後回寫
  const scored = curAnswers.map((a) => ({
    id: a.id, uid: a.uid,
    points: scoreAnswer({ correct: a.choice === correct, timeMs: a.timeMs, timeLimitMs: TIME_LIMIT_MS }),
  }));
  if (scored.length) await applyScores(pin, scored);
  await revealQuestion(pin, index, q.filename, correct);
  // 分布圖
  const counts = {};
  for (const c of categories) counts[c.key] = 0;
  for (const a of curAnswers) counts[a.choice] = (counts[a.choice] || 0) + 1;
  const max = Math.max(1, ...Object.values(counts));
  $('dist').innerHTML = categories.map((c) => {
    const n = counts[c.key] || 0;
    const mark = c.key === correct ? ' ✅' : '';
    return `<div style="margin:6px 0;text-align:left">${c.label}${mark}
      <div class="live-bar" style="width:${(n / max) * 100}%;background:${c.color}"></div> ${n}</div>`;
  }).join('');
  $('dist').classList.remove('live-hidden');
  $('reveal').classList.add('live-hidden');
  $('next').classList.remove('live-hidden');
  showBoard(false);
};

$('next').onclick = () => { $('board').classList.add('live-hidden'); nextQuestion(); };

function showBoard(final) {
  let rows;
  if (mode === 'group') {
    const totals = aggregateGroups(players);
    rows = Object.entries(totals).sort((a, b) => b[1] - a[1])
      .map(([g, s], i) => ({ name: `第 ${g} 組`, score: s, rank: i + 1 }));
  } else {
    rows = players.slice().sort((a, b) => (b.score || 0) - (a.score || 0))
      .map((p, i) => ({ name: p.name || '匿名', score: p.score || 0, rank: i + 1 }));
  }
  $('board-title').textContent = final ? '🏆 最終排行榜' : '目前排行榜';
  $('board-list').innerHTML = rows.slice(0, 12)
    .map((r) => `<div class="live-cat-btn" style="background:${r.rank === 1 ? '#f59e0b' : '#475569'}">${r.rank}. ${r.name}<br>${r.score}</div>`)
    .join('');
  $('board').classList.remove('live-hidden');
  if (final) { $('stage').classList.add('live-hidden'); endGame(pin); }
}
