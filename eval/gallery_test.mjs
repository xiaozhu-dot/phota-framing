// Run with: node --test eval/gallery_test.mjs
// 相册：日期分组、连拍组、最清楚的一张、筛选、成长曲线（纯函数）
import test from "node:test";
import assert from "node:assert/strict";
import { cells, sections, bestOf, dayLabel, matches, filterCounts, growth, trend, viewOrder, isCamera } from "../mobile/src/gallery-logic.js";

const T = new Date(2026, 10, 14, 15, 0, 0).getTime();          // 2026-11-14 15:00
const cam = (id, at, quality) => ({ id, at, source: "camera", quality });
const imp = (id, at) => ({ id, at, source: "import" });

test("dayLabel says today, yesterday, a date this year, and a full date in other years", () => {
  assert.equal(dayLabel(T - 3600e3, T), "今天");
  assert.equal(dayLabel(new Date(2026, 10, 13, 23, 59).getTime(), T), "昨天");
  assert.equal(dayLabel(new Date(2026, 10, 10).getTime(), T), "11月10日");
  assert.equal(dayLabel(new Date(2025, 11, 31).getTime(), T), "2025年12月31日");
});

test("camera shots within 10 s of each other stack into one burst; imports and gaps break it", () => {
  const list = [cam("a", T), cam("b", T - 4000), cam("c", T - 13000), cam("d", T - 40000), imp("e", T - 41000), cam("f", T - 45000)];
  const cs = cells(list.reverse());
  assert.deepEqual(cs.map((c) => (c.kind === "burst" ? c.shots.map((s) => s.id).join("") : c.shot.id)), ["abc", "d", "e", "f"]);
});

test("the sharpest shot is best; unmeasured shots lose; ties go to the newest", () => {
  const g = [cam("a", 3, { edge: 2.6 }), cam("b", 2, { edge: 1.9, over: 10 }), cam("c", 1, { edge: 2.0 }), cam("d", 4)];
  assert.equal(bestOf(g).id, "c", "over-exposure costs a little");
  assert.equal(bestOf([cam("x", 1), cam("y", 2)]).id, "y");
  const burst = cells([cam("a", T, { edge: 3 }), cam("b", T - 2000, { edge: 2 })])[0];
  assert.deepEqual(viewOrder(burst).map((s) => s.id), ["b", "a"], "viewer starts at the sharpest");
});

test("sections filter first, then group by day, newest first", () => {
  const shots = [
    { ...cam("p1", T), scene: "portrait" }, { ...imp("l1", T - 86400e3), scene: "landscape" },
    { ...imp("p2", T - 2 * 86400e3), scene: "portrait", analysis: { score: 9 } },
  ];
  assert.deepEqual(sections(shots, { now: T }).map((s) => s.label), ["今天", "昨天", "11月12日"]);
  assert.deepEqual(sections(shots, { now: T, filter: "portrait" }).map((s) => s.cells.length), [1, 1]);
  assert.deepEqual(sections(shots, { now: T, filter: "top" }).map((s) => s.label), ["11月12日"]);
  assert.equal(matches({ analysis: { score: 7 } }, "top"), false);
  assert.deepEqual(filterCounts(shots), { all: 3, portrait: 2, street: 0, animal: 0, landscape: 1, top: 1 });
});

test("old shots without a source count as camera shots only if they carry sensor data", () => {
  assert.equal(isCamera({ sensor: { tilt: 1 } }), true);
  assert.equal(isCamera({ sensor: null }), false);
});

test("growth uses analysed shots in analysis order; trend compares the last 3 with the first 3", () => {
  const shots = [5, 6, 4, 7, 8, 9].map((score, i) => ({ id: i, at: 0, analysis: { score, at: 100 - i } }));
  shots.push({ id: "no", at: 1 });
  const pts = growth(shots);
  assert.deepEqual(pts.map((p) => p.score), [9, 8, 7, 4, 6, 5]);
  assert.equal(trend(pts), Math.round(((4 + 6 + 5) / 3 - (9 + 8 + 7) / 3) * 10) / 10);
  assert.equal(trend(pts.slice(0, 5)), null);
});
