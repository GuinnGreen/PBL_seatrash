// js/live/firebase-live.js
// 即時挑戰的 Firestore 封裝。重用 firebase-config.js 既有的 app/匿名 auth。
// 正解不寫進玩家可讀的欄位;出題只下發 image,公布時才寫 correct。
import {
  doc, getDoc, getDocs, setDoc, updateDoc, collection, onSnapshot,
  query, where, serverTimestamp, increment, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db, auth, ready } from '../firebase-config.js';
import { generatePin } from './pin.js';

const roomRef    = (pin) => doc(db, 'live_rooms', pin);
const playersCol = (pin) => collection(db, 'live_rooms', pin, 'players');
const answersCol = (pin) => collection(db, 'live_rooms', pin, 'answers');

// 主持端:建立房間。categories = [{key,label,color}](不含任何題目正解)。
export async function createRoom({ mode, categories }) {
  await ready;
  for (let attempt = 0; attempt < 6; attempt++) {
    const pin = generatePin();
    const snap = await getDoc(roomRef(pin));
    if (snap.exists()) continue;
    await setDoc(roomRef(pin), {
      pin,
      hostId: auth.currentUser.uid,
      mode,                 // 'individual' | 'group'
      state: 'lobby',       // lobby | question | reveal | ended
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

// 主持端:推一題(只送 image,不含正解),狀態轉 question
export async function pushQuestion(pin, index, image) {
  await updateDoc(roomRef(pin), {
    state: 'question', currentIndex: index, currentQuestion: { index, image, correct: null },
  });
}
// 主持端:結束作答(停止計時,尚未公布正解)
export async function lockAnswers(pin) {
  await updateDoc(roomRef(pin), { state: 'locked' });
}
// 主持端:公布正解(寫入 correct,讓學生看到對錯)
export async function revealQuestion(pin, index, image, correct) {
  await updateDoc(roomRef(pin), {
    state: 'reveal', currentQuestion: { index, image, correct },
  });
}
export async function endGame(pin) {
  await updateDoc(roomRef(pin), { state: 'ended' });
}

// 學生端:送出作答(只有 choice + 花費時間)
export async function submitAnswer(pin, index, { choice, timeMs }) {
  await ready;
  const uid = auth.currentUser.uid;
  await setDoc(doc(db, 'live_rooms', pin, 'answers', `${index}_${uid}`), {
    uid, qIndex: index, choice, timeMs, points: null, createdAt: serverTimestamp(),
  });
}
// 主持端:監看某題所有作答(供計分與分布圖)
export function watchAnswers(pin, index, cb) {
  const q = query(answersCol(pin), where('qIndex', '==', index));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
// 主持端:一次讀取某題所有作答(公布計分時用,避免即時快照漏掉最後送出的)
export async function getAnswersOnce(pin, index) {
  const q = query(answersCol(pin), where('qIndex', '==', index));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
// 學生端:監看自己這題的作答(取得公布後的 points)
export function watchMyAnswer(pin, index, cb) {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};
  return onSnapshot(doc(db, 'live_rooms', pin, 'answers', `${index}_${uid}`),
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

export const auth_ = auth; // 方便頁面取得 currentUser
