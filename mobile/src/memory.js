// 长期记忆：记住你常犯的问题（只存在这台手机上，设置里可以一键清除）
// agent 每次深度分析完会给出这张照片的"问题类别"，这里累计起来；
// 下次指导、分析时把它告诉 AI，让它优先提醒你容易犯的错

export const HABITS = ["水平", "曝光", "主体位置", "主体大小", "背景杂乱", "裁切", "清晰度", "光线", "构图平衡"];
const KEY = "memory";

export function loadMemory() {
  try {
    return { habits: {}, scores: [], analyses: 0, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { habits: {}, scores: [], analyses: 0 };
  }
}

function save(m) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {}
}

export function recordAnalysis({ score, habits }) {
  const m = loadMemory();
  m.analyses++;
  if (Number.isFinite(score)) m.scores = [...m.scores, score].slice(-20);
  for (const h of habits || []) if (HABITS.includes(h)) m.habits[h] = (m.habits[h] || 0) + 1;
  save(m);
  return m;
}

export function clearMemory() {
  try { localStorage.removeItem(KEY); } catch {}
}

// 给 AI 看的一句话；没有足够的记录时返回空字符串
export function memoryText() {
  const m = loadMemory();
  if (m.analyses < 2) return "";
  const top = Object.entries(m.habits).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const recent = m.scores.slice(-10);
  const avg = recent.length ? (recent.reduce((a, b) => a + b, 0) / recent.length).toFixed(1) : null;
  return [
    `已经深度分析过 ${m.analyses} 张照片`,
    avg ? `最近 ${recent.length} 张平均 ${avg} 分` : "",
    top.length ? `常见问题：${top.map(([k, n]) => `${k}（${n} 次）`).join("、")}` : "",
  ].filter(Boolean).join("；");
}

// 给人看的
export function memorySummary() {
  return memoryText() || "还没有足够的记录。深度分析几张照片后，伙伴会记住你常犯的问题。";
}
