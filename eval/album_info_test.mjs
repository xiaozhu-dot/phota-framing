// Run with: node --test eval/album_info_test.mjs
// 摄影集关键信息和配文：问题整理、日期、发给 AI 的说明、话题标签和配文清理（不调用 AI）
import test from "node:test";
import assert from "node:assert/strict";
import { dateText, normalizeInfo, infoText, cleanTags, normalizeCaptions, captionCopy, ALBUM_PROMPT, INFO_PROMPT, langOf } from "../mobile/src/album-info.js";

const day = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

test("dateText covers one day, a range in one month, across months and years", () => {
  assert.equal(dateText([]), "");
  assert.equal(dateText([day(2026, 11, 10, 9), day(2026, 11, 10, 18)]), "2026年11月10日");
  assert.equal(dateText([day(2026, 11, 10), day(2026, 11, 8)]), "2026年11月8日～10日");
  assert.equal(dateText([day(2026, 10, 30), day(2026, 11, 2)]), "2026年10月30日～11月2日");
  assert.equal(dateText([day(2025, 12, 31), day(2026, 1, 1)]), "2025年12月31日～2026年1月1日");
});

test("normalizeInfo always asks for place, puts time last with the photo date, and caps the field count", () => {
  const r = normalizeInfo({ fields: [
    { key: "names", label: "他们怎么称呼？", guess: "" },
    { key: "names", label: "重复" },
    { key: "time", label: "AI 不该问时间" },
    { key: "bad key!", label: "乱的" },
    { key: "occasion", guess: "生日" }, { key: "with" }, { key: "mood" }, { key: "petName" },
  ], petQuestion: "是在海边吗？这句很长很长很长很长" }, { date: "2026年11月10日" });
  const keys = r.fields.map((f) => f.key);
  assert.equal(keys[0], "place", "place is added when the AI forgot it");
  assert.equal(keys.at(-1), "time");
  assert.equal(r.fields.at(-1).guess, "2026年11月10日");
  assert.equal(new Set(keys).size, keys.length, "no duplicate fields");
  assert.ok(keys.length <= 5);
  assert.ok(!keys.includes("bad key!"));
  assert.equal(r.fields.find((f) => f.key === "occasion").label, "是什么场合？", "missing labels fall back to defaults");
  assert.ok(r.petQuestion.length <= 14);
});

test("normalizeInfo survives a broken AI reply", () => {
  const r = normalizeInfo(null, { date: "" });
  assert.deepEqual(r.fields.map((f) => f.key), ["place", "time"]);
  assert.equal(r.petQuestion, "");
});

test("infoText passes what the user wrote and forbids inventing what they left empty", () => {
  const { fields } = normalizeInfo({ fields: [{ key: "place", label: "在哪儿拍的？" }, { key: "names", label: "照片里的人怎么称呼？" }] }, { date: "2026年11月10日" });
  const t = infoText(fields, { place: "青岛 小麦岛", names: "", time: "2026年11月10日" });
  assert.match(t, /在哪儿拍的：青岛 小麦岛/);
  assert.match(t, /照片里的人怎么称呼：（用户没填，不要编）/);
  assert.match(t, /不要出现具体的名字或地名/);
});

test("cleanTags adds #, drops spaces, punctuation and duplicates, keeps at most 5", () => {
  assert.deepEqual(cleanTags(["海边", "#海边", "## 青岛 ", "秋天。", "a", "b", "c"]), ["#海边", "#青岛", "#秋天", "#a", "#b"]);
  assert.deepEqual(cleanTags("#sea #Sea, sunset"), ["#sea", "#sunset"]);
});

test("normalizeCaptions keeps 3, moves inline hashtags into tags, drops empty ones", () => {
  const c = normalizeCaptions([
    { text: "风很大，我们笑得更大 #海边 #周末", tags: ["青岛"] },
    "只是一句 #夕阳",
    { text: "", tags: ["#空"] },
    { text: "第四条不要", tags: [] },
  ]);
  assert.equal(c.length, 2, "empty caption dropped, fourth never read");
  assert.deepEqual(c[0], { text: "风很大，我们笑得更大", tags: ["#青岛", "#海边", "#周末"] });
  assert.deepEqual(c[1], { text: "只是一句", tags: ["#夕阳"] });
  assert.equal(captionCopy(c[0]), "风很大，我们笑得更大\n\n#青岛 #海边 #周末");
  assert.deepEqual(normalizeCaptions(undefined), []);
});

test("prompts carry the photo count and caption language; info prompt never asks for time", () => {
  assert.match(ALBUM_PROMPT(4, "en"), /正好 4 项/);
  assert.match(ALBUM_PROMPT(4, "en"), /配文用 English/);
  assert.match(ALBUM_PROMPT(4, "xx"), /配文用 简体中文/, "unknown language falls back to Chinese");
  assert.match(ALBUM_PROMPT(4), /captions 正好 3 条/);
  assert.match(INFO_PROMPT(3), /时间由 App 根据拍摄日期自己填，不要问/);
  assert.match(INFO_PROMPT(3), /一定要问怎么称呼/);
  assert.equal(langOf("ja").label, "日本語");
});
