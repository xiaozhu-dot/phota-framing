// 摄影技能和个人资料的存取（只存在这台手机上）
//   技能：自带的只记用户改过的地方和开关；用户自己的整条存下来。规则和格式在 skills.js
import { BUILTIN_SKILLS, mergeSkills, cleanSkill, pickSkills, skillsPrompt, usedSkills } from "./skills.js";

const SKILLS = "phota-skills", PROFILE = "phota-profile";
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} };
const stored = () => ({ builtin: {}, custom: [], ...read(SKILLS, {}) });

export const loadSkills = () => mergeSkills(BUILTIN_SKILLS, stored());
export const skillById = (id) => loadSkills().find((s) => s.id === id);
const isBuiltin = (id) => BUILTIN_SKILLS.some((b) => b.id === id);

export function setEnabled(id, on) {
  const st = stored();
  if (isBuiltin(id)) st.builtin[id] = { ...st.builtin[id], enabled: on };
  else st.custom = st.custom.map((c) => (c.id === id ? { ...c, enabled: on } : c));
  write(SKILLS, st);
}
// 保存一条（新建或修改）。返回整理后的技能；名称或正文是空的返回 null，不保存
export function saveSkill(skill) {
  const clean = cleanSkill(skill);
  if (!clean) return null;
  const st = stored();
  if (isBuiltin(clean.id)) {
    const { id, ...fields } = clean;
    st.builtin[id] = { ...st.builtin[id], ...fields };
  } else {
    const i = st.custom.findIndex((c) => c.id === clean.id);
    const enabled = i >= 0 ? st.custom[i].enabled !== false : true;
    if (i >= 0) st.custom[i] = { ...clean, enabled }; else st.custom.push({ ...clean, enabled });
  }
  write(SKILLS, st);
  return clean;
}
export function resetSkill(id) {          // 自带技能恢复默认（开关保留）
  const st = stored();
  if (st.builtin[id]) st.builtin[id] = st.builtin[id].enabled === false ? { enabled: false } : {};
  write(SKILLS, st);
}
export function deleteSkill(id) {         // 只能删用户自己的
  const st = stored();
  st.custom = st.custom.filter((c) => c.id !== id);
  write(SKILLS, st);
}
// 导入：和自带技能同 id 的换一个新 id（不覆盖自带的）；和自己的同 id 的就更新那一条
export function importSkill(skill) {
  return saveSkill(isBuiltin(skill.id) ? { ...skill, id: "" } : skill);
}
export const introSeen = () => Boolean(read(SKILLS, {}).introSeen);
export const markIntroSeen = () => write(SKILLS, { ...stored(), introSeen: true });

// ===== 个人资料：昵称、拍摄水平、常拍题材（都可以不填）=====
export const loadProfile = () => ({ nickname: "", level: "", topics: [], ...read(PROFILE, {}) });
export function saveProfile(patch) {
  const p = { ...loadProfile(), ...patch };
  write(PROFILE, p);
  globalThis.dispatchEvent?.(new CustomEvent("phota-profile", { detail: p }));
  return p;
}

// ===== 调用 AI 时用：挑技能、拼说明、认回答 =====
// 返回 { prompt（附在系统说明后面）, finish(reply)（把 AI 实际用到的技能放进 reply._skills）}
export function skillsFor(feature, scene = null, opts = {}) {
  const profile = loadProfile();
  const picked = pickSkills(loadSkills(), { feature, scene, profile });
  return {
    picked,
    prompt: skillsPrompt(picked, { profile, ...opts }),
    finish(reply) {
      if (reply && typeof reply === "object") reply._skills = usedSkills(reply, picked);
      return reply;
    },
  };
}
