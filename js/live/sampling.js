// js/live/sampling.js
// 分層抽樣:每類抽相同題數,不足再從剩餘補,最後打散讓分類交錯。
// 與 js/game.js 的 pickPool() 同精神,但參數化、亂數可注入以利測試。
export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// items: [{ category, label, ... }];categories: 類別 key 陣列;total: 想要的總題數。
// 回傳已打散、各類均衡的題目陣列。需有 category 且有 label 才納入(與 game.js 一致)。
export function pickLivePool(items, categories, total, rand = Math.random) {
  const per = Math.floor(total / categories.length);
  const byCat = {};
  for (const c of categories) byCat[c] = [];
  for (const it of items) {
    if (!it.category || !it.label) continue;
    if (byCat[it.category]) byCat[it.category].push(it);
  }
  const picked = [];
  const leftover = [];
  for (const c of categories) {
    const sh = shuffle(byCat[c], rand);
    picked.push(...sh.slice(0, per));
    leftover.push(...sh.slice(per));
  }
  if (picked.length < total) {
    picked.push(...shuffle(leftover, rand).slice(0, total - picked.length));
  }
  return shuffle(picked, rand).slice(0, total);
}
