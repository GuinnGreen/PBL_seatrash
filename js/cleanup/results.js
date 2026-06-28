import {
  buildCleanupSummary,
  cleanupCsv,
  formatIccFolderName,
  formatPhotoFileName,
  getDisplayClassId,
} from './cleanup-utils.js';

const $ = (sel) => document.querySelector(sel);

let iccItems = [];
let records = [];
let filtered = [];
let urlCache = new Map();
let unsubscribe = null;
let firebaseApiPromise = null;

init();

async function init() {
  await loadIccItems();
  bindControls();
  $('#cleanup-status').textContent = '連線到 Firebase…';
  const firebaseLoaded = await loadFirebaseConfig();
  if (!firebaseLoaded) {
    $('#cleanup-status').textContent = 'Firebase 載入逾時，請確認網路後重新整理。';
    return;
  }
  await window.OG.firebase.ready;
  window.OG.firebase.onAuthChange(async () => {
    if (!window.OG.firebase.isTeacher()) {
      renderLoginPrompt();
      return;
    }
    startWatch();
  });
}

function renderLoginPrompt() {
  $('#cleanup-status').textContent = '需要老師登入。';
  $('#cleanup-body').innerHTML = `
    <div class="cleanup-panel cleanup-login">
      <h2>需要老師身份才能查看</h2>
      <p>請用老師帳號登入，即可查看漁光島淨灘照片統計。</p>
      <form class="cleanup-login-form" id="cleanup-login-form" novalidate>
        <label class="cleanup-field">
          <span class="cleanup-label">Email</span>
          <input class="cleanup-filter" id="cleanup-email" type="email" autocomplete="username" required>
        </label>
        <label class="cleanup-field">
          <span class="cleanup-label">密碼</span>
          <input class="cleanup-filter" id="cleanup-password" type="password" autocomplete="current-password" required>
        </label>
        <p class="cleanup-status" id="cleanup-login-status" aria-live="polite"></p>
        <button class="btn btn-primary" type="submit">登入統計頁 →</button>
      </form>
    </div>
  `;
  $('#cleanup-login-form').addEventListener('submit', onTeacherLogin);
}

async function onTeacherLogin(event) {
  event.preventDefault();
  const email = $('#cleanup-email').value.trim();
  const password = $('#cleanup-password').value;
  const status = $('#cleanup-login-status');
  if (!email || !password) {
    status.textContent = '請輸入老師帳號與密碼。';
    status.dataset.type = 'error';
    return;
  }
  try {
    status.textContent = '登入中…';
    status.dataset.type = 'busy';
    await window.OG.firebase.signInTeacher(email, password);
    status.textContent = '登入成功，載入統計中…';
    status.dataset.type = 'ok';
  } catch (err) {
    status.textContent = `登入失敗：${err.code || err.message || '請確認帳密'}`;
    status.dataset.type = 'error';
  }
}

async function loadIccItems() {
  const res = await fetch('../data/icc-items.json', { cache: 'no-store' });
  iccItems = await res.json();
  const filter = $('#filter-icc');
  filter.innerHTML = '<option value="all">全部 ICC</option>' + iccItems.map((item) =>
    `<option value="${item.id}">ICC ${String(item.id).padStart(2, '0')} · ${item.name}</option>`
  ).join('');
}

function bindControls() {
  $('#filter-class').addEventListener('change', renderAll);
  $('#filter-icc').addEventListener('change', renderAll);
  $('#filter-group').addEventListener('input', renderAll);
  $('#csv-btn').addEventListener('click', downloadCsv);
  $('#zip-btn').addEventListener('click', downloadZip);
  $('#logout-btn').addEventListener('click', async () => {
    if (unsubscribe) unsubscribe();
    await window.OG.firebase.signOutTeacher();
    renderLoginPrompt();
  });
}

function startWatch() {
  if (unsubscribe) unsubscribe();
  $('#cleanup-status').textContent = '即時監看中…';
  getFirebaseApi().then(({ watchCleanupPhotos }) => {
    unsubscribe = watchCleanupPhotos((rows) => {
      records = rows;
      renderAll();
    }, (err) => {
      $('#cleanup-status').textContent = `載入失敗：${err.code || err.message}`;
    });
  }).catch((err) => {
    $('#cleanup-status').textContent = `Firebase 載入失敗：${err.message || err}`;
  });
}

function renderAll() {
  const classFilter = $('#filter-class').value;
  const iccFilter = $('#filter-icc').value;
  const groupFilter = $('#filter-group').value.trim();
  filtered = records.filter((record) => {
    if (record.activity && record.activity !== 'yuguang') return false;
    const classId = getDisplayClassId(record);
    if (classFilter !== 'all') {
      if (classFilter === 'unknown' && classId !== '未標班級') return false;
      if (classFilter !== 'unknown' && classId !== classFilter) return false;
    }
    if (iccFilter !== 'all' && String(record.iccId) !== String(iccFilter)) return false;
    if (groupFilter && !String(record.group || '').includes(groupFilter)) return false;
    return true;
  });
  $('#cleanup-status').textContent = `共 ${records.length} 張照片，目前顯示 ${filtered.length} 張。`;
  renderSummary(filtered);
  renderGallery(filtered);
}

function renderSummary(rows) {
  const summary = buildCleanupSummary(rows, iccItems);
  const iccTop = [...summary.byIcc.values()]
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count || a.id - b.id)
    .slice(0, 8);
  const cats = [...summary.byCategory.values()].sort((a, b) => b.count - a.count);
  const classes = [...summary.byClass.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const groups = [...summary.byGroup.entries()].sort((a, b) => b[1] - a[1]);

  $('#summary').innerHTML = `
    <div class="cleanup-stat"><strong>${summary.total}</strong><span>照片總數</span></div>
    <div class="cleanup-stat"><strong>${iccTop[0]?.name || '—'}</strong><span>最多 ICC 項</span></div>
    <div class="cleanup-stat"><strong>${classes[0]?.[0] || '—'}</strong><span>最多上傳班級</span></div>
    <div class="cleanup-stat"><strong>${groups[0]?.[0] || '—'}</strong><span>最多上傳小組</span></div>
  `;

  $('#class-bars').innerHTML = classes.length ? classes.map(([classId, count]) =>
    barRow(classId, count, summary.total)
  ).join('') : emptyText('尚無資料');
  $('#category-bars').innerHTML = cats.length ? cats.map((cat) => barRow(cat.label, cat.count, summary.total)).join('') : emptyText('尚無資料');
  $('#icc-bars').innerHTML = iccTop.length ? iccTop.map((item) =>
    barRow(`ICC ${String(item.id).padStart(2, '0')} · ${item.name}`, item.count, summary.total)
  ).join('') : emptyText('尚無資料');
  $('#group-bars').innerHTML = groups.length ? groups.map(([group, count]) =>
    barRow(group, count, summary.total)
  ).join('') : emptyText('尚無資料');
}

function renderGallery(rows) {
  const root = $('#gallery');
  if (!rows.length) {
    root.innerHTML = '<p class="cleanup-empty">目前沒有符合條件的照片。</p>';
    return;
  }
  root.innerHTML = rows.map((record) => `
    <figure class="cleanup-photo" data-photo-id="${record.photoId}">
      <div class="cleanup-photo__image"><span>載入中…</span></div>
      <figcaption>
        <strong>${escapeHtml(getDisplayClassId(record))} · ${escapeHtml(record.group || '未填小組')}</strong>
        <span>ICC ${String(record.iccId).padStart(2, '0')} · ${escapeHtml(record.iccName || '')}</span>
      </figcaption>
    </figure>
  `).join('');
  hydrateImages(rows);
}

async function hydrateImages(rows) {
  await Promise.all(rows.slice(0, 60).map(async (record) => {
    const holder = document.querySelector(`[data-photo-id="${record.photoId}"] .cleanup-photo__image`);
    if (!holder) return;
    try {
      const url = await getPhotoUrl(record);
      holder.innerHTML = `<img src="${url}" alt="${escapeHtml(getDisplayClassId(record))} ${escapeHtml(record.group || '')} ${escapeHtml(record.iccName || '')}" loading="lazy">`;
    } catch (_) {
      holder.innerHTML = '<span>照片讀取失敗</span>';
    }
  }));
}

function downloadCsv() {
  const blob = new Blob([cleanupCsv(filtered)], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `yuguang-cleanup-${today()}.csv`);
}

async function downloadZip() {
  if (!filtered.length) return setDownloadStatus('沒有可下載的照片。');
  if (!window.JSZip) return setDownloadStatus('ZIP 工具尚未載入，請重新整理。');

  const zip = new window.JSZip();
  $('#zip-btn').disabled = true;
  try {
    let completed = 0;
    const concurrency = Math.min(2, filtered.length);
    const workers = Array.from({ length: concurrency }, async (_, workerIndex) => {
      for (let i = workerIndex; i < filtered.length; i += concurrency) {
        const record = filtered[i];
        const item = iccItems.find((x) => Number(x.id) === Number(record.iccId)) || {
          id: record.iccId,
          name: record.iccName || '未分類',
        };
        const blob = await getPhotoBlobForZip(record, i + 1);
        const folder = zip.folder(formatIccFolderName(item));
        folder.file(formatPhotoFileName(record), blob);
        completed += 1;
        setDownloadStatus(`下載照片中 ${completed} / ${filtered.length}…`);
      }
    });
    await Promise.all(workers);
    setDownloadStatus('正在產生 ZIP…');
    const out = await zip.generateAsync({ type: 'blob' }, (meta) => {
      setDownloadStatus(`正在產生 ZIP… ${Math.round(meta.percent)}%`);
    });
    downloadBlob(out, `yuguang-cleanup-photos-${today()}.zip`);
    setDownloadStatus('ZIP 已下載。');
  } catch (err) {
    setDownloadStatus(`ZIP 下載失敗：${err.message || err}`);
  } finally {
    $('#zip-btn').disabled = false;
  }
}

async function getPhotoUrl(record) {
  if (urlCache.has(record.storagePath)) return urlCache.get(record.storagePath);
  const { getCleanupPhotoUrl } = await getFirebaseApi();
  const url = await getCleanupPhotoUrl(record.storagePath);
  urlCache.set(record.storagePath, url);
  return url;
}

async function getPhotoBlob(record) {
  const { getCleanupPhotoBlob } = await getFirebaseApi();
  return getCleanupPhotoBlob(record.storagePath);
}

async function getPhotoBlobForZip(record, index) {
  try {
    const url = await getPhotoUrl(record);
    return await renderImageUrlToJpegBlob(url);
  } catch (err) {
    setDownloadStatus(`第 ${index} 張改用備援下載…`);
    return getPhotoBlobWithRetry(record, index);
  }
}

async function getPhotoBlobWithRetry(record, index) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (attempt > 1) {
        setDownloadStatus(`第 ${index} 張重試下載中… (${attempt}/3)`);
        await delay(700 * attempt);
      }
      return await getPhotoBlob(record);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function renderImageUrlToJpegBlob(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('圖片載入逾時')), 45000);
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('照片轉檔失敗'));
        }, 'image/jpeg', 0.9);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('照片下載失敗'));
    };
    img.src = url;
  });
}

function barRow(label, count, total) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return `
    <div class="cleanup-bar-row">
      <span>${escapeHtml(label)}</span>
      <strong>${count}</strong>
      <div class="cleanup-bar"><i style="width:${pct}%"></i></div>
    </div>
  `;
}

function emptyText(text) {
  return `<p class="cleanup-empty">${text}</p>`;
}

async function loadFirebaseConfig() {
  if (window.OG?.firebase) return true;
  try {
    await Promise.race([
      import('../firebase-config.js'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
    ]);
  } catch (_) {
    return false;
  }
  return !!window.OG?.firebase;
}

function getFirebaseApi() {
  firebaseApiPromise ||= import('./firebase-cleanup.js?v=zip-retry');
  return firebaseApiPromise;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 200);
}

function setDownloadStatus(text) {
  $('#download-status').textContent = text;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}
