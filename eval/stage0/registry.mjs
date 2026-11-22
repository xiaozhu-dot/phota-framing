// 第 0 阶段登记：规则哈希 + 数据三层划分（开发 / 回归 / 封存）+ 每张图的曝光历史。
// Run: node eval/stage0/registry.mjs           写 eval/stage0/registry.json
//      node eval/stage0/registry.mjs --verify  只核对：规则没被改过、身份没有跨层
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const read = async p => readFile(new URL(p, root));
const json = async p => JSON.parse(await read(p));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

const files = {
  rules: 'docs/evaluations/phota-scoring-v2.md',
  roadmap: 'docs/superpowers/plans/2026-10-24-phota-training-roadmap.md',
  checker: 'eval/stage0/consistency.mjs',
};
const hashes = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([k, p]) => [k, { file: p, sha256: sha(await read(p)) }])));

// 哪些版本在哪张图上跑过：用过的结果若影响了改方案，就算开发曝光（细则 §2）
const exposure = new Map();
for (const f of await readdir(new URL('eval/results/', root))) {
  const m = f.match(/^portrait-(novice-)?(.+)-(candidate|baseline)-(dev|holdout|confirmation)\.json$/);
  if (!m) continue;
  for (const r of await json('eval/results/' + f)) {
    const k = (m[1] ? 'novice/' : 'pro/') + r.case;
    if (!exposure.has(k)) exposure.set(k, new Set());
    exposure.get(k).add(m[2]);
  }
}

const cases = [];
const errors = [];
for (const [corpus, prefix] of [['novice', 'portrait-novice'], ['pro', 'portrait']]) {
  const sources = (await json(`eval/${prefix}-sources.json`)).sources;
  for (const c of await json(`eval/${prefix}-cases.json`)) {
    const matches = sources.filter(s => s.url === c.source);
    const source = matches.length === 1 ? matches[0] : null;
    if (!source?.author || !source?.group) errors.push(`${corpus}/${c.id}: 原帖须唯一关联 author 和 group`);
    const runs = [...(exposure.get(corpus + '/' + c.id) || [])].sort();
    // 新手主线：原 dev → 开发集；原 holdout / confirmation 已被 v17–v21 的取舍用过 → 回归集（登记开发曝光），不能再封存。
    // 专业示范图不是新手原片，只作回归参考，不计入主线指标。
    const tier = corpus === 'novice' ? (c.split === 'dev' ? 'dev' : 'regression') : 'reference';
    cases.push({
      id: c.id, corpus, tier, legacySplit: c.split, author: source?.author, authorGroup: source?.group,
      group: c.group, person: c.person, source: c.source, file: c.file,
      exposed: runs.length > 0, exposedBy: runs,
      note: corpus === 'novice' && c.split !== 'dev' ? '曾作留出/确认集，结果影响过候选取舍：登记开发曝光' : undefined,
    });
  }
}

// 同一作者 / 人物 / 拍摄组 / 原帖不能跨层
const seen = new Map();
const ids = new Set();
for (const c of cases) {
  const id = `${c.corpus}/${c.id}`;
  if (ids.has(id)) errors.push(`重复 case: ${id}`);
  ids.add(id);
  for (const [kind, value] of [['author', c.author], ['group', c.authorGroup], ['group', c.group], ['person', c.person], ['source', c.source]]) {
    if (!value) continue;
    const key = `${kind}:${value}`;
    const old = seen.get(key);
    if (old && old.tier !== c.tier) errors.push(`${key}: ${old.id}(${old.tier}) vs ${c.id}(${c.tier})`);
    seen.set(key, c);
  }
}

const registry = {
  stage: 0,
  createdAt: new Date().toISOString().slice(0, 10),
  policy: '禁止微调、蒸馏和权重训练。改规则须升版重新登记，不回改旧分。',
  hashes,
  tiers: {
    dev: cases.filter(c => c.tier === 'dev').map(c => c.id),
    regression: cases.filter(c => c.tier === 'regression').map(c => c.id),
    sealed: [],
    reference: cases.filter(c => c.tier === 'reference').map(c => c.id),
  },
  sealedNote: '封存集为空：现有 9 位新手作者都已曝光，不能恢复封存身份。须补充未曝光的公开新作者，由数据管理员预先登记，开发时不看。',
  cases,
};

const out = new URL('eval/stage0/registry.json', root);
if (process.argv.includes('--verify')) {
  const old = JSON.parse(await readFile(out, 'utf8'));
  for (const k of Object.keys(files)) if (old.hashes?.[k]?.file !== files[k] || old.hashes?.[k]?.sha256 !== hashes[k].sha256) errors.push(`${files[k]} 在登记后被改过：须升版重新登记`);
  // 冻结身份双向比较：既不能改旧项，也不能悄悄新增、删掉或重复登记。
  // exposed/exposedBy 是登记时的快照；后续新增运行无需修改已冻结的登记。
  const identityFields = ['id', 'corpus', 'tier', 'legacySplit', 'author', 'authorGroup', 'group', 'person', 'source', 'file'];
  const identities = list => Array.isArray(list) ? list.map(c => JSON.stringify(identityFields.map(k => c?.[k] ?? null))).sort() : null;
  if (JSON.stringify(identities(old.cases)) !== JSON.stringify(identities(cases))) errors.push('冻结 case 身份集合变了（含作者、组、人物、原帖、文件或分层）');
  const tierIndex = tiers => tiers && Object.keys(tiers).sort().map(k => [k, Array.isArray(tiers[k]) ? [...tiers[k]].sort() : null]);
  if (JSON.stringify(tierIndex(old.tiers)) !== JSON.stringify(tierIndex(registry.tiers))) errors.push('冻结 tiers 索引变了');
}

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
if (!process.argv.includes('--verify')) await writeFile(out, JSON.stringify(registry, null, 2) + '\n');
console.log(JSON.stringify({ ...Object.fromEntries(Object.entries(registry.tiers).map(([k, v]) => [k, v.length])),
  exposedNovice: cases.filter(c => c.corpus === 'novice' && c.exposed).length, rules: hashes.rules.sha256.slice(0, 12) }));
