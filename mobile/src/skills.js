// 摄影技能：一段段摄影师的经验，调用 AI 时按「哪个功能 + 什么场景」自动挑几条附在说明后面（说法见 CONTEXT.md）
//   这里全是纯函数（方便测试），存取在 skill-store.js
//
//   一个技能 = { id, name, description（什么时候用）, features（用在哪些功能）, scenes（哪些场景；空 = 任何场景）, body（具体怎么指导） }
//   挑选（混合方式）：程序按规则挑出最多 3 条候选 → 一起发给 AI → AI 在回答里写明实际用了哪几条（usedSkills）
//   技能文件：一个技能一个 .md，开头 --- 之间是名称、什么时候用、功能、场景，下面是正文

export const FEATURES = [
  { id: "coach", label: "实时指导" },
  { id: "analysis", label: "照片分析" },
  { id: "pro", label: "专业模式" },
  { id: "album", label: "摄影集配文" },
];
export const SKILL_SCENES = [
  { id: "portrait", label: "人像" },
  { id: "street", label: "人文街拍" },
  { id: "animal", label: "动物" },
  { id: "landscape", label: "风景 / 其他" },
];
export const MAX_PICK = 3;
export const MAX_BODY = 2000;          // 每个技能的正文最多带多少字给 AI，免得说明太长、又慢又贵

// ===== 自带技能 =====
export const BUILTIN_SKILLS = [
  {
    id: "street", name: "人文街拍", description: "画面里有路人，不能指挥他们，只能指导拍照的人",
    features: ["coach", "analysis"], scenes: ["street"],
    body: `画面里的人是路人。你不能指挥他们，也不要让用户去打扰他们，只指导拍照的人：站位、拍摄高度、背景取舍、等时机。
- 好的街拍有"故事"：人和环境的关系，比如人走进光里、经过有图案的墙、和招牌形成对比。
- 时机比位置更重要：人还没走到好位置时用 fix=wait，hint 说清楚等什么，例如"等那个人走进光里再按"。
- 人物前进的方向要留出空间，不要让人呆站在正中间。
- 提到人时用看得出来的特征，比如"穿红衣服的人"，不要说"模特"。`,
  },
  {
    id: "animal", name: "动物", description: "拍猫狗鸟等动物，没法指挥它们",
    features: ["coach", "analysis"], scenes: ["animal"],
    body: `你不能指挥动物，只指导拍照的人。
- 首先看高度：俯拍动物通常显得小、没神采，要降到和它眼睛一样高（fix=angle，move=lower）。
- 眼睛要看得见：它低头或背对时用 fix=wait，hint 说"等它抬头看过来"，也可以建议"轻轻出个声吸引它"。
- 动物在动时提醒连拍，保持距离，别吓到它。
- 背景乱时建议换个角度，让背景干净。`,
  },
  {
    id: "pro-params", name: "专业参数", description: "专业模式里手动调 ISO、快门、曝光补偿、白平衡",
    features: ["pro"], scenes: [],
    body: `按要拍的东西先定快门，再用 ISO 补亮度：
- 快门参考：静止的景物手持 1/60 就够；人走路 1/250；跑跳、宠物玩耍 1/500～1/1000；想拍出丝滑的水流、车灯轨迹才用 1/4 以下，而且必须架稳（三脚架、靠墙、放在栏杆上）。
- 手机传感器小，ISO 超过 800 噪点就明显了。光线不够时宁可快门慢一档、让用户拿稳，也别把 ISO 拉满；实在暗就建议开夜景模式。
- 曝光补偿：雪地、白墙、白衣服 +0.7～+1，否则会发灰；夜景、黑色主体 -0.3～-0.7，否则会发灰发白；逆光拍人脸 +0.3～+0.7。
- 天空、白云、灯这类亮的地方一旦过曝就救不回来，宁可欠一点，阴影后期还能拉。
- 白平衡：晴天 5500K，阴天和树荫 6500K，室内暖灯 3000K 左右，日落想更暖可以故意调高到 6500K 以上。混合光源拿不准就用自动。
- 讲参数时说清楚"为什么"，比如"人在走，快门要 1/250 才不糊"。`,
  },
  {
    id: "portrait-pose", name: "人像姿势", description: "给人拍照时，怎么站、怎么坐、手放哪、往哪看",
    features: ["analysis"], scenes: ["portrait"],
    body: `给模特的建议要是一个能马上照做的口令，不要只说"自然点""放松"。
- 站姿：重心放在一条腿上，另一条腿微曲；身体侧转 30～45°，别让肩膀正对镜头，会显宽。
- 手要有事做：插兜时露出拇指、拿着道具（杯子、花、包带）、整理头发或衣领、轻扶栏杆。手臂和身体之间留一点缝，手臂才不会被压粗。
- 坐姿：坐在椅子前三分之一，背挺直，身体略前倾；双腿一前一后或交叠，别正对镜头叉开。
- 脸：下巴微微往前伸再往下压一点，能避免双下巴；脸转向光的一侧。
- 视线：看镜头显得亲近；看远处显得有故事；看手里的东西显得自然。可以说"看我手指""想一件开心的事"。
- 动起来更自然：让模特慢慢走、转身回头、整理衣服，连拍抓中间的一瞬。
- 拍全身：手机放低到腰部、略微仰拍，脚放在画面底边附近，腿显长；广角时别把人放在画面边缘，会被拉变形。
- 构图别正好切在膝盖、手肘、脚踝这些关节上。`,
  },
  {
    id: "backlight-night", name: "逆光与夜景", description: "太阳或亮窗在主体后面，或者光线很暗的夜景、室内",
    features: ["coach", "analysis", "pro"], scenes: [],
    body: `只有画面确实逆光或很暗时才用这些。
逆光：
- 想看清人脸：点人脸对焦测光，曝光补偿 +0.3～+1；让太阳在人的侧后方，头发会有一圈亮边，很好看。
- 可以找白墙、白纸、浅色地面帮脸补光，或让人往前站一点离开阴影。
- 想拍剪影：主体轮廓清楚（侧脸、跳跃、手势）时，故意对着亮的天空测光、让人变成黑色剪影。
- 太阳直接进画面会出现眩光、发灰，可以让太阳躲在树叶、建筑或人的后面只露一点。
夜景和暗光：
- 第一要稳：手肘贴紧身体、靠墙或栏杆、用定时快门或音量键，开夜景模式时提醒"拿稳别动两秒"。
- 找光源：让人站在路灯、橱窗、招牌旁边，脸朝着光；没有光源的地方别硬拍。
- 拍远处的夜景别开闪光灯；灯和招牌很亮，宁可整体暗一点也别让它们过曝。
- 日落后二三十分钟天空还是深蓝色（蓝调时刻），这时拍城市比全黑时好看得多。`,
  },
  {
    id: "food-still", name: "美食与静物", description: "拍桌上的食物、饮品，或者花、小物件这类静物",
    features: ["coach", "analysis"], scenes: ["landscape"],
    body: `只有画面主体确实是食物、饮品或静物时才用这些。
- 角度：平的东西（披萨、拼盘、一桌菜）正上方俯拍；有高度的东西（汉堡、蛋糕、饮品）平视或 45° 拍。
- 光：靠窗坐，用侧光或侧后方的光，质感最好；头顶的灯会在食物上留下手机的影子，可以挪开一点。
- 背景：先收拾桌面，纸巾、外卖袋、手机拿走；只留一两样陪衬（餐具、杯子、一只手），少而精。
- 靠近一点，让主体占满画面大部分；主体放在三分点，或者对称摆放放正中。
- 加一点"生活感"：咬一口、筷子夹起来、正在倒的饮料、冒的热气和冰块的水珠，都要趁早拍。
- 花和小物件也一样：干净背景、侧光、靠近拍细节。`,
  },
  {
    id: "caption", name: "社交配文", description: "给摄影集写发朋友圈、小红书、Instagram 的配文和话题标签",
    features: ["album"], scenes: [],
    body: `- 第一句就要抓人：一个具体的画面、一句心里话或一个小反差，别用"今天天气很好"这种开头。
- 写具体的细节胜过堆形容词：写看到的颜色、听到的声音、当时发生的小事。
- 三条配文的语气要真的不同，比如：一条轻松俏皮，一条安静文艺，一条只有一句短话。
- 别用"绝绝子""yyds""氛围感拉满"这类用滥了的词；表情符号每条最多一两个。
- 话题标签：一两个大标签（地点或主题），再加两三个具体的小标签（这次独有的东西）。
- 用户没告诉你的地点、人名、关系不要编；没给名字就用"他""她""我们"。`,
  },
];

// ===== 合并：自带技能 + 用户改过的地方 + 用户自己的技能 =====
// stored = { builtin: { [id]: { enabled?, name?, description?, features?, scenes?, body? } }, custom: [skill] }
const EDITABLE = ["name", "description", "features", "scenes", "body"];
export function mergeSkills(builtins, stored = {}) {
  const over = stored.builtin || {};
  const list = builtins.map((b) => {
    const o = over[b.id] || {};
    const edited = EDITABLE.some((k) => o[k] != null && JSON.stringify(o[k]) !== JSON.stringify(b[k]));
    const s = { ...b };
    for (const k of EDITABLE) if (o[k] != null) s[k] = o[k];
    return { ...s, builtin: true, edited, enabled: o.enabled !== false };
  });
  for (const c of stored.custom || []) {
    const s = cleanSkill(c);
    if (s && !list.some((x) => x.id === s.id)) list.push({ ...s, builtin: false, edited: false, enabled: c.enabled !== false });
  }
  return list;
}

const FEATURE_IDS = FEATURES.map((f) => f.id), SCENE_IDS = SKILL_SCENES.map((s) => s.id);
const ALIASES = {
  实时指导: "coach", 指导: "coach", 取景: "coach", 照片分析: "analysis", 分析: "analysis", 专业模式: "pro", 专业参数: "pro", 摄影集: "album", 摄影集配文: "album", 配文: "album",
  人像: "portrait", 人文街拍: "street", 街拍: "street", 动物: "animal", 宠物: "animal", 风景: "landscape", 其他: "landscape", "风景 / 其他": "landscape",
};
const pickIds = (v, allowed) => [...new Set([].concat(v ?? []).flatMap((x) => String(x).split(/[,，、]/))
  .map((x) => x.trim()).map((x) => ALIASES[x] || x.toLowerCase()).filter((x) => allowed.includes(x)))];

// 整理一个技能：字段不合法就修好，缺名称或正文返回 null
export function cleanSkill(s) {
  if (!s || typeof s !== "object") return null;
  const name = String(s.name || "").trim().slice(0, 20), body = String(s.body || "").trim();
  if (!name || !body) return null;
  const id = String(s.id || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) || newSkillId();
  return { id, name, description: String(s.description || "").trim().slice(0, 80), features: pickIds(s.features, FEATURE_IDS), scenes: pickIds(s.scenes, SCENE_IDS), body: body.slice(0, 6000) };
}
export const newSkillId = () => "my-" + Math.random().toString(36).slice(2, 8);

// ===== 挑选：这次调用该附上哪几条 =====
// ctx = { feature, scene（不知道就 null）, profile: { topics } }
// 规则：开着的、功能对得上、场景对得上（技能没限场景 = 任何场景都行；不知道场景时只用不限场景的）
// 排序：专门写给这个场景的 > 用户自己写的 > 和常拍题材对得上的 > 原来的顺序；最多 MAX_PICK 条
export function pickSkills(skills, { feature, scene = null, profile = null, limit = MAX_PICK } = {}) {
  const topics = profile?.topics || [];
  return skills
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.enabled !== false && s.features.includes(feature) && (s.scenes.length === 0 || (scene && s.scenes.includes(scene))))
    .map(({ s, i }) => ({ s, i, rank: (s.scenes.length ? 4 : 0) + (s.builtin ? 0 : 2) + (s.scenes.some((x) => topics.includes(x)) ? 1 : 0) }))
    .sort((a, b) => b.rank - a.rank || a.i - b.i)
    .slice(0, limit)
    .map(({ s }) => s);
}

// ===== 个人资料怎么告诉 AI =====
export const LEVELS = [
  { id: "new", label: "新手", tone: "用大白话，专业词要顺便解释一句" },
  { id: "some", label: "会一点", tone: "可以用常见的摄影说法，不用解释太多" },
  { id: "pro", label: "熟练", tone: "直接用专业术语，说得简练" },
];
export const TOPICS = [
  { id: "portrait", label: "人像" }, { id: "landscape", label: "风景" }, { id: "animal", label: "宠物" },
  { id: "food", label: "美食" }, { id: "street", label: "街拍" },
];
export function profileText(profile) {
  const level = LEVELS.find((l) => l.id === profile?.level);
  const topics = TOPICS.filter((t) => profile?.topics?.includes(t.id)).map((t) => t.label);
  const parts = [];
  if (level) parts.push(`拍摄水平：${level.label}（${level.tone}）`);
  if (topics.length) parts.push(`常拍：${topics.join("、")}`);
  return parts.length ? "用户资料：" + parts.join("；") : "";
}

// ===== 附在系统说明后面的那一段 =====
// where：告诉 AI 把 usedSkills 写在哪（单次问答写在 JSON 里；深度分析 agent 写在 final 里）
export function skillsPrompt(picked, { profile = null, where = "输出的 JSON 对象" } = {}) {
  const who = profileText(profile);
  if (!picked.length) return who ? `\n\n${who}` : "";
  const blocks = picked.map((s) => `### 技能 ${s.id}：${s.name}\n什么时候用：${s.description || "—"}\n${s.body.slice(0, MAX_BODY)}`);
  return `

【摄影技能】下面是按当前情况挑出来的摄影经验。先判断它适不适合眼前的画面：适合就照着用，不适合就忽略，不要硬套。${who ? "\n" + who : ""}

${blocks.join("\n\n")}

在${where}里加一个字段 "usedSkills"：实际用到的技能 id 列表，例如 ["${picked[0].id}"]；一条都没用就写 []。`;
}

// AI 说用了哪些：只认这次真的发过去的那几条
export function usedSkills(reply, picked) {
  const said = new Set([].concat(reply?.usedSkills ?? []).map((x) => String(x).trim()));
  return picked.filter((s) => said.has(s.id)).map((s) => ({ id: s.id, name: s.name }));
}

// ===== 技能文件（.md）=====
export function toSkillMd(s) {
  return `---
id: ${s.id}
name: ${s.name}
description: ${s.description || ""}
features: ${s.features.join(", ")}
scenes: ${s.scenes.join(", ")}
---

${s.body.trim()}
`;
}
export function parseSkillMd(text) {
  const m = String(text || "").replace(/^﻿/, "").match(/^\s*---\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!m) throw new Error("文件开头要有 --- 包起来的名称、什么时候用");
  const head = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^\s*([A-Za-z]+)\s*:\s*(.*)$/);
    if (kv) head[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  const skill = cleanSkill({ ...head, body: m[2] });
  if (!skill) throw new Error(head.name ? "技能正文是空的" : "缺少 name（技能名称）");
  return skill;
}
export const skillFileName = (s) => `phota-技能-${s.name.replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 16) || s.id}.md`;
