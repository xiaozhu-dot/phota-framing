// 相册的整理规则（纯函数，方便测试；说法见 CONTEXT.md「相册页」「连拍组」）
//   照片：{ id, at, source（camera 拍的 / import 导入的）, scene, quality: { edge, over, under }, analysis: { score, at, ... } }
//   - 新的在上面，按日期分组：今天 / 昨天 / 11月10日 / 2025年11月10日
//   - 连拍组：在 Phota 里拍的、相邻两张间隔不超过 10 秒的连续几张叠成一格；标出「最清楚」的那张
//   - 筛选：全部 / 人像 / 街拍 / 动物 / 风景 / 高分（分析过且 8 分以上）

export const BURST_GAP = 10_000;
export const TOP_SCORE = 8;
export const FILTERS = [
  { id: "all", label: "全部" },
  { id: "portrait", label: "人像" },
  { id: "street", label: "街拍" },
  { id: "animal", label: "动物" },
  { id: "landscape", label: "风景" },
  { id: "top", label: "高分" },
];

// 在 Phota 里拍的（老照片没记来源：拍的时候会带陀螺仪读数，导入的没有）
export const isCamera = (s) => (s.source ? s.source === "camera" : Boolean(s.sensor));

export function matches(shot, filter = "all") {
  if (filter === "all") return true;
  if (filter === "top") return Number(shot.analysis?.score) >= TOP_SCORE;
  return shot.scene === filter;
}

// 一张照片清不清楚：边缘过渡越窄越清楚；死白、死黑多的扣一点。没测过的排最后
export function blurScore(s) {
  const q = s.quality;
  if (!q || !Number.isFinite(q.edge)) return Infinity;
  return q.edge + ((q.over || 0) + (q.under || 0)) / 20;
}
// 一组里最清楚的那张；一样清楚（或都没测）时取最新的
export function bestOf(group) {
  return group.reduce((best, s) => {
    const a = blurScore(s), b = blurScore(best);
    return a < b || (a === b && s.at > best.at) ? s : best;
  });
}

// 照片（任意顺序）→ 格子（新的在前）：{ kind: "one", shot } 或 { kind: "burst", shots（新的在前）, best }
export function cells(shots) {
  const list = [...shots].sort((a, b) => b.at - a.at);
  const out = [];
  for (const s of list) {
    const last = out.at(-1), prev = last && (last.kind === "burst" ? last.shots.at(-1) : last.shot);
    if (prev && isCamera(s) && isCamera(prev) && prev.at - s.at <= BURST_GAP) {
      if (last.kind === "one") out[out.length - 1] = { kind: "burst", shots: [prev, s] };
      else last.shots.push(s);
    } else out.push({ kind: "one", shot: s });
  }
  for (const c of out) if (c.kind === "burst") c.best = bestOf(c.shots);
  return out;
}
export const cellShots = (c) => (c.kind === "burst" ? c.shots : [c.shot]);
export const cellAt = (c) => (c.kind === "burst" ? c.shots[0].at : c.shot.at);
// 大图里的顺序：连拍组里最清楚的那张排在这组最前面
export const viewOrder = (c) => (c.kind === "burst" ? [c.best, ...c.shots.filter((s) => s !== c.best)] : [c.shot]);

// 日期标题
const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export function dayLabel(at, now = Date.now()) {
  const days = Math.round((dayStart(now) - dayStart(at)) / 86_400_000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  const d = new Date(at), md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return d.getFullYear() === new Date(now).getFullYear() ? md : `${d.getFullYear()}年${md}`;
}

// 相册页要画的东西：[{ label, cells }]，先筛选再分组再按日期分段
export function sections(shots, { filter = "all", now = Date.now() } = {}) {
  const out = [];
  for (const c of cells(shots.filter((s) => matches(s, filter)))) {
    const label = dayLabel(cellAt(c), now);
    if (out.at(-1)?.label === label) out.at(-1).cells.push(c);
    else out.push({ label, cells: [c] });
  }
  return out;
}
// 每个筛选下有几张（为 0 的筛选按钮可以灰掉）
export const filterCounts = (shots) => Object.fromEntries(FILTERS.map((f) => [f.id, shots.filter((s) => matches(s, f.id)).length]));

// 成长曲线：分析过的照片按分析时间排，至少 3 个点才画
export const MIN_GROWTH = 3;
export function growth(shots) {
  return shots
    .filter((s) => Number.isFinite(Number(s.analysis?.score)) && s.analysis.score !== null)
    .map((s) => ({ at: s.analysis.at || s.at, score: Number(s.analysis.score) }))
    .sort((a, b) => a.at - b.at);
}
// 最近几次的平均分和前几次比：进步了多少（点不够返回 null）
export function trend(points, n = 3) {
  if (points.length < n * 2) return null;
  const avg = (xs) => xs.reduce((a, p) => a + p.score, 0) / xs.length;
  return Math.round((avg(points.slice(-n)) - avg(points.slice(0, n))) * 10) / 10;
}
