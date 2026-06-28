export const ACTIVITY_ID = 'yuguang';
export const VALID_CLASS_IDS = ['505', '506'];
export const UNKNOWN_CLASS_LABEL = '未標班級';

export const CATEGORY_LABELS = {
  beverage: '飲料容器',
  food: '食物包裝',
  fishing: '漁業用具',
  hazard: '個人衛生與危險',
  other: '其他/不確定',
};

export function normalizeGroup(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function normalizeClassId(value, { allowUnknown = false } = {}) {
  const classId = String(value || '').trim();
  if (VALID_CLASS_IDS.includes(classId)) return classId;
  if (allowUnknown && !classId) return UNKNOWN_CLASS_LABEL;
  throw new Error('classId must be 505 or 506');
}

export function findIccItem(iccId, iccItems) {
  const id = Number(iccId);
  return iccItems.find((item) => Number(item.id) === id) || null;
}

export function buildCleanupRecord(input, iccItems) {
  const classId = normalizeClassId(input.classId);
  const group = normalizeGroup(input.group);
  if (!group) throw new Error('group is required');

  const item = findIccItem(input.iccId, iccItems);
  if (!item) throw new Error(`Unknown ICC id: ${input.iccId}`);

  if (!input.photoId) throw new Error('photoId is required');
  if (!input.storagePath) throw new Error('storagePath is required');
  if (!input.ownerUid) throw new Error('ownerUid is required');

  return {
    activity: ACTIVITY_ID,
    photoId: input.photoId,
    classId,
    group,
    iccId: Number(item.id),
    iccName: item.name,
    category: item.cat,
    categoryLabel: CATEGORY_LABELS[item.cat] || item.cat,
    storagePath: input.storagePath,
    width: Number(input.width) || 0,
    height: Number(input.height) || 0,
    ownerUid: input.ownerUid,
  };
}

export function buildCleanupSummary(records, iccItems) {
  const byIcc = new Map();
  const byCategory = new Map();
  const byClass = new Map();
  const byGroup = new Map();

  for (const item of iccItems) {
    byIcc.set(Number(item.id), {
      id: Number(item.id),
      name: item.name,
      category: item.cat,
      count: 0,
    });
  }

  for (const record of records) {
    const iccId = Number(record.iccId);
    const icc = byIcc.get(iccId) || {
      id: iccId,
      name: record.iccName || `ICC ${iccId}`,
      category: record.category || 'other',
      count: 0,
    };
    icc.count += 1;
    byIcc.set(iccId, icc);

    const catKey = record.category || 'other';
    const cat = byCategory.get(catKey) || {
      key: catKey,
      label: CATEGORY_LABELS[catKey] || catKey,
      count: 0,
    };
    cat.count += 1;
    byCategory.set(catKey, cat);

    const group = normalizeGroup(record.group) || '未填小組';
    byGroup.set(group, (byGroup.get(group) || 0) + 1);

    const classId = getDisplayClassId(record);
    byClass.set(classId, (byClass.get(classId) || 0) + 1);
  }

  return { total: records.length, byIcc, byCategory, byClass, byGroup };
}

export function formatIccFolderName(item) {
  const id = String(Number(item.id)).padStart(2, '0');
  const safeName = safeFilePart(item.name || `ICC_${id}`);
  return `ICC_${id}_${safeName}`;
}

export function formatPhotoFileName(record) {
  const classId = safeFilePart(getDisplayClassId(record));
  const group = safeFilePart(normalizeGroup(record.group) || '未填小組');
  const photoId = safeFilePart(record.photoId || record.id || 'photo');
  return `${classId}_${group}_${photoId}.jpg`;
}

export function getDisplayClassId(record) {
  if (VALID_CLASS_IDS.includes(String(record.classId || '').trim())) {
    return String(record.classId).trim();
  }
  return UNKNOWN_CLASS_LABEL;
}

export function cleanupCsv(records) {
  const header = ['班級', '小組', 'ICC編號', 'ICC分類', '五大類', '照片路徑', '寬度', '高度', '上傳時間'];
  const rows = records.map((record) => [
    getDisplayClassId(record),
    record.group,
    record.iccId,
    record.iccName,
    record.category,
    record.storagePath,
    record.width || '',
    record.height || '',
    formatTimestamp(record.createdAt),
  ]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n')}`;
}

export function formatTimestamp(value) {
  if (!value) return '';
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function safeFilePart(value) {
  return String(value || 'photo')
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'photo';
}
