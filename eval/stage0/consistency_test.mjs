// Run with: node --test eval/stage0/consistency_test.mjs
// 文字–坐标一致性检查：只报警，不定罪
import test from "node:test";
import assert from "node:assert/strict";
import { checkRecord, judge } from "./consistency.mjs";

const rec = (why, obs, extra = {}) => ({ final: { hint: "摄影师：拍下这一张", plan: { why }, observation: obs, ...extra } });

test("脸在正中却说贴边，缺头框仍只能待核验", () => {
  const r = checkRecord(rec("人物紧贴画面左边，视线前方缺少留白", { faceCenter: { x: 0.5, y: 0.4 }, headTop: 0.1 }));
  assert.equal(r.final.length, 1);
  assert.equal(r.final[0].verdict, "review");
});

test("没说哪边的贴边不能从视线推断边界", () => {
  const r = checkRecord(rec("人物视线朝左但贴边，留出前方空间更透气", { faceCenter: { x: 0.5, y: 0.44 }, headTop: 0.36 }));
  assert.equal(r.final[0].verdict, "review");
  const withBounds = checkRecord(rec("人物视线朝左但贴边", { headBounds: { left: .2, top: .2, right: .8, bottom: .8 } }));
  assert.equal(withBounds.final[0].verdict, "review");
});

test("说的是景物位置，不拿脸坐标对照", () => {
  assert.deepEqual(checkRecord(rec("花枝集中在画面右侧，人物正面平视", { faceCenter: { x: 0.48, y: 0.35 } })).final, []);
});

test("否定和目标不算断言：不贴边、让脸居中", () => {
  assert.deepEqual(checkRecord(rec("人物没有贴边，让脸居中更稳", { faceCenter: { x: 0.2, y: 0.4 }, headTop: 0.1 })).final, []);
});

test("居中：中间通过，复核带待核验，偏离报矛盾", () => {
  assert.equal(judge({ kind: "center" }, { faceCenter: { x: 0.5 } }).verdict, "ok");
  assert.equal(judge({ kind: "center" }, { faceCenter: { x: 0.62 } }).verdict, "review");
  assert.equal(judge({ kind: "center" }, { faceCenter: { x: 0.8 } }).verdict, "conflict");
});

test("偏左 / 偏右", () => {
  assert.equal(judge({ kind: "left" }, { faceCenter: { x: 0.25 } }).verdict, "ok");
  assert.equal(judge({ kind: "left" }, { faceCenter: { x: 0.7 } }).verdict, "conflict");
  assert.equal(judge({ kind: "right" }, { faceCenter: { x: 0.58 } }).verdict, "review");
});

test("贴边没有主体框：脸不在正中时只待核验，不报矛盾", () => {
  assert.equal(judge({ kind: "edge", side: "左" }, { faceCenter: { x: 0.3 } }).verdict, "review");
  assert.equal(judge({ kind: "edge", side: "左" }, { faceCenter: { x: 0.8 } }).verdict, "review");
});

test("贴边按头框相应四边距离判定，含阈值", () => {
  for (const [side, key, opposite] of [["左", "left", false], ["右", "right", true], ["上", "top", false], ["下", "bottom", true]]) {
    for (const [distance, verdict] of [[0, "ok"], [.05, "ok"], [.075, "review"], [.10, "review"], [.11, "conflict"]]) {
      const headBounds = { left: .2, top: .2, right: .8, bottom: .8, [key]: opposite ? 1 - distance : distance };
      assert.equal(judge({ kind: "edge", side }, { headBounds, faceCenter: { x: .5 } }).verdict, verdict, `${side} ${distance}`);
    }
  }
  assert.equal(checkRecord(rec("人物贴左边", { headBounds: { left: .2, top: .2, right: .8, bottom: .8 } })).final[0].verdict, "conflict");
  assert.equal(judge({ kind: "edge", side: null }, { headBounds: { left: 0, top: .2, right: .8, bottom: .8 } }).verdict, "review");
});

test("非归一化或非有限坐标只待核验", () => {
  for (const value of [-.1, 1.1, NaN, Infinity, "0.5", null]) {
    for (const kind of ["left", "right", "center"]) assert.equal(judge({ kind }, { faceCenter: { x: value } }).verdict, "review");
    for (const kind of ["roomy", "tight"]) assert.equal(judge({ kind }, { headTop: value }).verdict, "review");
  }
});

test("不完整、越界或倒置的头框只待核验", () => {
  for (const headBounds of [null, {}, { left: -.1, top: .2, right: .8, bottom: .8 }, { left: .8, top: .2, right: .3, bottom: .8 }, { left: .2, top: .8, right: .8, bottom: .8 }, { left: .2, top: .2, right: Infinity, bottom: .8 }]) {
    assert.equal(judge({ kind: "edge", side: "左" }, { headBounds }).verdict, "review");
  }
});

test("目标、否定、不确定及场景位置不与人物坐标比较", () => {
  for (const text of ["让人物的脸居中", "建议人物靠左", "人物需要居中", "人物尽量不要贴左边", "人物并非居中", "人物没有紧贴画面左边", "人物是否居中看不清", "无法判断人物是否偏右", "人物前面的花枝居中", "人物身后的背景偏右", "背景居中，人物偏左", "镜头向左转，让人物居中"]) {
    const obs = { faceCenter: { x: .2 }, headBounds: { left: .2, top: .2, right: .8, bottom: .8 } };
    assert.deepEqual(checkRecord(rec(text, obs)).final, [], text);
  }
});

for (const text of ["减少头顶留白", "把脸放在画面中央", "将人物调整为居中", "人物保持居中", "人物的身体靠右", "人物视线偏右", "居中的背景比较干净"]) {
  test(`指令或非脸部位置不报警：${text}`, () => {
    assert.deepEqual(checkRecord(rec(text, { faceCenter: { x: .2 }, headTop: .1 })).final, [], text);
  });
}

test("有场景词时仍保留明确的人物断言，否定不跨句污染", () => {
  for (const text of ["背景后的人物居中", "花枝旁的脸居中", "人物不贴边，但人物居中", "人物不贴边。脸居中", "人物居中，背景偏右"]) {
    const alarms = checkRecord(rec(text, { faceCenter: { x: .2 } })).final;
    assert.equal(alarms.filter(a => a.kind === "center" && a.verdict === "conflict").length, 1, text);
  }
});

test("报警报告保留用来判定贴边的头框证据", () => {
  const headBounds = { left: .2, top: .2, right: .8, bottom: .8 };
  assert.deepEqual(checkRecord(rec("人物贴左边", { headBounds })).coords.headBounds, headBounds);
});

test("头顶留空：>.25 才能说多；说太挤但留空很多 → 矛盾", () => {
  assert.equal(judge({ kind: "roomy" }, { headTop: 0.3 }).verdict, "ok");
  assert.equal(judge({ kind: "roomy" }, { headTop: 0.22 }).verdict, "review");
  assert.equal(judge({ kind: "roomy" }, { headTop: 0.1 }).verdict, "conflict");
  assert.equal(judge({ kind: "tight" }, { headTop: 0.3 }).verdict, "conflict");
});

test("缺坐标只待核验，不编数值", () => {
  assert.equal(judge({ kind: "roomy" }, {}).verdict, "review");
  assert.equal(judge({ kind: "center" }, { faceCenter: null }).verdict, "review");
});

test("理由说向右，最终动作向左 → 方向疑点", () => {
  const r = checkRecord(rec("镜头向右转，给视线留出空间", { faceCenter: { x: 0.5, y: 0.4 } }, { action: { direction: "left" } }));
  assert.equal(r.final.filter(a => a.code === "H3?").length, 1);
});

test("内部草稿和最终输出分开报", () => {
  const r = checkRecord({ raw: { plan: { why: "脸贴右边" }, observation: { faceCenter: { x: 0.5 } } }, final: { hint: "摄影师：拍下这一张", observation: { faceCenter: { x: 0.5 } } } });
  assert.equal(r.final.length, 0);
  assert.equal(r.raw.length, 1);
});
