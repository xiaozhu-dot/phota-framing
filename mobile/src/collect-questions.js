// 收集版：标注题目，以及提交 / 跳过时怎么整理一条回合记录
//   步骤标记：每一步指导打一个（"可以拍了"这类 ready 步骤和失败的步骤不标）
//   前后盲选：指导前画面和最满意的一张左右随机摆放（round.blindLeft 记下左边是哪张），用户选更好的一张
//   part：compare = 盲选，shot = 成片，scene = 场景专属题，overall = 整体
import { SCENES, sceneId } from "./scenes.js";

export const STEP_MARKS = ["有用", "没用", "做不到", "没听懂"];
const scene = (id) => (a) => sceneId(a.scene) === id;

export const QUESTIONS = [
  { key: "blind", part: "compare", title: "哪张更好？", options: ["左边", "右边", "差不多", "说不清"], when: (a, c) => c.blind },
  { key: "stars", part: "shot", title: "拍到的这张你自己满意吗？", options: ["1", "2", "3", "4", "5"], type: "stars" },
  { key: "scene", part: "overall", title: "这次拍的是？（App 自动判断的，不对就改）", options: SCENES.map((s) => s.label) },
  { key: "natural", part: "scene", title: "表情和姿势自然吗？", options: ["自然", "有点僵", "很僵"], when: scene("portrait") },
  { key: "moment", part: "scene", title: "抓到时机了吗？", options: ["抓到了", "差一点", "没抓到"], when: scene("street") },
  { key: "spirit", part: "scene", title: "抓到神态了吗？", options: ["抓到了", "差一点", "没抓到"], when: scene("animal") },
  { key: "layers", part: "scene", title: "水平和层次处理好了吗？", options: ["好", "一般", "不好"], when: scene("landscape") },
  { key: "helpful", part: "overall", title: "这一轮指导帮到你了吗？", options: ["很有帮助", "有一点", "没帮助", "帮倒忙"] },
  { key: "stepCount", part: "overall", title: "步骤数", options: ["太多", "刚好", "太少"] },
  { key: "speed", part: "overall", title: "AI 回复的速度", options: ["可以接受", "有点慢", "太慢"] },
  { key: "light", part: "overall", title: "当时的光线", options: ["室外晴天", "室外阴天", "室内", "夜景", "逆光"] },
];

// 要打步骤标记的那几步（下标）
export const markableSteps = (round) => round.steps.map((s, i) => (!s.error && s.status !== "ready" ? i : -1)).filter((i) => i >= 0);
// 能不能做前后盲选：要有指导前画面和至少一张带小图的成片
export const canBlind = (round) => Boolean(round.before && round.shots.some((s) => s.thumb));

export const askedQuestions = (answers, ctx = {}) => QUESTIONS.filter((q) => !q.when || q.when(answers, ctx));
export function missingAnswers(answers = {}, ctx = {}) {
  const missing = askedQuestions(answers, ctx).filter((q) => !q.options.includes(answers[q.key])).map((q) => q.key);
  for (const i of ctx.steps ?? []) if (!STEP_MARKS.includes(answers.steps?.[i])) missing.push("step" + i);
  return missing;
}

// 盲选的回答 → 指导后比指导前：after（指导后更好）/ before / same / unsure
export function blindResult(pick, left) {
  if (pick === "差不多") return "same";
  if (pick !== "左边" && pick !== "右边") return "unsure";
  return (pick === "左边") === (left === "after") ? "after" : "before";
}

// 提交或跳过一回合。附图只留指导前画面、步骤画面和最满意的一张；不附图或跳过就把图全部去掉
//   expired：7 天没标，自动当作跳过
export function finishRound(round, { skip = false, expired = false, answers, comment = "", best = 0, attach = true, now = Date.now() }) {
  const shotCount = round.shotCount ?? round.shots.length;
  const keepImages = !skip && attach;
  const { before, ...rest } = round;
  const r = {
    ...rest,
    ...(keepImages && before ? { before } : {}),
    shotCount,
    steps: round.steps.map(({ frame, ...s }) => (keepImages && frame ? { ...s, frame } : s)),
    shots: round.shots.map(({ thumb, ...s }, i) => (keepImages && i === best && thumb ? { ...s, thumb } : s)),
    updatedAt: now,
  };
  if (skip) return { ...r, status: "skipped", ...(expired ? { skipReason: "expired" } : {}) };
  const ctx = { blind: Boolean(round.blindLeft) && canBlind(round), steps: markableSteps(round) };
  const picked = Object.fromEntries(askedQuestions(answers, ctx).map((q) => [q.key, answers[q.key]]));
  picked.steps = Object.fromEntries(ctx.steps.map((i) => [i, answers.steps?.[i]]));
  const missing = missingAnswers(picked, ctx);
  if (missing.length) throw new Error("还有题没答：" + missing.join("、"));
  if (!(best >= 0 && best < Math.max(1, round.shots.length))) throw new Error("最满意的一张不存在");
  // 修改一条没附图的旧标注：图已经删了，没法再盲选，沿用上次的结果
  const compare = ctx.blind ? blindResult(picked.blind, round.blindLeft) : round.compare;
  if (!ctx.blind && round.answers?.blind) picked.blind = round.answers.blind;
  return { ...r, status: "done", answers: picked, comment: String(comment).trim(), best, attach: keepImages,
           ...(compare ? { compare } : {}),
           sceneFixed: sceneId(picked.scene) !== (round.scene ?? "landscape") ? sceneId(picked.scene) : undefined,
           annotatedAt: round.annotatedAt ?? now };
}
