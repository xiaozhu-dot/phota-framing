// 文字–坐标一致性检查（评分细则 v2 §5，H2/H3 疑点）。
// 只是报警器：结果交人工核验，不当作视觉真值，也不直接定为硬错误。
// 坐标是模型自己报的观测估计；文字与错坐标一致时，这里查不出来。
export const CHECK_VERSION = 'consistency-v1';

const NEGATION = /(不|没|未|无|避免|别|防止|以免|并非)[^，。；,;]*$/;
const FUTURE = /(让|使|建议|需要|应该|应当|可以|尝试|试着|尽量|保持|调整为|移到|放到|放在|改到|挪到|调到|变成|回到)[^，。；,;]*$/;
const UNCERTAIN = /是否|可能|似乎|也许|看不清|不确定|无法判断|难以判断/;

// 一条记录里所有会展示给用户、或驱动动作理由的文字（最终 + 原始草稿分开）
export function texts(record) {
  const pick = (o, where) => o ? [
    [where + '.hint', o.hint], [where + '.plan.title', o.plan?.title], [where + '.plan.why', o.plan?.why],
    [where + '.action.evidence', o.action?.evidence], [where + '.action.check', o.action?.check],
    ...(Array.isArray(o.issues) ? o.issues.map((t, i) => [where + '.issues.' + i, typeof t === 'string' ? t : JSON.stringify(t)]) : []),
  ].filter(([, t]) => typeof t === 'string' && t.trim()) : [];
  return { final: pick(record.final, 'final'), raw: pick(record.raw, 'raw') };
}

// 找出描述"现在"的空间断言；跳过否定（不贴边）和目标（让脸居中）
function claims(text) {
  const out = [];
  const rules = [
    ['edge', /(紧贴|贴着|贴近|贴在|贴|挤在|挤着|靠在)(画面|画框|镜头)?的?(左|右|上|下)?(边缘|边|侧)/g],
    ['edge', /(左|右)(边缘|边|侧)(太|过于|有点)?(贴|挤|紧)/g],
    ['center', /(居中|正中|画面中央|画面中间|画面正中)/g],
    ['left', /(偏左|靠左|在画面左侧|在画面左边|位于画面左)/g],
    ['right', /(偏右|靠右|在画面右侧|在画面右边|位于画面右)/g],
    ['roomy', /头顶(上方)?的?(留白|留空|空间|空白)(太|过|偏|较|很)?(多|大)/g],
    ['tight', /头顶(上方)?的?(留白|留空|空间|空白)(太|过|偏|较|很)?(少|小|挤)|顶天|切头|头(顶|发)?被切|切到头/g],
  ];
  for (const [kind, re] of rules) for (const m of text.matchAll(re)) {
    const clause = clauseAt(text, m.index);
    const before = clause.slice(0, m.index - clauseStart(text, m.index));
    if (NEGATION.test(before) || FUTURE.test(before) || UNCERTAIN.test(clause)) continue;
    // 说的是景物（花枝在画面右侧），不是人物：坐标只有脸，不能拿来对照
    if (['center', 'left', 'right', 'edge'].includes(kind) && sceneOrBodySubject(before, clause)) continue;
    const side = kind === 'edge' ? (m[0].match(/左|右|上|下/)?.[0] || null) : null;
    out.push({ kind, side, phrase: m[0] });
  }
  return out;
}
const SUBJECT = /人物|脸|头|模特|她|他|主体|人像|花|枝|树|叶|背景|灯塔|窗|墙|海|天空|云|前景|道具|建筑|门|桌|椅|光斑|路|身体|肩|手|脚|视线|眼/g;
const PERSON = /^(人物|脸|头|模特|她|他|主体|人像)$/;
function sceneOrBodySubject(before, clause) {
  // "人物身后的花枝居中" 的主语是花枝，不能只因同句出现人物就对照脸坐标。
  const subjects = [...before.matchAll(SUBJECT)];
  if (subjects.length) return !PERSON.test(subjects.at(-1)[0]);
  const following = [...clause.slice(before.length).matchAll(SUBJECT)];
  return following.length > 0 && !PERSON.test(following[0][0]);
}
const SEPARATORS = ['，', '。', '；', ',', ';', '但', '！', '？', '!', '?', '\n'];
const clauseStart = (text, i) => Math.max(...SEPARATORS.map(p => text.lastIndexOf(p, i))) + 1;
const clauseAt = (text, i) => {
  const start = clauseStart(text, i);
  const ends = SEPARATORS.map(p => text.indexOf(p, i)).filter(n => n >= 0);
  return text.slice(start, ends.length ? Math.min(...ends) : text.length);
};

const band = (v, edge) => Math.abs(v - edge) <= 0.03;   // 边界 ±.03：人工复核带
const normalized = v => Number.isFinite(v) && v >= 0 && v <= 1;
const validBounds = b => b && ['left', 'top', 'right', 'bottom'].every(k => normalized(b[k])) && b.left < b.right && b.top < b.bottom;

// 一项断言对照坐标：ok / review（待核验）/ conflict（明显矛盾）
export function judge(claim, obs) {
  const x = obs?.faceCenter?.x, top = obs?.headTop;
  const hasX = normalized(x), hasTop = normalized(top);
  const need = (cond, why) => cond ? null : { verdict: 'review', why };
  switch (claim.kind) {
    case 'center':
      return need(hasX, '缺 faceCenter') || (x >= .40 && x <= .60 ? (band(x, .40) || band(x, .60) ? { verdict: 'review', why: `x=${x} 在复核带` } : { verdict: 'ok' })
        : band(x, .40) || band(x, .60) ? { verdict: 'review', why: `x=${x} 在复核带` } : { verdict: 'conflict', why: `说居中，但脸中心 x=${x}` });
    case 'left': case 'right': {
      const ok = claim.kind === 'left' ? x < .40 : x > .60, edge = claim.kind === 'left' ? .40 : .60;
      return need(hasX, '缺 faceCenter') || (band(x, edge) ? { verdict: 'review', why: `x=${x} 在复核带` } : ok ? { verdict: 'ok' } : { verdict: 'conflict', why: `说${claim.kind === 'left' ? '偏左' : '偏右'}，但脸中心 x=${x}` });
    }
    case 'edge': {
      const b = obs?.headBounds;
      if (!validBounds(b) || !['左', '右', '上', '下'].includes(claim.side)) return { verdict: 'review', why: '缺可靠 headBounds 或未明确哪边，贴边须对图核验' };
      const distance = { 左: b.left, 右: 1 - b.right, 上: b.top, 下: 1 - b.bottom }[claim.side];
      // 归一化减法可产生末位误差；仅消除 .05/.10 的浮点噪声。
      if (distance <= .05 + Number.EPSILON) return { verdict: 'ok' };
      return distance > .10 + Number.EPSILON ? { verdict: 'conflict', why: `说贴${claim.side}边，但头框距该边=${distance}` }
        : { verdict: 'review', why: `头框距${claim.side}边=${distance} 在 .05–.10` };
    }
    case 'roomy':
      return need(hasTop, '缺 headTop') || (top > .25 ? { verdict: 'ok' } : top >= .20 ? { verdict: 'review', why: `headTop=${top} 在 .20–.25` } : { verdict: 'conflict', why: `说头顶留空多，但 headTop=${top}` });
    case 'tight':
      return need(hasTop, '缺 headTop') || (top > .25 ? { verdict: 'conflict', why: `说头顶太挤，但 headTop=${top}` } : top <= .05 ? { verdict: 'ok' } : { verdict: 'review', why: `headTop=${top}，挤不挤须看图` });
  }
}

// 理由里说"向左/向右"，最终动作却是反方向：方向疑点（H3），交人工判断说的是不是同一件事
function directionAlarms(record) {
  const dir = record.final?.action?.direction;
  if (!['left', 'right'].includes(dir)) return [];
  const opposite = dir === 'left' ? '右' : '左';
  const out = [];
  for (const [where, t] of texts(record).final) {
    if (where === 'final.hint') continue;
    const m = t.match(new RegExp(`(向|往|朝)${opposite}(转|移|走|偏|挪|看|侧)`));
    if (m && !NEGATION.test(t.slice(Math.max(0, m.index - 6), m.index)))
      out.push({ code: 'H3?', verdict: 'review', where, phrase: m[0], why: `最终动作方向是 ${dir}` });
  }
  return out;
}

// 检查一条评测记录。final 是用户看得见或驱动动作的；raw 是内部草稿，分开报（细则 §4）
export function checkRecord(record) {
  const obs = record.final?.observation || record.raw?.observation;
  const scan = list => list.flatMap(([where, t]) => claims(t).map(c => ({ code: 'H2?', where, ...c, ...judge(c, obs) }))).filter(a => a.verdict !== 'ok');
  const { final, raw } = texts(record);
  return {
    version: CHECK_VERSION,
    final: [...scan(final), ...directionAlarms(record)],
    raw: scan(raw),
    coords: { faceCenter: obs?.faceCenter ?? null, headTop: obs?.headTop ?? null, headBounds: obs?.headBounds ?? null },
  };
}
