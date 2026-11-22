// 实时取景：相机画面 + 三分线 + 陀螺仪水平仪 + 实时亮度 + 缩放 / 比例 / 清晰度 + AI 教练
// 教练是一个有记忆、会自己判断时机的 agent：
//   短期记忆：记得最近几次说过什么，看得出你有没有照着做（画面变化 + 她的判断），做到了会夸你，没做到会换个说法
//   长期记忆：知道你平时常犯什么错（memory.js）
//   时机（智能模式）：画面明显变了、而且你已经停稳了，才看一眼；画面没变就不问 —— 不再傻傻地每隔几秒问一次
//   手动：点"指导"或者点宠物，随时问
import { coach, isConfigured, portraitCoach, portraitSettings, COACH_PROMPT_VERSION } from "./ai.js";
import { PORTRAIT_PROMPT_VERSION } from "./portrait-prompt.js";
import { classifyScene, createSceneSmoother, detect } from "./scene-detect.js";
import { sceneLabel } from "./scenes.js";
import { onceToday } from "./once.js";
import { createPortraitSession } from "./portrait-coach.js";
import { stop as stopSpeech, setVoice } from "./voice.js";
import { memoryText } from "./memory.js";
import { exposureStats, toDataURL } from "./vision.js";
import { channel } from "./bubbles.js";
import { createCamera, RATIOS, QUALITY } from "./camera.js";
import { saveToGallery } from "./gallery.js";
import { decide } from "./coach-logic.js";
import { setupPro } from "./pro.js";
import { placeSkillChip } from "./skill-ui.js";

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ARROWS = { left: "←", right: "→", raise: "↑", lower: "↓", closer: "＋", back: "－", wait: "…", shoot: "●" };
const next = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];

export function setupLive({ settings, saveSetting, speakAs, onShot, openSettings, collect = null }) {   // collect：只有收集版才传，记录出片回合
  const pet = window.pet;
  const talk = channel({ scroll: false });
  let active = false, loopId = 0, abort = null, asking = false, capturing = false;
  let roll = null;               // 手机相对水平面的倾斜角（顺时针为正）
  let pitch = null;              // 手机仰 / 俯的角度（镜头朝上为正）
  let quarter = 0;               // 手机横过来拿时，拍到的画面要转几个 90°
  let lastSpoken = { move: null, at: 0 }, bright = null, expo = null, shots = 0;   // lastSpoken：上一句念出来的指导
  // 短期记忆 & 画面变化
  let history = [];              // 最近几次指导 { hint, move, score, at }
  let askSig = null;             // 上次提问时画面的"指纹"
  let prevSig = null, stableSince = 0, lastAskAt = 0;
  const portrait = createPortraitSession();
  let requestRevision = 0, portraitEpoch = 0, lastZoom = 1;
  // 场景：手机本地识别（scene-detect.js）。人像走出片指导（DeepSeek），其他场景走构图指导（带场景说明）
  const smoother = createSceneSmoother(3);
  let sceneForced = false;
  const scene = () => smoother.scene;
  const isPortrait = () => scene() === "portrait";
  function invalidate({ reset = false } = {}) {
    requestRevision++;
    abort?.abort(); abort = null; asking = false;
    talk.cancel(); stopSpeech();
    $("askBtn").classList.remove("busy"); $("coach").classList.remove("busy");
    $("liveShutter").classList.remove("ready"); $("arrow").classList.remove("show");
    $("coachSet").hidden = true;
    askSig = prevSig = null; stableSince = performance.now();
    if (reset) { portraitEpoch++; portrait.reset(); }
    if (active) pet.mode("idle");
    pet.holdBreath(false);
  }
  function geometryChanged() {
    invalidate({ reset: !capturing && portrait.snapshot().phase !== "shot" });
    if (isPortrait()) renderPortrait();
  }

  // 画面指纹：缩成 32 像素宽的灰度小图。两张指纹的平均差异 = 画面变化有多大（0~1）
  function signature() {
    const c = cam.frame(32);
    const d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
    const g = new Float32Array(d.length / 4);
    for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
    return g;
  }
  function difference(a, b) {
    if (!a || !b || a.length !== b.length) return 1;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    return s / a.length;
  }
  const changeWords = (d) => (d > 0.12 ? "明显变了" : d > 0.05 ? "有一点变化" : "几乎没变");

  let focusBox = null, focusTimer = 0;
  const cam = createCamera({
    video: $("video"), box: $("vf"), wrap: $("vfWrap"),
    onZoom: (z, r) => renderZoom(z, r),
    onReopen: () => pro.attach(),                                      // 摄像头重开后，把专业参数（或全自动）重新设置一遍
    onTap: (x, y, e) => {                                              // 点哪儿对焦哪儿：画个对焦框，宠物也转头看过去
      focusBox?.remove();                                              // 画面上永远只有一个对焦框：换对焦时旧框立刻消失
      clearTimeout(focusTimer);
      const f = document.createElement("div");
      f.className = "focus";
      f.style.left = x + "px";
      f.style.top = y + "px";
      $("vf").append(f);
      focusBox = f;
      focusTimer = setTimeout(() => { f.remove(); if (focusBox === f) focusBox = null; }, 1000);   // 和对焦框动画一样长
      pet.lookAt({ x: e.clientX, y: e.clientY }, 1400);
    },
  });
  const previewControls = [document.querySelector(".vf-top"), $("coach"), document.querySelector(".zoom")];
  // 移动原控件以保留事件和状态；普通模式按原位置还原。
  const controlHomes = previewControls.map((control) => {
    const anchor = document.createComment("preview control");
    control.before(anchor);
    return anchor;
  });
  // 面板标签：出片 + PRO 时，面板里一次只显示"拍法"或"参数"中的一个（取景框大小不变）
  let deckTab = "plan";
  function showDeckTab(tab) {
    deckTab = tab;
    syncProLayout(pro.on);
  }
  $("tabPlan").onclick = () => showDeckTab("plan");
  $("tabPro").onclick = () => showDeckTab("pro");
  const tabsHome = document.createComment("deck tabs");
  $("deckTabs").before(tabsHome);
  function syncProLayout(on) {
    const portraitOn = isPortrait(), deckOn = on || portraitOn, both = on && portraitOn;
    $("live").classList.toggle("pro-mode", on);
    $("live").classList.toggle("portrait-mode", portraitOn);
    $("live").classList.toggle("deck-on", deckOn);
    $("live").classList.toggle("deck-both", both);
    $("deck").hidden = $("proTop").hidden = !deckOn;
    $("deckTabs").hidden = !both;
    const tab = both ? deckTab : on ? "pro" : "plan";
    $("portraitPanel").hidden = !portraitOn || tab !== "plan";
    $("pro").hidden = !on || tab !== "pro";
    $("tabPlan").setAttribute("aria-selected", String(tab === "plan"));
    $("tabPro").setAttribute("aria-selected", String(tab === "pro"));
    if (tab === "plan") $("tabPlan").classList.remove("new");
    previewControls.forEach((control, i) => {
      if (isPortrait() && i === 1) $("portraitInstruction").append(control);
      else if (both && i === 2) document.querySelector(".vf-top .fmt").before(control);
      else if (on || isPortrait()) $(i === 0 ? "proTop" : "proPreviewTools").append(control);
      else controlHomes[i].after(control);
    });
    if (both) $("proPreviewTools").append($("deckTabs")); else tabsHome.after($("deckTabs"));
    $("tPro").classList.toggle("on", on);
    $("tPro").setAttribute("aria-pressed", String(on));
  }
  const pro = setupPro({ cam, getFrame: () => cam.frame(512, quarter), onState: syncProLayout, getScene: () => scene() });
  $("tPro").onclick = () => { if (!pro.on) deckTab = "pro"; pro.toggle(); };   // 刚打开 PRO：面板先显示参数
  $("proAsk").onclick = () => pro.ask(settings(), openSettings);
  function syncCoachMode() {
    const on = isPortrait();
    if (on) deckTab = "plan";                                           // 刚到人像：面板先显示拍法
    syncProLayout(pro.on);
    $("sceneTag").textContent = sceneLabel(scene());
    $("sceneTag").dataset.scene = scene();
    $("hudScore").textContent = "—"; $("scoreRing").style.setProperty("--p", 0);
    $("hudSubject").textContent = on ? "出片参考" : "构图";
    if (on) renderPortrait();
    else { $("coachText").textContent = "点我要一次指导"; $("coachText").classList.add("landed"); }
  }
  // 自拍：拿手机的就是模特本人，指导直接对"你"说（AI 那边也会收到说明，只给自拍做得到的动作）
  const selfie = () => cam.facing === "user";
  const say = (hint) => (selfie() && hint ? String(hint).replace(/^(摄影师|模特)：/, "").replace(/模特|摄影师/g, "你") : hint);
  const SELFIE_NOTE = "自拍：前置摄像头，画面是镜像，和用户屏幕上看到的一样。拿手机的人就是模特本人。摄影师动作只能是手机举高/放低/拉近拉远/转动角度，不要让人横走绕到别处，也不要让人放下手机去拿东西。";
  async function flipCamera() {
    if (capturing || !cam.ready) return;
    invalidate({ reset: true }); history = [];
    collect?.switchCamera();
    try { await cam.flip(); } catch (e) { toast("切换摄像头失败：" + (e.message || e)); return; }
    smoother.set(selfie() ? "portrait" : "landscape");                // 自拍直接按人像；换回后置让识别重新判断
    sceneChanged();
    $("tFlip").setAttribute("aria-pressed", String(selfie()));
    if (selfie() && !settings().voice) { saveSetting({ voice: true }); setVoice(true); toast("自拍时我会把指导念给你听"); }
  }
  $("tFlip").onclick = flipCamera;
  // 场景换了：重置这一轮指导，告诉收集版
  function sceneChanged() {
    invalidate({ reset: true }); history = [];
    collect?.scene?.(scene());
    syncCoachMode();
    reactToScene(scene());
  }
  // 宠物对新场景的反应（睡着时不反应；玩笑每天最多一次）
  function reactToScene(sc) {
    if (!active || pet.asleep) return;
    if (selfie()) { pet.lookAt({ x: innerWidth / 2, y: 0 }, 1800); pet.cheer(1400); return; }
    if (sc === "animal") { pet.perkUp(); if (onceToday("jealous")) pet.ambient("又拍别的小可爱……好吧，我帮你"); }
    else if (sc === "landscape") { pet.mood({ eye: 0.55 }); pet.lookAt({ x: innerWidth * 0.3, y: 0 }, 1500); setTimeout(() => pet.mood({ eye: 1 }), 1500); if (onceToday("wow")) pet.ambient("哇——"); }
    else if (sc === "street") pet.lookAt({ x: innerWidth * 0.7, y: innerHeight * 0.3 }, 1200);
    else if (sc === "portrait") pet.nod();
  }
  window.__photaDetect = detect;                                      // 测试用：在任意画布上跑一次场景识别
  // 测试用：固定场景（null = 恢复自动识别）
  window.__photaScene = (next) => {
    sceneForced = Boolean(next);
    if (next && next !== scene()) { smoother.set(next); sceneChanged(); }
  };
  // 每 0.8 秒在手机本地看一眼画面，判断场景（识别器加载失败就停下，一直用构图指导）
  async function sceneLoop(id) {
    while (active && id === loopId) {
      await sleep(800);
      if (sceneForced || !cam.ready || capturing || document.hidden) continue;
      const dets = await detect(cam.frame(320, quarter)).catch(() => null);
      if (!dets) return;
      if (active && id === loopId && !sceneForced && smoother.push(classifyScene(dets, { selfie: cam.facing === "user" }))) sceneChanged();
    }
  }
  $("portraitNew").onclick = () => {
    invalidate(); portraitEpoch++; portrait.newIdea(); renderPortrait();
    if (!collect?.restart()) askOnce();
  };

  // ===== 缩放：快捷按钮 + 双指捏合（捏合在 camera.js 里）=====
  function renderZoom(z, r) {
    if (z !== lastZoom) { lastZoom = z; geometryChanged(); }
    const presets = [r.min < 1 ? Math.round(r.min * 10) / 10 : null, 1, 2, 3].filter((v) => v != null && v <= r.max + 0.01);
    const row = $("zoomRow");
    row.replaceChildren(...presets.map((v) => {
      const b = document.createElement("button");
      b.textContent = v + "×";
      b.classList.toggle("on", Math.abs(z - v) < 0.05);
      b.onclick = () => cam.setZoom(v);
      return b;
    }));
    const off = !presets.some((v) => Math.abs(z - v) < 0.05);
    $("zoomNow").textContent = z.toFixed(1) + "×";
    $("zoomNow").hidden = !off;
  }

  // ===== 照片比例 / 清晰度 =====
  function syncFormat() {
    const s = settings();
    $("tRatio").textContent = s.ratio;
    $("tQuality").textContent = s.quality;
    $("tPro").classList.toggle("on", pro.on);
    cam.setRatio(s.ratio);
  }
  $("tRatio").onclick = () => { geometryChanged(); saveSetting({ ratio: next(Object.keys(RATIOS), settings().ratio) }); syncFormat(); };
  $("tQuality").onclick = () => {
    saveSetting({ quality: next(Object.keys(QUALITY), settings().quality) });
    syncFormat();
    const tip = { "标准": "标准：长边 1600 像素，省空间", "高清": "高清：长边 2400 像素", "原图": "原图：尽量用相机的完整分辨率" }[settings().quality];
    $("coachText").textContent = tip;
    $("coachText").classList.add("landed");
  };

  // ===== 重力传感器 → 水平仪（不需要 AI，实时）=====
  window.addEventListener("devicemotion", (e) => {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null || Math.abs(g.x) + Math.abs(g.y) < 3) return;      // 手机平放时不判断
    let deg = (Math.atan2(-g.x, g.y) * 180) / Math.PI;                       // 顺时针转为正
    // 横屏时界面跟着转了，要减去屏幕本身转过的角度，才是"相对于屏幕"的倾斜
    deg = ((deg + (screen.orientation?.angle || 0) + 540) % 360) - 180;
    const q = Math.round(deg / 90);
    const newQuarter = ((q % 4) + 4) % 4;
    if (newQuarter !== quarter) { quarter = newQuarter; geometryChanged(); }
    const tilt = deg - q * 90;
    roll = roll == null ? tilt : roll * 0.75 + tilt * 0.25;
    // 仰俯：屏幕朝天的分量（z）和竖直方向的比例。镜头朝上（仰拍）为正
    const up = (Math.atan2(g.z ?? 0, Math.hypot(g.x, g.y)) * 180) / Math.PI;
    pitch = pitch == null ? up : pitch * 0.75 + up * 0.25;
  });

  function drawLevel() {
    if (!active) return;
    const lv = $("level");
    if (roll == null) lv.hidden = true;
    else {
      lv.hidden = false;
      const ok = Math.abs(roll) < 1;
      lv.classList.toggle("ok", ok);
      lv.querySelector("i").style.transform = `rotate(${-roll}deg)`;
      $("levelText").textContent = ok ? "水平" : `${Math.abs(roll).toFixed(1)}°`;
    }
    requestAnimationFrame(drawLevel);
  }

  // ===== 实时亮度：每 0.5 秒算一下取景框里的画面 =====
  async function brightnessLoop(id) {
    while (active && id === loopId) {
      if (cam.ready) {
        expo = exposureStats(cam.frame(96));
        bright = expo.brightness;
        $("hudBright").textContent = `亮度 ${Math.round(bright)}%`;
        if (bright < 30) pet.mood({ eyeSize: 1.28, eye: 1 });
        else if (bright > 65) pet.mood({ eye: 0.45, eyeSize: 1 });
        else pet.mood({ eye: 1, eyeSize: 1 });
      }
      await sleep(500);
    }
  }

  // ===== 问一次教练 =====
  let lastSkills = { at: -Infinity, list: [] };                       // 最近一次指导用到的技能（拍下的照片记一笔）
  async function askOnce() {
    const s = settings();
    if (!active || asking || capturing || !cam.ready) return;
    // 人像只用 DeepSeek（沿用原来的约定：没有密钥时不把人像画面发给别的服务商）
    if (isPortrait() && !portraitSettings(s)) return openSettings("请在 AI 连接中保存 DeepSeek 密钥，再使用人像出片指导（其他服务商设置会保留）");
    if (!isPortrait() && !isConfigured(s)) return openSettings("填好 AI 接口后，我就能帮你看取景");
    if (isPortrait() && portrait.snapshot().phase === "shot") { portraitEpoch++; portrait.newIdea(); }   // 拍过了又要指导 = 接着下一个拍法
    asking = true;
    const revision = ++requestRevision, portraitMode = isPortrait();
    $("askBtn").classList.add("busy");
    $("coach").classList.add("busy");
    $("coachText").textContent = "让我看看…";
    $("coachText").classList.add("landed");
    placeSkillChip($("coach"), null);                                   // 上一次用到的技能标签先收起来
    pet.mode("thinking");
    if (pet.asleep) pet.peek(true);                                     // 睡着时被叫：半睁眼、坐起来一点看一眼
    const id = loopId;
    abort = new AbortController();
    let canvas, askedAt = performance.now();
    const askScene = scene(), prompt = portraitMode ? PORTRAIT_PROMPT_VERSION : `${COACH_PROMPT_VERSION}:${askScene}`;
    const record = (extra) => collect?.guidance({ ms: Math.round(performance.now() - askedAt), canvas, scene: askScene, prompt, selfie: selfie(), ...extra });
    try {
      canvas = cam.frame(portraitMode ? 1024 : 512, quarter);
      const frame = toDataURL(canvas, portraitMode ? 0.86 : 0.7);
      const now = signature();
      const ago = (t) => Math.round((performance.now() - t) / 1000) + " 秒前";
      const facts = {
        画面亮度_百分比: bright,
        曝光: expo ? expo.verdict + (expo.note ? `（${expo.note}）` : "") : "未知",
        ...(pro.describe() ? { 专业模式参数: pro.describe(), ...pro.facts() } : {}),
        手机倾斜_度: roll == null ? "未知" : Math.round(roll * 10) / 10,
        你最近说过的话: history.length ? history.map((h) => `${ago(h.at)}：${h.hint}（当时 ${h.score} 分）`) : "这是第一次指导",
        上次提示后画面: askSig ? changeWords(difference(askSig, now)) : "—",
        用户的长期习惯: memoryText() || "还不了解",
        ...(selfie() ? { 拍摄方式: SELFIE_NOTE } : {}),
      };
      askSig = now;
      lastAskAt = performance.now();
      let r;
      if (portraitMode) {
        const key = JSON.stringify([s.ratio, cam.zoom, quarter, canvas.width, canvas.height, $("video").videoWidth, $("video").videoHeight]);
        const turn = portrait.begin(frame, key);
        const raw = await portraitCoach(s, frame, { ...facts, ...turn.context }, abort.signal, turn.previous);
        if (!active || id !== loopId || revision !== requestRevision) return;
        r = portrait.accept(raw, frame, turn.token);
        if (r) { renderPortrait(r, true); record({ result: r }); }
      } else {
        r = await coach(s, frame, { 场景: sceneLabel(askScene), ...facts }, abort.signal, askScene);
        if (active && id === loopId && revision === requestRevision) {
          const shown = showHint(r);
          if (shown) { placeSkillChip($("coach"), r._skills); lastSkills = { at: performance.now(), list: r._skills || [] }; }   // 📖 这次用到的摄影技能
          if (shown) record({ result: { status: shown.move === "shoot" ? "ready" : "adjust", hint: shown.hint, score: shown.score, observation: r.subject, skills: r._skills?.map((x) => x.id) } });
        }
      }
    } catch (e) {
      if (active && id === loopId && revision === requestRevision && e.name !== "AbortError") {
        showError(e.message);
        record({ error: e.message });
        if (portraitMode) { portrait.pause(); $("portraitStatus").textContent = "暂时停下 · 点指导重试"; $("portraitNew").hidden = false; }
      }
    } finally {
      if (revision !== requestRevision) return;
      asking = false;
      $("askBtn").classList.remove("busy");
      $("coach").classList.remove("busy");
      if (active) pet.mode("idle");
      if (pet.asleep) setTimeout(() => pet.peek(false), 2600);          // 说完再躺回去
    }
  }

  // 智能指导：她自己决定什么时候开口
  //   画面和上次看的时候相比明显变了（你换了角度 / 走了几步），而且已经稳住 1 秒（你停下来了）→ 看一眼
  //   画面没怎么变 → 不问，省 token
  async function smartLoop(id) {
    while (active && id === loopId) {
      await sleep(300);
      const s = settings();
      if (!s.coachAuto || document.hidden || $("settings").open || asking || capturing || !cam.ready) { prevSig = null; continue; }
      if (isPortrait() && !portrait.canAuto() && portrait.snapshot().phase !== "shot") { prevSig = null; continue; }   // 拍完后动了机位 = 自动接着指导
      const now = signature();
      const t = performance.now();
      if (difference(prevSig, now) > 0.03) stableSince = t;             // 还在动
      prevSig = now;
      const changed = !askSig || difference(askSig, now) > 0.1;
      const settled = t - stableSince > 1000;
      const rested = t - lastAskAt > Math.max(3, s.interval) * 1000;
      $("hudState").textContent = !changed ? "等你换个角度" : !settled ? "等你停稳" : "";
      pet.holdBreath(changed && !settled && !pet.asleep);                // 等你停稳：宠物憋着气，一稳就松口气
      if (changed && settled && rested) await askOnce();
    }
  }

  function renderPortrait(result = portrait.snapshot().result, speak = false) {
    const phase = portrait.snapshot().phase;
    const labels = { start: "先定一个拍法", adjust: "一次只做这一步", ready: "可以拍了", shot: "已拍下 · 点换个拍法继续", need_view: "需要再看清楚", pause: "这一步先停一下" };
    $("portraitStatus").textContent = labels[phase] || labels.start;
    if (result && pro.on && deckTab === "pro") $("tabPlan").classList.add("new");
    $("portraitPlan").textContent = result?.plan?.title || "让人物和现场一起出片";
    $("portraitWhy").textContent = result?.plan?.why || "脸和神态优先 · 每次只指导一人一个动作";
    $("portraitNew").hidden = !["ready", "shot", "pause", "need_view"].includes(phase);
    $("coachText").textContent = phase === "shot" ? "拍下了。换个位置停稳，我接着指导；或点「换个拍法」" : say(result?.hint) || (selfie() ? "看着屏幕，点我要一次指导" : "让模特入镜，点我要一次指导");
    $("coachText").classList.add("landed");
    $("coachSet").hidden = true;
    const ready = phase === "ready";
    $("liveShutter").classList.toggle("ready", ready);
    $("hudScore").textContent = result?.score ?? "—";
    $("hudSubject").textContent = "出片参考";
    $("scoreRing").style.setProperty("--p", (result?.score || 0) / 10);
    $("arrow").classList.remove("show");
    if (ready && speak) { pet.celebrate(); pet.point($("liveShutter"), 2400); }   // 可以拍了：指着快门
    if (speak && result?.hint) speakAs(say(result.hint), { flush: true, context: "coach" });
  }

  function showHint(r) {
    if (!r || (!r.hint && !r.fix && !r.move)) { showError("这次没看清，再试一次"); return null; }
    const prev = history[history.length - 1];
    const { move, hint } = decide(r, prev);                        // 方向由程序按"主体在哪、该在哪"换算
    const score = Math.max(0, Math.min(10, parseInt(r.score) || 0));

    const text = $("coachText");
    text.textContent = hint;
    text.classList.remove("landed");
    talk.cancel();
    talk.say(hint, text, move === "shoot" ? "accent" : "");

    const arrow = $("arrow");
    arrow.dataset.move = move;
    arrow.textContent = ARROWS[move];
    arrow.classList.remove("show"); void arrow.offsetWidth; arrow.classList.add("show");

    // 专业模式下，教练也可能建议改参数：程序先换算、验算，再给一个"应用"按钮
    const set = pro.fromCoach(r.settings), btn = $("coachSet");
    btn.hidden = !set;
    if (set) {
      btn.textContent = `⚙ 应用 ${set.label}` + (r.settings.why ? ` · ${String(r.settings.why).slice(0, 12)}` : "");
      btn.onclick = async () => {
        btn.hidden = true;
        await set.apply();
        toast("参数已调好：" + set.label);
        pet.hop(0.6);
      };
    }

    // 评分圆环：分数越高画得越满，颜色从红到黄到绿
    $("hudScore").textContent = score;
    $("scoreRing").style.setProperty("--p", score / 10);
    $("scoreRing").style.setProperty("--ring", score >= 8 ? "var(--signal-good)" : "var(--amber)");   // 设计系统：达标（≥8）用 signal-good，否则琥珀
    $("hudSubject").textContent = r.subject ? String(r.subject).slice(0, 8) : "构图";
    pet.mood({ smile: Math.max(-1, Math.min(1, (score - 6) / 3)), ear: score >= 8 ? 1 : score < 5 ? -0.6 : 0.2 });

    const ready = move === "shoot";
    $("liveShutter").classList.toggle("ready", ready);
    if (ready) { pet.celebrate(); pet.point($("liveShutter"), 2400); }
    else if (r.followed === true) pet.hop(0.6);                        // 你照着做了，她很开心

    history = [...history, { hint, move, score, at: performance.now() }].slice(-4);

    const repeat = move === lastSpoken.move && performance.now() - lastSpoken.at < 20000;
    if (!settings().coachAuto || !repeat) {
      speakAs(hint, { flush: true, context: "coach" });
      lastSpoken = { move, at: performance.now() };
    }
    return { move, hint, score };
  }

  function showError(msg) {
    $("coachText").textContent = "没看清：" + msg.slice(0, 48);
    $("coachText").classList.add("landed");
    pet.shake();
  }

  // ===== 打开 / 关闭相机 =====
  async function start() {
    if (active) return;
    active = true;
    const id = ++loopId;
    $("camOff").hidden = true;
    syncCoachMode();
    syncFormat();
    try {
      await cam.open();
      if (!active || id !== loopId) return cam.close();
    } catch (e) {
      active = false;
      $("camOff").hidden = false;
      $("camOffText").textContent = e.name === "NotAllowedError" ? "需要相机权限 · 点这里重试" : "相机打不开 · 点这里重试";
      return;
    }
    pet.onPoke = askOnce;                                  // 取景时点宠物 = 请她指导一下
    toast("双指缩放 · 点画面对焦");
    if (!isConfigured(settings()) && !portraitSettings(settings())) openSettings("填好 AI 接口后，我就能帮你看取景");
    history = [];
    askSig = null;
    await pro.attach();
    pro.resume();
    drawLevel();
    brightnessLoop(id);
    smartLoop(id);
    sceneLoop(id);
  }

  function stop() {
    active = false;
    loopId++;
    invalidate({ reset: true });
    pro.stop();
    cam.close();
    pet.onPoke = null;
    pet.mode("idle");
  }

  $("askBtn").onclick = askOnce;
  $("camOff").onclick = () => start();

  // ===== 按快门：存进手机相册 + 摄影集（继续取景，可以连着拍一组）=====
  $("liveShutter").onclick = async () => {
    if (!cam.ready || capturing) return;
    capturing = true;
    $("liveShutter").disabled = true;
    invalidate();
    const shotPortrait = isPortrait(), shotEpoch = portraitEpoch;
    const flash = $("flash");
    flash.classList.remove("on"); void flash.offsetWidth; flash.classList.add("on");
    $("liveShutter").classList.remove("ready");
    pet.snap();                                                         // 咔嚓：螃蟹钳子一合，小猪镜片一闪
    if (!pet.asleep) pet.hop(0.4);
    // 按快门那一刻的手机姿态和参数，跟着照片一起记下来（以后分析这张照片时用：陀螺仪比从画面里找直线准）
    // 画面的倾斜方向和手机相反：手机顺时针歪，拍出来的景物就逆时针歪
    const last = history[history.length - 1];
    const sensor = { tilt: roll == null ? undefined : -roll, pitch: pitch ?? undefined, ...pro.shotInfo(),
                     coach: !isPortrait() && last && performance.now() - last.at < 30000 ? last.score : undefined };   // 人像综合分不作为构图传感器
    try {
      const shot = await cam.capture(settings().quality, quarter);
      const blob = await new Promise((resolve, reject) => shot.toBlob(value => value ? resolve(value) : reject(new Error("照片生成失败")), "image/jpeg", 0.92));
      const name = `PHOTA_${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}_${++shots}.jpg`;
      const skillsNow = performance.now() - lastSkills.at < 30000 ? lastSkills.list : [];
      await onShot(blob, name, sensor, { scene: scene(), skills: skillsNow });   // 场景、用到的技能：相册里筛选和看照片信息用
      if (active && shotPortrait && isPortrait() && shotEpoch === portraitEpoch) { portrait.markShot(); renderPortrait(); }
      if (active) collect?.shot({ canvas: shot, name });                 // 收集版：任何场景指导后的快门都算
      flyToTray(shot);
      try {
        if (await saveToGallery(blob, name)) toast(`已存入相册 · ${shot.width}×${shot.height}`);
      } catch (e) {
        toast("存相册失败：" + (e.message || e));
      }
    } catch (e) {
      if (isPortrait()) renderPortrait();
      toast("拍照失败 · 请重试：" + (e.message || e));
    } finally {
      capturing = false;
      $("liveShutter").disabled = false;
    }
  };

  // 拍下的照片缩小、飞进右下角的缩略图里
  function flyToTray(shot) {
    const tray = $("tray");
    tray.hidden = false;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const thumb = document.createElement("canvas");
    const k = 240 / Math.max(shot.width, shot.height);
    thumb.width = Math.round(shot.width * k);
    thumb.height = Math.round(shot.height * k);
    thumb.getContext("2d").drawImage(shot, 0, 0, thumb.width, thumb.height);
    thumb.className = "fly";
    const from = $("vf").getBoundingClientRect(), to = tray.getBoundingClientRect();
    Object.assign(thumb.style, { left: from.left + "px", top: from.top + "px", width: from.width + "px", height: from.height + "px" });
    document.body.append(thumb);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const s = to.width / from.width;
    thumb.animate([
      { transform: "none", opacity: 1 },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.2 - 30}px) scale(0.55) rotate(-6deg)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(4deg)`, opacity: 0.6 },
    ], { duration: 700, easing: "cubic-bezier(.5,0,.25,1)" }).onfinish = () => thumb.remove();
  }

  let toastTimer;
  function toast(text) {
    const t = $("toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  // 切到后台时关相机（省电，也不会在后台调用 AI）
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && active) { stop(); $("camOff").hidden = false; $("camOffText").textContent = "点这里继续取景"; }
  });
  $("video").addEventListener("resize", geometryChanged);
  addEventListener("orientationchange", geometryChanged);
  addEventListener("pagehide", () => { if (active) stop(); });

  return { start, stop, toast, resetHint: () => (lastSpoken = { move: null, at: 0 }) };
}
