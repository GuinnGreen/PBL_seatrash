// js/live/icc.test.js
import assert from 'node:assert/strict';
import { buildIccOptions } from './icc.js';

const items = [
  { id: 1, name: '寶特瓶', emoji: '🍶', cat: 'beverage' },
  { id: 5, name: '塑膠提袋', emoji: '🛍️', cat: 'food' },
  { id: 7, name: '吸管', emoji: '🥤', cat: 'food' },
  { id: 14, name: '漁業浮球', emoji: '🟠', cat: 'fishing' },
  { id: 18, name: '菸蒂', emoji: '🚬', cat: 'hazard' },
  { id: 20, name: '口罩', emoji: '😷', cat: 'hazard' },
];

// 回傳 4 個選項,含正解,皆不重複,且每個有 id/name/emoji
const opts = buildIccOptions(7, items);
assert.equal(opts.length, 4, '應有 4 個選項');
assert.ok(opts.some((o) => o.id === 7), '必含正解 7');
const ids = opts.map((o) => o.id);
assert.equal(new Set(ids).size, 4, '選項不可重複');
for (const o of opts) {
  assert.ok(o.id != null && o.name && o.emoji, '每個選項要有 id/name/emoji');
}

// 正解一定出現;多次抽樣都成立
for (let i = 0; i < 200; i++) {
  const o = buildIccOptions(18, items);
  assert.ok(o.some((x) => x.id === 18));
  assert.equal(o.length, 4);
}

// 候選不足 4 個時:回傳全部(含正解),不報錯
const few = [{ id: 1, name: 'a', emoji: '🍶', cat: 'beverage' }, { id: 2, name: 'b', emoji: '🔘', cat: 'beverage' }];
const small = buildIccOptions(1, few);
assert.equal(small.length, 2);
assert.ok(small.some((o) => o.id === 1));

console.log('icc.js: all tests passed');
