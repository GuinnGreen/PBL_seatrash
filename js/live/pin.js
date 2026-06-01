// js/live/pin.js
// 4 位數加入碼(字串,保留前導 0,例如 "0427")。rand 可注入以利測試。
export function generatePin(rand = Math.random) {
  const n = Math.floor(rand() * 10000); // 0..9999
  return String(n).padStart(4, '0');
}

export function isValidPin(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}
