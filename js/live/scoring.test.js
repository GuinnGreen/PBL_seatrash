// js/live/scoring.test.js
import assert from 'node:assert/strict';
import { scoreAnswer, aggregateGroups } from './scoring.js';

// 答錯 → 0 分
assert.equal(scoreAnswer({ correct: false, timeMs: 100, timeLimitMs: 20000 }), 0);
// 答對 + 瞬間作答 → 滿分 base
assert.equal(scoreAnswer({ correct: true, timeMs: 0, timeLimitMs: 20000, base: 1000 }), 1000);
// 答對 + 用滿時間 → base/2
assert.equal(scoreAnswer({ correct: true, timeMs: 20000, timeLimitMs: 20000, base: 1000 }), 500);
// 答對 + 用一半時間 → base*0.75
assert.equal(scoreAnswer({ correct: true, timeMs: 10000, timeLimitMs: 20000, base: 1000 }), 750);
// 超時仍 clamp 到 base/2
assert.equal(scoreAnswer({ correct: true, timeMs: 99999, timeLimitMs: 20000, base: 1000 }), 500);

// 小組加總:依 group 欄位加總,忽略無組別者
const groups = aggregateGroups([
  { group: '1', score: 750 }, { group: '1', score: 500 },
  { group: '2', score: 1000 }, { group: '', score: 999 },
]);
assert.deepEqual(groups, { '1': 1250, '2': 1000 });

console.log('scoring.js: all tests passed');
