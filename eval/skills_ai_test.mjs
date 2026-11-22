// Run with: node --test eval/skills_ai_test.mjs
// 调用 AI 时真的带上了摄影技能和个人资料，回答里的 usedSkills 变成 _skills（假的网络请求，不花钱）
import test from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
let sent = null, reply = {};
globalThis.fetch = async (url, init) => {
  sent = JSON.parse(init.body);
  return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(reply) }, finish_reason: "stop" }], usage: { total_tokens: 1 } }) };
};
const { coach, proAdvice, suggest, album } = await import("../mobile/src/ai.js");
const { saveProfile, setEnabled } = await import("../mobile/src/skill-store.js");
const s = { apiKey: "fixture", baseUrl: "https://fixture.invalid/v1", model: "m" };
const system = () => sent.messages[0].content;

test("coach sends the scene's skills and the profile, and reports only skills it was given", async () => {
  saveProfile({ level: "new", topics: ["animal"] });
  reply = { hint: "蹲低", usedSkills: ["animal", "portrait-pose"] };
  const r = await coach(s, "data:image/png;base64,AA", {}, undefined, "animal");
  assert.match(system(), /### 技能 animal：动物/);
  assert.doesNotMatch(system(), /技能 street/);
  assert.match(system(), /拍摄水平：新手/);
  assert.deepEqual(r._skills, [{ id: "animal", name: "动物" }]);
});

test("switched-off skills are not sent", async () => {
  setEnabled("street", false);
  reply = { hint: "等一下" };
  const r = await coach(s, "x", {}, undefined, "street");
  assert.doesNotMatch(system(), /技能 street/);
  assert.deepEqual(r._skills, []);
  setEnabled("street", true);
});

test("pro, photo suggestions and album each get their own skills", async () => {
  reply = {};
  await proAdvice(s, "x", {}, undefined, null);
  assert.match(system(), /技能 pro-params/);
  await suggest(s, "x", {}, "portrait");
  assert.match(system(), /技能 portrait-pose/);
  await album(s, ["x", "y"], { info: "", lang: "zh" });
  assert.match(system(), /技能 caption/);
  assert.doesNotMatch(system(), /技能 portrait-pose/);
});
