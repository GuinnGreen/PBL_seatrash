// Firebase Firestore + Auth integration
// 學生匿名登入 → 寫入 game_records collection
// 老師 Email/Password 登入 → 讀取 game_records 顯示儀表板

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, collection, addDoc, getDocs, serverTimestamp,
  query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getAuth, signInAnonymously, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAOEZBa1KLxVZxLqlxHat-cwVdmWw1WByA',
  authDomain: 'pbl-seatrash.firebaseapp.com',
  projectId: 'pbl-seatrash',
  storageBucket: 'pbl-seatrash.firebasestorage.app',
  messagingSenderId: '633346118811',
  appId: '1:633346118811:web:0f47005693d30d3308e23e',
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// 等持久化的 auth state 載入完成；如果沒有任何 user → anonymous 登入
// 注意：不能直接看 auth.currentUser，初始時是 null，要等 onAuthStateChanged 第一次 fire
const readyPromise = new Promise((resolve) => {
  const unsub = onAuthStateChanged(auth, async (user) => {
    unsub();
    if (!user) {
      try { await signInAnonymously(auth); } catch (_) { /* offline 時會 fail，無妨 */ }
    }
    resolve();
  });
});

window.OG = window.OG || {};
window.OG.firebase = {
  ready: readyPromise,

  // 學生：寫一筆紀錄到 game_records collection
  syncRecord: async (rec) => {
    await readyPromise;
    return addDoc(collection(db, 'game_records'), {
      ...rec,
      createdAt: serverTimestamp(),
    });
  },

  // 老師：列出所有紀錄
  listRecords: async () => {
    const snap = await getDocs(
      query(collection(db, 'game_records'), orderBy('createdAt', 'desc'))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // 老師登入：先登出 anonymous，再用 email/password 登入
  signInTeacher: async (email, password) => {
    await signOut(auth);
    return signInWithEmailAndPassword(auth, email, password);
  },

  // 老師登出：登出後重新匿名登入（讓學生路徑可以繼續用）
  signOutTeacher: async () => {
    await signOut(auth);
    return signInAnonymously(auth);
  },

  onAuthChange: (cb) => onAuthStateChanged(auth, cb),

  // 判斷目前 session 是不是教師（email/password 登入的）
  isTeacher: () => {
    const u = auth.currentUser;
    return !!(u && u.providerData[0]?.providerId === 'password');
  },

  currentUser: () => auth.currentUser,
};
