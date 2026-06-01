// js/live/icc.js
// 為一題產生「四選一」ICC 選項:1 個正解 + 最多 3 個隨機誤答,洗牌後回傳。
// 純函式;iccItems 由呼叫端傳入(host 由 data/icc-items.json fetch),rand 可注入以利測試。
import { shuffle } from './sampling.js';

export function buildIccOptions(correctId, iccItems, rand = Math.random) {
  const correct = iccItems.find((i) => i.id === correctId);
  const others = iccItems.filter((i) => i.id !== correctId);
  const distractors = shuffle(others, rand).slice(0, 3);
  const chosen = correct ? [correct, ...distractors] : distractors;
  return shuffle(chosen, rand).map((i) => ({ id: i.id, name: i.name, emoji: i.emoji }));
}
