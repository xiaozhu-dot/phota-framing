// 相册页：在 Phota 里拍的和导入的照片（说法见 CONTEXT.md「相册页」）
//   像手机自带相册：新的在上面、按日期分组；连拍叠成一格；顶部按场景 / 高分筛选
//   单点：整屏大图（viewer.js）。长按：进入多选，底部出现「分析 / 编成摄影集 / 删除」
//   删除不弹窗：直接删，底部几秒内可以撤销（系统相册里的那张不受影响）
//   编摄影集：多选 → 填关键信息 → AI 写文字和配文 → 自动存进「摄影集」页并打开（books.js）
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { album as askAlbum, albumInfo, isConfigured } from "./ai.js";
import { LANGS, dateText, normalizeInfo, infoText, normalizeCaptions } from "./album-info.js";
import { loadImage, toCanvas, toDataURL, sharpness, exposureStats } from "./vision.js";
import { THEMES } from "./album-template.js";
import { loadShots, saveShot, deleteShot } from "./shotstore.js";
import { FILTERS, sections, cellShots, viewOrder, filterCounts, isCamera } from "./gallery-logic.js";
import { detect, classifyScene } from "./scene-detect.js";
import { createViewer } from "./viewer.js";
import { pushBack, popBack } from "./backstack.js";

const $ = (id) => document.getElementById(id);
const MIN = 2, MAX = 12, HOLD_MS = 450, UNDO_MS = 5000;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export function setupAlbum({ settings, openSettings, onAnalyze, speakAs, books, setMode }) {
  const pet = window.pet;
  const shots = [];              // 旧的在前：{ id, blob, url, name, sensor, at, source, scene, quality, analysis, skills }（url 只在这次打开 App 时有效，不存）
  let filter = "all", making = false, prepared = null, seq = 0;
  const selected = new Set();    // 多选中的照片 id
  let selBack = 0;               // 多选时记的那一笔「返回」
  let visible = [];              // 当前筛选下画出来的格子（大图按这个顺序翻）
  const LANG_KEY = "phota-caption-lang";
  $("infoLang").replaceChildren(...LANGS.map((l) => Object.assign(document.createElement("option"), { value: l.id, textContent: l.label })));
  try { $("infoLang").value = localStorage.getItem(LANG_KEY) || "zh"; } catch {}
  const msg = (text, cls = "") => { $("albumMsg").textContent = text; $("albumMsg").className = "album-msg " + cls; };

  // 存进数据库的那份不带 url / fresh（它们只在这次打开 App 时有用）
  const persist = ({ url, fresh, selected: _old, ...rest }) => saveShot(rest).catch((e) => msg("照片没存住：" + e.message, "bad"));

  // 快门右边的缩略图：显示最新一张和总张数
  function syncTray(pop) {
    const tray = $("tray");
    tray.hidden = shots.length === 0;
    $("trayCount").textContent = shots.length;
    if (shots.length) $("trayImg").src = shots[shots.length - 1].url;
    if (pop) { tray.classList.remove("pop"); void tray.offsetWidth; tray.classList.add("pop"); }
  }

  // ===== 加照片 =====
  //   extra：拍的时候认出的场景、指导用到的技能；导入的照片在这里本地认一次场景（免费，不联网）
  function add(blob, name, sensor = null, extra = {}) {
    const camera = Boolean(sensor);
    const shot = {
      id: `${Date.now()}-${++seq}`, blob, url: URL.createObjectURL(blob), at: Date.now(), fresh: true,
      name: name || `SHOT_${String(seq).padStart(3, "0")}.jpg`, sensor, source: camera ? "camera" : "import",
      scene: extra.scene || null, skills: extra.skills || [], quality: null, analysis: null,
    };
    shots.push(shot);
    persist(shot);
    render();
    syncTray(true);
    queueMeasure(shot);
  }

  // 测清晰度（连拍挑最清楚的用），导入的顺便认场景。一张一张来，不卡界面
  let measuring = Promise.resolve();
  function queueMeasure(shot) {
    measuring = measuring.then(async () => {
      if (!shots.includes(shot)) return;
      try {
        const canvas = toCanvas(await loadImage(shot.url), 800);
        if (!shot.quality) {
          const sh = sharpness(canvas), ex = exposureStats(canvas);
          shot.quality = { edge: sh.edge ?? null, over: ex.over, under: ex.under };
        }
        if (!shot.scene && !isCamera(shot)) {
          const dets = await detect(canvas);
          if (dets) shot.scene = classifyScene(dets);
        }
        persist(shot);
        render();
      } catch {}
      await new Promise((r) => setTimeout(r, 30));
    });
  }

  // 打开 App 时，把上次的照片读回来；以前的照片没测过清晰度的，慢慢补上
  loadShots().then((list) => {
    for (const s of list) shots.push({ ...s, url: URL.createObjectURL(s.blob) });
    shots.sort((a, b) => a.at - b.at);
    render();
    syncTray(false);
    for (const s of shots) if (!s.quality || (!s.scene && !isCamera(s))) queueMeasure(s);
  }).catch(() => {});
  $("albumAdd").onchange = (e) => {
    [...e.target.files].forEach((f) => add(f, f.name, null));
    e.target.value = "";
  };

  // ===== 筛选 =====
  function renderFilters() {
    const counts = filterCounts(shots);
    $("albumFilters").replaceChildren(...FILTERS.map((f) => {
      const b = el("button", "set-choice", f.id === "all" ? f.label : `${f.label} ${counts[f.id]}`);
      b.type = "button";
      b.setAttribute("aria-pressed", String(filter === f.id));
      b.disabled = f.id !== "all" && f.id !== filter && !counts[f.id];
      b.onclick = () => { filter = filter === f.id ? "all" : f.id; render(); };
      return b;
    }));
  }

  // ===== 网格 =====
  function render() {
    if (filter !== "all" && !shots.some((s) => s.scene === filter || (filter === "top" && s.analysis?.score >= 8))) filter = "all";
    renderFilters();
    $("albumCount").textContent = shots.length ? `${shots.length} 张` : "";
    $("albumEmpty").hidden = shots.length > 0;
    $("albumHint").hidden = shots.length === 0;
    const secs = sections(shots, { filter });
    visible = secs.flatMap((s) => s.cells);
    $("albumGrid").replaceChildren(...secs.map((sec) => {
      const box = el("section", "day");
      const grid = el("div", "shots");
      sec.cells.forEach((c) => grid.append(cellView(c)));
      box.append(el("h3", "day-title", sec.label), grid);
      return box;
    }));
    syncSelect();
  }

  function cellView(c) {
    const list = cellShots(c), face = c.kind === "burst" ? c.best : c.shot;
    const on = list.every((s) => selected.has(s.id));
    const cell = el("div", "shot" + (on ? " on" : "") + (face.fresh ? " fresh" : "") + (c.kind === "burst" ? " burst" : ""));
    face.fresh = false;
    cell.tabIndex = 0;
    cell.setAttribute("role", "button");
    const score = face.analysis?.score;
    cell.setAttribute("aria-label", `${c.kind === "burst" ? `连拍 ${list.length} 张` : "照片"}${score != null ? `，${score} 分` : ""}${on ? "，已选" : ""}`);
    const img = el("img");
    img.src = face.url; img.alt = ""; img.draggable = false; img.loading = "lazy";
    cell.append(img, el("span", "mark", on ? "✓" : ""));
    if (score != null) cell.append(el("span", "score-badge" + (score >= 8 ? " hi" : ""), String(score)));
    if (c.kind === "burst") cell.append(el("span", "burst-badge", `×${list.length}`), el("span", "best-badge", "最清楚"));
    hold(cell, () => { if (!selBack) enterSelect(); toggle(list, true); pet.lookAt(cell, 900); pet.nod(); },
      () => (selBack ? toggle(list) : openViewer(face, c)));
    cell.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selBack ? toggle(list) : openViewer(face, c); } };
    return cell;
  }

  // 长按（按住不动 0.45 秒）和单点分开；手指一动就当是在滑动页面
  function hold(node, onHold, onTap) {
    let timer = 0, start = null, held = false;
    node.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return;
      held = false; start = { x: e.clientX, y: e.clientY };
      node.classList.add("pressing");
      timer = setTimeout(() => { held = true; node.classList.remove("pressing"); navigator.vibrate?.(15); onHold(); }, HOLD_MS);
    });
    node.addEventListener("pointermove", (e) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) { clearTimeout(timer); start = null; node.classList.remove("pressing"); }
    });
    const stop = (e) => {
      clearTimeout(timer); node.classList.remove("pressing");
      if (e.type === "pointerup" && start && !held) onTap();
      start = null;
    };
    node.addEventListener("pointerup", stop);
    node.addEventListener("pointercancel", stop);
    node.addEventListener("pointerleave", stop);
    node.addEventListener("contextmenu", (e) => e.preventDefault());     // 别弹出系统的「保存图片」菜单
  }

  // ===== 多选 =====
  function enterSelect() {
    selBack = pushBack(exitSelect);
    document.body.classList.add("selecting");
    hideInfo();
  }
  function exitSelect() {
    selBack = 0;
    selected.clear();
    document.body.classList.remove("selecting");
    render();
  }
  const leaveSelect = () => { if (selBack) popBack(selBack); };
  function toggle(list, forceOn = false) {
    const all = list.every((s) => selected.has(s.id));
    for (const s of list) { if (all && !forceOn) selected.delete(s.id); else selected.add(s.id); }
    if (selBack && selected.size === 0) return leaveSelect();          // 一张都没选了：退出多选
    render();
  }
  const chosen = () => shots.filter((s) => selected.has(s.id));        // 按拍摄时间，从早到晚
  function syncSelect() {
    $("selTop").hidden = $("selBar").hidden = !selBack;
    const n = selected.size;
    $("selCount").textContent = `已选 ${n} 张`;
    $("selAnalyze").disabled = n !== 1;
    $("selBook").disabled = n < MIN || n > MAX || making;
    $("selBook").textContent = n > MAX ? `最多 ${MAX} 张` : n < MIN ? "编成摄影集" : `编成摄影集（${n}）`;
    $("selBook").title = n < MIN ? `再选 ${MIN - n} 张以上` : "";
    $("selDelete").disabled = n === 0;
    const all = visible.flatMap(cellShots);
    $("selAll").textContent = all.length && all.every((s) => selected.has(s.id)) ? "全不选" : "全选";
  }
  $("selCancel").onclick = leaveSelect;
  $("selAll").onclick = () => {
    const all = visible.flatMap(cellShots);
    if (all.every((s) => selected.has(s.id))) return leaveSelect();
    all.forEach((s) => selected.add(s.id));
    render();
  };
  $("selAnalyze").onclick = () => { const [s] = chosen(); if (!s) return; leaveSelect(); onAnalyze(s.url, s.name, s.sensor, s.id); };
  $("selDelete").onclick = () => { const list = chosen(); leaveSelect(); remove(list); };
  $("selBook").onclick = () => { const list = chosen(); if (list.length < MIN || list.length > MAX) return; leaveSelect(); make(list); };

  // ===== 删除（可撤销）=====
  let pending = null;            // { list, timer }：还能撤销的那一次删除
  function commitDelete() {
    if (!pending) return;
    clearTimeout(pending.timer);
    for (const s of pending.list) { deleteShot(s.id).catch(() => {}); URL.revokeObjectURL(s.url); }
    pending = null;
    $("undoToast").hidden = true;
  }
  function remove(list) {
    if (!list.length) return;
    commitDelete();
    for (const s of list) { const i = shots.indexOf(s); if (i >= 0) shots.splice(i, 1); }
    render(); syncTray(false);
    pending = { list, timer: setTimeout(commitDelete, UNDO_MS) };
    $("undoText").textContent = `已删除 ${list.length} 张 · 系统相册里的不受影响`;
    $("undoToast").hidden = false;
    pet.scratch?.(900);
  }
  $("undoBtn").onclick = () => {
    if (!pending) return;
    clearTimeout(pending.timer);
    shots.push(...pending.list);
    shots.sort((a, b) => a.at - b.at);
    pending = null;
    $("undoToast").hidden = true;
    render(); syncTray(false);
    pet.nod();
  };
  addEventListener("pagehide", commitDelete);

  // ===== 大图 =====
  const viewer = createViewer({
    groupOf: (s) => visible.find((c) => c.kind === "burst" && c.shots.includes(s)) || null,
    onAnalyze: (s) => { viewer.close(); onAnalyze(s.url, s.name, s.sensor, s.id); },
    onShare: (s) => shareShot(s),
    onDelete: (s) => {
      const order = viewList(), i = order.indexOf(s);
      remove([s]);
      const next = viewList();
      viewer.refresh(next, (order[i + 1] || order[i - 1])?.id);
    },
  });
  const viewList = () => visible.flatMap(viewOrder);
  function openViewer(face) { const list = viewList(); viewer.open(list, Math.max(0, list.indexOf(face))); }

  async function shareShot(s) {
    try {
      if (Capacitor.isNativePlatform()) {
        const data = await new Promise((resolve, reject) => {
          const r = new FileReader(); r.onload = () => resolve(String(r.result).split(",")[1]); r.onerror = () => reject(r.error); r.readAsDataURL(s.blob);
        });
        const { uri } = await Filesystem.writeFile({ path: s.name.replace(/[^\w.-]/g, "_") || "photo.jpg", data, directory: Directory.Cache });
        await Share.share({ title: "Phota 照片", files: [uri], dialogTitle: "分享照片" });
      } else {
        const a = Object.assign(document.createElement("a"), { href: s.url, download: s.name });
        a.click();
      }
    } catch (e) {
      if (!/cancel/i.test(e.message || "")) msg("分享失败：" + e.message, "bad");
    }
  }

  // 分析完：结果留在照片上（缩略图上显示分数，大图里能看）
  function setAnalysis(id, analysis) {
    const s = shots.find((x) => x.id === id);
    if (!s) return;
    s.analysis = analysis;
    persist(s);
    render();
  }

  // ===== 编摄影集：第一步，看照片、想想要问什么 =====
  function hideInfo() { if (!$("albumInfo").hidden) { $("albumInfo").hidden = true; prepared = null; pet.hold(null); } }
  async function make(list) {
    const s = settings();
    if (!isConfigured(s)) return openSettings("先填好 AI 接口，我才能帮你编摄影集");
    making = true;
    $("albumInfo").hidden = true;
    pet.mode("thinking");
    pet.hold("notes");                                         // 拿出小本子，一边翻照片一边记
    pet.caption("正在翻看你的照片");
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      msg(`整理 ${list.length} 张照片…`);
      const small = [], big = [];
      for (const shot of list) {
        const img = await loadImage(shot.url);
        small.push(toDataURL(toCanvas(img, 512), 0.7));       // 给 AI 看的小图，省 token
        big.push(toDataURL(toCanvas(img, 1600), 0.82));       // 放进摄影集的大图（副本：原图删了也不影响）
      }
      msg(`${pet.name}在看照片，想想要问你什么…`);
      const date = dateText(list.map((c) => c.at));
      let info;
      try { info = normalizeInfo(await albumInfo(s, small), { date }); }
      catch { info = normalizeInfo(null, { date }); }         // 没问到也没关系：至少问地点和时间
      prepared = { list, small, big, fields: info.fields };
      showInfo(info.fields, list);
      msg("");
      pet.mode("idle");
      const q = info.petQuestion || "这是在哪儿拍的？";
      pet.caption(q);
      pet.ambient(q);
      pet.lookAt($("albumInfo"), 1500);
    } catch (e) {
      msg("没编成：" + e.message, "bad");
      pet.hold(null);
      pet.mode("idle");
      pet.shake();
    } finally {
      making = false;
    }
  }
  function showInfo(fields, list) {
    $("infoPhotos").replaceChildren(...list.map((s) => { const i = el("img"); i.src = s.url; i.alt = ""; return i; }));
    $("infoFields").replaceChildren(...fields.map((f) => {
      const row = el("label", "info-row");
      const input = el("input");
      Object.assign(input, { name: f.key, value: f.guess, placeholder: f.hint, maxLength: 60, autocomplete: "off" });
      row.append(el("span", null, f.label), input);
      return row;
    }));
    $("albumInfo").hidden = false;
    $("albumInfo").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("albumInfo").onsubmit = (e) => {
    e.preventDefault();
    generate(Object.fromEntries([...$("infoFields").querySelectorAll("input")].map((i) => [i.name, i.value])));
  };
  $("infoSkip").onclick = () => generate({});
  $("infoCancel").onclick = () => { hideInfo(); msg(""); pet.mode("idle"); };
  $("infoLang").onchange = () => { try { localStorage.setItem(LANG_KEY, $("infoLang").value); } catch {} };

  // ===== 第二步：写摄影集和配文，存进「摄影集」页 =====
  async function generate(values) {
    if (!prepared || making) return;
    const s = settings(), { list, small, big, fields } = prepared, lang = $("infoLang").value;
    $("albumInfo").hidden = true;
    making = true;
    pet.mode("thinking");
    pet.hold("book");                                          // 抱着书，照片一张张贴进去当进度
    pet.propFill(0);
    pet.caption("在写字…");
    let fill = 0;
    const tick = setInterval(() => pet.propFill((fill = Math.min(0.9, fill + 0.05))), 1400);
    try {
      msg(`${pet.name}正在为 ${list.length} 张照片写文字和配文…（大约半分钟）`);
      const r = await askAlbum(s, small, { info: infoText(fields, values), lang });
      const pages = big.map((img, i) => {
        const p = (r.pages || [])[i] || {};
        return { img, line: String(p.line || "").slice(0, 12), text: String(p.text || ""), whisper: String(p.whisper || "").slice(0, 16), mood: String(p.mood || "warm") };
      });
      const now = new Date();
      const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
      const book = {
        title: String(r.title || "一组照片").slice(0, 20), subtitle: String(r.subtitle || ""), opening: String(r.opening || ""), closing: String(r.closing || ""),
        date, pages, species: pet.species, petName: pet.name,
      };
      const ids = Object.keys(THEMES);
      const theme = THEMES[r.style] ? r.style : ids[Math.floor(Math.random() * ids.length)];   // 用 AI 挑的风格；没挑就随机
      prepared = null;
      msg("");
      pet.propFill(1);
      pet.mode("idle");
      pet.caption("编好啦");
      setTimeout(() => { pet.hold(null); pet.celebrate(); }, 900);   // 书贴满了，再放下来欢呼
      setMode("books");
      await books.add({ book, theme, captions: normalizeCaptions(r.captions), skills: r._skills || [] });
      if (r.opening) speakAs(r.opening, { context: "album" });
    } catch (e) {
      msg("没编成：" + e.message, "bad");
      pet.hold(null);
      pet.mode("idle");
      pet.shake();
      $("albumInfo").hidden = false;                             // 填的信息还在，可以直接再点一次
    } finally {
      clearInterval(tick);
      making = false;
      syncSelect();
    }
  }

  // 离开相册页：多选、大图都收起来，没撤销的删除就真删了
  function leave() { leaveSelect(); if (viewer.isOpen()) viewer.close(); commitDelete(); }

  render();
  return { add, render, setAnalysis, leave, shots: () => shots };
}
