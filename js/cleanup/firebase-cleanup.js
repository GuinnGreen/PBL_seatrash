import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getBlob,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';
import { app, auth, db, ready } from '../firebase-config.js';
import { buildCleanupRecord } from './cleanup-utils.js';

const storage = getStorage(app);
const photosCol = collection(db, 'cleanup_photos');

export function newCleanupPhotoId() {
  return doc(photosCol).id;
}

export async function uploadCleanupPhoto({
  photoId,
  classId,
  group,
  iccId,
  iccItems,
  blob,
  width,
  height,
  onProgress,
}) {
  await ready;
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('登入尚未完成，請重新整理後再試。');

  const storagePath = `cleanup/yuguang/${photoId}.jpg`;
  const storageRef = ref(storage, storagePath);
  try {
    await uploadResumable(storageRef, blob, onProgress);
  } catch (err) {
    throw addContext(err, '照片檔案上傳失敗');
  }

  const record = buildCleanupRecord({
    photoId,
    classId,
    group,
    iccId,
    storagePath,
    width,
    height,
    ownerUid: uid,
  }, iccItems);

  try {
    await setDoc(doc(db, 'cleanup_photos', photoId), {
      ...record,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    throw addContext(err, '照片資料寫入失敗');
  }

  return record;
}

function addContext(err, prefix) {
  err.message = `${prefix}：${err.code || err.message || 'unknown'}`;
  return err;
}

export function watchCleanupPhotos(cb, onError) {
  const q = query(photosCol, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, onError);
}

export function getCleanupPhotoUrl(storagePath) {
  return getDownloadURL(ref(storage, storagePath));
}

export function getCleanupPhotoBlob(storagePath) {
  return getBlob(ref(storage, storagePath));
}

function uploadResumable(storageRef, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob, {
      contentType: 'image/jpeg',
      customMetadata: { activity: 'yuguang' },
    });
    task.on('state_changed', (snapshot) => {
      if (onProgress) {
        onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
      }
    }, reject, () => resolve(task.snapshot));
  });
}
