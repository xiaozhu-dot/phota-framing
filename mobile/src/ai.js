// AI 接口：和电脑版一样用"OpenAI 兼容格式"，只是改成手机直接调用
// 设置（密钥、地址、模型）保存在手机本地，不会上传到任何别的地方

import { companionFor } from './companions.js';
import { PORTRAIT_PROMPT, PORTRAIT_OBSERVE_PROMPT } from './portrait-prompt.js';
import { normalizePortrait } from './portrait-coach.js';
import { INFO_PROMPT, ALBUM_PROMPT } from './album-info.js';
import { skillsFor } from './skill-store.js';

// 千问 AI 平台：platform.qianwenai.com 申请的密钥
export const PRESETS = [
  { id: "qianwen", name: "千问 AI 平台", baseUrl: "https://maas.qianwenaiapi.com/compatible-mode/v1", model: "qwen3.8-flash" },
  { id: "zhipu", name: "智谱", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4v-flash" },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-flash" },
  { id: "custom", name: "自定义", baseUrl: "", model: "" },
];

const DEFAULTS = {
  preset: PRESETS[0].id, apiKey: "", baseUrl: PRESETS[0].baseUrl, model: PRESETS[0].model,
  voice: true,          // 朗读
  coachAuto: true,      // 自动指导（默认开：新手不用找按钮；长按宠物可关，关掉时宠物去睡觉）
  interval: 4,          // 智能指导时，两次之间至少隔几秒
  analysis: "deep",     // 照片分析：quick 快速 / deep 深度（agent）
  pet: "crab",
  voiceEngine: "cloud", // 千问语音；可切换为 system
  voiceModel: "qwen-audio-3.0-tts-plus", // 实测可用的年轻男女声
  voiceGender: "female",
  voiceApiKey: "",      // 留空沿用本机保存的千问平台密钥
  voiceName: "",        // 系统备用声音的 voiceURI
  voicePitch: 1,        // 原声，不靠拉高音调模拟年龄
  voiceRate: 1,
  voiceVersion: 2,
  ratio: "4:3",         // 照片比例
  quality: "高清",      // 照片清晰度：标准 / 高清 / 原图
};

export function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem("settings") || "{}");
    const s = { ...DEFAULTS, ...stored };
    if (!stored.voiceVersion && (stored.voicePitch == null || stored.voicePitch === 1.3)) s.voicePitch = 1;
    s.voiceVersion = 2;
    s.pet = companionFor(s.pet).id;
    s.voiceGender = companionFor(s.pet).gender;
    if (!PRESETS.some((p) => p.id === s.preset)) s.preset = "custom";   // 以前选的服务商已经去掉了：当作自定义，填过的地址和密钥照常用
    // 老版本只存一组：把它放进"每个服务商各一份"的 saved 里，切换服务商时不会丢
    if (!s.saved) s.saved = s.apiKey ? { [s.preset]: { baseUrl: s.baseUrl, model: s.model, apiKey: s.apiKey } } : {};
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  try { localStorage.setItem("settings", JSON.stringify(s)); } catch {}
}

export const isConfigured = (s) => Boolean(s.apiKey && s.baseUrl && s.model);

// ===== 提示词 =====
const RULES = `
要求：
- 只描述画面中真实存在的东西；用中文。
- 亮度、过曝、欠曝是程序精确测量的，可以直接引用。
- 水平：只有数据里给出了具体倾斜角度时才可信；写着"未检测到"表示程序没把握，请你自己看画面判断，
  看不出明显倾斜就不要说它歪。
- 只输出一个 JSON 对象，不要输出任何其他文字，不要用 markdown 代码块。`;

const REVIEW_PROMPT = `你是一位专业摄影指导，正在给用户的照片做快速点评。${RULES}

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

JSON 格式（按这个顺序写）：
{
  "title": "给照片起一个 4~8 字的标题",
  "summary": "一句话总评，不超过 30 字",
  "highlights": ["亮点，每条不超过 12 字，共 2~3 条"],
  "problems": ["明显问题，每条不超过 12 字，0~3 条；没有就写空列表"],
  "nitpicks": ["小瑕疵，每条不超过 12 字，0~2 条"],
  "composition": 1 到 10 的整数，只看构图,
  "score": 1 到 10 的整数，成片总分，按上面的评分标准
}`;

const SUGGEST_PROMPT = `你是一位专业摄影指导，告诉用户下次怎么拍得更好。${RULES}

JSON 格式：
{
  "suggestions": [
    {"action": "不超过 10 字的具体动作，例如：向右平移两步", "why": "不超过 35 字，说明这样做的效果"}
  ],
  "crop": {"left": 0.0, "top": 0.0, "right": 1.0, "bottom": 1.0, "reason": "不超过 25 字"}
}
suggestions 正好 3 条，按重要程度排序。
crop 是对这张照片的二次裁剪建议，坐标是相对图片宽高的比例（0~1）：
left/right 从图片左边算起，top/bottom 从图片上边算起。不需要裁剪时 crop 填 null。`;

export const COACH_PROMPT = `你是站在用户身边的摄影教练，正在看取景器里的实时画面。
只给一个最重要、马上能做的调整，像朋友一样口语化。${RULES}

你还会收到：你最近几次说过的话（从旧到新）、上次提示之后画面变化有多大、这位用户的长期习惯。请利用它们：
- 用户照着你上次的话做了、画面变好了：先简短夸一句（比如"很好！"），再给下一步。
- 上次的建议用户还没做（画面几乎没变）：别原样重复，换个说法或者给更具体的提示。
- 不要反复说同一件已经解决的事。
- 用户有常犯的问题时，优先留意。

- 构图已经不错（8 分及以上）就让用户拍，不要为了挑刺硬找问题。

先看主体在哪、应该在哪，再决定最需要做的一件事（fix）。往哪个方向移手机由程序根据位置换算，你只要把位置报准。
坐标：x 从 0（画面最左）到 1（最右），y 从 0（最上）到 1（最下）。

JSON 格式：
{
  "followed": true / false / null（用户有没有照着你上次的话做；第一次指导填 null）,
  "score": 1 到 10 的整数，当前的构图评分（只看构图：主体位置、平衡、取舍），不管清晰度和曝光,
  "subject": "不超过 6 字，画面主体",
  "subject_at": {"x": 主体中心的 x, "y": 主体中心的 y} 或 null（没有明确主体，比如大场景）,
  "subject_size": 主体长边占画面对应边的比例（0~1）,
  "fix": "position / closer / back / angle / wait / none 之一",
  "target": {"x": , "y": } 或 null —— fix 为 position 时，主体中心应该在的位置（常用三分线 0.33 / 0.67；对称的画面用 0.5）,
  "target_size": 0~1 或 null —— fix 为 closer / back 时，主体应该占多大,
  "move": "raise / lower / wait / shoot 之一 —— 只有 fix 为 angle（改变拍摄高度：举高俯拍 raise、蹲低仰拍 lower）或 wait 时才看",
  "why": "不超过 10 字，为什么这么调，例如：让主体落在三分线上",
  "hint": "不超过 14 字的口语提示，例如：很好！再往左挪一步",
  "settings": null 或 {"mode": "manual 或 auto", "shutter": "1/250 这样的写法或 null", "iso": 数字或 null, "ev": 数字, "why": "不超过 12 字"}
}
settings：只有数据里给了"专业模式参数"时才可能需要，平时填 null。
只在参数明显不合适时才建议改，比如：拍动的东西快门慢于 1/125（会糊）、手持慢于 1/30、测光表 EV 偏离超过 1 档、ISO 很高但光线明明很足。
参数已经合适就填 null，不要每次都建议改。画面亮不亮由"快门时间 × ISO"决定：快门快 2 档，ISO 就要高 2 档。
fix 的含义：position 主体位置不对；closer / back 主体太小 / 太大（走近 / 后退）；angle 换个拍摄高度更好；
wait 等待时机（比如等行人走到合适位置）；none 构图已经很好，hint 说"就是现在，按快门"。`;

// 专业模式：看画面 + 测光数据，推荐一组曝光参数
const PRO_PROMPT = `你是一位摄影老师，用户正在用手机的专业模式（手动 ISO / 快门 / 曝光补偿 / 白平衡）拍照。
看这一帧取景画面和程序测得的数据，推荐一组参数，并用一句话教他为什么。

思路：
- 先判断场景：有没有在动的东西（人走路、水流、宠物）、光线够不够、是不是逆光 / 夜景 / 室内灯光。
- 快门：手持一般不要慢于 1/60；拍动的东西要 1/250 以上；想拍出水流丝滑感才用慢快门（要提醒用三脚架）。
- ISO：在快门够快的前提下尽量低，越低越干净；光线暗时才提高。
- 测光表 EV 是画面平均亮度离"18% 灰"差几档：负数 = 偏暗，正数 = 偏亮。
- 最重要：画面亮不亮由"快门时间 × ISO"决定。自动曝光时相机选的 ISO 和快门（数据里的"当前参数"）就是一组曝光合适的组合。
  推荐手动参数时，要让"快门时间 × ISO"和它差不多：快门快 2 档（比如 1/60 → 1/250），ISO 就要高 2 档（比如 100 → 400）。
  再按测光表微调：EV 是 −1 就再亮 1 档（时间或 ISO 翻倍）。不这样算，照片会一片黑或一片白。
  · 雪景、白墙要"过曝一点"（+0.7 左右）才是白的；夜景、黑色主体要"欠一点"。
- 白平衡：日光约 5500K，阴天 6500K，室内暖光 2800~3200K；不确定就填 null（自动）。
- 只能推荐"这台相机支持"的参数（数据里会写范围）；不支持的填 null。
- mode 选 "auto" 时（自动曝光，只调曝光补偿），iso 和 shutter 都填 null。
- 用中文；只输出一个 JSON 对象，不要输出其他文字。

JSON 格式：
{
  "scene": "你判断的场景，不超过 10 字",
  "mode": "auto 或 manual",
  "iso": 数字或 null,
  "shutter": "1/125 这样的写法，或 null",
  "ev": 曝光补偿数字（-2~2），手动时填 0,
  "wb": 色温数字或 null,
  "why": "为什么这样设，不超过 40 字，像老师在教学生"
}`;

// ===== 从 AI 的回答里稳稳地取出 JSON =====
export function parseJSON(raw) {
  let text = String(raw || "").replace(/<think>[\s\S]*?<\/think>/g, "");      // 有的模型会把思考过程写在 <think> 里
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1];

  // 找到第一个完整配对的 { ... }（跳过字符串里的括号）
  const start = text.indexOf("{");
  if (start === -1) throw formatError(raw);
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { end = i; break; }
  }
  if (end === -1) throw Object.assign(formatError(raw), { truncated: true });
  const body = text.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    try {
      return JSON.parse(body.replace(/,\s*([}\]])/g, "$1"));               // 去掉多余的逗号再试
    } catch {
      throw formatError(raw);
    }
  }
}

function formatError(raw) {
  const head = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 30);
  return new Error(head ? `AI 没有按格式返回 JSON（开头是："${head}…"）` : "AI 返回了空内容");
}

// ===== 调用 =====
const noTemperature = new Set();               // 不接受 temperature 参数的服务商 + 模型
const noJsonMode = new Set();      // 记住哪些"地址+模型"不支持强制 JSON 模式

// 一条"用户消息"：若干张图 + 一段文字（OpenAI 兼容格式）
export const userMsg = (images, text) => ({
  role: "user",
  content: [...[].concat(images || []).map((u) => ({ type: "image_url", image_url: { url: u } })), { type: "text", text }],
});

let usage = 0;                     // 本次打开 App 以来一共用了多少 token（显示给用户看）
export const tokensUsed = () => usage;

// 最底层：发一组消息，拿回文字。单次问答和 agent 的多轮循环都用它
// 千问这类"会先思考"的模型：思考更准，但慢很多（实测一次 15 秒 vs 1 秒）。只有千问认 enable_thinking 这个参数
export const isQwen = (s) => /qwen|qianwen/i.test(`${s.model} ${s.baseUrl}`);
export const thinkingParam = (s, on) => isQwen(s) ? { enable_thinking: Boolean(on) }
  : /deepseek/i.test(s.model || '') ? { thinking:{type:on ? 'enabled' : 'disabled'} } : {};

async function chatMessages(s, messages, maxTokens, signal, temperature, extra = {}) {
  const url = s.baseUrl.trim().replace(/\/+$/, "") + "/chat/completions";
  const key = url + "|" + s.model.trim();
  const body = { model: s.model.trim(), max_tokens: maxTokens, messages, ...extra };
  if (!noJsonMode.has(key)) body.response_format = { type: "json_object" };   // 支持的服务商会严格只输出 JSON
  if (temperature != null && !noTemperature.has(key)) body.temperature = temperature;   // 低温度 = 同一张照片多次分析，分数更稳定

  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.apiKey.trim()}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j.error?.message || JSON.stringify(j).slice(0, 160);
    } catch {}
    // 不支持 JSON 模式：记下来，去掉这个参数重试
    if (res.status === 400 && body.response_format && /response_format|json/i.test(detail)) {
      noJsonMode.add(key);
      return chatMessages(s, messages, maxTokens, signal, temperature, extra);
    }
    // 不接受 temperature（有些推理模型）：记下来，去掉这个参数重试
    if (res.status === 400 && body.temperature != null && /temperature/i.test(detail)) {
      noTemperature.add(key);
      return chatMessages(s, messages, maxTokens, signal, temperature, extra);
    }
    const hint = { 401: "密钥不对", 404: "地址或模型名不对", 429: "太频繁或额度不足" }[res.status];
    throw new Error(`${res.status}${hint ? " · " + hint : ""}${detail ? " · " + detail.slice(0, 80) : ""}`);
  }
  const data = await res.json();
  usage += data.usage?.total_tokens || 0;
  const choice = data.choices?.[0] || {};
  return { content: choice.message?.content || "", cutOff: choice.finish_reason === "length" };
}

// 要一个 JSON（多轮消息版）：格式不对或被截断时，自动再试一次（被截断就把额度翻倍）
// 返回 { data, raw }：raw 是 AI 的原话，agent 需要把它放回对话历史里
export async function askJSONMessages(s, messages, maxTokens, signal, temperature, extra) {
  let budget = maxTokens;
  for (let attempt = 0; ; attempt++) {
    const msgs = attempt
      ? [...messages, { role: "user", content: "上一次的回答格式不对。这一次只输出一个完整的 JSON 对象。" }]
      : messages;
    const { content, cutOff } = await chatMessages(s, msgs, budget, signal, temperature, extra);
    try {
      return { data: parseJSON(content), raw: content };
    } catch (e) {
      if (attempt >= 1) throw cutOff ? new Error("AI 的回答太长被截断了，换个模型或稍后再试") : e;
      if (cutOff || e.truncated) budget *= 2;
    }
  }
}

// 单次问答：一段系统提示 + 图片 + 文字
async function askJSON(s, system, images, text, maxTokens, signal, temperature, extra) {
  const { data } = await askJSONMessages(s, [{ role: "system", content: system }, userMsg(images, text)], maxTokens, signal, temperature, extra);
  return data;
}

const factsText = (facts) => "程序精确测得的数据：" + JSON.stringify(facts);

// 额度给足：有的模型会先"思考"，思考也占输出额度。这只是上限，实际用多少扣多少
// 要快的地方（快速分析、实时教练、参数推荐）明确关掉思考 —— 千问默认是会思考的，一次要多等十几秒
export const review = (s, img, facts) => askJSON(s, REVIEW_PROMPT, img, factsText(facts), 2500, undefined, 0.3, thinkingParam(s, false));
// 「下次这样拍」会带上按场景挑出的摄影技能（点评打分不带，分数才稳定）
export async function suggest(s, img, facts, scene = null) {
  const sk = skillsFor("analysis", scene);
  return sk.finish(await askJSON(s, SUGGEST_PROMPT + sk.prompt, img, factsText(facts), 3000, undefined, 0.3, thinkingParam(s, false)));
}
// 快速分析的自检：把上一次的点评和发现的矛盾一起交回去，请它修正一次
export async function reviewAgain(s, img, facts, prev, issues) {
  const { data } = await askJSONMessages(s, [
    { role: "system", content: REVIEW_PROMPT }, userMsg(img, factsText(facts)),
    { role: "assistant", content: JSON.stringify(prev) },
    { role: "user", content: `【自检】你的点评和测量数据有对不上的地方：\n- ${issues.join("\n- ")}\n请重新考虑后，输出修正后的完整 JSON。` },
  ], 2500, undefined, 0.3, thinkingParam(s, false));
  return data;
}
// 实时指导：通用构图指导 + 按场景挑出的摄影技能（街拍、动物这些说明也是技能，见 skills.js；人像另有一套出片指导，见 portrait-prompt.js）
export const COACH_PROMPT_VERSION = "coach-v3-skills";
export async function coach(s, img, facts, signal, scene = "landscape") {
  const sk = skillsFor("coach", scene);
  return sk.finish(await askJSON(s, COACH_PROMPT + sk.prompt, img, factsText(facts), 1500, signal, undefined, thinkingParam(s, false)));
}
// 出片明确使用有视觉能力的 DeepSeek Flash。只从官方地址保存项取密钥，绝不借用其他服务商密钥。
export function portraitSettings(s) {
  const entry = [s,s.saved?.deepseek].find(e => {
    try { return new URL(e?.baseUrl).origin === 'https://api.deepseek.com' && Boolean(e.apiKey?.trim()); }
    catch { return false; }
  });
  return entry ? {...entry,baseUrl:'https://api.deepseek.com',model:'deepseek-flash'} : null;
}
export async function portraitCoach(s, current, facts, signal, previous = null,
  prompts = {observe:PORTRAIT_OBSERVE_PROMPT,direct:PORTRAIT_PROMPT}) {
  const config = portraitSettings(s);
  if (!config) throw new Error('请在 AI 连接中保存 DeepSeek 密钥，再使用出片指导');
  const images = previous ? [previous,current] : [current];
  const label = previous ? '第一张是上次取景，第二张是当前取景。' : '只有当前一张取景，没有之前图像，不能判断动作已经完成。';
  const observed = await askJSON(config,prompts.observe,current,
    '仅观察当前一帧。原有拍法：'+JSON.stringify(facts.activePlan || null),1400,signal,0.1,thinkingParam(config,false));
  const observation=observed?.observation;
  if (!observation || !['single','collage'].includes(observation.layout) || !Array.isArray(observation.visible) || !Array.isArray(observation.scene))
    throw new Error('这次没有看清人物和环境，请稳住画面再试');
  if (observation.layout === 'collage' || observation.people !== 1) return {
    observation,status:'need_view',plan:null,action:null,progress:{state:'uncertain',evidence:''},score:null,
  };
  const messages=[{role:'system',content:prompts.direct},userMsg(images,label+'会话事实：'+JSON.stringify({...facts,currentObservation:observation}))];
  let {data:directed}=await askJSONMessages(config,messages,2600,signal,0.35,thinkingParam(config,false));
  const checked=normalizePortrait({...directed,observation},facts);
  const repairable=new Set(['body_part_not_visible','unknown_plan_reference','unknown_action_reference','unsupported_object_use','object_not_held','ground_not_reachable',
    'seat_not_supported','footing_not_supported','gaze_target_not_supported','invalid_action','invalid_direction','missing_action_evidence','readiness_not_supported','face_detail_not_clear','framing_not_reached','unsolicited_plan_change',
    'reframe_action_mismatch','reframe_observation_missing','reframe_already_met','reframe_not_reached','invalid_reframe_goal','repeated_plan',
    'clearance_action_mismatch','clearance_observation_missing','clearance_depth_unknown','clearance_already_met','clearance_not_reached','clearance_observation_conflict']);
  if (['adjust','ready'].includes(directed.status) && checked.issues.some(i=>repairable.has(i))) {
    const issues=[...checked.issues];
    const clearanceTarget=directed.action?.kind==='camera_clearance'?directed.action.reference:
      checked.plan?.focus==='head_clearance'?checked.plan.clearanceTarget:null;
    const clearanceGoal=clearanceTarget && observation.scene.some(r=>r.id===clearanceTarget)
      ? {focus:'head_clearance',clearanceTarget}:null;
    const continuity=issues.includes('repeated_plan')
      ?'这是用户主动要求另一拍法，保留currentObservation；不能重复usedPlans的标题，也不能仅改标题，需在动作、观察角度、景别或环境关系上给出可执行的实质变化。'
      :'保持currentObservation与activePlan。';
    const goalInstruction=clearanceGoal?'本步仍要处理头部干扰，保持'+JSON.stringify(clearanceGoal)+'，用camera_clearance及该reference，不自行猜方向、不改成无关姿态动作。':'';
    ({data:directed}=await askJSONMessages(config,[...messages,{role:'assistant',content:JSON.stringify(directed)},
      {role:'user',content:'程序检查发现这一步不可直接执行：'+JSON.stringify(issues)+'。'+continuity+goalInstruction+'不添加新物件或部位。取景留白用camera_reframe及对应goal；观察不足就换受支持动作或need_view；若目标已满足且脸、姿势、构图均成立可ready，不为了修正而多走一步。只输出修正后的完整JSON。'}],2600,signal,0.2,thinkingParam(config,false)));
    const proposedPlan=directed.plan;
    return {...directed,...(clearanceGoal?{plan:{...proposedPlan,...clearanceGoal}}:{}),observation,
      _repair:{issues,attempts:1,...(clearanceGoal?{proposedPlan}:{})}};
  }
  return {...directed,observation};
}
export async function proAdvice(s, img, facts, signal, scene = null) {
  const sk = skillsFor("pro", scene);
  return sk.finish(await askJSON(s, PRO_PROMPT + sk.prompt, img, factsText(facts), 1500, signal, undefined, thinkingParam(s, false)));
}
// 摄影集第一步：看照片，决定问用户哪些关键信息（小图、少 token）
export const albumInfo = (s, imgs) =>
  askJSON(s, INFO_PROMPT(imgs.length), imgs, `这是按顺序排列的 ${imgs.length} 张照片。`, 800, undefined, 0.3, thinkingParam(s, false));
// 第二步：带上用户填的信息，写摄影集文字和 3 条配文（配文会用上文案类的摄影技能）
export async function album(s, imgs, { info = "", lang = "zh" } = {}) {
  const sk = skillsFor("album");
  return sk.finish(await askJSON(s, ALBUM_PROMPT(imgs.length, lang) + sk.prompt, imgs, `这是按顺序排列的 ${imgs.length} 张照片。${info ? "\n" + info : ""}`, 2600 + imgs.length * 400));
}

// 测试连接：发一张很小的图，确认密钥、地址、模型都对，而且模型能看图
export async function testConnection(s, tinyImage) {
  const r = await askJSON(s, "你是一个测试助手。只输出 JSON。", tinyImage, '这张图主要是什么颜色？输出 {"color": "两个字"}', 800, undefined, undefined, thinkingParam(s, false));
  return String(r.color || JSON.stringify(r)).slice(0, 20);
}
