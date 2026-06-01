// js/live/scoring.js
// 即時搶答計分。答對給「基礎分 + 速度加分」,答錯 0 分。
// Kahoot 式:答對最少拿 base/2,越快越接近 base。
export function scoreAnswer({ correct, timeMs, timeLimitMs, base = 1000 }) {
  if (!correct) return 0;
  const frac = Math.max(0, Math.min(1, timeMs / timeLimitMs));
  return Math.round(base * (1 - frac / 2));
}

// 小組模式:把每位玩家的分數依組別加總。
// players: [{ group, score }] → { [group]: totalScore }
export function aggregateGroups(players) {
  const totals = {};
  for (const p of players) {
    const g = p.group;
    if (g == null || g === '') continue;
    totals[g] = (totals[g] || 0) + (p.score || 0);
  }
  return totals;
}
