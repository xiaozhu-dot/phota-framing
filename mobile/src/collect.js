// 收集版：顶部的「标注」页 + 指导回合记录 + 导出文件
//   只有 node scripts/build.mjs --collect 打出来的包才会用到这个文件；正式版打包时整个被剔除
//   流程：指导后按快门 → 回合在后台攒着（标签上显示数字），离开拍摄页或停拍 5 分钟时提醒 → 答题 / 跳过
//         → 追加进底稿，并重写手机「文档/Phota数据」里的导出文件
//   指导前画面：只存在 App 内部；跳过就删，提交时附图则留小图，7 天没标自动当跳过并删图
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { PORTRAIT_PROMPT_VERSION } from "./portrait-prompt.js";
import { createRoundTracker } from "./collect-round.js";
import { QUESTIONS, STEP_MARKS, finishRound, markableSteps, canBlind } from "./collect-questions.js";
import { sceneLabel } from "./scenes.js";
import { buildExportHtml, exportFileName, EXPORT_SCHEMA } from "./collect-export.js";
import { loadRounds, saveRound, clearRounds, loadProfile, saveProfile, renameProfile } from "./collect-store.js";
import { loadProfile as loadUserProfile, saveProfile as saveUserProfile } from "./skill-store.js";

const FOLDER = "Phota数据";
const EXPIRE_MS = 7 * 24 * 3600 * 1000;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const time = (t) => new Date(t).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// 缩成长边 side 的小图（导出文件里的附图）。指导前画面和成片都用 512，盲选时公平
function thumb(source, side = 512) {
  const s = Math.min(1, side / Math.max(source.width, source.height));
  const c = document.createElement("canvas");
  c.width = Math.round(source.width * s); c.height = Math.round(source.height * s);
  c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}

const CSS = `
#annotate { display: none; padding: 22px 16px 120px; max-width: 720px; margin: 0 auto; }
body[data-mode="annotate"] #annotate { display: block; }
#petDockAnnotate { height: 0; }
#petDockAnnotate .pet { position: fixed; right: -46px; bottom: calc(env(safe-area-inset-bottom, 0px) - 8px); z-index: 40; transform: scale(.42); transform-origin: 100% 100%; }
#petDockAnnotate .pet .cap { display: none; }
#annotate h2 { margin: 0 0 4px; font: 500 22px/1.3 var(--font-sans); }
#annotate h3 { margin: 22px 0 6px; font: 500 12px/16px var(--font-mono); letter-spacing: .08em; color: var(--ink-3); text-transform: uppercase; }
#annotate .muted { color: var(--ink-3); font-size: 13px; margin: 0; }
#annotate .card { border: var(--stroke-hairline) solid var(--line); border-radius: var(--radius-sm); background: var(--surface-1); padding: 12px; margin: 10px 0; }
#annotate .row { display: flex; gap: 10px; align-items: center; }
#annotate .row img { width: 56px; height: 56px; object-fit: cover; border-radius: var(--radius-xs); background: #000; }
#annotate .row .grow { flex: 1; min-width: 0; }
#annotate .row .grow p { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#annotate fieldset { border: 0; padding: 0; margin: 14px 0 0; }
#annotate legend { padding: 0; margin-bottom: 6px; font-size: 14px; color: var(--ink-1); }
#annotate .opts { display: flex; flex-wrap: wrap; gap: 6px; }
#annotate .opts label { position: relative; }
#annotate .opts input { position: absolute; opacity: 0; }
#annotate .opts span { display: block; padding: 8px 12px; min-height: 20px; border: var(--stroke-hairline) solid var(--line-strong); border-radius: var(--radius-sm); font-size: 14px; cursor: pointer; }
#annotate .opts input:checked + span { background: var(--amber-soft); border-color: var(--amber); color: var(--amber-text); }
#annotate .opts input:focus-visible + span { outline: var(--stroke-bracket) solid var(--focus-ring); }
#annotate .say { margin: 6px 0 0; padding: 8px 12px; border-left: var(--stroke-bracket) solid var(--amber); background: var(--surface-2); font-size: 15px; }
#annotate .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
#annotate figure { margin: 0; }
#annotate figure img { width: 100%; aspect-ratio: 3 / 4; object-fit: cover; display: block; border-radius: var(--radius-xs); background: #000; }
#annotate figcaption { font: 12px/20px var(--font-mono); color: var(--ink-3); }
#annotate .picks { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
#annotate .picks span { padding: 0; overflow: hidden; }
#annotate .picks img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
#annotate textarea, #annotate input[type=text] { width: 100%; box-sizing: border-box; margin-top: 6px; padding: 10px; border: var(--stroke-hairline) solid var(--line-strong);
  border-radius: var(--radius-sm); background: var(--surface-0); color: var(--ink-1); font: 15px/1.5 var(--font-sans); }
#annotate textarea { min-height: 80px; }
#annotate .check { display: flex; gap: 8px; align-items: center; margin-top: 14px; font-size: 14px; }
#annotate .btns { display: flex; gap: 10px; margin-top: 18px; }
#annotate .msg { min-height: 20px; margin: 10px 0 0; font-size: 13.5px; color: var(--ink-3); }
#annotate .msg.bad { color: var(--signal-alert); } #annotate .msg.good { color: var(--signal-good); }
#annotate .tag { font: 11px/16px var(--font-mono); color: var(--amber-text); }
#annotate .step { margin-top: 12px; }
#annotate .pair figure { position: relative; }
#annotate .pair figure b { position: absolute; left: 6px; top: 6px; font: 500 12px/20px var(--font-mono); padding: 0 6px; background: rgba(0,0,0,.6); color: #fff; border-radius: var(--radius-xs); }
.seg .c-badge { display: inline-block; min-width: 16px; height: 16px; margin-left: 4px; padding: 0 4px; box-sizing: border-box; border-radius: 8px;
  background: var(--amber); color: #1a1714; font: 500 11px/16px var(--font-mono); text-align: center; vertical-align: 1px; }
.seg .c-badge[hidden] { display: none; }
.c-remind { position: fixed; left: 16px; right: 16px; bottom: calc(env(safe-area-inset-bottom) + 112px); z-index: 30; display: flex; gap: 8px; align-items: center;
  max-width: 480px; margin: 0 auto; padding: 10px 12px; border: var(--stroke-hairline) solid var(--line-strong); border-radius: var(--radius-sm);
  background: var(--surface-1); color: var(--ink-1); font-size: 14px; box-shadow: 0 6px 24px rgba(0,0,0,.35); }
.c-remind[hidden] { display: none; }
.c-remind span { flex: 1; }
`;

export function setupCollect({ setMode }) {
  const $ = (id) => document.getElementById(id);
  const pet = window.pet;
  document.head.append(Object.assign(document.createElement("style"), { textContent: CSS }));
  const nav = document.querySelector(".seg");
  const tab = Object.assign(document.createElement("button"), { innerHTML: `标注<span class="c-badge" id="cBadge" hidden></span>` });
  tab.dataset.mode = "annotate";
  nav.append(tab);
  const page = Object.assign(document.createElement("section"), { id: "annotate" });
  page.innerHTML = `<div id="cBody"></div><div id="petDockAnnotate"></div>`;
  $("album").after(page);
  const remind = Object.assign(document.createElement("div"), { className: "c-remind", hidden: true });
  remind.innerHTML = `<span id="cRemindText"></span><button class="chip-btn strong" id="cRemindGo">去标注</button><button class="chip-btn" id="cRemindLater">等会儿</button>`;
  document.body.append(remind);

  let profile = loadProfile(), rounds = [], editing = null, writing = Promise.resolve(), remindTimer = 0;
  // 昵称只有一个：和设置 → 个人资料里的是同一个
  if (profile?.nickname && !loadUserProfile().nickname) saveUserProfile({ nickname: profile.nickname });
  addEventListener("phota-profile", (e) => { if (profile && e.detail.nickname) profile = renameProfile(e.detail.nickname); });
  const body = $("cBody");
  const pendingCount = () => rounds.filter((r) => r.status === "pending").length;
  function syncBadge() {
    const n = pendingCount();
    $("cBadge").hidden = !n;
    $("cBadge").textContent = n;
  }
  // 提醒去标注：不打断拍摄，只在离开拍摄页或停拍 5 分钟时出现
  function showReminder() {
    const n = pendingCount();
    if (!n || !profile || document.body.dataset.mode === "annotate") return;
    $("cRemindText").textContent = `有 ${n} 次拍摄等你标注，每次大约 30 秒`;
    remind.hidden = false;
    clearTimeout(remindTimer);
    remindTimer = setTimeout(() => (remind.hidden = true), 12000);
  }
  $("cRemindGo").onclick = () => { remind.hidden = true; setMode("annotate"); };
  $("cRemindLater").onclick = () => (remind.hidden = true);

  const tracker = createRoundTracker({
    newId: () => crypto.randomUUID(),
    onEnd: async (r) => {
      const round = { ...r, schema: EXPORT_SCHEMA, status: "pending", rater: profile && { nickname: profile.nickname, id: profile.id },
        app: { build: "collect", version: PHOTA_VERSION, prompt: r.steps.find((s) => s.prompt)?.prompt ?? PORTRAIT_PROMPT_VERSION }, device: navigator.userAgent };
      await saveRound(round);
      rounds = await loadRounds();
      syncBadge();
      if (r.endReason === "idle") showReminder();
    },
  });
  document.addEventListener("visibilitychange", () => (document.hidden ? tracker.hidden() : tracker.visible()));
  setInterval(() => tracker.tick(), 15000);

  // ===== 给拍摄页用的钩子 =====
  //   guidance：每次 AI 回答（或失败）都记一步；回合的第一步顺便存下指导前画面
  const hooks = {
    restart: () => tracker.restart(),
    leave: () => tracker.leave(),
    switchCamera: () => tracker.switchCamera(),
    scene: (next) => tracker.scene(next),
    guidance({ result, error, ms, canvas, scene, prompt, selfie }) {
      const r = result && JSON.parse(JSON.stringify({ status: result.status, hint: result.hint, plan: result.plan && { title: result.plan.title, why: result.plan.why },
        action: result.action, observation: result.observation, issues: result.issues, progress: result.progress?.state, score: result.score, skills: result.skills }));
      const cur = tracker.current();
      const fresh = !cur || cur.shots.length || (scene && cur.scene && cur.scene !== scene);
      tracker.guidance({ ...(r || { error: String(error || "没有回应").slice(0, 120) }), scene, prompt, ms, ...(selfie ? { selfie } : {}), frame: canvas ? thumb(canvas, 320) : undefined },
        fresh && canvas ? thumb(canvas) : undefined);
    },
    shot: ({ canvas, name }) => tracker.shot({ name, thumb: thumb(canvas) }),
  };

  // ===== 导出文件 =====
  const fileName = () => exportFileName(profile);
  const exportHtml = () => buildExportHtml({ profile, rounds: rounds.filter((r) => r.status !== "pending"), exportedAt: Date.now() });
  // 每次标注后重写手机里的那份（排队写，避免两次同时写）
  function writeCopy() {
    if (!Capacitor.isNativePlatform() || !profile) return writing;
    writing = writing.then(() => Filesystem.writeFile({ path: `${FOLDER}/${fileName()}`, data: exportHtml(), directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true }))
      .catch((e) => console.warn("写导出文件失败", e));
    return writing;
  }
  async function share() {
    pet.hold("envelope");                                   // 拿着信封送出去
    setTimeout(() => pet.hold(null), 2200);
    const html = exportHtml();
    if (!Capacitor.isNativePlatform()) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      a.download = fileName(); a.click();
      return setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    const { uri } = await Filesystem.writeFile({ path: fileName(), data: html, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: "Phota 收集数据", text: "Phota 收集数据 · 用浏览器打开", files: [uri], dialogTitle: "发送导出文件" });
  }

  // ===== 页面 =====
  const COMPARE = { after: "指导后更好", before: "指导前更好", same: "差不多", unsure: "说不清" };
  function render() {
    syncBadge();
    remind.hidden = true;
    if (!profile) return renderConsent();
    const open = editing && rounds.find((r) => r.id === editing);
    if (open) return renderForm(open);
    const pending = rounds.filter((r) => r.status === "pending"), skipped = rounds.filter((r) => r.status === "skipped"),
          done = rounds.filter((r) => r.status === "done");
    const item = (r, label) => {
      const pic = r.shots.find((s) => s.thumb)?.thumb || r.before || r.steps.find((s) => s.frame)?.frame;
      const last = [...r.steps].reverse().find((s) => !s.error && s.status !== "ready") || r.steps.find((s) => !s.error);
      return `<div class="card row">${pic ? `<img src="${pic}" alt="">` : ""}<div class="grow"><p>${esc(last?.hint || "—")}</p>
        <p class="muted">${time(r.startedAt)} · ${esc(sceneLabel(r.sceneFixed || r.scene))} · ${r.shotCount ?? r.shots.length} 张${r.compare ? " · " + COMPARE[r.compare] : ""}${r.skipReason === "expired" ? " · 超过 7 天" : ""}</p></div>
        <button class="chip-btn" data-open="${r.id}">${label}</button></div>`;
    };
    const kept = rounds.filter((r) => r.status !== "pending");
    const size = new Blob([exportHtml()]).size;
    body.innerHTML = `<h2>标注</h2><p class="muted">${esc(profile.nickname)} · 编号 ${profile.id}</p>
      ${pending.length ? `<h3>待标注</h3>${pending.map((r) => item(r, "开始标注")).join("")}` : ""}
      ${!rounds.length ? `<p class="muted" style="margin-top:18px">还没有记录。去拍摄页，按 AI 的指导拍一张，这里就会出现题目。拍摄时不会打断你。</p>` : ""}
      ${skipped.length ? `<h3>跳过的回合</h3>${skipped.map((r) => item(r, "补标")).join("")}` : ""}
      ${done.length ? `<h3>已标注</h3>${done.map((r) => item(r, "修改")).join("")}` : ""}
      <h3>导出</h3><div class="card"><p>共 ${kept.length} 条（已标注 ${done.length}）· 约 ${size < 1048576 ? Math.ceil(size / 1024) + " KB" : (size / 1048576).toFixed(1) + " MB"}</p>
      <p class="muted">文件也保存在手机「文档 / ${FOLDER} / ${esc(fileName())}」。只有你点下面的按钮才会发出去。</p>
      <div class="btns"><button class="btn primary" id="cShare" ${kept.length ? "" : "disabled"}>分享导出文件</button><button class="btn" id="cClear" ${rounds.length ? "" : "disabled"}>清空</button></div>
      <p class="msg" id="cMsg"></p></div>`;
    body.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => { editing = b.dataset.open; render(); scrollTo({ top: 0 }); }));
    $("cShare").onclick = () => share().catch((e) => { if (!/cancel/i.test(e.message || "")) msg("分享失败：" + e.message, "bad"); });
    let armed = 0;
    $("cClear").onclick = async () => {
      if (++armed === 1) return msg("清空后不能恢复。确定的话，再点一次「清空」。", "bad");
      if (armed === 2) { $("cClear").textContent = "最后确认：清空全部"; return msg("真的要删除全部记录吗？再点一次就清空。", "bad"); }
      await clearRounds(); rounds = []; await writeCopy(); render();
    };
  }
  const msg = (text, cls = "") => { const m = $("cMsg"); if (m) { m.textContent = text; m.className = "msg " + cls; } };

  function renderConsent() {
    body.innerHTML = `<h2>欢迎使用 Phota 收集版</h2>
      <div class="card"><p>这一版会在你按 AI 指导拍照后，请你回答几道题（大约 30 秒，可以跳过）。拍摄时不会打断你，题目攒在「标注」页里。</p>
      <p>会记录：AI 说的话、你的回答、指导前的取景画面和你选择附上的小图。全部只存在你的手机里，只有你自己点「分享」才会发出去。指导前画面不会进相册，标完就清理。</p>
      <p><b>照片里有别人的话，请先征得对方同意再附图。</b></p></div>
      <label>你的昵称（方便认出是谁标的）<input type="text" id="cNick" maxlength="12" placeholder="比如：小王" value="${esc(loadUserProfile().nickname)}"></label>
      <div class="btns"><button class="btn primary" id="cStart" ${loadUserProfile().nickname ? "" : "disabled"}>开始</button></div>`;
    $("cNick").oninput = () => ($("cStart").disabled = !$("cNick").value.trim());
    $("cStart").onclick = () => { profile = saveProfile($("cNick").value.trim()); saveUserProfile({ nickname: profile.nickname }); setMode("live"); render(); dispatchEvent(new Event("phota-consent")); };   // 填完昵称：开始新手引导
  }

  function radios(name, q, value, hidden = false) {
    const stars = q.type === "stars";
    return `<fieldset data-q="${name}"${hidden ? " hidden" : ""}><legend>${esc(q.title)}</legend><div class="opts">${q.options.map((o) =>
      `<label><input type="radio" name="q-${name}" value="${esc(o)}"${o === value ? " checked" : ""}><span>${stars ? "★".repeat(+o) : esc(o)}</span></label>`).join("")}</div></fieldset>`;
  }

  async function renderForm(r) {
    // 盲选的左右顺序第一次打开时随机定下并存起来，之后修改也保持一样
    if (canBlind(r) && !r.blindLeft) { r = { ...r, blindLeft: Math.random() < 0.5 ? "before" : "after" }; await saveRound(r); rounds = await loadRounds(); }
    const a = { scene: sceneLabel(r.sceneFixed || r.scene), ...(r.answers || {}) }, steps = r.steps, marks = markableSteps(r);
    const withThumb = r.shots.filter((s) => s.thumb), blind = Boolean(r.blindLeft) && canBlind(r);
    let best = r.best ?? (r.shots.length - 1);
    const ctx = { blind, steps: marks };
    const qs = (part) => QUESTIONS.filter((q) => q.part === part).map((q) => radios(q.key, q, a[q.key], Boolean(q.when) && !q.when(a, ctx))).join("");
    const stepHtml = marks.map((i, n) => `<div class="step"><p class="say">${n + 1}. ${esc(steps[i].hint)}</p>
      ${radios("mark" + i, { title: "这一步", options: STEP_MARKS }, a.steps?.[i])}</div>`).join("");
    const hasImages = Boolean(r.before || withThumb.length);
    body.innerHTML = `<h2>${r.status === "done" ? "修改标注" : "标注这次拍摄"}</h2>
      <p class="muted">${time(r.startedAt)} · ${esc(sceneLabel(r.scene))} · 指导 ${steps.length} 步 · 拍了 ${r.shotCount ?? r.shots.length} 张 · 大约 30 秒</p>
      ${withThumb.length > 1 && r.status === "pending" ? `<fieldset><legend>先选出最满意的一张</legend><div class="opts picks">${r.shots.map((s, i) =>
        `<label><input type="radio" name="best" value="${i}"${i === best ? " checked" : ""}><span><img src="${s.thumb}" alt="第 ${i + 1} 张"></span></label>`).join("")}</div></fieldset>` : ""}
      ${blind ? `<h3>前后盲选</h3><p class="muted">一张是 AI 指导前的取景画面，一张是你拍下的。不告诉你哪张是哪张，凭感觉选。</p>
        <div class="pair"><figure><img id="cLeft" alt="左边"><b>左</b></figure><figure><img id="cRight" alt="右边"><b>右</b></figure></div>${qs("compare")}`
        : r.compare ? "" : `<p class="muted">这条记录没有图，不做盲选。</p>`}
      ${marks.length ? `<h3>每一步指导</h3>${stepHtml}` : ""}
      <h3>成片</h3>${qs("shot")}
      <h3>整体</h3>${qs("overall")}${qs("scene")}
      <label class="text" style="display:block;margin-top:16px">文字点评（选填）<textarea id="cComment" placeholder="哪里好、哪里不好、AI 哪句话不对">${esc(r.comment)}</textarea></label>
      <label class="check"><input type="checkbox" id="cAttach" ${hasImages && r.attach !== false ? "checked" : ""} ${hasImages ? "" : "disabled"}>附上照片（指导前的画面和最满意的一张）</label>
      <p class="msg" id="cMsg"></p>
      <div class="btns"><button class="btn" id="cSkip">${r.status === "pending" ? "跳过" : "返回"}</button><button class="btn primary" id="cSubmit">提交</button></div>`;

    const answers = { ...a, steps: { ...(a.steps || {}) } };
    const sync = () => {
      body.querySelectorAll("fieldset[data-q]").forEach((f) => { const q = QUESTIONS.find((q) => q.key === f.dataset.q); if (q?.when) f.hidden = !q.when(answers, ctx); });
      if (blind) {
        const after = r.shots[best]?.thumb || withThumb.at(-1)?.thumb;
        const [l, rt] = r.blindLeft === "before" ? [r.before, after] : [after, r.before];
        $("cLeft").src = l; $("cRight").src = rt;
      }
    };
    body.querySelectorAll("input[type=radio]").forEach((i) => (i.onchange = () => {
      const key = i.name.slice(2);
      if (i.name === "best") best = +i.value;
      else if (/^mark\d+$/.test(key)) answers.steps[key.slice(4)] = i.value;
      else answers[key] = i.value;
      if (key === "blind") pet.coverEyes(false);            // 选完了才睁眼
      sync();
    }));
    sync();
    pet.coverEyes(blind && !answers.blind);                   // 前后盲选：宠物捂住眼睛，表示它也不偷看
    const close = () => { pet.coverEyes(false); editing = null; render(); scrollTo({ top: 0 }); };
    $("cSkip").onclick = async () => {
      if (r.status !== "pending") return close();
      await store(finishRound(r, { skip: true }));
      close();
    };
    $("cSubmit").onclick = async () => {
      try {
        const done = finishRound(r, { answers, comment: $("cComment").value, best: Math.min(best, Math.max(0, r.shots.length - 1)), attach: $("cAttach").checked });
        await store(done);
        close();
        pet.hold("bag"); pet.propFill(1);                  // 把这一回合装进袋子
        setTimeout(() => { pet.hold(null); pet.nod(); }, 1300);
        msg("已保存，导出文件也更新了", "good");
      } catch (e) {
        msg(e.message.startsWith("还有题") ? "还有题没答完，往上翻看看" : e.message, "bad");
        [...body.querySelectorAll("fieldset[data-q]:not([hidden])")].find((f) => !f.querySelector("input:checked"))
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
  }
  async function store(round) {
    await saveRound({ ...round, rater: round.rater || { nickname: profile.nickname, id: profile.id } });   // 同意前拍的回合，提交时补上标注人
    rounds = await loadRounds();
    syncBadge();
    await writeCopy();
  }

  // 7 天没标的回合：自动当作跳过，图片删掉
  loadRounds().then(async (list) => {
    const old = list.filter((r) => r.status === "pending" && Date.now() - (r.endedAt ?? r.startedAt) > EXPIRE_MS);
    for (const r of old) await saveRound(finishRound(r, { skip: true, expired: true }));
    rounds = old.length ? await loadRounds() : list;
    if (old.length) writeCopy();
    syncBadge();
    if (document.body.dataset.mode === "annotate") render();
  });

  return {
    mode: "annotate", dock: "petDockAnnotate", caption: "拍完的回合在这里标注",
    hooks,
    ready: () => Boolean(profile),
    remind: showReminder,
    render: () => { if (!editing) editing = rounds.find((r) => r.status === "pending")?.id ?? null; render(); },
  };
}
