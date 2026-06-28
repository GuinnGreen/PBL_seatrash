import { CATEGORY_LABELS } from './cleanup-utils.js';
import { compressImageFile } from './image.js?v=compress-size';

const $ = (sel) => document.querySelector(sel);

const CATEGORY_ORDER = ['beverage', 'food', 'fishing', 'hazard', 'other'];
const GROUP_KEY = 'cleanup-yuguang-group';
const CLASS_KEY = 'cleanup-yuguang-class';

let iccItems = [];
let photoQueue = [];
let activePhotoId = null;
let activeCategory = CATEGORY_ORDER[0];
let cleanupApiPromise = null;
let isUploading = false;

init();

async function init() {
  try {
    const res = await fetch('../data/icc-items.json', { cache: 'no-store' });
    iccItems = await res.json();
    renderCategoryTabs();
    renderIccOptions();
  } catch (err) {
    setStatus(`ICC 清單載入失敗：${err.message}`, 'error');
  }

  $('#photo').addEventListener('change', onPhotoChange);
  $('#photo-queue').addEventListener('click', onQueueClick);
  $('#cleanup-form').addEventListener('submit', onSubmit);
  $('#icc-tabs').addEventListener('click', onTabClick);
  $('#icc-options').addEventListener('click', onIccClick);
  $('#icc-picker').addEventListener('click', onPickerClick);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePicker();
  });

  const storedClass = localStorage.getItem(CLASS_KEY) || '';
  const storedGroup = localStorage.getItem(GROUP_KEY) || '';
  if (storedClass) $('#class-id').value = storedClass;
  if (storedGroup) $('#group').value = storedGroup;
  renderQueue();
}

function onPhotoChange(event) {
  const files = [...(event.target.files || [])].filter((file) => file.type.startsWith('image/'));
  if (!files.length) {
    setStatus('請選擇圖片檔。', 'error');
    event.target.value = '';
    return;
  }

  const startIndex = photoQueue.length;
  const additions = files.map((file, index) => ({
    id: `local-${Date.now()}-${startIndex + index}`,
    file,
    objectUrl: URL.createObjectURL(file),
    iccId: null,
    status: 'pending',
    progress: 0,
    error: '',
    record: null,
  }));

  photoQueue = [...photoQueue, ...additions];
  event.target.value = '';
  setStatus(`已加入 ${additions.length} 張照片。點縮圖開始分類。`, 'ok');
  renderQueue();
}

function onQueueClick(event) {
  const deleteBtn = event.target.closest('[data-delete-photo]');
  if (deleteBtn) {
    deletePhoto(deleteBtn.dataset.deletePhoto);
    return;
  }
  const card = event.target.closest('[data-photo-id]');
  if (!card || isUploading) return;
  openPicker(card.dataset.photoId);
}

function deletePhoto(photoId) {
  const item = photoQueue.find((photo) => photo.id === photoId);
  if (!item || item.status === 'uploading') return;
  URL.revokeObjectURL(item.objectUrl);
  photoQueue = photoQueue.filter((photo) => photo.id !== photoId);
  if (activePhotoId === photoId) closePicker();
  renderQueue();
}

function openPicker(photoId) {
  const photo = photoQueue.find((item) => item.id === photoId);
  if (!photo) return;
  activePhotoId = photoId;
  const selectedItem = photo.iccId ? findIccItem(photo.iccId) : null;
  activeCategory = selectedItem?.cat || activeCategory || CATEGORY_ORDER[0];
  $('#picker-image').src = photo.objectUrl;
  $('#picker-photo-name').textContent = photo.file.name || '待分類照片';
  $('#icc-picker').hidden = false;
  renderCategoryTabs();
  renderIccOptions();
}

function closePicker() {
  $('#icc-picker').hidden = true;
  activePhotoId = null;
}

function onPickerClick(event) {
  if (event.target.closest('[data-close-picker]')) closePicker();
}

function onTabClick(event) {
  const tab = event.target.closest('[data-category]');
  if (!tab) return;
  activeCategory = tab.dataset.category;
  renderCategoryTabs();
  renderIccOptions();
}

function onIccClick(event) {
  const button = event.target.closest('[data-icc-id]');
  if (!button || !activePhotoId) return;
  const photo = photoQueue.find((item) => item.id === activePhotoId);
  if (!photo) return;
  photo.iccId = Number(button.dataset.iccId);
  photo.status = photo.status === 'done' ? 'done' : 'classified';
  photo.error = '';
  closePicker();
  renderQueue();
  setStatus('已標記分類。', 'ok');
}

function renderCategoryTabs() {
  const root = $('#icc-tabs');
  if (!root) return;
  root.innerHTML = CATEGORY_ORDER.map((cat) => `
    <button class="cleanup-tab${cat === activeCategory ? ' is-active' : ''}" type="button" data-category="${cat}">
      ${CATEGORY_LABELS[cat] || cat}
    </button>
  `).join('');
}

function renderIccOptions() {
  const root = $('#icc-options');
  if (!root) return;
  const currentPhoto = photoQueue.find((photo) => photo.id === activePhotoId);
  const items = iccItems.filter((item) => item.cat === activeCategory);
  root.innerHTML = items.length ? items.map((item) => `
    <button class="cleanup-icc-big${Number(currentPhoto?.iccId) === Number(item.id) ? ' is-selected' : ''}" type="button" data-icc-id="${item.id}">
      <span>${String(item.id).padStart(2, '0')}</span>
      <strong>${escapeHtml(item.name)}</strong>
    </button>
  `).join('') : '<p class="cleanup-empty">這個分類沒有項目。</p>';
}

function renderQueue() {
  const root = $('#photo-queue');
  const count = $('#queue-count');
  const unclassified = photoQueue.filter((photo) => !photo.iccId).length;
  count.textContent = photoQueue.length
    ? `${photoQueue.length} 張照片，${unclassified} 張未分類`
    : '尚未選擇照片';

  if (!photoQueue.length) {
    root.innerHTML = '<p class="cleanup-empty">可一次選多張照片，選完後點縮圖分類。</p>';
    updateOverallProgress();
    return;
  }

  root.innerHTML = photoQueue.map((photo, index) => {
    const icc = photo.iccId ? findIccItem(photo.iccId) : null;
    const statusText = getStatusText(photo, icc);
    return `
      <article class="cleanup-queue-card cleanup-queue-card--${photo.status}" data-photo-id="${photo.id}" tabindex="0">
        <div class="cleanup-queue-card__image">
          <img src="${photo.objectUrl}" alt="第 ${index + 1} 張待上傳照片">
          <span>${index + 1}</span>
        </div>
        <div class="cleanup-queue-card__body">
          <strong>${escapeHtml(photo.file.name || `照片 ${index + 1}`)}</strong>
          <p>${statusText}</p>
          <div class="cleanup-mini-progress"><i style="width:${photo.progress}%"></i></div>
        </div>
        <button class="cleanup-delete-photo" type="button" data-delete-photo="${photo.id}" ${photo.status === 'uploading' ? 'disabled' : ''}>刪除</button>
      </article>
    `;
  }).join('');
  updateOverallProgress();
}

async function onSubmit(event) {
  event.preventDefault();
  if (isUploading) return;

  const classId = $('#class-id').value.trim();
  const group = $('#group').value.trim();
  const unclassified = photoQueue.filter((photo) => !photo.iccId && photo.status !== 'done');

  if (!classId) return setStatus('請先選擇班級。', 'error');
  if (!['505', '506'].includes(classId)) return setStatus('班級只能選 505 或 506。', 'error');
  if (!group) return setStatus('請先填寫小組。', 'error');
  if (!photoQueue.length) return setStatus('請先選擇照片。', 'error');
  if (unclassified.length) return setStatus(`還有 ${unclassified.length} 張照片尚未分類。`, 'error');

  localStorage.setItem(CLASS_KEY, classId);
  localStorage.setItem(GROUP_KEY, group);

  isUploading = true;
  setFormEnabled(false);
  try {
    const uploadTargets = photoQueue.filter((photo) => photo.status !== 'done');
    if (!uploadTargets.length) {
      setStatus('這批照片已全部上傳完成。', 'ok');
      return;
    }
    for (let i = 0; i < uploadTargets.length; i++) {
      const photo = uploadTargets[i];
      await uploadOnePhoto(photo, { classId, group, index: i, total: uploadTargets.length });
    }
    appendUploaded(uploadTargets);
    setStatus(`已上傳 ${uploadTargets.length} 張照片。可以再加入下一批。`, 'ok');
  } catch (err) {
    setStatus(`上傳中斷：${err.code || err.message || 'unknown'}`, 'error');
  } finally {
    isUploading = false;
    setFormEnabled(true);
    renderQueue();
  }
}

async function uploadOnePhoto(photo, { classId, group, index, total }) {
  try {
    photo.status = 'uploading';
    photo.progress = 0;
    photo.error = '';
    renderQueue();
    setStatus(`第 ${index + 1} / ${total} 張壓縮中…`, 'busy');

    const compressed = await compressImageFile(photo.file);
    const { newCleanupPhotoId, uploadCleanupPhoto } = await loadCleanupApi();
    const photoId = newCleanupPhotoId();

    setStatus(`第 ${index + 1} / ${total} 張上傳中…`, 'busy');
    const record = await uploadCleanupPhoto({
      photoId,
      classId,
      group,
      iccId: photo.iccId,
      iccItems,
      blob: compressed.blob,
      width: compressed.width,
      height: compressed.height,
      onProgress: (pct) => {
        photo.progress = pct;
        updateOverallProgress();
        const card = document.querySelector(`[data-photo-id="${photo.id}"]`);
        const bar = card?.querySelector('.cleanup-mini-progress i');
        if (bar) bar.style.width = `${pct}%`;
      },
    });
    photo.status = 'done';
    photo.progress = 100;
    photo.record = record;
    renderQueue();
  } catch (err) {
    photo.status = 'error';
    photo.error = err.code || err.message || 'unknown';
    renderQueue();
    throw err;
  }
}

function appendUploaded(uploaded) {
  const list = $('#uploaded-list');
  const empty = list.querySelector('.cleanup-empty');
  if (empty) empty.remove();
  uploaded.forEach((photo) => {
    const record = photo.record;
    if (!record) return;
    const row = document.createElement('li');
    row.innerHTML = `
      <strong>${escapeHtml(record.classId)} · ${escapeHtml(record.group)}</strong>
      <span>ICC ${String(record.iccId).padStart(2, '0')} · ${escapeHtml(record.iccName)}</span>
    `;
    list.prepend(row);
  });
}

function updateOverallProgress() {
  const bar = $('#overall-progress');
  if (!bar) return;
  if (!photoQueue.length) {
    bar.style.width = '0%';
    return;
  }
  const total = photoQueue.reduce((sum, photo) => sum + (photo.progress || 0), 0);
  bar.style.width = `${Math.round(total / photoQueue.length)}%`;
}

function setFormEnabled(enabled) {
  $('#submit-btn').disabled = !enabled;
  $('#photo').disabled = !enabled;
  $('#class-id').disabled = !enabled;
  $('#group').disabled = !enabled;
}

function getStatusText(photo, icc) {
  if (photo.status === 'uploading') return `上傳中 ${photo.progress || 0}%`;
  if (photo.status === 'done') return `已上傳 · ICC ${String(photo.iccId).padStart(2, '0')} ${icc?.name || ''}`;
  if (photo.status === 'error') return `失敗：${photo.error}`;
  if (icc) return `已分類 · ICC ${String(icc.id).padStart(2, '0')} ${icc.name}`;
  return '未分類 · 點照片選 ICC';
}

function findIccItem(iccId) {
  return iccItems.find((item) => Number(item.id) === Number(iccId)) || null;
}

function setStatus(message, type) {
  const el = $('#status');
  el.textContent = message;
  el.dataset.type = type;
}

function loadCleanupApi() {
  cleanupApiPromise ||= import('./firebase-cleanup.js?v=upload-context');
  return cleanupApiPromise;
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
