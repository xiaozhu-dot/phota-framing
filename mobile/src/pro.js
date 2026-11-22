// 专业模式：手动调 ISO、快门、曝光补偿、白平衡、对焦 + 直方图 + 测光表 + 让她推荐参数
//
// 曝光三要素：光圈（进光的"窗户"有多大）、快门（窗户开多久）、ISO（传感器有多"敏感"）
//   手机的光圈是固定的，所以手机上能调的只有快门和 ISO：
//   快门越慢 → 越亮，但手一抖、东西一动就糊；ISO 越高 → 越亮，但噪点越多
// 能不能调、能调多大范围，要看手机和浏览器（camera.js 的 proCaps）；不支持的格子会说明原因
import { exposureStats, toDataURL } from "./vision.js";
import { proAdvice, isConfigured } from "./ai.js";
import { placeSkillChip } from "./skill-ui.js";

const $ = (id) => document.getElementById(id);
const SHUTTERS = [1 / 8000, 1 / 4000, 1 / 2000, 1 / 1000, 1 / 500, 1 / 250, 1 / 125, 1 / 60, 1 / 30, 1 / 15, 1 / 8, 1 / 4, 1 / 2, 1];
const ISOS = [50, 64, 100, 125, 200, 400, 800, 1600, 3200, 6400, 12800];
export const fmtShutter = (s) => (s >= 1 ? `${+s.toFixed(1)}"` : `1/${Math.round(1 / s)}`);
const fmtEV = (v) => (Math.abs(v) < 0.05 ? "±0" : (v > 0 ? "+" : "−") + Math.abs(v).toFixed(1));
const WB_NAMES = [[3200, "室内暖光"], [4300, "荧光灯"], [5800, "日光"], [7000, "阴天"], [Infinity, "阴影"]];
const wbName = (k) => WB_NAMES.find(([lim]) => k < lim)[1];

const DIALS = [
  { key: "iso", label: "ISO" },
  { key: "shutter", label: "快门" },
  { key: "ev", label: "曝光" },
  { key: "wb", label: "白平衡" },
  { key: "focus", label: "对焦" },
  { key: "aperture", label: "光圈" },
];

const WHY_FIXED = {
  iso: "这台相机（或这个浏览器）不让网页手动调 ISO。安卓手机上的 App 里一般可以。",
  shutter: "这台相机（或这个浏览器）不让网页手动调快门。安卓手机上的 App 里一般可以。",
  focus: "这台相机不支持手动对焦（电脑摄像头大多是定焦的）。",
  aperture: "手机镜头的光圈是固定的（只有极少数手机能变），所以没法调。想让背景更虚：靠近主体、用 2× 长焦、主体离背景远一点；想让前后都清楚：退远一点拍。",
};

const AUTO = { iso: null, shutter: null, ev: 0, wb: null, focus: null };

export function setupPro({ cam, getFrame, onState, getScene = () => null }) {
  let on = false, sel = "iso", editing = false, loop = 0, caps = {}, abort = null, advice = null;
  const p = { iso: null, shutter: null, ev: 0, wb: null, focus: null };   // null = 自动
  let applied = { hw: [], sim: [], failed: [] };

  // 每个参数可以取哪些值
  function stops(key) {
    const c = caps[key];
    if (key === "iso" && c) return withEnds(ISOS.filter((v) => v >= c.min && v <= c.max), c);
    if (key === "shutter" && c) return SHUTTERS.filter((v) => v >= c.min - 1e-9 && v <= Math.min(1, c.max) + 1e-9);
    if (key === "ev") {
      const r = c || { min: -2, max: 2, step: 1 / 3 };                 // 不支持就数码模拟 ±2 档
      const step = r.step >= 0.1 ? r.step : 1 / 3, out = [];
      for (let v = r.min; v <= r.max + 1e-6; v += step) out.push(Math.round(v * 100) / 100);
      return out;
    }
    if (key === "wb") {
      const r = c || { min: 2500, max: 8000 }, out = [];
      for (let v = Math.ceil(r.min / 100) * 100; v <= r.max; v += 100) out.push(v);
      return out;
    }
    if (key === "focus" && c) return Array.from({ length: 41 }, (_, i) => c.min + ((c.max - c.min) * i) / 40);
    return [];
  }
  const withEnds = (list, c) => (list.length ? list : [c.min, c.max]);
  const supported = (key) => (key === "ev" || key === "wb" ? true : key === "aperture" ? false : Boolean(caps[key]));
  const manual = () => p.iso != null || p.shutter != null;

  function valueText(key) {
    const now = cam.proNow();
    switch (key) {
      // A = 自动（后面是相机自动选的值）；手动曝光时没动过的那个也被锁住了，不再带 A
      case "iso": return p.iso != null ? String(p.iso) : now.iso && caps.iso ? `${manual() ? "" : "A "}${Math.round(now.iso)}` : "自动";
      case "shutter": return p.shutter != null ? fmtShutter(p.shutter) : now.shutter && caps.shutter ? `${manual() ? "" : "A "}${fmtShutter(now.shutter)}` : "自动";
      case "ev": return manual() ? "—" : fmtEV(p.ev);
      case "wb": return p.wb != null ? `${p.wb}K` : "自动";
      case "focus": return p.focus != null ? "手动" : "自动";
      case "aperture": return "固定";
    }
  }

  // ===== 画界面 =====
  const shown = {};                                                    // 上次显示的值：变了就让数字跳一下
  function render() {
    $("proDials").replaceChildren(...DIALS.map(({ key, label }) => {
      const b = document.createElement("button");
      b.className = "dial" + (key === sel && editing ? " on" : "") + (supported(key) ? "" : " off") + (isManual(key) ? " manual" : "");
      b.setAttribute("aria-expanded", String(key === sel && editing));
      b.setAttribute("aria-controls", "proAdjust");
      b.innerHTML = `<small></small><b></b>`;
      b.querySelector("small").textContent = label;
      const v = valueText(key), val = b.querySelector("b");
      val.textContent = v;
      if (shown[key] != null && shown[key] !== v) val.classList.add("bump");
      shown[key] = v;
      b.onclick = () => {
        editing = key !== sel || !editing;
        sel = key;
        if (!supported(key)) showNote(editing);
        render();
      };
      return b;
    }));
    const list = stops(sel), adjust = $("proAdjust");
    const usable = supported(sel) && list.length && !(sel === "ev" && manual());
    adjust.hidden = !editing || !usable;
    if (usable) {
      const cur = p[sel];
      const range = $("proRange");
      range.max = String(list.length - 1);
      range.value = String(cur == null ? defaultIndex(sel, list) : nearest(sel, list, cur));
      $("proAuto").classList.toggle("on", cur == null || (sel === "ev" && !cur));
      $("proAuto").textContent = sel === "ev" ? "归零" : "自动";
      $("proVal").textContent = valueText(sel);
    }
    $("proNote").textContent = note();
    onState?.(on);
  }
  function showNote(visible = true) {
    $("proNote").hidden = !visible;
    $("proHelp").setAttribute("aria-expanded", String(visible));
    $("proHelp").textContent = visible ? "收起" : "说明";
  }
  $("proHelp").onclick = () => showNote($("proNote").hidden);
  const isManual = (key) => (key === "ev" ? Boolean(p.ev) && !manual() : key === "aperture" ? false : p[key] != null);
  // 在可选值里找最接近 v 的那一个的位置。ISO、快门按"档"算（翻倍算一档，所以比较比值），其他按数值差算
  function nearest(key, list, v) {
    const dist = key === "iso" || key === "shutter" ? (x) => Math.abs(Math.log(x / v)) : (x) => Math.abs(x - v);
    return list.reduce((bi, x, i) => (dist(x) < dist(list[bi]) ? i : bi), 0);
  }
  function defaultIndex(key, list) {
    const now = cam.proNow();
    const guess = { iso: now.iso || 100, shutter: now.shutter || 1 / 60, ev: 0, wb: now.wb || 5500 }[key];
    return guess == null ? Math.floor(list.length / 2) : nearest(key, list, guess);
  }

  // 说明 / 提醒：这是专业模式"教学"的部分
  function note() {
    if (advice) return advice;
    if (!supported(sel)) return WHY_FIXED[sel];
    const tips = [];
    if (sel === "ev" && manual()) tips.push("手动曝光时，亮度由 ISO 和快门决定，曝光补偿不起作用。看测光表：指针在 0 附近就合适。");
    if (manual()) tips.push("手动曝光：亮度不会再自动调整。快门每慢一档（时间翻倍）或 ISO 翻倍，画面亮一倍。");
    if (p.shutter != null && p.shutter > 1 / 60) tips.push(`快门 ${fmtShutter(p.shutter)} 比较慢：手持容易抖糊，靠着东西或用三脚架。`);
    if (p.shutter != null && p.shutter > 1 / 30) tips.push("预览会变卡（视频最快也要 1/30 秒一帧）。");
    if (p.iso != null && p.iso >= 1600) tips.push(`ISO ${p.iso} 很高：画面会有明显噪点。`);
    if (sel === "wb") tips.push(p.wb != null ? `${p.wb}K 适合${wbName(p.wb)}。数值调低画面变冷（偏蓝），调高变暖（偏黄）。` : "白平衡让白色看起来是白的。室内暖光约 3000K，日光约 5500K，阴天约 6500K。");
    if (sel === "focus" && p.focus != null) tips.push("手动对焦：滑杆往一边是近处清楚，另一边是远处清楚。");
    if (applied.sim.includes(sel)) tips.push("（这台相机不能直接调，这是数码模拟：预览和拍出来的照片效果一致）");
    if (applied.failed.length) tips.push("有的参数相机没接受，已退回自动。");
    if (!tips.length) tips.push({ iso: "ISO：传感器的灵敏度。越低画面越干净，光线暗时才提高。", shutter: "快门：拍一张照片时\"开窗\"多久。快 = 能定格动作；慢 = 更亮，但容易糊。", ev: "曝光补偿：在自动曝光的基础上让画面更亮或更暗。拍雪景、白墙时 +0.7，拍夜景、黑色主体时 −0.7。" }[sel] || "");
    return tips.join(" ");
  }

  async function apply() {
    applied = await cam.applyPro(p);
    if (applied.failed.includes("exposure")) { p.iso = p.shutter = null; }
    if (applied.failed.includes("wb")) p.wb = null;
    if (applied.failed.includes("focus")) p.focus = null;
    render();
  }

  $("proRange").oninput = () => {
    const list = stops(sel), v = list[+$("proRange").value];
    p[sel] = v;
    advice = null;
    $("proVal").textContent = valueText(sel);
    clearTimeout(apply.t);
    apply.t = setTimeout(apply, 120);                                  // 拖动时不要每一格都去调相机
  };
  $("proAuto").onclick = () => {
    if (sel === "iso" || sel === "shutter") p.iso = p.shutter = null;   // ISO 和快门一起回到自动
    else p[sel] = sel === "ev" ? 0 : null;
    advice = null;
    apply();
  };

  // ===== 直方图 + 测光表 =====
  async function meterLoop(id) {
    while (on && id === loop) {
      if (cam.ready) draw();
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  let lastEV = null;
  function draw() {
    const f = cam.frame(128);
    const d = f.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, f.width, f.height).data;
    const bins = new Uint32Array(64);
    for (let i = 0; i < d.length; i += 4) bins[Math.min(63, (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) >> 2)]++;
    const c = $("histo"), g = c.getContext("2d"), max = Math.max(...bins.slice(1, 63)) || 1;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = "rgba(255,255,255,.75)";
    const bw = c.width / 64;
    bins.forEach((n, i) => { const hgt = Math.min(1, n / max) * c.height; g.fillRect(i * bw, c.height - hgt, bw + 0.5, hgt); });
    // 两端有大量像素 = 死黑 / 死白，标红
    const n = d.length / 4;
    g.fillStyle = "#E8A33D";   // 设计系统的琥珀色
    if (bins[0] / n > 0.02) g.fillRect(0, 0, 2, c.height);
    if (bins[63] / n > 0.02) g.fillRect(c.width - 2, 0, 2, c.height);

    const ev = exposureStats(f).ev;
    lastEV = lastEV == null ? ev : lastEV * 0.6 + ev * 0.4;
    const clamped = Math.max(-3, Math.min(3, lastEV));
    $("evNeedle").style.left = ((clamped + 3) / 6) * 100 + "%";
    $("evNeedle").classList.toggle("ok", Math.abs(lastEV) < 0.7);
    $("evText").textContent = `EV ${fmtEV(lastEV)}`;
    // 自动模式下，相机报告的 ISO / 快门会变，顺手刷新格子里的数
    if (!manual() && (caps.iso || caps.shutter)) {
      const btns = $("proDials").children;
      btns[0].querySelector("b").textContent = valueText("iso");
      btns[1].querySelector("b").textContent = valueText("shutter");
    }
  }

  // ===== 让她推荐参数（一次 AI 请求）=====
  const range = (c, fmt) => (c ? `${fmt(c.min)} ~ ${fmt(c.max)}` : "不支持");
  async function ask(settings, openSettings) {
    if (!isConfigured(settings)) return openSettings("填好 AI 接口后，我就能帮你挑参数");
    if (!cam.ready) return;
    $("proAsk").classList.add("busy");
    advice = "让我看看光线…";
    $("proNote").textContent = advice;
    showNote();
    $("proApply").hidden = true;
    abort?.abort();
    abort = new AbortController();
    try {
      const e = exposureStats(cam.frame(320));
      const facts = {
        测光表_EV: Math.round((lastEV ?? e.ev) * 10) / 10,
        曝光判断: e.verdict + (e.note ? `（${e.note}）` : ""),
        死白_百分比: e.over, 死黑_百分比: e.under,
        当前参数: describe(),
        这台相机能调的范围: {
          ISO: range(caps.iso, Math.round), 快门: range(caps.shutter && { min: caps.shutter.min, max: Math.min(1, caps.shutter.max) }, fmtShutter),
          曝光补偿: caps.ev ? range(caps.ev, fmtEV) : "−2 ~ +2（数码模拟）", 白平衡: caps.wb ? range(caps.wb, (k) => k + "K") : "2500K ~ 8000K（数码模拟）",
        },
      };
      const r = await proAdvice(settings, toDataURL(getFrame(), 0.7), facts, abort.signal, getScene());
      showAdvice(r);
    } catch (err) {
      if (err.name !== "AbortError") { advice = "没看清：" + String(err.message).slice(0, 40); $("proNote").textContent = advice; }
    } finally {
      $("proAsk").classList.remove("busy");
    }
  }

  // 把 AI 的推荐换算成这台相机能用的值，点"应用"才生效
  let pending = null;
  // 把 AI 的推荐（专业模式的"让她推荐"和实时教练都用这个格式）换算成这台相机能用的值，并验算亮度
  // 返回 { next: 新参数, label: 一句话概括, check: 验算说明 }
  function plan(r) {
    const next = { ...p };
    const snap = (key, v) => { const list = stops(key); return list.length ? list[nearest(key, list, v)] : null; };
    const sec = typeof r.shutter === "string" && /^\s*1\s*\/\s*\d+/.test(r.shutter) ? 1 / parseFloat(r.shutter.split("/")[1]) : parseFloat(r.shutter);
    if (r.mode === "manual" && (caps.shutter || caps.iso)) {
      next.shutter = caps.shutter && Number.isFinite(sec) ? snap("shutter", sec) : null;
      next.iso = caps.iso && Number.isFinite(+r.iso) ? snap("iso", +r.iso) : null;
      next.ev = 0;
    } else {
      next.iso = next.shutter = null;
      next.ev = Number.isFinite(+r.ev) ? snap("ev", +r.ev) : 0;
    }
    if (r.wb !== undefined) next.wb = Number.isFinite(+r.wb) && r.wb != null ? snap("wb", +r.wb) : null;
    let check = "";
    // 帮 AI 验算：曝光量 ∝ 快门时间 × ISO。和现在比差几档，加上测光表现在的读数，就是用了之后大概的 EV
    const now = cam.proNow();
    const t0 = p.shutter ?? now.shutter, i0 = p.iso ?? now.iso;
    // 分工：AI 决定"意图"（比如要 1/250 定格走动的人），程序负责算数 —— 亮度差太多就改 ISO 补回来，快门保持 AI 的选择
    if (next.shutter != null && t0 && i0 && lastEV != null) {
      const evAfter = (iso) => lastEV + Math.log2((next.shutter * iso) / (t0 * i0));
      const after = evAfter(next.iso ?? i0);
      if (Math.abs(after) > 0.7 && caps.iso) {
        const fixed = snap("iso", (next.iso ?? i0) * 2 ** -after);
        const left = evAfter(fixed);
        check = `我验算了一下：照这样拍会${after < 0 ? "偏暗" : "偏亮"} ${Math.abs(after).toFixed(1)} 档，所以把 ISO 改成 ${fixed}` +
          (Math.abs(left) > 0.7 ? `（ISO 到头了，还差 ${Math.abs(left).toFixed(1)} 档，${left < 0 ? "需要放慢快门" : "需要加快快门"}）。` : "，亮度就合适了。");
        next.iso = fixed;
      } else {
        check = `我验算了一下：照这样拍测光表大约 ${fmtEV(after)}，${Math.abs(after) > 0.7 ? "亮度有偏差，可以自己再微调。" : "亮度合适。"}`;
      }
    }
    const label = [
      next.iso != null && `ISO ${next.iso}`, next.shutter != null && fmtShutter(next.shutter),
      next.iso == null && next.shutter == null && `自动曝光 ${fmtEV(next.ev)}`,
      r.wb !== undefined && (next.wb != null ? `${next.wb}K` : "白平衡自动"),
    ].filter(Boolean).join(" · ");
    return { next, label, check };
  }
  function showAdvice(r) {
    const { next, label, check } = plan(r);
    pending = next;
    advice = `${r.scene ? `【${String(r.scene).slice(0, 10)}】` : ""}${label}。${String(r.why || "").slice(0, 60)} ${check}`;
    $("proNote").textContent = advice;
    placeSkillChip($("proNote"), r._skills);                    // 📖 这次用到的摄影技能
    showNote();
    $("proApply").hidden = false;
  }
  $("proApply").onclick = () => {
    if (!pending) return;
    Object.assign(p, pending);
    pending = null;
    advice = null;
    $("proApply").hidden = true;
    apply();
  };

  // 现在的参数，写成一句话（给 AI 教练、给照片记下来）
  function describe() {
    const now = cam.proNow();
    const iso = p.iso ?? (caps.iso && now.iso ? Math.round(now.iso) : null);
    const sh = p.shutter ?? (caps.shutter && now.shutter ? now.shutter : null);
    return [
      manual() ? "手动曝光" : "自动曝光",
      iso != null && `ISO ${iso}`, sh != null && `快门 ${fmtShutter(sh)}`,
      !manual() && p.ev && `曝光补偿 ${fmtEV(p.ev)}`, p.wb != null && `白平衡 ${p.wb}K`, p.focus != null && "手动对焦",
    ].filter(Boolean).join("，");
  }

  return {
    get on() { return on; },
    // 相机打开后调用：读取这台相机能调什么，把之前的设置重新用上
    // 相机打开（或重新打开）后调用：读取这台相机能调什么，把设置重新用上；没开专业模式就保证是全自动
    async attach() {
      caps = cam.proCaps();
      if (on) await apply(); else { await cam.applyPro(AUTO); render(); }
    },
    async toggle(v = !on) {
      on = v;
      $("pro").hidden = !on;
      $("meterBox").hidden = !on;
      if (on) { editing = false; showNote(false); }
      onState?.(on);
      if (on) { caps = cam.proCaps(); await apply(); meterLoop(++loop); }
      else { loop++; abort?.abort(); await cam.applyPro(AUTO); }   // 关掉专业模式 = 回到全自动（手动参数记着，下次打开再用）
      requestAnimationFrame(() => cam.layout());                        // 面板占了位置，取景框重新排
      onState?.(on);
    },
    stop() { loop++; abort?.abort(); },
    resume() { if (on) meterLoop(++loop); },
    ask,
    // 给实时教练：这台相机能调什么、测光表现在多少（教练据此决定要不要建议改参数）
    facts: () => (on ? {
      测光表_EV: lastEV == null ? "未知" : Math.round(lastEV * 10) / 10,
      能调的范围: { ISO: range(caps.iso, Math.round), 快门: range(caps.shutter && { min: caps.shutter.min, max: Math.min(1, caps.shutter.max) }, fmtShutter),
                    曝光补偿: caps.ev ? range(caps.ev, fmtEV) : "−2 ~ +2（数码模拟）" },
    } : null),
    // 教练建议改参数：换算 + 验算，返回给界面显示的文字和"应用"函数
    fromCoach(r) {
      if (!on || !r || typeof r !== "object") return null;
      const { next, label } = plan({ wb: undefined, ...r });
      const same = ["iso", "shutter", "ev"].every((k) => next[k] === p[k]);
      if (same) return null;
      return { label, apply: async () => { Object.assign(p, next); advice = null; await apply(); } };
    },
    // 只有用了专业模式才返回参数
    describe: () => (on ? describe() : null),
    shotInfo: () => (on ? { pro: describe(), shutter: p.shutter ?? (caps.shutter ? cam.proNow().shutter : undefined) } : null),
  };
}
