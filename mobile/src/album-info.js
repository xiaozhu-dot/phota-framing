// 摄影集的「关键信息」和「配文」：都是纯函数，方便测试
//   第一步：AI 先看照片，决定要问用户哪几项（地点、人名这类看不出来、配文又要用的，一定要问），并给出能看出来的猜测
//   第二步：用户填好（都可以留空）后，AI 写摄影集文字 + 3 条可以直接发 Instagram 的配文（带 3～5 个话题标签）
//   规则：用户没填的名字和地名，AI 不能编
export const LANGS = [
  { id: "zh", label: "中文", prompt: "简体中文" },
  { id: "en", label: "English", prompt: "English" },
  { id: "ja", label: "日本語", prompt: "日本語" },
  { id: "ko", label: "한국어", prompt: "한국어" },
  { id: "zh-en", label: "中英双语", prompt: "中英双语（先中文一句，再英文一句）" },
];
export const langOf = (id) => LANGS.find((l) => l.id === id) || LANGS[0];

const MAX_FIELDS = 5;
const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export const INFO_PROMPT = (n) => `你是摄影集编辑。用户选了 ${n} 张照片，要编成摄影集，并写几条能发 Instagram 的配文。
先别写文案。请看照片，决定要问用户哪几项「关键信息」，并把你能从照片里看出来的先猜好，让用户少打字。

规则：
- 地点：照片看不出具体地名，所以一定要问（key 用 "place"）；guess 只写看得出的类型，比如"海边""老街""公园"，不要编城市名或店名。
- 人物：照片里有人时，一定要问怎么称呼他们（key 用 "names"），因为配文可能要 @ 或提到他们；没人就不要问。
- 照片里有猫狗等动物时，可以问它的名字（key 用 "petName"）。
- 其他可选：场合（"occasion"，比如生日、旅行、毕业）、和谁一起（"with"）、想要的感觉（"mood"）。只问对这组照片有用的。
- 时间由 App 根据拍摄日期自己填，不要问。
- 一共 2～4 项，问题要短、口语，像朋友在问；guess 能看出来就填，看不出来填空字符串。
- petQuestion：小宠物顺口问用户的一句话，不超过 12 个字，比如"是在海边吗？"。
- 只输出一个 JSON 对象，不要输出其他文字，不要用 markdown 代码块。

JSON 格式：
{
  "fields": [{"key": "place", "label": "在哪儿拍的？", "hint": "例如：青岛 · 小麦岛", "guess": "海边"}],
  "petQuestion": "是在海边吗？"
}`;

const DEFAULT_FIELDS = {
  place: { label: "在哪儿拍的？", hint: "例如：青岛 · 小麦岛" },
  names: { label: "照片里的人怎么称呼？", hint: "例如：小雨、阿杰（可以写 @账号）" },
  petName: { label: "它叫什么名字？", hint: "例如：团子" },
  occasion: { label: "是什么场合？", hint: "例如：周末出游、生日" },
  with: { label: "和谁一起？", hint: "例如：大学室友" },
  mood: { label: "想要什么感觉？", hint: "例如：松弛、热闹、怀旧" },
};

// 照片的拍摄时间（毫秒）→ "2026年11月10日" 或 "2026年11月8日～10日"
export function dateText(times) {
  const ts = (times || []).filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  if (!ts.length) return "";
  const f = (t) => { const d = new Date(t); return [d.getFullYear(), d.getMonth() + 1, d.getDate()]; };
  const [y1, m1, d1] = f(ts[0]), [y2, m2, d2] = f(ts.at(-1));
  if (y1 === y2 && m1 === m2 && d1 === d2) return `${y1}年${m1}月${d1}日`;
  if (y1 === y2 && m1 === m2) return `${y1}年${m1}月${d1}日～${d2}日`;
  if (y1 === y2) return `${y1}年${m1}月${d1}日～${m2}月${d2}日`;
  return `${y1}年${m1}月${d1}日～${y2}年${m2}月${d2}日`;
}

// AI 回来的问题 → 表单字段。地点一定有；时间由 App 填在最后；AI 回得乱也不会坏
export function normalizeInfo(r, { date = "" } = {}) {
  const seen = new Set(), fields = [];
  for (const f of Array.isArray(r?.fields) ? r.fields : []) {
    const key = clip(f?.key, 20);
    if (!key || key === "time" || seen.has(key) || !/^[a-zA-Z]+$/.test(key)) continue;
    seen.add(key);
    const d = DEFAULT_FIELDS[key] || {};
    fields.push({ key, label: clip(f.label, 20) || d.label || key, hint: clip(f.hint, 30) || d.hint || "", guess: clip(f.guess, 30) });
  }
  if (!seen.has("place")) fields.unshift({ key: "place", ...DEFAULT_FIELDS.place, guess: "" });
  const kept = fields.slice(0, MAX_FIELDS - 1);
  kept.push({ key: "time", label: "什么时候？", hint: "例如：2026年秋天", guess: date });
  return { fields: kept, petQuestion: clip(r?.petQuestion, 14) };
}

// 用户填的值 → 发给 AI 的说明。没填的写明"没填"，让 AI 不要编
export function infoText(fields, values) {
  const lines = fields.map((f) => {
    const v = clip(values?.[f.key], 60);
    return `- ${f.label.replace(/[？?]$/, "")}：${v || "（用户没填，不要编）"}`;
  });
  return `用户补充的关键信息：\n${lines.join("\n")}\n人名、地名只能用上面用户写的；用户没填的，文字里不要出现具体的名字或地名。`;
}

export const ALBUM_PROMPT = (n, lang = "zh") => `你是一位摄影集编辑，也是一位文字温柔、有画面感的作家。
用户刚刚拍了一组照片，按拍摄顺序一共 ${n} 张。请为它们编一本小小的摄影集，再写 3 条能直接发 Instagram 的配文。
文字要沉浸、克制，写那一刻的感受、光线、温度和声音，不要罗列"画面里有什么"，也不要说"这张照片"。
只描述照片中真实存在的东西；用户提供了地点、人名、场合时，要自然地用进去（不必每句都用）。
摄影集的文字用中文；配文用 ${langOf(lang).prompt}。只输出一个 JSON 对象，不要输出其他文字，不要用 markdown 代码块。

JSON 格式：
{
  "title": "摄影集标题，4~10 字",
  "subtitle": "副标题，不超过 20 字",
  "opening": "开篇语，40~70 字",
  "pages": [
    {"line": "这一页的一句短句，4~10 字，像诗，会用大字排版", "text": "这一页的旁白，30~70 字", "whisper": "跟着拍照的小宠物看到这张照片时说的一句话，不超过 10 字，可爱", "mood": "warm / calm / lively / wistful 之一"}
  ],
  "closing": "结尾语，20~50 字",
  "style": "整本摄影集的风格，从下面选一个最贴合这组照片气质的",
  "captions": [
    {"text": "配文正文，不含话题标签", "tags": ["#话题1", "#话题2", "#话题3"]}
  ]
}
pages 必须正好 ${n} 项，顺序和照片一一对应。
captions 正好 3 条，口吻各不相同：一条短而有余味（不超过 20 字），一条讲一点小故事（40~80 字），一条俏皮轻松、可以带 1~2 个 emoji。
每条 3~5 个话题标签，要具体（地点、季节、场合、拍的东西），不要 #photography #photooftheday 这种谁都在用的。
style 可选：dawn（晨光：温暖、清晨、日常的温柔）、sea（海风：水、天空、辽阔、平静）、rain（雨夜：城市、夜晚、灯光、安静的心事）、
summer（夏日：鲜艳、热闹、出游、朋友）、snow（初雪：冷色、干净、冬天、留白）、film（胶片：怀旧、街头、人文、黑白）。`;

// 话题标签：去空格、补 #、去重，最多 5 个
export function cleanTags(tags) {
  const out = [];
  for (const t of Array.isArray(tags) ? tags : String(tags || "").split(/[\s,，]+/)) {
    const body = String(t || "").replace(/^#+/, "").replace(/[\s#,，。.!！?？]+/g, "").slice(0, 30);
    if (body && !out.some((x) => x.toLowerCase() === "#" + body.toLowerCase())) out.push("#" + body);
  }
  return out.slice(0, 5);
}

// AI 的配文 → 正好 3 条（不够就不补，界面只显示有的）；正文里混进来的 #标签 挪到标签里
export function normalizeCaptions(list) {
  return (Array.isArray(list) ? list : []).slice(0, 3).map((c) => {
    const raw = String(typeof c === "string" ? c : c?.text || "");
    const inline = raw.match(/#[^\s#]+/g) || [];
    const text = raw.replace(/#[^\s#]+/g, "").replace(/\s+$/g, "").trim();
    return { text, tags: cleanTags([...(c?.tags || []), ...inline]) };
  }).filter((c) => c.text);
}

// 复制用的完整文字：正文 + 空一行 + 标签
export const captionCopy = (c) => (c.tags.length ? `${c.text}\n\n${c.tags.join(" ")}` : c.text);
