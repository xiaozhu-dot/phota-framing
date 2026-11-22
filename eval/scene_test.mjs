// 场景识别规则：人像 / 人文街拍 / 动物 / 风景，以及防抖（连续几次一致才换）
// Run: node --test eval/scene_test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyScene, createSceneSmoother } from '../mobile/src/scene-detect.js';
import { COACH_PROMPT_VERSION } from '../mobile/src/ai.js';
import { BUILTIN_SKILLS, mergeSkills, pickSkills } from '../mobile/src/skills.js';
import { createRoundTracker } from '../mobile/src/collect-round.js';

const person = (area) => ({ label: 'person', score: 0.8, area });

test('一两个主角够大是人像；人小或人多是街拍', () => {
  assert.equal(classifyScene([person(0.2)]), 'portrait');
  assert.equal(classifyScene([person(0.1), person(0.09)]), 'portrait');
  assert.equal(classifyScene([person(0.03)]), 'street', '人太小：远处的路人');
  assert.equal(classifyScene([person(0.2), person(0.1), person(0.1), person(0.1)]), 'street', '四个人以上：人群');
  assert.equal(classifyScene([person(0.001)]), 'landscape', '极小的框当噪点');
});

test('动物、风景和自拍', () => {
  assert.equal(classifyScene([{ label: 'cat', area: 0.05 }]), 'animal');
  assert.equal(classifyScene([{ label: 'bird', area: 0.01 }]), 'landscape', '远处的小鸟不算');
  assert.equal(classifyScene([person(0.3), { label: 'dog', area: 0.2 }]), 'portrait', '人抱着狗：按人像指导');
  assert.equal(classifyScene([person(0.02), { label: 'dog', area: 0.1 }]), 'animal', '遛狗的路人很小：主角是狗');
  assert.equal(classifyScene([]), 'landscape');
  assert.equal(classifyScene([], { selfie: true }), 'portrait');
});

test('防抖：连续 3 次一致才换场景，中途被打断要重新数', () => {
  const s = createSceneSmoother(3);
  assert.equal(s.push('street'), false);
  assert.equal(s.push('landscape'), false, '回到原场景：清零');
  assert.equal(s.push('street'), false);
  assert.equal(s.push('animal'), false, '换了候选：重新数');
  assert.equal(s.push('animal'), false);
  assert.equal(s.push('animal'), true);
  assert.equal(s.scene, 'animal');
});

test('街拍和动物的说明变成了自带技能，实时指导按场景挑出来', () => {
  const pick = (scene) => pickSkills(mergeSkills(BUILTIN_SKILLS, {}), { feature: 'coach', scene }).map((s) => s.body).join(' | ');
  assert.match(pick('street'), /不能指挥/);
  assert.match(pick('animal'), /眼睛一样高/);
  assert.doesNotMatch(pick('landscape'), /不能指挥|眼睛一样高/);
  assert.ok(COACH_PROMPT_VERSION);
});

test('收集版：场景一换，拍过照的回合立刻结束', () => {
  const ended = [];
  const tr = createRoundTracker({ now: () => 1, newId: () => 'r', onEnd: (r) => ended.push(r) });
  tr.guidance({ status: 'adjust', hint: '蹲低', scene: 'animal' });
  assert.equal(tr.scene('street'), null, '没拍照：不结束');
  tr.shot({ name: 'a.jpg' });
  assert.equal(tr.scene('animal'), null, '场景没变');
  tr.scene('street');
  assert.equal(ended[0].endReason, 'scene');
});
