// js/live/sampling.test.js
import assert from 'node:assert/strict';
import { pickLivePool } from './sampling.js';

const cats = ['beverage', 'food', 'fishing', 'hazard', 'other'];
// 造 10 題/類,共 50 題
const items = [];
for (const c of cats) for (let i = 0; i < 10; i++) items.push({ category: c, label: `${c}${i}` });

// 抽 20 題 → 每類應 4 題
const pool = pickLivePool(items, cats, 20);
assert.equal(pool.length, 20);
const counts = {};
for (const it of pool) counts[it.category] = (counts[it.category] || 0) + 1;
for (const c of cats) assert.equal(counts[c], 4, `${c} 應 4 題,實得 ${counts[c]}`);

// 沒有 label 的題目要被排除(與 game.js 一致)
const sparse = [{ category: 'beverage', label: '' }, { category: 'food', label: 'x' }];
const pool2 = pickLivePool(sparse, cats, 5);
assert.ok(pool2.every((it) => it.label), '不應含無 label 題目');

console.log('sampling.js: all tests passed');
