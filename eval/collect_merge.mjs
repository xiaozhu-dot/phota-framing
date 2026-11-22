// 合并朋友们发回来的收集版导出文件（每人一个 html）→ 一份 JSON + 简单统计。无接口调用。
// Run: node eval/collect_merge.mjs --name 20261105 文件1.html 文件2.html ...
//   输出 eval/results/collect-<name>.json（含图片，已被 git 忽略）
import { readFile, writeFile } from 'node:fs/promises';
import { parseExportHtml, mergeExports } from '../mobile/src/collect-export.js';

const median = list => { const v = list.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.ceil(v.length / 2) - 1] : null; };

export function summarize(merged) {
  const done = merged.rounds.filter(r => r.status === 'done');
  const tally = list => Object.fromEntries(Object.entries(Object.groupBy(list, v => v ?? '—')).map(([k, v]) => [k, v.length]));
  const count = key => tally(done.map(r => r.answers[key]));
  const steps = merged.rounds.flatMap(r => r.steps);
  const ok = steps.filter(s => !s.error).map(s => s.ms).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    raters: merged.raters.map(r => `${r.nickname}(${r.id})`),
    rounds: merged.rounds.length, done: done.length, skipped: merged.rounds.filter(r => r.status === 'skipped').length,
    duplicatesRemoved: merged.duplicates,
    perRater: Object.fromEntries(merged.raters.map(p => [p.nickname + '/' + p.id, merged.rounds.filter(r => r.rater?.id === p.id).length])),
    prompts: [...new Set(merged.rounds.map(r => r.app?.prompt))],
    guidanceSteps: steps.length, guidanceErrors: steps.filter(s => s.error).length,
    successfulWaitMedianMs: ok.length ? ok[Math.ceil(ok.length / 2) - 1] : null,
    scenes: tally(merged.rounds.map(r => r.sceneFixed || r.scene || 'portrait')),
    compare: tally(done.filter(r => r.compare).map(r => r.compare)),
    stepMarks: tally(done.flatMap(r => Object.values(r.answers.steps ?? {}))),
    helpful: count('helpful'), stepCount: count('stepCount'), speed: count('speed'), light: count('light'),
    toShotMedianMs: median(merged.rounds.map(r => r.metrics?.toShotMs)),
    note: '单评、熟人样本。compare 来自前后盲选（左右随机、不标明），after = 指导后更好；v1 记录没有盲选。图片只在附图的记录里有。',
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2), i = args.indexOf('--name'), name = i >= 0 ? args[i + 1] : null;
  const files = args.filter((_, j) => j !== i && j !== i + 1);
  if (!name || !/^[\w-]+$/.test(name) || !files.length) throw Error('Usage: --name <name> <export html files...>');
  const merged = mergeExports(await Promise.all(files.map(async f => parseExportHtml(await readFile(f, 'utf8')))));
  const out = new URL(`./results/collect-${name}.json`, import.meta.url);
  await writeFile(out, JSON.stringify(merged, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ saved: out.pathname, ...summarize(merged) }, null, 1));
}
