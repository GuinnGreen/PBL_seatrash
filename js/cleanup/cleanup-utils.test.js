import assert from 'node:assert/strict';
import {
  buildCleanupRecord,
  buildCleanupSummary,
  cleanupCsv,
  formatIccFolderName,
  formatPhotoFileName,
} from './cleanup-utils.js';

const iccItems = [
  { id: 1, name: '寶特瓶', emoji: '🍶', cat: 'beverage' },
  { id: 5, name: '塑膠提袋', emoji: '🛍️', cat: 'food' },
  { id: 15, name: '保麗龍浮筒', emoji: '⬜', cat: 'fishing' },
];

const record = buildCleanupRecord({
  photoId: 'abc123',
  classId: '505',
  group: '第 2 組',
  iccId: 15,
  storagePath: 'cleanup/yuguang/abc123.jpg',
  width: 1200,
  height: 900,
  ownerUid: 'uid-1',
}, iccItems);

assert.equal(record.activity, 'yuguang');
assert.equal(record.photoId, 'abc123');
assert.equal(record.classId, '505');
assert.equal(record.group, '第 2 組');
assert.equal(record.iccId, 15);
assert.equal(record.iccName, '保麗龍浮筒');
assert.equal(record.category, 'fishing');
assert.equal(record.storagePath, 'cleanup/yuguang/abc123.jpg');
assert.equal(record.width, 1200);
assert.equal(record.height, 900);
assert.equal(record.ownerUid, 'uid-1');

assert.throws(() => buildCleanupRecord({ ...record, iccId: 99 }, iccItems), /Unknown ICC id/);
assert.throws(() => buildCleanupRecord({ ...record, classId: '' }, iccItems), /classId/);
assert.throws(() => buildCleanupRecord({ ...record, classId: '507' }, iccItems), /classId/);
assert.throws(() => buildCleanupRecord({ ...record, group: '' }, iccItems), /group/);

const summary = buildCleanupSummary([
  record,
  { ...record, photoId: 'p2', group: '第 1 組', iccId: 1, iccName: '寶特瓶', category: 'beverage' },
  { ...record, photoId: 'p3', group: '第 1 組', iccId: 1, iccName: '寶特瓶', category: 'beverage' },
  { ...record, photoId: 'p4', classId: undefined },
], iccItems);

assert.equal(summary.total, 4);
assert.equal(summary.byIcc.get(1).count, 2);
assert.equal(summary.byIcc.get(15).count, 2);
assert.equal(summary.byCategory.get('beverage').count, 2);
assert.equal(summary.byGroup.get('第 1 組'), 2);
assert.equal(summary.byClass.get('505'), 3);
assert.equal(summary.byClass.get('未標班級'), 1);

assert.equal(formatIccFolderName({ id: 1, name: '寶特瓶' }), 'ICC_01_寶特瓶');
assert.equal(formatIccFolderName({ id: 15, name: '保麗龍/浮筒' }), 'ICC_15_保麗龍_浮筒');
assert.equal(formatPhotoFileName(record), '505_第_2_組_abc123.jpg');
assert.equal(formatPhotoFileName({ ...record, group: '第3/4組' }), '505_第3_4組_abc123.jpg');

const csv = cleanupCsv([record]);
assert.ok(csv.startsWith('\uFEFF'));
assert.ok(csv.includes('班級,小組,ICC編號,ICC分類,五大類'));
assert.ok(csv.includes('505,第 2 組,15,保麗龍浮筒,fishing'));

console.log('cleanup-utils.js: all tests passed');
