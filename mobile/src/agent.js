// 深度分析 agent：不急着下结论，先用工具检查，确认之后再给建议
//
// 和"快速分析"（一次问完）的区别：
//   快速：程序先测好数据，一次性问 AI，AI 只能"看一眼就答"
//   深度：AI 自己决定下一步做什么 —— 测量、放大某块细看、试着裁剪并看裁完的效果 —— 看到结果后再决定下一步
//
// 循环（这就是 agent 的核心）：
//   思考 → 选一个工具 → 程序执行工具 → 把结果（文字或图片）交回给 AI → 再思考 …… → 给出结论
//
// 这里没有用服务商的 function calling，而是约定 AI 每一步输出一个 JSON：要么 {"tool": ...}，要么 {"final": ...}
// 好处是任何能输出 JSON 的模型都能用
import { askJSONMessages, userMsg, thinkingParam, isQwen } from "./ai.js";
import { toCanvas, toDataURL, measure, metricFacts, renderCrop, cropRegion, levelLines } from "./vision.js";
import { HABITS, memoryText } from "./memory.js";
import { skillsFor } from "./skill-store.js";

const MAX_STEPS = 6;

const PROMPT = (memory) => `你是一位摄影指导 agent。你不急着下结论：先用工具仔细检查照片，确认之后再给建议。

每一步只输出一个 JSON 对象，二选一：
① 调用工具：{"thought": "为什么做这一步，不超过 25 字", "tool": "工具名", "args": {...}}
② 给出结论：{"thought": "不超过 25 字", "final": {...}}

可用工具：
- measure：精确测量曝光、清晰度、水平倾斜（有陀螺仪数据时用陀螺仪）。args 填 {}
- zoom_in：从原图（全分辨率）里取出一块区域放大给你看。用来检查主体是否清晰、边缘有没有杂物、细节怎么样。
  args: {"left": 0~1, "top": 0~1, "right": 0~1, "bottom": 0~1}（相对照片宽高的比例）
- try_crop：按你给的范围裁剪，把裁好的图给你看，用来检验裁剪方案。args 同上，再加 "reason"
- level_lines：在照片（或其中一块）上画出严格水平和竖直的细线，像拿尺子比一比。
  人眼和你都很难看出 2~5° 的小倾斜，对着这些线一比就清楚了：地平线、海平线、建筑边缘和线不平行，就是歪了。
  args 填 {} 看整张；或者给范围 {"left", "top", "right", "bottom"} 只看一块

规则：
- 程序已经先测量过了，结果在第一条消息里（不用再调用 measure）。
- 如果打算建议裁剪，必须先用 try_crop 看过效果；不满意就调整范围再试。最终的 crop 必须是你试过并满意的那个。
- measure 的数据是程序测的，比你目测准，可以直接引用。但要注意：
  · 水平"把握：中"说明只找到一种证据，可能被树枝、斜坡骗了，要用 zoom_in 看看那条线是不是真的该水平
  · 水平"没测出来"时，画面里有地平线、海平线或建筑的话，用 level_lines 比一比再下判断；看不出就不要说它歪
  · 清晰度"有点糊 / 模糊"时，用 zoom_in 看看主体本身糊不糊（只是背景虚化不算问题）
  · 曝光"过曝"如果是白色背景 / 有意的高调风格，可以不算问题
- 最多 ${MAX_STEPS} 步，快到上限时直接给结论。
- 只描述照片里真实存在的东西；用中文；不要输出 JSON 以外的任何文字。

final 的格式：
{
  "title": "4~8 字的标题",
  "summary": "一句话总评，不超过 30 字",
  "highlights": ["亮点，每条不超过 12 字，2~3 条"],
  "problems": ["明显问题，每条不超过 12 字，0~3 条；没有就为空"],
  "nitpicks": ["小瑕疵，每条不超过 12 字，0~2 条"],
  "composition": 1~10 的整数，只看构图,
  "score": 1~10 的整数，成片总分,
  "suggestions": [{"action": "不超过 10 字的具体动作", "why": "不超过 35 字"}],
  "crop": {"left": 0~1, "top": 0~1, "right": 0~1, "bottom": 0~1, "reason": "不超过 25 字"} 或 null,
  "habits": ["这张照片暴露的问题类别，从 ${HABITS.join("、")} 里选 0~2 个"]
}
suggestions 正好 3 条，按重要程度排序（第一条会被念出来）。
问题分两种，分开写：
- 明显问题（problems）：一眼能看出、影响整张照片的硬伤 —— 画面明显歪斜、曝光明显过暗或过曝、主体模糊、
  主体被画框切掉一部分（人的头顶、帽子、手脚，动物的身体，主菜的一角）、主体紧贴或挤在画面边缘
- 小瑕疵（nitpicks）：留白稍多、背景有点杂、可以再紧凑一点这类"可以更好"的地方
评分标准（严格按标准打分，不要习惯性地给 7 分）：
- 9～10：构图、光线、主体都出色，没有明显问题
- 7～8：整体不错，没有明显问题，只有小瑕疵
- 5～6：有 1 个明显问题
- 3～4：有 2 个及以上明显问题
- 1～2：基本拍失败了
先想清楚有哪些明显问题，再给分；小瑕疵不扣分。
清晰度按测量结果：测出"模糊"算明显问题；测出"有点糊"算小瑕疵（除非主体本身糊得看不清细节）。
打两个分：
- composition：只看构图（主体位置、平衡、取舍、视角），不管清不清晰、亮不亮
- score：成片总分 = 构图 + 技术（清晰度、曝光、水平）。构图好但技术有问题时，score 可以比 composition 低
如果数据里有"取景时教练给的构图分"：你的 composition 一般应该和它接近（它看的是拍摄前的预览小图）；
差 2 分以上，或者 score 比 composition 低，都要在 summary 里用半句话说明原因（比如"构图好，但成片有点糊"）。
measure 测出的偏暗、过曝、模糊、高把握的倾斜（≥2°）都算明显问题（除非你确认是有意的风格，并在结论里说明）。${memory ? `

关于这位用户（长期记忆）：${memory}。如果这张照片又出现了他的老问题，在建议里点出来。` : ""}`;

// 上下文管理：每一步都要把整段对话重新发给 AI，图片越积越多会很费 token。
// 只保留最近 2 次工具返回的图片，更早的换成一句文字说明（原图始终保留）
function compact(messages) {
  const withImages = messages.map((m, i) => (i > 1 && Array.isArray(m.content) && m.content.some((c) => c.type === "image_url") ? i : -1)).filter((i) => i >= 0);
  const drop = new Set(withImages.slice(0, -2));
  return messages.map((m, i) => (drop.has(i) ? { ...m, content: m.content.filter((c) => c.type !== "image_url").concat({ type: "text", text: "（这一步的图片已省略）" }) } : m));
}

const TOOL_NAMES = { measure: "测量", zoom_in: "放大细看", try_crop: "试裁剪", level_lines: "对齐线" };

// ===== 自检：结论和测量数据对得上吗？=====
// 这是 agent 常用的"反思"：先让它下结论，再找出结论里和事实矛盾的地方，让它重新想一次
// 审稿人是程序（固定的规则），不是另一个 AI —— 规则只管"有数据可依"的硬伤，不评判审美
const NEGATION = /(无|没有|没|不|未|并不|并无)[^，。；,;]{0,2}$/;
function mentions(text, words) {                                     // 肯定地提到了这些词（"没有倾斜"这种否定说法不算）
  return words.some((w) => {
    for (let i = text.indexOf(w); i !== -1; i = text.indexOf(w, i + 1)) if (!NEGATION.test(text.slice(Math.max(0, i - 4), i))) return true;
    return false;
  });
}
const sameBox = (a, b) => ["left", "top", "right", "bottom"].every((k) => Math.abs(Number(a?.[k]) - Number(b?.[k])) <= 0.02);

export function selfCheck(final, m, tried) {
  const all = JSON.stringify(final);                                 // 整个结论（用来找"有意为之"的说明）
  const problems = (final.problems || []).join("；");                // 明显问题
  const n = (final.problems || []).length, score = parseInt(final.score);
  const e = m.exposure, sh = m.sharpness, h = m.horizon, issues = [];

  // 测量确认的硬伤，必须写进"明显问题"（写成小瑕疵不算 —— 那样就不扣分了）
  if (e.verdict === "偏暗" && !mentions(problems, ["暗", "欠曝", "曝光不足"]))
    issues.push(`测量显示整体偏暗（最亮处只有 ${e.highlights}%），这是明显问题，但没写进 problems`);
  if (e.verdict === "过曝" && !mentions(problems, ["过曝", "太亮", "偏亮", "死白", "高光", "曝光过度"]) && !mentions(all, ["白色背景", "白背景", "高调"]))
    issues.push(`测量显示 ${e.over}% 的画面死白，没写进 problems（如果是白背景或有意的高调，请在 summary 里说明）`);
  if (sh.verdict === "模糊" && !mentions(problems, ["糊", "模糊", "虚", "不清", "对焦", "抖"]) && !mentions(all, ["背景虚化", "浅景深"]))
    issues.push(`测量显示画面模糊（边缘过渡 ${sh.edge} 像素），没写进 problems（如果只是背景虚化，请在 summary 里说明）`);
  // 歪斜的说法很多："倾斜""右倾""左高右低""不平"……都算
  const TILT = ["歪", "倾", "不平", "斜", "左高右低", "右高左低"];
  if (h.found && h.sure === "高" && Math.abs(h.angle) >= 2 && !mentions(problems, TILT))
    issues.push(`测量（高把握，依据：${h.by}）显示画面倾斜 ${Math.abs(h.angle)}°，这是明显问题，但没写进 problems`);
  if (h.found && h.sure === "高" && Math.abs(h.angle) < 0.7 && mentions(problems, TILT))
    issues.push(`测量（高把握）显示基本是平的（${h.angle}°），问题里却说歪了`);
  // 分数和"明显问题"的个数要对得上（评分标准：有 1 个明显问题 5～6 分，2 个及以上 3～4 分）
  if (n >= 1 && score >= 7)
    issues.push(`有 ${n} 个明显问题却打了 ${score} 分（标准：1 个明显问题 5～6 分，2 个及以上 3～4 分）；如果它们其实只是小瑕疵，就移到 nitpicks`);
  else if (n >= 2 && score >= 6)
    issues.push(`有 ${n} 个明显问题却打了 ${score} 分（标准：2 个及以上明显问题 3～4 分）`);
  // 主体被切 / 贴边，评分标准里算明显问题；写进了小瑕疵就提醒一下（被切的也可能只是次要物体，让它自己判断）
  // 已经写明"非主体 / 次要 / 背景里的东西"被切，就不追问了
  const cutNit = (final.nitpicks || []).find((t) => mentions(t, ["切", "截", "贴边", "贴左", "贴右", "挤"]) && !/非主体|次要|背景|配角|杂物|前景/.test(t));
  if (cutNit)
    issues.push(`小瑕疵里写了"${cutNit}"。评分标准里，主体被切掉一部分或紧贴边缘算明显问题：如果说的是主体，请移到 problems 并按标准打分；只是次要物体就保留`);
  if (n === 0 && score <= 4)
    issues.push(`打了 ${score} 分却没有任何明显问题`);
  if (final.crop && !tried.some((c) => sameBox(c, final.crop)))
    issues.push("最终给的裁剪范围没有用 try_crop 试过");
  return issues;
}

// canvas：分析用的照片（长边 ≤ 1000）；full：同一张照片的高分辨率版本（"放大细看"从这里取，才看得到细节）
// sensor：拍摄时的陀螺仪读数（只有用本 App 拍的照片才有）
// onStep({ step, thought, tool, name, args, image, note })：每走一步通知界面
// thinking（只对千问这类会思考的模型有效）：
//   "off"   —— 都不思考（默认）：实测千问在这个任务上，不思考和"结论时复核"一样准（83% vs 83%），还快 8 秒
//   "final" —— 放大、裁剪这些工具步骤快速走；给出结论后，开思考把所有证据复核一遍
//   "all"   —— 每一步都思考：一张照片要 2 分钟以上，太慢
export async function runAgent(s, canvas, { full = canvas, sensor = null, onStep, signal, thinking = s.thinking || "off", scene = null } = {}) {
  const sk = skillsFor("analysis", scene, { where: "final" });   // 按场景挑出的摄影技能，附在说明后面
  // 第一步永远是测量，而测量是本地程序做的 —— 不用问 AI，直接测好一起交给它，每张照片省一次请求
  let metrics = measure(canvas, sensor);
  const h0 = metrics.horizon;
  onStep?.({ step: 1, thought: "先让程序把曝光、清晰度、水平测一遍", tool: "measure", name: "测量", metrics,
             note: `曝光${metrics.exposure.verdict} · ${metrics.sharpness.verdict} · ${h0.found ? `倾斜 ${h0.angle}°（${h0.by}）` : "没找到可靠的水平线"}` });
  const messages = [
    { role: "system", content: PROMPT(memoryText()) + sk.prompt },
    userMsg(toDataURL(toCanvas(canvas, 768), 0.8), `请仔细分析这张照片。\n【程序已经测好的数据】${JSON.stringify(metricFacts(metrics))}`),
  ];
  let reflected = false, thinkNext = false;
  let reviewed = thinking !== "final" || !isQwen(s);               // 不会思考的模型，复核意义不大，就不多花这一次请求
  const tried = [];                                                  // 试过的裁剪
  const think = (on) => thinkingParam(s, on);
  let lastCall = "", repeats = 0, graced = false;
  let limit = MAX_STEPS + 1;                                         // 最多走到第几步（自检需要时会临时加一步）

  for (let step = 2; step <= limit; step++) {
    if (step === limit) messages.push({ role: "user", content: "这是最后一步了，请直接给出 final。" });
    let { data } = await askJSONMessages(s, compact(messages), thinkNext ? 6000 : 3000, signal, 0.3, think(thinking === "all" || thinkNext));
    thinkNext = false;
    messages.push({ role: "assistant", content: JSON.stringify(data) });

    if (data.final && !reviewed) {
      // 复核：开着思考，把前面所有证据（测量、放大、试裁剪）和这份结论再对一遍，给出最终版
      reviewed = true;
      onStep?.({ step, thought: data.thought || "初步结论有了", tool: "draft", name: "初步结论", note: `${data.final.score ?? "?"} 分 · 开始复核` });
      messages.push({ role: "user", content: "【复核】请认真思考：把前面所有工具结果、测量数据和你的初步结论逐条对照，" +
        "按评分标准检查问题的轻重、两个分数是否合理、裁剪是否试过。然后输出最终的 JSON：{\"thought\": \"...\", \"final\": {...}}（格式同上）。" });
      try {
        const r = await askJSONMessages(s, compact(messages), 6000, signal, 0.3, think(true));
        if (r.data.final || r.data.score != null) {
          data = r.data.final ? r.data : { thought: "复核完成", final: r.data };
          messages.push({ role: "assistant", content: JSON.stringify(data) });
          step++;
        }
      } catch (e) { if (e.name === "AbortError") throw e; }     // 复核失败就用初步结论
    }

    if (data.final) {
      const issues = selfCheck(data.final, metrics, tried);
      if (issues.length && !reflected) {                             // 自检永远留一次修正的机会：没步数了就临时加一步
        if (step >= limit) limit = step + 1;
        // 发现矛盾：指出来，让它再想一次（只给一次机会，避免来回拉扯）
        reflected = true;
        onStep?.({ step, thought: data.thought || "可以下结论了", tool: "check", name: "自检", note: "发现对不上的地方：" + issues.join("；") });
        thinkNext = isQwen(s) && thinking !== "off";                // 被自检打回后修正的这一步，也想清楚再答
        messages.push({ role: "user", content: `【自检】你的结论和测量数据有对不上的地方：\n- ${issues.join("\n- ")}\n` +
          "请重新考虑。如果是数据没体现出的原因（比如有意的风格），就在结论里说明；否则修正结论和分数。可以继续用工具，最后再输出 final。" });
        continue;
      }
      onStep?.({ step, thought: data.thought || "可以下结论了", tool: "final", name: "结论",
                 note: issues.length ? "仍有出入：" + issues.join("；") : reflected ? "修正后和测量数据一致 ✓" : "和测量数据一致 ✓" });
      const skills = sk.finish({ usedSkills: data.final.usedSkills ?? data.usedSkills })._skills;
      return { final: { ...data.final, _skills: skills }, metrics, steps: step, reflected };
    }

    // ---- 执行工具 ----
    const tool = data.tool, args = data.args || {};
    // 只写了想法、既没调工具也没给结论：提醒一下，这一次不算步数（只宽限一次）
    if (!tool) {
      messages.push(userMsg([], "你这一步只写了想法，没有调用工具，也没有给出 final。请输出一个工具调用，或者直接给出 final。"));
      if (!graced) { graced = true; limit++; }
      continue;
    }
    let text, image = null, note = "";
    // 原地打转：和上一步一模一样的调用（实测千问不思考时偶尔会连着放大同一块好几次）—— 不再执行，提醒它往前走
    const callKey = tool + JSON.stringify(args);
    if (callKey === lastCall) {
      repeats++;
      text = repeats >= 2 ? "你已经连续几次做同一件事了，结果不会变。现在请直接给出 final。"
        : "这一步和上一步完全一样，结果不会变。请根据已经看到的内容继续：换一个工具或范围，或者直接给出 final。";
      onStep?.({ step, thought: data.thought || "", tool, name: TOOL_NAMES[tool] || tool, args, note: "重复了上一步，提醒它往前走" });
      messages.push(userMsg([], `【工具结果 · ${tool}】${text}`));
      continue;
    }
    lastCall = callKey;
    repeats = 0;
    if (tool === "measure") {
      metrics = measure(canvas, sensor);
      text = JSON.stringify(metricFacts(metrics));
      const h = metrics.horizon;
      note = `曝光${metrics.exposure.verdict} · ${metrics.sharpness.verdict} · ${h.found ? `倾斜 ${h.angle}°（${h.by}）` : "没找到可靠的水平线"}`;
    } else if (tool === "zoom_in") {
      const region = cropRegion(full, args);
      if (region) {
        image = toDataURL(toCanvas(region, 512), 0.8);
        text = "这是放大后的区域。";
      } else text = "这个范围不合理（太小或坐标有误），请换一个。";
    } else if (tool === "level_lines") {
      const hasBox = ["left", "top", "right", "bottom"].every((k) => args[k] != null);
      const region = hasBox ? cropRegion(full, args) : full;
      if (region) {
        image = toDataURL(toCanvas(levelLines(region), 768), 0.85);
        text = "红色细线是严格水平和竖直的。对照看看：画面里本该水平或竖直的线（地平线、海平线、建筑边缘）和红线平行吗？";
      } else text = "这个范围不合理（太小或坐标有误），请换一个。";
    } else if (tool === "try_crop") {
      const r = renderCrop(canvas, args);
      if (r) {
        tried.push(args);
        image = r.cropped;
        text = `裁剪后保留了 ${r.kept}% 的画面，这是裁好的样子。它达到你想要的效果了吗？`;
        note = `保留 ${r.kept}%${args.reason ? " · " + args.reason : ""}`;
      } else text = "这个裁剪范围不合理（裁掉太多、几乎没裁、或者坐标有误），请换一个。";
    } else {
      text = `没有叫 ${tool} 的工具。可用的只有 measure、zoom_in、try_crop、level_lines。`;
    }
    onStep?.({ step, thought: data.thought || "", tool, name: TOOL_NAMES[tool] || tool, args, image, metrics: tool === "measure" ? metrics : null, note: note || (image ? "" : text) });
    messages.push(userMsg(image ? [image] : [], `【工具结果 · ${tool}】${text}`));
  }
  // 步数用完还没结论：明确要求最后给一次结论，还不行才算失败
  messages.push({ role: "user", content: "步数用完了。请根据已经看到的内容，现在只输出 final。" });
  const { data } = await askJSONMessages(s, compact(messages), 3000, signal, 0.3, think(false));
  const final = data.final || (data.score != null ? data : null);
  if (final) {
    onStep?.({ step: MAX_STEPS + 2, thought: data.thought || "步数用完，直接下结论", tool: "final", name: "结论",
               note: selfCheck(final, metrics, tried).length ? "步数用完，来不及自检修正" : "和测量数据一致 ✓" });
    return { final, metrics, steps: MAX_STEPS + 2, reflected };
  }
  throw new Error(`agent 没能在 ${MAX_STEPS} 步内给出结论`);
}
