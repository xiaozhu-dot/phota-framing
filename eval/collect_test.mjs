// 收集版：指导回合判定、标注校验（步骤标记、前后盲选）、导出文件（单个 html）读写与合并去重
// Run: node --test eval/collect_test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoundTracker, ROUND_LIMITS } from '../mobile/src/collect-round.js';
import { QUESTIONS, missingAnswers, finishRound, markableSteps, blindResult } from '../mobile/src/collect-questions.js';
import { buildExportHtml, parseExportHtml, mergeExports, exportFileName, EXPORT_SCHEMA } from '../mobile/src/collect-export.js';

function tracker() {
  let t = 1000, n = 0;
  const ended = [];
  const tr = createRoundTracker({ now: () => t, newId: () => 'r' + ++n, onEnd: r => ended.push(r) });
  return { tr, ended, advance: ms => (t += ms) };
}
const step = (hint = '往左一步', scene = 'portrait') => ({ status: 'adjust', hint, scene });

test('快门要跟在一次成功的出片指导之后才算回合', () => {
  const { tr, ended } = tracker();
  assert.equal(tr.shot({ name: 'a.jpg' }), false);
  tr.guidance({ error: '超时' });
  assert.equal(tr.shot({ name: 'b.jpg' }), false, '只有失败的指导不算');
  tr.guidance(step());
  assert.equal(tr.shot({ name: 'c.jpg' }), true);
  tr.leave();
  assert.equal(ended.length, 1);
  assert.deepEqual(ended[0].shots.map(s => s.name), ['c.jpg']);
  assert.equal(ended[0].steps.length, 2, '失败的那步也记下（用于统计可用率）');
  assert.equal(ended[0].endReason, 'leave');
});

test('没拍照就离开或换拍法：不产生回合，旧步骤丢掉', () => {
  const { tr, ended } = tracker();
  tr.guidance(step('第一步'));
  assert.equal(tr.restart(), false);
  tr.guidance(step('新拍法'));
  tr.shot({ name: 'a.jpg' });
  tr.leave();
  assert.deepEqual(ended[0].steps.map(s => s.hint), ['新拍法']);
  assert.equal(tr.leave(), null);
});

test('拍完后 AI 开始下一轮指导：上一回合结束，新回合带上新的指导前画面', () => {
  const { tr, ended } = tracker();
  tr.guidance(step(), 'before-1'); tr.shot({ name: 'a.jpg' }); tr.shot({ name: 'b.jpg' });
  tr.guidance(step('再来一张'), 'before-2');
  assert.equal(ended[0].endReason, 'next');
  assert.equal(ended[0].shots.length, 2, '连拍的几张都在同一回合');
  assert.equal(ended[0].before, 'before-1');
  assert.equal(tr.current().before, 'before-2');
  assert.deepEqual(ended[0].metrics.steps, 1);
});

test('回合里后面几步的画面不会顶替指导前画面', () => {
  const { tr } = tracker();
  tr.guidance(step(), 'first'); tr.guidance(step('第二步'), 'second');
  assert.equal(tr.current().before, 'first');
});

test('场景变了或切换摄像头：结束回合；没拍过照就丢掉', () => {
  const { tr, ended } = tracker();
  tr.guidance(step('人像一步'), 'p');
  tr.guidance(step('风景一步', 'landscape'), 'l');
  assert.equal(ended.length, 0);
  assert.equal(tr.current().scene, 'landscape');
  assert.equal(tr.current().before, 'l', '没拍照的人像步骤和画面都丢掉');
  tr.shot({ name: 'a.jpg' });
  tr.guidance(step('街拍', 'street'), 's');
  assert.equal(ended[0].endReason, 'scene');
  tr.shot({ name: 'b.jpg' });
  tr.switchCamera();
  assert.equal(ended[1].endReason, 'camera');
  assert.equal(ended[1].scene, 'street');
});

test('拍完后换个拍法：结束回合并告诉调用方不要继续指导', () => {
  const { tr, ended } = tracker();
  tr.guidance(step()); tr.shot({ name: 'a.jpg' });
  assert.equal(tr.restart(), true);
  assert.equal(ended[0].endReason, 'restart');
});

test('后台超过 2 分钟才结束，短暂切出不结束', () => {
  const { tr, ended, advance } = tracker();
  tr.guidance(step()); tr.shot({ name: 'a.jpg' });
  tr.hidden(); advance(ROUND_LIMITS.hiddenMs - 1); tr.visible();
  assert.equal(ended.length, 0);
  tr.hidden(); advance(ROUND_LIMITS.hiddenMs + 1); tr.visible();
  assert.equal(ended[0].endReason, 'background');
});

test('拍完 5 分钟没有新指导：结束', () => {
  const { tr, ended, advance } = tracker();
  tr.guidance(step()); tr.shot({ name: 'a.jpg' });
  advance(ROUND_LIMITS.idleAfterShotMs); tr.tick();
  assert.equal(ended.length, 0);
  advance(1); tr.tick();
  assert.equal(ended[0].endReason, 'idle');
});

const full = {
  blind: '右边', stars: '4', scene: '人像', natural: '自然', helpful: '很有帮助', stepCount: '刚好', speed: '可以接受', light: '室内',
  steps: { 0: '有用' },
};
const ctx = { blind: true, steps: [0] };

test('标注必答题：步骤标记、盲选、场景专属题；ready 步骤不标', () => {
  assert.deepEqual(missingAnswers(full, ctx), []);
  assert.deepEqual(missingAnswers({ ...full, steps: {} }, ctx), ['step0']);
  assert.deepEqual(missingAnswers({ ...full, scene: '动物' }, ctx), ['spirit'], '改成动物场景就要答动物的专属题');
  assert.deepEqual(missingAnswers({ ...full, blind: undefined }, { ...ctx, blind: false }), [], '没有图就不考盲选');
  assert.deepEqual(markableSteps(pendingRound()), [0], '第二步是 ready，不标');
  assert.ok(QUESTIONS.every(q => q.key && q.title && q.options));
});

test('盲选换算：左右顺序随机，结果统一成指导后 / 指导前', () => {
  assert.equal(blindResult('左边', 'after'), 'after');
  assert.equal(blindResult('左边', 'before'), 'before');
  assert.equal(blindResult('右边', 'before'), 'after');
  assert.equal(blindResult('差不多', 'before'), 'same');
  assert.equal(blindResult('说不清', 'after'), 'unsure');
});

const img = 'data:image/jpeg;base64,AAAA';
function pendingRound(id = 'r1') {
  return {
    id, schema: EXPORT_SCHEMA, status: 'pending', startedAt: 1, endedAt: 2, endReason: 'leave', scene: 'portrait', before: img, blindLeft: 'before',
    rater: { nickname: '小王', id: 'a1b2c3d4' }, app: { prompt: 'portrait-v16', build: 'collect' },
    steps: [{ at: 1, status: 'adjust', hint: '往左一步', frame: img }, { at: 2, status: 'ready', hint: '可以拍了', frame: img }],
    shots: [{ at: 3, name: 'a.jpg', thumb: img }, { at: 4, name: 'b.jpg', thumb: img }],
  };
}

test('提交标注：附图留指导前画面、步骤画面和最满意的一张；不附图、跳过、过期都把图去掉', () => {
  const kept = finishRound(pendingRound(), { answers: full, comment: '光线不错', best: 1, attach: true, now: 9 });
  assert.equal(kept.status, 'done');
  assert.equal(kept.shotCount, 2);
  assert.deepEqual(kept.shots.map(s => [s.name, !!s.thumb]), [['a.jpg', false], ['b.jpg', true]]);
  assert.ok(kept.steps.every(s => s.frame));
  assert.equal(kept.before, img);
  assert.equal(kept.compare, 'after', '左边是指导前，选了右边 = 指导后更好');
  assert.equal(kept.sceneFixed, undefined);
  assert.equal(kept.annotatedAt, 9); assert.equal(kept.updatedAt, 9);
  const bare = finishRound(pendingRound(), { answers: full, best: 0, attach: false, now: 9 });
  assert.ok(!JSON.stringify(bare).includes('data:image'));
  const skipped = finishRound(pendingRound(), { skip: true, now: 9 });
  assert.equal(skipped.status, 'skipped');
  assert.ok(!JSON.stringify(skipped).includes('data:image'), '跳过的回合一律不附图');
  assert.equal(skipped.shotCount, 2);
  const expired = finishRound(pendingRound(), { skip: true, expired: true, now: 9 });
  assert.equal(expired.skipReason, 'expired');
  assert.ok(!('before' in expired));
  const fixed = finishRound(pendingRound(), { answers: { ...full, scene: '人文街拍', natural: undefined, moment: '差一点' }, best: 0, attach: false, now: 9 });
  assert.equal(fixed.sceneFixed, 'street');
  assert.equal(fixed.answers.natural, undefined, '不再问的题不留答案');
  assert.throws(() => finishRound(pendingRound(), { answers: { ...full, light: undefined }, best: 0, attach: true, now: 9 }));
});

test('导出单个 html：数据可读回，页面里的 </script> 不会把文件弄坏', () => {
  const r = finishRound(pendingRound(), { answers: full, comment: '</script><b>坏</b>', best: 0, attach: true, now: 9 });
  const html = buildExportHtml({ profile: { nickname: '小王', id: 'a1b2c3d4' }, rounds: [r], exportedAt: 10 });
  assert.equal(html.match(/<\/script>/g).length, 2, '只有数据块和渲染脚本两个结束标签');
  const data = parseExportHtml(html);
  assert.equal(data.schema, EXPORT_SCHEMA);
  assert.equal(data.rounds[0].comment, '</script><b>坏</b>');
  assert.equal(data.rater.nickname, '小王');
  assert.match(exportFileName({ nickname: '小王 / ?', id: 'a1b2c3d4' }), /^phota-数据-小王-a1b2\.html$/);
});

test('合并多人导出：同一回合重复导出按编号去重，保留最新修改', () => {
  const a = finishRound(pendingRound('x'), { answers: full, best: 0, attach: false, now: 5 });
  const a2 = finishRound(pendingRound('x'), { answers: { ...full, blind: '左边' }, best: 0, attach: false, now: 8 });
  const b = { ...finishRound(pendingRound('y'), { skip: true, now: 6 }), rater: { nickname: '小李', id: 'ffff0000' } };
  const f1 = parseExportHtml(buildExportHtml({ profile: a.rater, rounds: [a], exportedAt: 6 }));
  const f2 = parseExportHtml(buildExportHtml({ profile: a.rater, rounds: [a2], exportedAt: 9 }));
  const f3 = parseExportHtml(buildExportHtml({ profile: b.rater, rounds: [b], exportedAt: 7 }));
  const m = mergeExports([f2, f1, f3]);
  assert.equal(m.rounds.length, 2);
  assert.equal(m.rounds.find(r => r.id === 'x').compare, 'before');
  assert.equal(m.duplicates, 1);
  assert.deepEqual(m.raters.map(r => r.id).sort(), ['a1b2c3d4', 'ffff0000']);
});

test('正式版打包不含任何标注代码；收集版包含', async () => {
  const { build } = await import('../mobile/node_modules/esbuild/lib/main.js');
  const bundle = async collect => (await build({ entryPoints: ['mobile/src/app.js'], bundle: true, format: 'esm', target: ['chrome90'], write: false, logLevel: 'silent',
    define: { PHOTA_COLLECT: String(collect), PHOTA_VERSION: '"test"' } })).outputFiles[0].text;
  const formal = await bundle(false), collect = await bundle(true);
  for (const marker of ['phota-collect-v2', 'createRoundTracker', 'petDockAnnotate']) {
    assert.ok(!formal.includes(marker), '正式版里出现了 ' + marker);
    assert.ok(collect.includes(marker), '收集版里缺少 ' + marker);
  }
});

test('合并统计：按标注人计数，失败的指导单独数', async () => {
  const { summarize } = await import('./collect_merge.mjs');
  const r = finishRound(pendingRound('z'), { answers: full, best: 0, attach: false, now: 5 });
  r.steps[0].error = '超时';
  const s = summarize(mergeExports([parseExportHtml(buildExportHtml({ profile: r.rater, rounds: [r] }))]));
  assert.equal(s.done, 1); assert.equal(s.guidanceErrors, 1); assert.deepEqual(s.compare, { after: 1 });
  assert.deepEqual(s.stepMarks, { 有用: 1 }); assert.deepEqual(s.scenes, { portrait: 1 });
  assert.deepEqual(s.perRater, { '小王/a1b2c3d4': 1 });
});
