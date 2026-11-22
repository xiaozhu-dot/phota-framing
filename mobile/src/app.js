// 主程序：页面切换（拍摄 / 相册；照片分析是相册里的下一层）、宠物、朗读、新手引导
import { loadSettings, saveSettings } from "./ai.js";
import { speak, setVoice, setVoiceStyle, stop as stopSpeech } from "./voice.js";
import { speechConfig } from "./cloud-voice.js";
import { setupSettings } from "./settings.js";
import { setupPhoto } from "./photo.js";
import { setupLive } from "./live.js";
import { setupAlbum } from "./album.js";
import { setupBooks } from "./books.js";
import { playIntro } from "./intro.js";
import { setupCollect } from "./collect.js";
import { setupGuide } from "./guide.js";

const $ = (id) => document.getElementById(id);
let settings = loadSettings();
const getSettings = () => settings;

// ===== 宠物：只有一只，切换模式时把她"搬"到对应的位置 =====
const pet = window.pet;
pet.mount($("petDockLive"), settings.pet);
const petRoot = $("petDockLive").querySelector('.pet');
setVoice(settings.voice);
setVoiceStyle(speechConfig(settings));

// 宠物朗读：一边读一边动嘴
const speakAs = (text, opts = {}) => {
  if ($("settings").open && !opts.force) return Promise.resolve();
  return speak(text, { ...opts, onStart: () => pet.talk(true), onEnd: () => pet.talk(false) });
};

const photo = setupPhoto({ settings: getSettings, saveSetting: (patch) => update(patch), speakAs, openSettings,
  onResult: (id, a) => album.setAnalysis(id, a) });          // 分析结果记在相册那张照片上
const books = setupBooks({ pet });
const album = setupAlbum({
  settings: getSettings,
  speakAs,
  openSettings,
  books,
  setMode: (m) => setMode(m),
  onAnalyze: (src, name, sensor, id) => { setMode("photo"); photo.show(src, name, sensor, id); },
});
// 收集版才有的「标注」页（PHOTA_COLLECT 由打包脚本决定；正式版打包时这一行和 collect.js 整个被剔除）
const collect = PHOTA_COLLECT ? setupCollect({ setMode: (m) => setMode(m) }) : null;
const live = setupLive({
  collect: collect?.hooks,
  settings: getSettings,
  saveSetting: (patch) => update(patch),
  speakAs,
  openSettings,
  onShot: (blob, name, sensor, extra) => album.add(blob, name, sensor, extra),   // 拍下的照片存进相册（同时存系统相册），继续取景
});

// ===== 模式切换 =====
const DOCKS = { live: "petDockLive", photo: "petDockPhoto", album: "petDockAlbum", books: "petDockBooks" };
const CAPTIONS = { photo: "看看这张拍得怎么样", album: "点开看大图，长按可以多选", books: "做好的摄影集都在这里" };
let mode = null;
const ORDER = ["live", "album", "books", "photo"];
const navOf = (m) => (m === "photo" ? "album" : m);                  // 照片分析属于相册：导航停在「相册」
if (collect) { DOCKS[collect.mode] = collect.dock; CAPTIONS[collect.mode] = collect.caption; ORDER.push(collect.mode); }
function setMode(m) {
  if (m === mode) return;
  stopSpeech();
  // 新页面从点的方向滑进来（浏览器支持"视图过渡"时；不支持就直接切换）
  document.documentElement.style.setProperty("--dir", mode && ORDER.indexOf(m) < ORDER.indexOf(mode) ? -1 : 1);
  const first = mode == null;
  mode = m;
  const apply = () => {
    document.body.dataset.mode = m;
    window.scrollTo({ top: 0 });
    document.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === navOf(m)));
    $(DOCKS[m]).append(petRoot);
  };
  // 注意：用了视图过渡，页面是"稍后"才切过去的。相机要等取景页真的显示出来再打开，不然量到的取景框尺寸是 0
  const after = () => {
    if (mode !== m) return;
    pet.coverEyes(false);                                               // 标注页盲选时捂着的眼睛，换页就放开
    if (m === "live") { photo.cancel(); live.resetHint(); live.start(); pet.sleep(!settings.coachAuto); }
    else pet.sleep(false);                                              // 睡觉只表示"拍摄时自动指导关着"，别的页面宠物醒着
    if (m === "album") album.render();
    if (m === "books") books.render();
    if (m === collect?.mode) collect.render();
    else if (m !== "live") collect?.remind();                         // 离开拍摄页：有待标注的就提醒一下
  };
  if (m !== "album") album.leave();                                   // 离开相册：退出多选、关大图
  if (m !== "books") books.leave();
  if (m !== "live") { collect?.hooks.leave(); live.stop(); pet.caption(CAPTIONS[m]); }
  movePill(!first);
  if (!first) pet.hop(0.4);
  if (!first && !document.hidden && document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const vt = document.startViewTransition(apply);
    vt.updateCallbackDone.then(after, after);
    setTimeout(() => { if (document.body.dataset.mode !== m && mode === m) vt.skipTransition(); }, 600);   // 保险：过渡卡住了就直接切
  } else { apply(); after(); }
}
// 导航里的红色胶囊滑到选中的按钮下面
function movePill(animate) {
  const btn = document.querySelector(`.seg button[data-mode="${navOf(mode)}"]`), pill = $("segPill");
  if (!btn) return;
  if (!animate) pill.style.transition = "none";
  pill.style.width = btn.offsetWidth + "px";
  pill.style.transform = `translateX(${btn.offsetLeft - 2}px)`;
  if (animate) { pill.classList.remove("stretch"); void pill.offsetWidth; pill.classList.add("stretch"); }
  else requestAnimationFrame(() => (pill.style.transition = ""));
}
addEventListener("resize", () => movePill(false));
document.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
$("tray").onclick = () => setMode("album");
$("photoBack").onclick = () => setMode("album");

// ===== 「⋯」：比例、清晰度、专业参数、朗读、自动指导 =====
$("tMore").onclick = (e) => {
  e.stopPropagation();
  const open = $("morePop").hidden;
  $("morePop").hidden = !open;
  $("tMore").setAttribute("aria-expanded", String(open));
};
document.addEventListener("click", (e) => {
  if (!$("morePop").hidden && !e.target.closest(".fmt")) { $("morePop").hidden = true; $("tMore").setAttribute("aria-expanded", "false"); }
});

// ===== 快捷开关：朗读 / 自动指导 =====
function syncToggles() {
  // 开着的开关：文字变亮，下面有个小点
  $("tVoice").classList.toggle("on", settings.voice);
  $("tVoice").setAttribute("aria-pressed", settings.voice);
  $("tVoice").textContent = settings.voice ? "开" : "关";
  $("tAuto").classList.toggle("on", settings.coachAuto);
  $("tAuto").setAttribute("aria-pressed", settings.coachAuto);
  $("tAuto").textContent = settings.coachAuto ? "开" : "关";
}
function update(patch) {
  settings = { ...settings, ...patch };
  saveSettings(settings);
  syncToggles();
}
$("tVoice").onclick = () => {
  update({ voice: !settings.voice });
  setVoice(settings.voice);
  if (settings.voice) speakAs("我会把建议念给你听");
};
// 自动指导：关着时宠物在睡觉（长按宠物或在「⋯」里开关）
function setAuto(on) {
  update({ coachAuto: on });
  if (mode === "live") pet.sleep(!on);
  $("coachText").textContent = on ? "自动指导开了：你换个角度停稳后，我会自己看一眼" : "自动指导关了，我先睡会儿。要指导就点我";
  $("coachText").classList.add("landed");
  live.toast(on ? "自动指导已开" : "自动指导已关");
}
$("tAuto").onclick = () => setAuto(!settings.coachAuto);
pet.onLongPress = () => { if (mode === "live") setAuto(!settings.coachAuto); };

// ===== 设置：整屏页面（个人资料、伙伴与声音、取景指导、AI 连接、摄影技能……见 settings.js）=====
const settingsUI = setupSettings({
  pet, getSettings, update, speakAs, getMode: () => mode,
  onGuide: () => { setMode("live"); setTimeout(() => guide.start(true), 400); },
});
function openSettings(message = "", page = null) { settingsUI.open(message, page); }
$("btnSettings").onclick = () => openSettings();

syncToggles();
setMode(collect && !collect.ready() ? "annotate" : "live");   // 收集版第一次打开：先看说明、填昵称
playIntro();
// 新手引导：第一次进拍摄页时，宠物走到各个按钮旁边介绍一遍（收集版要先填完昵称）
const guide = setupGuide({ pet, setMode, auto: () => settings.coachAuto });
if (!collect || collect.ready()) setTimeout(() => guide.start(), 1500);
addEventListener("phota-consent", () => setTimeout(() => guide.start(), 900));
