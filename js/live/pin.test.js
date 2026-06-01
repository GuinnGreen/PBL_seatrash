// js/live/pin.test.js
import assert from 'node:assert/strict';
import { generatePin, isValidPin } from './pin.js';

// 格式:固定 4 位數字字串(含前導 0)
for (let i = 0; i < 1000; i++) {
  const p = generatePin();
  assert.ok(isValidPin(p), `bad pin: ${p}`);
}
// 邊界:rand=0 → "0000";rand≈0.9999 → "9999"
assert.equal(generatePin(() => 0), '0000');
assert.equal(generatePin(() => 0.99999), '9999');
// isValidPin 拒絕非法值
assert.equal(isValidPin('12'), false);
assert.equal(isValidPin('12345'), false);
assert.equal(isValidPin('abcd'), false);
assert.equal(isValidPin(1234), false);

console.log('pin.js: all tests passed');
