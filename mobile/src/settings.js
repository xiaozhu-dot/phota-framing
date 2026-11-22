// 设置：整屏页面（说法见 CONTEXT.md「设置」）
//   首页是分组列表：我（个人资料）/ 伙伴 / 拍摄 / AI 模块（AI 连接、摄影技能）/ 其他
//   点一项从右边滑进子页面；左上角返回、手机返回键一层层退回去（用浏览器历史记录实现，安卓返回键会走它）
//   改了立刻生效、立刻保存；只有 AI 连接要「测试并保存」，连得上才存
import { PRESETS, isConfigured, testConnection, tokensUsed } from "./ai.js";
import { memorySummary, clearMemory } from "./memory.js";
import { setVoice, setVoiceStyle, stop as stopSpeech, onVoiceStatus } from "./voice.js";
import { speechConfig, CLOUD_MODELS } from "./cloud-voice.js";
import { COMPANIONS, companionFor } from "./companions.js";
import { FEATURES, SKILL_SCENES, LEVELS, TOPICS, BUILTIN_SKILLS, toSkillMd, parseSkillMd, skillFileName, newSkillId } from "./skills.js";
import { loadSkills, skillById, setEnabled, saveSkill, resetSkill, deleteSkill, importSkill, introSeen, markIntroSeen, loadProfile, saveProfile } from "./skill-store.js";
import { Capacitor } from "@capacitor/core";
import { loadShots } from "./shotstore.js";
import { growth, trend, MIN_GROWTH } from "./gallery-logic.js";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function setupSettings({ pet, getSettings, update, speakAs, onGuide, getMode }) {
  const dlg = $("settings");
  const pages = Object.fromEntries([...dlg.querySelectorAll(".set-page")].map((p) => [p.dataset.page, p]));
  let stack = [];                       // 当前打开的页面，从首页到最上面一层
  let openId = 0;                       // 每次打开设置换一个编号：历史记录里别的（旧的）条目一律当作「已经退出设置」
  const S = () => getSettings();

  // ===== 页面切换 =====
  // dir：1 = 往里走（新页从右边滑进来盖住旧页），-1 = 往回退（上面那页滑出去，露出下面的）
  function show(name, dir, fromName) {
    const from = pages[fromName] || null, to = pages[name];
    for (const p of Object.values(pages)) if (p !== to && p !== from) { p.hidden = true; p.classList.remove("enter", "under"); p.style.zIndex = ""; }
    RENDER[name]?.();
    to.hidden = false;
    if (dir > 0) to.querySelector(".set-scroll").scrollTop = 0;
    if (!from || from === to || reduced()) {
      if (from && from !== to) from.hidden = true;
      to.classList.remove("enter", "under");
      return;
    }
    const top = dir > 0 ? to : from, below = dir > 0 ? from : to;
    top.style.zIndex = 2; below.style.zIndex = 1;
    if (dir > 0) to.classList.add("enter"); else to.classList.add("under");
    void top.offsetWidth;                             // 先让起始位置生效，再改到终点位置，过渡动画才会播
    if (dir > 0) { to.classList.remove("enter"); from.classList.add("under"); }
    else { from.classList.add("enter"); to.classList.remove("under"); }
    setTimeout(() => {
      if (stack.at(-1) !== name) return;              // 动画还没完又切走了：交给下一次切换收拾
      from.hidden = true;
      from.classList.remove("enter", "under");
      top.style.zIndex = below.style.zIndex = "";
    }, 300);
  }
  function go(name) {                   // 往里走一层
    if (!pages[name] || stack.at(-1) === name) return;
    const from = stack.at(-1);
    stack.push(name);
    history.pushState({ setDepth: stack.length, setId: openId }, "");
    show(name, 1, from);
  }
  const back = () => history.back();    // 统一走浏览器历史：页面上的返回、手机返回键都一样
  addEventListener("popstate", (e) => {
    if (!dlg.open) return;
    const depth = e.state?.setId === openId ? e.state.setDepth : 0;
    if (depth <= 0) { stack = []; closeNow(); return; }
    if (depth >= stack.length) return;
    const leaving = stack.at(-1);
    stack.length = depth;
    LEAVE[leaving]?.();
    show(stack.at(-1), -1, leaving);
  });
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); back(); });   // 电脑上按 Esc：退一层
  dlg.querySelectorAll("[data-back]").forEach((b) => (b.onclick = back));
  dlg.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => go(b.dataset.go)));
  $("sClose").onclick = () => history.go(-stack.length);

  function open(message = "", page = null) {
    if (dlg.open) {                     // 已经开着（比如后台任务要密钥）：不打断，只在 AI 连接页提示
      if (message) { showMsg(message); if (stack.at(-1) !== "connection") go("connection"); }
      return;
    }
    stopPreview();
    stack = ["home"];
    openId = Date.now();
    history.pushState({ setDepth: 1, setId: openId }, "");
    for (const p of Object.values(pages)) { p.hidden = true; p.classList.remove("enter", "under"); }
    RENDER.home();
    pages.home.hidden = false;
    dlg.showModal();
    if (message) { go("connection"); showMsg(message); }
    else if (page) go(page);
  }
  function closeNow() {
    LEAVE[stack.at(-1)]?.();
    stopPreview();
    dlg.close();
    pet.setSpecies(S().pet);
    if (getMode() === "live") pet.sleep(!S().coachAuto);
    pet.hop(0.8);
    pet.caption(isConfigured(S()) ? `好啦，我是${pet.name}` : "还缺 AI 接口哦");
  }
  const isOpen = () => dlg.open;

  // ===== 首页：每一项下面一行小字，写着现在的设置 =====
  function renderHome() {
    const s = S(), prof = loadProfile();
    const level = LEVELS.find((l) => l.id === prof.level)?.label;
    $("sumProfile").textContent = [prof.nickname, level].filter(Boolean).join(" · ") || "未填写";
    const c = companionFor(s.pet);
    $("sumCompanion").textContent = `${c.name} · ${s.voice ? (s.voiceEngine === "cloud" ? "千问语音" : "系统语音") : "不朗读"}`;
    $("sumCoach").textContent = s.coachAuto ? `自动指导开 · 至少间隔 ${s.interval} 秒` : "自动指导关";
    $("sumConnection").textContent = `${PRESETS.find((p) => p.id === s.preset)?.name || "自定义"} · ${isConfigured(s) ? "已保存密钥" : "还没填密钥"}`;
    const skills = loadSkills();
    $("sumSkills").textContent = `${skills.filter((x) => x.enabled).length} 个开着 · 共 ${skills.length} 个`;
    $("sumMemory").textContent = `这次用了 ${(tokensUsed() / 1000).toFixed(1)}k token`;
  }

  // ===== 个人资料 =====
  function choice(label, pressed, onClick, role = "button") {
    const b = el("button", "set-choice", label);
    b.type = "button";
    if (role === "radio") { b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(pressed)); }
    else b.setAttribute("aria-pressed", String(pressed));
    b.onclick = onClick;
    return b;
  }
  function renderProfile() {
    const prof = loadProfile();
    $("pNick").value = prof.nickname || "";
    $("pLevel").replaceChildren(...LEVELS.map((l) => choice(l.label, prof.level === l.id, () => {
      saveProfile({ level: loadProfile().level === l.id ? "" : l.id });   // 再点一次 = 取消
      renderProfile();
    }, "radio")));
    $("pTopics").replaceChildren(...TOPICS.map((t) => choice(t.label, prof.topics.includes(t.id), () => {
      const cur = loadProfile().topics;
      saveProfile({ topics: cur.includes(t.id) ? cur.filter((x) => x !== t.id) : [...cur, t.id] });
      renderProfile();
    })));
  }
  $("pNick").oninput = () => saveProfile({ nickname: $("pNick").value.trim().slice(0, 12) });

  // ===== 拍照伙伴与声音 =====
  let voicePreview = 0, previewPending = false;
  const voiceStatus = $("sVoiceStatus");
  COMPANIONS.forEach((character) => {
    document.querySelector(`[data-companion="${character.id}"] .pet-portrait`).append(pet.portrait(character.id));
  });
  CLOUD_MODELS.forEach((m) => $("sVoiceModel").append(new Option(m.label, m.id)));
  function renderCompanion() {
    const s = S();
    $("sReadAloud").checked = s.voice;
    $("sVoiceEngine").value = s.voiceEngine;
    $("sVoiceModel").value = s.voiceModel;
    $("sVoiceApiKey").value = s.voiceApiKey;
    $("sVoiceRate").value = s.voiceRate;
    $("sVoiceAdvanced").open = false;
    voiceStatus.textContent = "";
    syncVoice();
  }
  function syncVoice() {
    const s = S(), cloud = s.voiceEngine === "cloud";
    $("sCloudVoice").hidden = !cloud;
    $("sLocalVoice").hidden = cloud;
    const model = CLOUD_MODELS.find((m) => m.id === s.voiceModel) || CLOUD_MODELS[0];
    $("sVoicePrice").textContent = model.price + "；重复提示优先复用。价格以平台为准。";
    const character = companionFor(s.pet);
    $("sCompanionVoice").textContent = `${character.name} · ${character.voiceLabel}`;
    $("sVoiceTest").textContent = `听听 ${character.name}`;
    $("sVoiceRateVal").textContent = Number(s.voiceRate).toFixed(2) + "×";
    document.querySelectorAll("[data-companion]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.companion === character.id)));
  }
  function stopPreview() {
    voicePreview++; previewPending = false; stopSpeech();
    $("sVoiceTest").disabled = false;
  }
  function applyVoice() {
    setVoice(S().voice);
    setVoiceStyle(speechConfig(S()));
  }
  document.querySelectorAll("[data-companion]").forEach((b) => (b.onclick = () => {
    stopPreview();
    const c = companionFor(b.dataset.companion);
    update({ pet: c.id, voiceGender: c.gender });
    pet.setSpecies(c.id);
    applyVoice(); syncVoice();
    voiceStatus.textContent = "伙伴和声音已配好，听听看";
  }));
  $("sReadAloud").onchange = () => { update({ voice: $("sReadAloud").checked }); applyVoice(); };
  $("sVoiceEngine").onchange = () => { stopPreview(); update({ voiceEngine: $("sVoiceEngine").value }); applyVoice(); syncVoice(); voiceStatus.textContent = ""; };
  $("sVoiceModel").onchange = () => { stopPreview(); update({ voiceModel: $("sVoiceModel").value }); applyVoice(); syncVoice(); };
  $("sVoiceApiKey").onchange = () => { stopPreview(); update({ voiceApiKey: $("sVoiceApiKey").value.trim() }); applyVoice(); };
  $("sVoiceRate").oninput = () => { update({ voiceRate: Number($("sVoiceRate").value) }); syncVoice(); };
  $("sVoiceRate").onchange = () => { stopPreview(); applyVoice(); };
  onVoiceStatus(({ state, message }) => {
    if (previewPending) { voiceStatus.textContent = message; voiceStatus.classList.toggle("bad", state === "error"); }
    $("tVoice").title = message;
  });
  // 用真正的拍摄提示试听；云端失败时明确报错，避免拿系统声音冒充试听
  $("sVoiceTest").onclick = async () => {
    const id = ++voicePreview;
    previewPending = true; $("sVoiceTest").disabled = true; voiceStatus.classList.remove("bad");
    let message = "试听完成。", failed = false;
    try {
      await speakAs(`你好，我是${companionFor(S().pet).name}。今天一起拍照吧。往左挪一点，留住这束光。好，就是现在。`, { flush: true, force: true, strict: true, context: "coach" });
    } catch (error) { message = error.message || "当前系统语音不可用，请换个声音再试"; failed = true; }
    finally {
      if (id === voicePreview) {
        previewPending = false; $("sVoiceTest").disabled = false;
        voiceStatus.textContent = message; voiceStatus.classList.toggle("bad", failed);
      }
    }
  };
  $("sVoiceStop").onclick = () => { stopPreview(); voiceStatus.textContent = "已停止试听"; };
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopPreview(); });

  // ===== 取景指导 =====
  function renderCoach() {
    $("sCoachAuto").checked = S().coachAuto;
    $("sInterval").value = S().interval;
    syncCoach();
  }
  function syncCoach() {
    $("sGuidanceInterval").hidden = !S().coachAuto;
    $("sIntervalVal").textContent = S().interval + " 秒";
  }
  $("sCoachAuto").onchange = () => { update({ coachAuto: $("sCoachAuto").checked }); syncCoach(); };
  $("sInterval").oninput = () => { update({ interval: Number($("sInterval").value) }); syncCoach(); };

  // ===== AI 连接：每个服务商各记一份 { baseUrl, model, apiKey }，「测试并保存」连得上才存 =====
  //   draft：这一页打开期间，在服务商之间来回切换时填了但还没保存的内容
  const f = { preset: $("sPreset"), baseUrl: $("sBaseUrl"), model: $("sModel"), apiKey: $("sApiKey") };
  PRESETS.forEach((p) => f.preset.append(new Option(p.name, p.id)));
  let draft = {}, shownPreset = null;
  const formEntry = () => ({ baseUrl: f.baseUrl.value.trim(), model: f.model.value.trim(), apiKey: f.apiKey.value.trim() });
  function fillPreset(id) {
    const p = PRESETS.find((x) => x.id === id) || {};
    const saved = draft[id] || S().saved?.[id] || {};
    f.baseUrl.value = saved.baseUrl ?? p.baseUrl ?? "";
    f.model.value = saved.model ?? p.model ?? "";
    f.apiKey.value = saved.apiKey ?? "";
    shownPreset = id;
  }
  function markSaved() {               // 下拉框里给已经存过密钥的服务商打个勾
    [...f.preset.options].forEach((o) => {
      const p = PRESETS.find((x) => x.id === o.value);
      o.text = p.name + (S().saved?.[o.value]?.apiKey ? "  ✓ 已存密钥" : "");
    });
  }
  function renderConnection() {
    const s = S();
    draft = {};
    f.preset.value = s.preset;
    fillPreset(s.preset);
    f.baseUrl.value = s.baseUrl; f.model.value = s.model; f.apiKey.value = s.apiKey;   // 当前正在用的那一组
    markSaved();
    $("sConnectionAdvanced").open = s.preset === "custom";
    $("sSaveAnyway").hidden = true;
    if (!pendingMsg) showMsg("");
    pendingMsg = false;
  }
  let pendingMsg = false;
  function showMsg(text, cls = "") { $("sMsg").textContent = text; $("sMsg").className = "s-msg" + (cls ? " " + cls : ""); if (text) pendingMsg = true; }
  f.preset.onchange = () => {
    if (shownPreset) draft[shownPreset] = formEntry();
    fillPreset(f.preset.value);
    $("sConnectionAdvanced").open = f.preset.value === "custom";
    $("sSaveAnyway").hidden = true;
    showMsg("");
  };
  const connection = () => {
    const now = formEntry();
    return { preset: f.preset.value, ...now, saved: { ...S().saved, [f.preset.value]: now } };
  };
  function saveConnection() {
    update(connection());
    markSaved();
    $("sSaveAnyway").hidden = true;
  }
  $("sTest").onclick = async () => {
    const patch = connection(), s = { ...S(), ...patch };
    if (!s.apiKey && S().saved?.[s.preset]?.apiKey) {           // 把存过的密钥清空了 = 想删掉它
      showMsg("密钥是空的。要清除这个服务商存过的密钥，点「仍然保存」。");
      $("sSaveAnyway").hidden = false;
      return;
    }
    if (!isConfigured(s)) { showMsg("密钥、接口地址、模型三项都要填", "bad"); return; }
    showMsg("测试中…");
    $("sTest").disabled = true;
    const c = document.createElement("canvas");             // 一张纯红色的小图，看模型能不能认出来
    c.width = c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "#d33"; g.fillRect(0, 0, 64, 64);
    try {
      const answer = await testConnection(s, c.toDataURL("image/png"));
      saveConnection();
      showMsg(`连接成功，已保存。模型说：${answer}`, "good");
      pet.cheer?.(1000);
    } catch (e) {
      showMsg("连接失败，还没有保存：" + e.message, "bad");
      $("sSaveAnyway").hidden = false;
    } finally { $("sTest").disabled = false; }
  };
  $("sSaveAnyway").onclick = () => { saveConnection(); showMsg(formEntry().apiKey ? "已保存（还没测试通过）。" : "已清除这个服务商的密钥。", ""); };

  // ===== 摄影技能 =====
  let editing = null, flashId = null;                  // editing：正在编辑的技能 id
  function renderSkills() {
    $("skIntro").hidden = introSeen();
    const skills = loadSkills();
    const row = (s) => {
      const r = el("div", "sk-row setting-toggle" + (s.enabled ? "" : " off"));
      r.dataset.id = s.id;
      const open = el("button", "sk-open");
      open.type = "button";
      open.append(document.createTextNode(s.name));
      if (s.edited) open.append(el("span", "sk-badge", "已修改"));
      open.append(el("small", null, s.description || "（没写什么时候用）"));
      open.onclick = () => { editing = s.id; go("skill"); };
      const sw = el("input");
      sw.type = "checkbox"; sw.setAttribute("role", "switch"); sw.checked = s.enabled;
      sw.setAttribute("aria-label", `${s.name}：${s.enabled ? "开着" : "关着"}`);
      sw.onchange = () => { setEnabled(s.id, sw.checked); r.classList.toggle("off", !sw.checked); sw.setAttribute("aria-label", `${s.name}：${sw.checked ? "开着" : "关着"}`); };
      r.append(open, sw);
      if (s.id === flashId) { r.classList.add("flash"); setTimeout(() => r.scrollIntoView({ block: "center" }), 50); }
      return r;
    };
    $("skBuiltin").replaceChildren(...skills.filter((s) => s.builtin).map(row));
    const mine = skills.filter((s) => !s.builtin);
    $("skCustom").replaceChildren(...(mine.length ? mine.map(row) : [el("p", "sk-empty", "还没有自己的技能。点下面「新建技能」写一条，或者导入别人分享的技能文件。")]));
    flashId = null;
  }
  $("skIntroOk").onclick = () => { markIntroSeen(); $("skIntro").hidden = true; };
  $("skNew").onclick = () => { editing = newSkillId(); go("skill"); };
  $("skImport").onchange = async () => {
    const files = [...$("skImport").files];
    $("skImport").value = "";
    const ok = [], bad = [];
    for (const file of files) {
      try { const s = importSkill(parseSkillMd(await file.text())); if (s) ok.push(s.name); else throw new Error("内容是空的"); }
      catch (e) { bad.push(`${file.name}：${e.message}`); }
    }
    renderSkills(); renderHomeLater();
    $("skMsg").className = "s-msg" + (bad.length ? " bad" : " good");
    $("skMsg").textContent = [ok.length && `导入了 ${ok.join("、")}`, ...bad].filter(Boolean).join("；");
  };

  // 编辑一条技能：改了就存（名称和正文都填了才存）
  function chips(host, options, selected, onChange) {
    host.replaceChildren(...options.map((o) => choice(o.label, selected.includes(o.id), () => {
      const next = selected.includes(o.id) ? selected.filter((x) => x !== o.id) : [...selected, o.id];
      onChange(next);
    })));
  }
  let form = null;                                     // 正在编辑的内容（还没存也在这里）
  function renderSkill() {
    const s = skillById(editing);
    form = s ? { ...s } : { id: editing, name: "", description: "", features: ["coach", "analysis"], scenes: [], body: "", builtin: false, enabled: true, isNew: true };
    $("skTitle").textContent = form.isNew ? "新建技能" : form.name;
    $("skOn").checked = form.enabled;
    $("skName").value = form.name; $("skWhen").value = form.description; $("skBody").value = form.body;
    syncSkillForm();
    $("skEditMsg").textContent = form.isNew ? "名称和正文都填了才会保存。" : "";
    $("skEditMsg").className = "s-msg";
  }
  function syncSkillForm() {
    chips($("skFeatures"), FEATURES, form.features, (v) => { form.features = v; syncSkillForm(); persist(); });
    chips($("skScenes"), SKILL_SCENES, form.scenes, (v) => { form.scenes = v; syncSkillForm(); persist(); });
    const builtin = BUILTIN_SKILLS.some((b) => b.id === form.id);
    $("skReset").hidden = !builtin || !skillById(form.id)?.edited;
    $("skDelete").hidden = builtin || form.isNew;
    $("skShare").hidden = form.isNew;
    $("skOn").disabled = Boolean(form.isNew);
  }
  let persistTimer = 0;
  function persist(now = false) {
    clearTimeout(persistTimer);
    const run = () => {
      const saved = saveSkill(form);
      const msg = $("skEditMsg");
      if (!saved) { msg.textContent = "名称和正文都填了才会保存。"; msg.className = "s-msg bad"; return; }
      if (form.isNew) { form.isNew = false; setEnabled(saved.id, true); }
      if (!saved.features.length) { msg.textContent = "已保存。还没选功能，这条技能暂时不会被用到。"; msg.className = "s-msg"; }
      else { msg.textContent = "已保存"; msg.className = "s-msg good"; }
      $("skTitle").textContent = saved.name;
      syncSkillForm();
    };
    if (now) run(); else persistTimer = setTimeout(run, 400);
  }
  $("skName").oninput = () => { form.name = $("skName").value; persist(); };
  $("skWhen").oninput = () => { form.description = $("skWhen").value; persist(); };
  $("skBody").oninput = () => { form.body = $("skBody").value; persist(); };
  $("skOn").onchange = () => { form.enabled = $("skOn").checked; setEnabled(form.id, form.enabled); };
  $("skReset").onclick = () => { resetSkill(form.id); renderSkill(); $("skEditMsg").textContent = "已恢复默认"; $("skEditMsg").className = "s-msg good"; };
  $("skDelete").onclick = () => {
    if (!confirm(`删除「${form.name}」？删除后不能恢复。`)) return;
    deleteSkill(form.id); form = null; back();
  };
  $("skShare").onclick = async () => {
    persist(true);
    const s = skillById(form.id);
    if (!s) return;
    const name = skillFileName(s), text = toSkillMd(s);
    try {
      if (Capacitor.isNativePlatform()) {
        const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
        await Share.share({ title: `Phota 摄影技能：${s.name}`, text: `Phota 摄影技能「${s.name}」，在 设置 → 摄影技能 → 导入技能文件`, files: [uri], dialogTitle: "分享技能文件" });
      } else {
        const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type: "text/markdown" })), download: name });
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
    } catch (e) {
      if (!/cancel/i.test(e.message || "")) { $("skEditMsg").textContent = "分享失败：" + e.message; $("skEditMsg").className = "s-msg bad"; }
    }
  };
  // 点结果旁边的 📖 标签：打开设置，直接到那条技能
  addEventListener("phota-open-skill", (e) => {
    const id = e.detail?.id;
    if (!skillById(id)) return;
    if (!dlg.open) open("", "skills"); else if (stack.at(-1) !== "skills") go("skills");
    editing = id; go("skill");
  });

  // ===== 成长与用量 =====
  // 成长曲线：相册里每张分析过的照片的分数，按分析的先后连成一条线
  async function renderGrowth() {
    const box = $("sGrowth"), note = $("sTrend");
    let pts = [];
    try { pts = growth(await loadShots()); } catch { /* 读不到相册就当没有 */ }
    if (pts.length < MIN_GROWTH) {
      box.innerHTML = `<div class="growth-empty">分析过 ${MIN_GROWTH} 张以上才画曲线<br><small>现在 ${pts.length} 张 · 在相册点开大图，点「分析」</small></div>`;
      note.textContent = "";
      return;
    }
    pts = pts.slice(-30);                                                   // 最多画最近 30 次
    const W = 300, H = 130, L = 22, R = 8, T = 10, B = 18;
    const x = (i) => L + (pts.length === 1 ? 0 : (i * (W - L - R)) / (pts.length - 1));
    const y = (v) => T + ((10 - Math.max(0, Math.min(10, v))) * (H - T - B)) / 10;
    const grid = [0, 5, 10].map((v) => `<line class="g-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join("");
    const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join("");
    const dots = pts.map((p, i) => `<circle class="g-dot${i === pts.length - 1 ? " g-last" : ""}" cx="${x(i).toFixed(1)}" cy="${y(p.score).toFixed(1)}" r="3"><title>${new Date(p.at).toLocaleDateString("zh-CN")} · ${p.score} 分</title></circle>`).join("");
    const day = (at) => { const d = new Date(at); return `${d.getMonth() + 1}/${d.getDate()}`; };
    const ends = `<text x="${L}" y="${H - 4}">${day(pts[0].at)}</text><text x="${W - R}" y="${H - 4}" text-anchor="end">${day(pts.at(-1).at)}</text>`;
    box.innerHTML = `<svg class="growth-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="照片分数变化，共 ${pts.length} 次">${grid}<path class="g-line" d="${path}"/>${dots}${ends}</svg>`;
    const d = trend(pts);
    const avg = (pts.reduce((a, p) => a + p.score, 0) / pts.length).toFixed(1);
    note.textContent = d == null ? `共 ${pts.length} 次 · 平均 ${avg} 分 · 再多分析几张就能看出进步`
      : `共 ${pts.length} 次 · 平均 ${avg} 分 · 最近 3 次比最早 3 次${d > 0 ? `高了 ${d} 分，在进步` : d < 0 ? `低了 ${-d} 分，别急，换个场景试试` : "持平"}`;
  }
  function renderMemory() {
    renderGrowth();
    $("sMemory").textContent = memorySummary();
    $("sUsage").textContent = `这次打开 App 以来用了 ${(tokensUsed() / 1000).toFixed(1)}k token`;
  }
  $("sForget").onclick = () => { clearMemory(); renderMemory(); };
  $("sGuide").onclick = () => { history.go(-stack.length); setTimeout(onGuide, 400); };

  // 回到首页时更新小字；离开编辑页时把没存的存掉
  const renderHomeLater = () => { if (stack.includes("home")) renderHome(); };
  const RENDER = { home: renderHome, profile: renderProfile, companion: renderCompanion, coach: renderCoach, connection: renderConnection, skills: renderSkills, skill: renderSkill, memory: renderMemory };
  const LEAVE = {
    skill: () => { if (form && !form.isNew) persist(true); clearTimeout(persistTimer); if (form) flashId = form.id; },
    companion: stopPreview,
  };

  return { open, isOpen };
}
