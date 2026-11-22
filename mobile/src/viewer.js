// 大图：在相册里单点一张照片，整屏查看（说法见 CONTEXT.md「大图」）
//   左右滑切换；双指或双击放大，放大后拖动看细节；往下滑关闭；往上滑（或点 ⓘ）看照片信息和上次的分析
//   点一下画面：隐藏 / 显示按钮。手机返回键：先收起信息，再关闭大图
//   底部：分析 / 分享 / 删除（具体做什么由相册页决定）
import { pushBack, popBack } from "./backstack.js";
import { sceneLabel } from "./scenes.js";
import { isCamera } from "./gallery-logic.js";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const ICON = {
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 11v5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="7.8" r="1.1" fill="currentColor"/></svg>',
};
export const sharpWord = (q) => !q || !Number.isFinite(q.edge) ? "" : q.edge <= 2.4 ? "清晰" : q.edge <= 3.2 ? "有点糊" : "模糊";
const fullTime = (t) => new Date(t).toLocaleString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });

export function createViewer({ onAnalyze, onShare, onDelete, groupOf = () => null }) {
  const root = el("div", "pv");
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "查看照片");
  const track = el("div", "pv-track");
  const slides = [0, 1, 2].map(() => { const s = el("div", "pv-slide"); const img = el("img"); img.alt = ""; img.draggable = false; s.append(img); track.append(s); return s; });
  const top = el("header", "pv-top");
  const closeBtn = el("button", "pv-icon"); closeBtn.type = "button"; closeBtn.innerHTML = ICON.close; closeBtn.setAttribute("aria-label", "关闭");
  const count = el("span", "pv-count"), date = el("span", "pv-date");
  const infoBtn = el("button", "pv-icon"); infoBtn.type = "button"; infoBtn.innerHTML = ICON.info; infoBtn.setAttribute("aria-label", "照片信息");
  const mid = el("div", "pv-mid"); mid.append(count, date);
  top.append(closeBtn, mid, infoBtn);
  const badge = el("div", "pv-badge");
  const bar = el("footer", "pv-bar");
  const btn = (act, label) => { const b = el("button", null, label); b.type = "button"; b.dataset.act = act; bar.append(b); return b; };
  const analyzeBtn = btn("analyze", "分析"), shareBtn = btn("share", "分享"), deleteBtn = btn("delete", "删除");
  deleteBtn.classList.add("danger");
  const sheet = el("section", "pv-sheet");
  sheet.setAttribute("aria-label", "照片信息");
  root.append(track, top, badge, bar, sheet);
  document.body.append(root);

  let list = [], index = 0, backId = 0, sheetBack = 0;
  let zoom = { s: 1, x: 0, y: 0 };
  const cur = () => list[index];

  // ===== 打开 / 关闭 =====
  function open(shots, at = 0) {
    list = shots; index = clamp(at, 0, shots.length - 1);
    root.hidden = false;
    root.classList.remove("bare", "closing");
    root.style.removeProperty("--fade");
    hideSheet(true);
    layout(); render();
    if (!reduced()) { root.classList.add("opening"); setTimeout(() => root.classList.remove("opening"), 220); }
    backId = pushBack(closeNow);
    closeBtn.focus({ preventScroll: true });
  }
  function closeNow() {
    if (sheetBack) { sheetBack = 0; hideSheet(true); }
    root.hidden = true;
    slides.forEach((s) => (s.firstChild.src = ""));
    list = []; backId = 0;
  }
  const close = () => { if (sheetBack) history.go(-2); else popBack(backId); };   // 信息面板开着：两层一起退
  closeBtn.onclick = close;
  // 删了一张（或照片变了）：换新的列表，停在差不多的位置；删光了就关掉
  function refresh(shots, keepId = null) {
    if (root.hidden) return;
    const i = keepId ? shots.findIndex((s) => s.id === keepId) : -1;
    list = shots;
    if (!list.length) return close();
    index = i >= 0 ? i : clamp(index, 0, list.length - 1);
    render();
  }

  // ===== 画出当前这张和左右两张 =====
  function render() {
    resetZoom(false);
    [-1, 0, 1].forEach((d, k) => {
      const s = list[index + d], img = slides[k].firstChild;
      slides[k].hidden = !s;
      if (s && img.dataset.id !== s.id) { img.src = s.url; img.dataset.id = s.id; }
      if (!s) { img.removeAttribute("src"); img.dataset.id = ""; }
      slides[k].style.transform = `translateX(${d * 100}%)`;
    });
    track.style.transform = "";
    const s = cur();
    if (!s) return;
    count.textContent = `${index + 1} / ${list.length}`;
    date.textContent = new Date(s.at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const g = groupOf(s);
    badge.textContent = g ? `连拍第 ${g.shots.length - g.shots.indexOf(s)} 张 / 共 ${g.shots.length}${g.best === s ? " · 最清楚" : ""}` : "";
    badge.hidden = !g;
    analyzeBtn.textContent = s.analysis ? "重新分析" : "分析";
    if (!sheet.hidden) fillSheet();
  }
  function go(d) {
    const next = index + d;
    if (!list[next]) return snap();
    const w = root.clientWidth;
    if (reduced()) { index = next; return render(); }
    track.style.transition = "transform .22s var(--ease)";
    track.style.transform = `translateX(${-d * w}px)`;
    setTimeout(() => {
      track.style.transition = "none";
      const imgs = slides.map((s) => s.firstChild);
      // 换位置不换图片：省得重新解码，闪一下
      if (d > 0) { track.append(slides[0]); slides.push(slides.shift()); } else { track.prepend(slides[2]); slides.unshift(slides.pop()); }
      void imgs;
      index = next;
      render();
    }, 220);
  }
  function snap() {
    track.style.transition = reduced() ? "none" : "transform .18s var(--ease)";
    track.style.transform = "";
    root.style.removeProperty("--fade");
    slides[1].style.transform = "translateX(0)";
  }

  // ===== 放大 =====
  function fitBox() {             // 当前这张实际显示多大（object-fit: contain）
    const img = slides[1].firstChild, W = root.clientWidth, H = root.clientHeight;
    const r = img.naturalWidth && img.naturalHeight ? Math.min(W / img.naturalWidth, H / img.naturalHeight) : 1;
    return { W, H, w: (img.naturalWidth || W) * r, h: (img.naturalHeight || H) * r };
  }
  function applyZoom(animate) {
    const b = fitBox();
    zoom.s = clamp(zoom.s, 1, 4);
    const mx = Math.max(0, (b.w * zoom.s - b.W) / 2), my = Math.max(0, (b.h * zoom.s - b.H) / 2);
    zoom.x = clamp(zoom.x, -mx, mx); zoom.y = clamp(zoom.y, -my, my);
    const img = slides[1].firstChild;
    img.style.transition = animate && !reduced() ? "transform .2s var(--ease)" : "none";
    img.style.transform = zoom.s === 1 ? "" : `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`;
    root.classList.toggle("zoomed", zoom.s > 1.01);
  }
  function resetZoom(animate = true) { zoom = { s: 1, x: 0, y: 0 }; applyZoom(animate); }
  function zoomAt(px, py, s) {    // 让手指下面那一点停在原地
    const cx = root.clientWidth / 2, cy = root.clientHeight / 2;
    const qx = (px - cx - zoom.x) / zoom.s, qy = (py - cy - zoom.y) / zoom.s;
    zoom.s = clamp(s, 1, 4);
    zoom.x = px - cx - zoom.s * qx; zoom.y = py - cy - zoom.s * qy;
    applyZoom(true);
  }

  // ===== 手势 =====
  const pts = new Map();
  let g = null, lastTap = 0, tapTimer = 0;
  track.addEventListener("pointerdown", (e) => {
    track.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      g = { kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: zoom.s, x0: zoom.x, y0: zoom.y, m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    } else if (pts.size === 1) {
      g = { kind: "maybe", x: e.clientX, y: e.clientY, t: performance.now(), zx: zoom.x, zy: zoom.y };
    }
  });
  track.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId) || !g) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.kind === "pinch" && pts.size === 2) {
      const [a, b] = [...pts.values()], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cx = root.clientWidth / 2, cy = root.clientHeight / 2;
      const s = clamp(g.s0 * Math.hypot(a.x - b.x, a.y - b.y) / g.d0, 1, 4);
      zoom.s = s;
      zoom.x = m.x - cx - (s / g.s0) * (g.m0.x - cx - g.x0);
      zoom.y = m.y - cy - (s / g.s0) * (g.m0.y - cy - g.y0);
      applyZoom(false);
      return;
    }
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (g.kind === "maybe" && Math.hypot(dx, dy) > 8) {
      g.kind = zoom.s > 1.01 ? "pan" : Math.abs(dx) > Math.abs(dy) ? "swipe" : dy > 0 ? "down" : "up";
      track.style.transition = "none";
    }
    if (g.kind === "pan") { zoom.x = g.zx + dx; zoom.y = g.zy + dy; applyZoom(false); }
    else if (g.kind === "swipe") {
      const edge = (dx > 0 && index === 0) || (dx < 0 && index === list.length - 1);
      track.style.transform = `translateX(${edge ? dx / 3 : dx}px)`;        // 到头了：拉不太动
    } else if (g.kind === "down") {
      slides[1].style.transform = `translate(${dx / 3}px, ${dy}px) scale(${1 - Math.min(0.25, dy / 1600)})`;
      root.style.setProperty("--fade", String(1 - Math.min(0.8, dy / 400)));
    }
  });
  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (!g) return;
    if (g.kind === "pinch") { if (pts.size === 0) { if (zoom.s < 1.05) resetZoom(); g = null; } return; }
    if (pts.size) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y, dt = performance.now() - g.t, w = root.clientWidth;
    if (g.kind === "swipe") {
      if (e.type === "pointercancel") snap();
      else if (Math.abs(dx) > w * 0.2 || (Math.abs(dx) > 30 && dt < 250)) go(dx < 0 ? 1 : -1);
      else snap();
    } else if (g.kind === "down") {
      if (dy > 110 || (dy > 40 && dt < 250)) close(); else snap();
    } else if (g.kind === "up") {
      if (dy < -50) showSheet();
    } else if (g.kind === "maybe" && e.type !== "pointercancel") {           // 点了一下
      const now = performance.now();
      if (now - lastTap < 280) {                                              // 双击：放大 / 还原
        clearTimeout(tapTimer); lastTap = 0;
        if (zoom.s > 1.01) resetZoom(); else zoomAt(e.clientX, e.clientY, 2.5);
      } else {
        lastTap = now;
        tapTimer = setTimeout(() => { if (sheet.hidden) root.classList.toggle("bare"); else hideSheet(); }, 280);
      }
    }
    g = null;
  };
  track.addEventListener("pointerup", end);
  track.addEventListener("pointercancel", end);
  root.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
  });
  addEventListener("resize", () => { if (!root.hidden) { resetZoom(false); render(); } });

  // ===== 照片信息（往上滑或点 ⓘ）=====
  function row(label, value) {
    if (value == null || value === "") return null;
    const r = el("div", "pv-row");
    r.append(el("span", null, label), el("b", null, String(value)));
    return r;
  }
  function fillSheet() {
    const s = cur(), a = s.analysis, img = slides[1].firstChild;
    const rows = [
      row("拍摄时间", fullTime(s.at)),
      row("来源", isCamera(s) ? "在 Phota 里拍的" : "从手机相册导入"),
      row("场景", s.scene ? sceneLabel(s.scene) : "没认出来"),
      row("清晰度", sharpWord(s.quality)),
      row("取景时教练分", Number.isFinite(s.sensor?.coach) ? `${s.sensor.coach} / 10` : ""),
      row("专业参数", s.sensor?.pro || ""),
      row("用到的技能", s.skills?.length ? s.skills.map((k) => "📖 " + k.name).join("  ") : ""),
      row("尺寸", img.naturalWidth ? `${img.naturalWidth} × ${img.naturalHeight}` : ""),
    ].filter(Boolean);
    const head = el("div", "pv-sheet-head");
    head.append(el("span", "pv-grip"));
    const box = el("div", "pv-sheet-body");
    box.append(el("h3", null, "照片信息"), ...rows);
    const ana = el("div", "pv-ana");
    if (a) {
      const t = el("div", "pv-ana-head");
      t.append(el("span", "pv-score", String(a.score ?? "—")), el("span", null, a.title || "上次的分析"));
      ana.append(el("h3", null, "上次的分析"), t);
      if (a.summary) ana.append(el("p", null, a.summary));
      const list = (title, items) => {
        if (!items?.length) return;
        ana.append(el("h4", null, title));
        const ul = el("ul");
        items.forEach((x) => ul.append(el("li", null, typeof x === "string" ? x : `${x.action}${x.why ? " —— " + x.why : ""}`)));
        ana.append(ul);
      };
      list("亮点", a.highlights); list("问题", a.problems); list("下次这样拍", a.suggestions);
      ana.append(el("p", "pv-muted", `分析于 ${fullTime(a.at || s.at)} · 再分析一次会覆盖这份结果`));
    } else ana.append(el("h3", null, "还没分析过"), el("p", "pv-muted", "点下面的「分析」，伙伴帮你看看这张拍得怎么样、下次怎么拍。分析结果会留在这里，以后再看不用重新分析。"));
    box.append(ana);
    sheet.replaceChildren(head, box);
  }
  function showSheet() {
    if (!cur()) return;
    fillSheet();
    sheet.hidden = false;
    root.classList.remove("bare");
    void sheet.offsetWidth;
    sheet.classList.add("on");
    if (!sheetBack) sheetBack = pushBack(() => { sheetBack = 0; hideSheet(true); });
  }
  function hideSheet(now = false) {
    if (!now && sheetBack) { popBack(sheetBack); return; }
    sheet.classList.remove("on");
    if (now || reduced()) sheet.hidden = true; else setTimeout(() => { if (!sheet.classList.contains("on")) sheet.hidden = true; }, 220);
  }
  infoBtn.onclick = () => (sheet.hidden ? showSheet() : hideSheet());
  // 信息面板往下拖：收起
  let sy = null;
  sheet.addEventListener("pointerdown", (e) => { if (sheet.scrollTop <= 0) sy = e.clientY; });
  sheet.addEventListener("pointerup", (e) => { if (sy != null && e.clientY - sy > 60) hideSheet(); sy = null; });

  // ===== 底部按钮 =====
  analyzeBtn.onclick = () => cur() && onAnalyze(cur());
  shareBtn.onclick = () => cur() && onShare(cur());
  deleteBtn.onclick = () => cur() && onDelete(cur());

  function layout() { root.style.setProperty("--vw", root.clientWidth + "px"); }
  return { open, close, refresh, isOpen: () => !root.hidden, current: cur };
}
