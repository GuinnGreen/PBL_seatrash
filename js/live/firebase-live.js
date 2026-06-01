// js/live/firebase-live.js
// 即時挑戰的 Firestore 封裝。重用 firebase-config.js 既有的 app/匿名 auth。
// 正解不寫進玩家可讀的欄位;出題只下發 image(+icc 選項),公布時才寫 correct。
// round:多輪重玩用,讓作答 doc id 不互撞(${round}_${index}_${uid})。
import {
  doc, getDoc, getDocs, setDoc, updateDoc, collection, onSnapshot,
  query, where, serverTimestamp, increment, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db, auth, ready } from '../firebase-config.js';
import { generatePin } from './pin.js';

const roomRef    = (pin) => doc(db, 'live_rooms', pin);
const playersCol = (pin) => collection(db, 'live_rooms', pin, 'players');
const answersCol = (pin) => collection(db, 'live_rooms', pin, 'answers');
const ansId = (round, index, uid) => `${round}_${index}_${uid}`;

// 主持端:建立房間。difficulty: 'basic' | 'icc'。categories 不含任何題目正解。
export async function createRoom({ mode, categories, difficulty }) {
  await ready;
  for (let attempt = 0; attempt < 6; attempt++) {
    const pin = generatePin();
    const snap = await getDoc(roomRef(pin));
    if (snap.exists()) continue;
    await setDoc(roomRef(pin), {
      pin,
      hostId: auth.currentUser.uid,
      mode,                 // 'individual' | 'group'
      difficulty,           // 'basic' | 'icc'
      round: 0,
      state: 'lobby',       // lobby | question | locked | reveal | ended
      currentIndex: -1,
      currentQuestion: null,
      categories,
      createdAt: serverTimestamp(),
    });
    return { pin };
  }
  throw new Error('無法產生未使用的加入碼,請重試');
}

// 學生端:加入房間(doc id = 自己的匿名 uid)
export async function joinRoom(pin, { name, group }) {
  await ready;
  const uid = auth.currentUser.uid;
  await setDoc(doc(db, 'live_rooms', pin, 'players', uid), {
    name: name || '', group: group || '', score: 0, joinedAt: serverTimestamp(),
  });
  return uid;
}

export function watchRoom(pin, cb) {
  return onSnapshot(roomRef(pin), (s) => cb(s.exists() ? s.data() : null));
}
export function watchPlayers(pin, cb) {
  return onSnapshot(playersCol(pin), (s) =>
    cb(s.docs.map((d) => ({ uid: d.id, ...d.data() }))));
}

// 主持端:推一題。options(icc 模式的 4 選項)只含 id/name/emoji,不含正解旗標;basic 模式傳 null。
export async function pushQuestion(pin, { index, round, image, options }) {
  await updateDoc(roomRef(pin), {
    state: 'question',
    currentIndex: index,
    round,
    currentQuestion: { index, round, image, options: options || null, correct: null },
  });
}
// 主持端:結束作答
export async function lockAnswers(pin) {
  await updateDoc(roomRef(pin), { state: 'locked' });
}
// 主持端:公布正解(保留 options 讓學生端標出正解)
export async function revealQuestion(pin, { index, round, image, options, correct }) {
  await updateDoc(roomRef(pin), {
    state: 'reveal',
    currentQuestion: { index, round, image, options: options || null, correct },
  });
}
export async function endGame(pin) {
  await updateDoc(roomRef(pin), { state: 'ended' });
}

// 學生端:送出作答(choice 一律字串)
export async function submitAnswer(pin, { index, round, choice, timeMs }) {
  await ready;
  const uid = auth.currentUser.uid;
  await setDoc(doc(db, 'live_rooms', pin, 'answers', ansId(round, index, uid)), {
    uid, qIndex: index, round, choice, timeMs, points: null, createdAt: serverTimestamp(),
  });
}
// 主持端:即時監看某輪某題的作答(qIndex 單欄查詢 + 用 round 在前端過濾,免複合索引)
export function watchAnswers(pin, index, round, cb) {
  const q = query(answersCol(pin), where('qIndex', '==', index));
  return onSnapshot(q, (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.round === round)));
}
// 主持端:一次讀取(公布計分時用,避免快照漏掉最後送出的)
export async function getAnswersOnce(pin, index, round) {
  const q = query(answersCol(pin), where('qIndex', '==', index));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.round === round);
}
// 學生端:監看自己這題的作答(取得公布後的 points)
export function watchMyAnswer(pin, index, round, cb) {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};
  return onSnapshot(doc(db, 'live_rooms', pin, 'answers', ansId(round, index, uid)),
    (s) => cb(s.exists() ? s.data() : null));
}

// 主持端:批次寫回每人得分並累加到 player.score。scored = [{ id, uid, points }]
export async function applyScores(pin, scored) {
  const batch = writeBatch(db);
  for (const s of scored) {
    batch.update(doc(db, 'live_rooms', pin, 'answers', s.id), { points: s.points });
    batch.update(doc(db, 'live_rooms', pin, 'players', s.uid), { score: increment(s.points) });
  }
  await batch.commit();
}

// 主持端:重玩時把所有玩家分數歸零
export async function resetScores(pin, uids) {
  const batch = writeBatch(db);
  for (const uid of uids) {
    batch.update(doc(db, 'live_rooms', pin, 'players', uid), { score: 0 });
  }
  await batch.commit();
}

export const auth_ = auth; // 方便頁面取得 currentUser
