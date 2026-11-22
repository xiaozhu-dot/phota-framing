// Run with: node --test eval/skills_test.mjs
// 摄影技能：合并、挑选、拼说明、认回答、.md 技能文件（不调用 AI）
import test from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_SKILLS, mergeSkills, pickSkills, skillsPrompt, usedSkills, toSkillMd, parseSkillMd, cleanSkill, profileText, MAX_PICK } from "../mobile/src/skills.js";

const all = (stored) => mergeSkills(BUILTIN_SKILLS, stored);
const ids = (list) => list.map((s) => s.id);

test("built-in skills are valid and cover the agreed set", () => {
  assert.deepEqual(ids(BUILTIN_SKILLS), ["street", "animal", "pro-params", "portrait-pose", "backlight-night", "food-still", "caption"]);
  for (const b of BUILTIN_SKILLS) assert.deepEqual(cleanSkill(b), { id: b.id, name: b.name, description: b.description, features: b.features, scenes: b.scenes, body: b.body.trim() }, b.id);
});

test("mergeSkills applies edits and switches, marks edited, adds custom skills after built-ins", () => {
  const list = all({
    builtin: { street: { enabled: false }, animal: { body: "改过的正文" }, caption: { body: BUILTIN_SKILLS[6].body } },
    custom: [{ id: "my-a", name: "我的", body: "正文", features: ["coach"], enabled: false }, { id: "street", name: "撞名", body: "x" }, { name: "", body: "坏的" }],
  });
  const by = Object.fromEntries(list.map((s) => [s.id, s]));
  assert.equal(by.street.enabled, false);
  assert.equal(by.street.edited, false);
  assert.equal(by.animal.body, "改过的正文");
  assert.equal(by.animal.edited, true);
  assert.equal(by.caption.edited, false, "saving the same text is not an edit");
  assert.equal(by["my-a"].builtin, false);
  assert.equal(by["my-a"].enabled, false);
  assert.equal(list.length, BUILTIN_SKILLS.length + 1, "custom skill reusing a built-in id and empty skills are dropped");
});

test("pickSkills matches feature and scene, never uses scene-only skills when the scene is unknown", () => {
  assert.deepEqual(ids(pickSkills(all(), { feature: "coach", scene: "street" })), ["street", "backlight-night"]);
  assert.deepEqual(ids(pickSkills(all(), { feature: "coach", scene: "landscape" })), ["food-still", "backlight-night"]);
  assert.deepEqual(ids(pickSkills(all(), { feature: "analysis", scene: "portrait" })), ["portrait-pose", "backlight-night"]);
  assert.deepEqual(ids(pickSkills(all(), { feature: "pro", scene: null })), ["pro-params", "backlight-night"]);
  assert.deepEqual(ids(pickSkills(all(), { feature: "album" })), ["caption"]);
  assert.deepEqual(ids(pickSkills(all({ builtin: { street: { enabled: false } } }), { feature: "coach", scene: "street" })), ["backlight-night"], "switched-off skills are skipped");
});

test("pickSkills caps at 3 and ranks scene-specific, then the user's own, then profile topics", () => {
  const custom = [
    { id: "my-any", name: "通用", body: "x", features: ["coach"], scenes: [] },
    { id: "my-street", name: "街拍2", body: "x", features: ["coach"], scenes: ["street"] },
    { id: "my-any2", name: "通用2", body: "x", features: ["coach"], scenes: [] },
  ];
  const picked = pickSkills(all({ custom }), { feature: "coach", scene: "street" });
  assert.equal(picked.length, MAX_PICK);
  assert.deepEqual(ids(picked), ["my-street", "street", "my-any"]);
  const animalFan = pickSkills(all(), { feature: "analysis", scene: "animal", profile: { topics: ["animal"] }, limit: 1 });
  assert.deepEqual(ids(animalFan), ["animal"]);
});

test("skillsPrompt carries skills, the profile and the usedSkills instruction; usedSkills trusts only what was sent", () => {
  const picked = pickSkills(all(), { feature: "coach", scene: "animal" });
  const p = skillsPrompt(picked, { profile: { level: "new", topics: ["animal", "food"] }, where: "final" });
  assert.match(p, /### 技能 animal：动物/);
  assert.match(p, /拍摄水平：新手（用大白话/);
  assert.match(p, /常拍：宠物、美食/);
  assert.match(p, /在final里加一个字段 "usedSkills"/);
  assert.equal(skillsPrompt([], {}), "");
  assert.match(skillsPrompt([], { profile: { level: "pro" } }), /^\n\n用户资料：拍摄水平：熟练/);
  assert.equal(profileText({ level: "??", topics: ["nope"] }), "");
  assert.deepEqual(usedSkills({ usedSkills: ["animal", "street", 3] }, picked), [{ id: "animal", name: "动物" }]);
  assert.deepEqual(usedSkills({}, picked), []);
  assert.deepEqual(usedSkills(null, picked), []);
});

test("skill files round-trip and accept Chinese labels, BOM and CRLF", () => {
  const s = BUILTIN_SKILLS[3];
  assert.deepEqual(parseSkillMd(toSkillMd(s)), cleanSkill(s));
  const md = "﻿---\r\nname: 夕阳剪影\r\ndescription: 太阳快落山时\r\nfeatures: 实时指导、照片分析, 乱写\r\nscenes: 人像，风景\r\n---\r\n\r\n对着天空测光。\r\n";
  const p = parseSkillMd(md);
  assert.equal(p.name, "夕阳剪影");
  assert.deepEqual(p.features, ["coach", "analysis"]);
  assert.deepEqual(p.scenes, ["portrait", "landscape"]);
  assert.equal(p.body, "对着天空测光。");
  assert.match(p.id, /^my-/);
  assert.throws(() => parseSkillMd("只有正文"), /---/);
  assert.throws(() => parseSkillMd("---\ndescription: x\n---\n正文"), /name/);
  assert.throws(() => parseSkillMd("---\nname: 空\n---\n  "), /正文/);
});
