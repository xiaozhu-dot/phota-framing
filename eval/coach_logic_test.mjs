// Run with: node --test eval/coach_logic_test.mjs
// 取景指导的方向换算：AI 报"主体在哪、该在哪"，程序决定手机往哪动
import test from "node:test";
import assert from "node:assert/strict";
import { decide, panFor } from "../mobile/src/coach-logic.js";

test("主体太靠右 → 手机往右移（不是往左）", () => {
  assert.equal(panFor({ x: 0.85, y: 0.5 }, { x: 0.67, y: 0.5 }), "right");
  const r = decide({ score: 6, fix: "position", subject_at: { x: 0.85, y: 0.5 }, target: { x: 0.67, y: 0.5 }, move: "left", hint: "往左挪一点", why: "别贴着边" });
  assert.equal(r.move, "right");
  assert.equal(r.hint, "手机往右移一点，别贴着边", "AI 说反了的话不能用");
});

test("主体太靠左 → 手机往左移", () => {
  assert.equal(panFor({ x: 0.1, y: 0.5 }, { x: 0.33, y: 0.5 }), "left");
});

test("主体太靠上 → 镜头往上抬；太靠下 → 往下压", () => {
  assert.equal(panFor({ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.33 }), "raise");
  assert.equal(panFor({ x: 0.5, y: 0.9 }, { x: 0.5, y: 0.67 }), "lower");
});

test("AI 说的方向和算出来的一致：用它自己的话", () => {
  const r = decide({ score: 6, fix: "position", subject_at: { x: 0.85, y: 0.5 }, target: { x: 0.67, y: 0.5 }, move: "right", hint: "再往右转一点点" });
  assert.deepEqual([r.move, r.hint], ["right", "再往右转一点点"]);
});

test("离目标很近就不用再挪了", () => {
  assert.equal(panFor({ x: 0.7, y: 0.5 }, { x: 0.67, y: 0.5 }), null);
  assert.equal(decide({ score: 7, fix: "position", subject_at: { x: 0.7, y: 0.5 }, target: { x: 0.67, y: 0.5 } }).move, "shoot");
});

test("8 分及以上：不挑刺，直接拍", () => {
  const r = decide({ score: 8, fix: "position", subject_at: { x: 0.9, y: 0.5 }, target: { x: 0.67, y: 0.5 }, hint: "往左一点" });
  assert.equal(r.move, "shoot");
  assert.match(r.hint, /按快门/);
});

test("照着做了但分数没涨：别再来回折腾", () => {
  const r = decide({ score: 7, followed: true, fix: "position", subject_at: { x: 0.85, y: 0.5 }, target: { x: 0.67, y: 0.5 } }, { move: "right", score: 7 });
  assert.equal(r.move, "shoot");
  assert.equal(r.why, "plateau");
});

test("大小：主体太小 → 走近；差不多 → 拍", () => {
  assert.equal(decide({ score: 6, fix: "closer", subject_size: 0.2, target_size: 0.5 }).move, "closer");
  assert.equal(decide({ score: 6, fix: "back", subject_size: 0.9, target_size: 0.6 }).move, "back");
  assert.equal(decide({ score: 6, fix: "closer", subject_size: 0.45, target_size: 0.5 }).move, "shoot");
});

test("换拍摄高度、等时机、老格式", () => {
  assert.equal(decide({ score: 6, fix: "angle", move: "lower" }).move, "lower");
  assert.equal(decide({ score: 6, fix: "wait" }).move, "wait");
  assert.equal(decide({ score: 5, move: "back", hint: "退一步" }).move, "back");
  assert.equal(decide({ score: 5, move: "nonsense" }).move, "wait");
});

test("坐标乱填也不会出错", () => {
  const r = decide({ score: 6, fix: "position", subject_at: { x: "abc", y: 2 }, target: null });
  assert.equal(r.move, "shoot");
});
