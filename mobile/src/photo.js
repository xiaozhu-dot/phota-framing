// 照片模式：选一张照片（或从摄影集里挑一张）→ 分析 → 气泡飞进各个方框
//   快速：测量 → 两个 AI 请求并行（一次问完）
//   深度：agent 自己决定测量、放大细看、试裁剪，检查过再下结论（见 agent.js），每一步都显示在"思考过程"里
import { review, reviewAgain, suggest, isConfigured } from "./ai.js";
import { loadImage, toCanvas, toDataURL, measure, metricFacts, renderCrop } from "./vision.js";
import { channel } from "./bubbles.js";
import { runAgent, selfCheck } from "./agent.js";
import { recordAnalysis } from "./memory.js";
import { saveToGallery } from "./gallery.js";
import { detect, classifyScene } from "./scene-detect.js";
import { placeSkillChip } from "./skill-ui.js";

const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;     // AI 的文字一律当纯文本，不当网页代码
  return e;
}
const BOXES = { metrics: "meter", review: "review", suggestions: "tips", crop: "crop" };

export function setupPhoto({ settings, saveSetting, speakAs, openSettings, onResult = () => {} }) {   // onResult：分析完把结果交给相册存起来
  const pet = window.pet;
  const talk = channel();
  let current = null;            // { src, name, sensor }（sensor：拍摄时的陀螺仪读数，只有本 App 拍的照片才有）
  let run = 0;                   // 分析编号，换照片时作废旧结果
  let abort = null;

  $("file").onchange = (e) => {
    const f = e.target.files[0];
    if (f) show(URL.createObjectURL(f), f.name);
    e.target.value = "";
  };
  $("analyzeBtn").onclick = () => (settings().analysis === "deep" ? analyzeDeep() : analyze());

  // 快速 / 深度 切换
  function syncMode() {
    const deep = settings().analysis === "deep";
    document.querySelectorAll("#modeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.a === settings().analysis));
    $("logBox").hidden = !deep;
    $("modeNote").textContent = deep
      ? "深度：伙伴会自己测量、放大细看、试裁剪，检查过再下结论（更准，大约多花 3～5 倍 token）"
      : "快速：一次问完，几秒出结果";
  }
  document.querySelectorAll("#modeSeg button").forEach((b) => (b.onclick = () => { saveSetting({ analysis: b.dataset.a }); syncMode(); }));
  syncMode();

  function setStatus(stage, text, cls = "") {
    const s = $("st-" + stage);
    s.textContent = text;
    s.className = "st " + cls;
  }
  function resetBoxes(status) {
    for (const [stage, id] of Object.entries(BOXES)) {
      $(id).replaceChildren(el("p", "empty", "等伙伴开口"));
      setStatus(stage, status, status === "接收中" ? "wait" : "");
    }
  }
  const clearBox = (id) => { const b = $(id); b.replaceChildren(); return b; };

  // 分析时：宠物举着放大镜，眼睛跟着照片上一条扫描线从上往下、左右来回看；结束时放下
  let scanTimer = 0;
  function scan(on, prop = "magnifier") {
    clearInterval(scanTimer);
    $("print").classList.toggle("scanning", on);
    pet.hold(on ? prop : null);
    if (!on) { pet.lookAt(null, 0); return; }
    $("print").style.setProperty("--scan-h", $("preview").offsetHeight + "px");
    const t0 = performance.now();
    scanTimer = setInterval(() => {
      const r = $("preview").getBoundingClientRect(), t = (performance.now() - t0) / 1000;
      const y = r.top + r.height * ((t / 2.4) % 1), x = r.left + r.width * (0.5 + 0.4 * Math.sin(t * 2.6));
      pet.lookAt({ x, y }, 400);
    }, 120);
  }

  function show(src, name = "photo.jpg", sensor = null, id = null) {        // id：相册里这张照片的编号（分析结果存回去用）
    run++;
    scan(false);
    abort?.abort();
    talk.cancel();
    $("log").replaceChildren(el("p", "empty", "深度分析时，伙伴每一步在想什么、做了什么，都会记在这里"));
    setStatus("log", "待命");
    document.body.classList.remove("running");
    current = { src, name, sensor, id };
    const img = $("preview");
    img.src = src;
    img.hidden = false;
    img.onload = () => {
      $("printCap").textContent = `${name.toUpperCase()} · ${img.naturalWidth}×${img.naturalHeight}`;
      $("printCap").hidden = false;
    };
    $("print").classList.replace("empty", "filled");
    $("printEmpty").hidden = true;
    $("analyzeBtn").disabled = false;
    $("analyzeLabel").textContent = "按下快门 · 开始分析";
    resetBoxes("待命");
    window.scrollTo({ top: 0 });
    pet.reset();
    pet.hop(0.8);
    pet.caption("让我看看这张");
  }

  function failBox(stage, message) {
    const p = el("p", "err slot", "这一部分没能完成：" + message);
    clearBox(BOXES[stage]).append(p);
    setStatus(stage, "未完成", "fail");
    talk.say("这里出了点问题", p, "bad");
  }

  async function analyze() {
    if (!current) return;
    const s = settings();
    if (!isConfigured(s)) return openSettings("先填好 AI 接口，我才能看照片");
    const my = ++run;
    talk.cancel();
    resetBoxes("接收中");
    document.body.classList.add("running");
    $("analyzeBtn").disabled = true;
    $("analyzeLabel").textContent = `${pet.name}在看…`;
    pet.reset();
    pet.mode("thinking");
    scan(true);
    pet.caption("正在读光线");
    const t0 = performance.now();
    const sec = () => ((performance.now() - t0) / 1000).toFixed(1) + "s";

    let base;
    try {
      base = toCanvas(await loadImage(current.src), 1000);
    } catch (e) {
      Object.keys(BOXES).forEach((st) => failBox(st, e.message));
      return finish(my);
    }

    // 第 1 步：本地测量，几乎瞬间完成
    const metrics = measure(base, current.sensor);
    showMetrics(metrics);
    setStatus("metrics", sec());

    // 第 2、3 步：两个 AI 请求同时发出
    const image = toDataURL(base);
    const facts = metricFacts(metrics);
    pet.caption("琢磨构图");
    // 点评回来后先自检（和深度分析同一套规则）；有矛盾就请它修正一次
    const got = {};                                          // 两个请求的结果，最后合成一份存进相册
    const p1 = review(s, image, facts).then(async (r) => {
      const issues = selfCheck(r, metrics, []);
      if (!issues.length || my !== run) return { r, fixed: false };
      try { return { r: await reviewAgain(s, image, facts, r, issues), fixed: true }; } catch { return { r, fixed: false }; }
    }).then(
      ({ r, fixed }) => { if (my === run) { got.review = r; showReview(r); setStatus("review", sec() + (fixed ? " · 已自检修正" : "")); } },
      (e) => { if (my === run) failBox("review", e.message); }
    );
    const p2 = sceneOf(base).then((scene) => suggest(s, image, facts, scene)).then(
      (r) => {
        if (my !== run) return;
        got.tips = r;
        showTips(r);
        setStatus("suggestions", sec());
        showCrop(renderCrop(base, r.crop));
        setStatus("crop", sec());
      },
      (e) => { if (my === run) { failBox("suggestions", e.message); failBox("crop", "没有建议，也就没有裁剪方案"); } }
    );
    await Promise.all([p1, p2]);
    if (my === run && got.review) keep({ ...got.review, suggestions: got.tips?.suggestions, _skills: got.tips?._skills }, "quick");
    finish(my);
  }

  // 照片是什么场景（人像 / 街拍 / 动物 / 风景）：在手机本地认一下，用来挑摄影技能；认不出就当不知道
  async function sceneOf(canvas) {
    try { const dets = await detect(canvas); return dets ? classifyScene(dets) : null; } catch { return null; }
  }

  // ===== 深度分析：agent 循环 =====
  async function analyzeDeep() {
    if (!current) return;
    const s = settings();
    if (!isConfigured(s)) return openSettings("先填好 AI 接口，我才能看照片");
    const my = ++run;
    talk.cancel();
    resetBoxes("接收中");
    $("log").replaceChildren();
    setStatus("log", "思考中", "wait");
    document.body.classList.add("running");
    $("analyzeBtn").disabled = true;
    $("analyzeLabel").textContent = `${pet.name}在仔细看…`;
    pet.reset();
    pet.mode("thinking");
    scan(true, "notes");                                   // 深度分析：一边看一边记笔记
    pet.caption("先想想要查什么");
    const t0 = performance.now();
    const sec = () => ((performance.now() - t0) / 1000).toFixed(1) + "s";

    let base, full;
    try {
      const img = await loadImage(current.src);
      base = toCanvas(img, 1000);
      full = toCanvas(img, 3000);                       // "放大细看"用的高分辨率版本
    } catch (e) {
      Object.keys(BOXES).forEach((st) => failBox(st, e.message));
      return finish(my);
    }

    abort = new AbortController();
    try {
      const result = await runAgent(s, base, {
        full, sensor: current.sensor, scene: await sceneOf(base),
        signal: abort.signal,
        onStep: (st) => {
          if (my !== run) return;
          addLogEntry(st);
          pet.caption(`第 ${st.step} 步：${st.name}`);
          if (st.metrics) {
            showMetrics(st.metrics);
            setStatus("metrics", sec());
          }
        },
      });
      if (my !== run) return;
      setStatus("log", `${result.steps} 步 · ${sec()}`);
      const f = result.final || {};
      if (!result.metrics) { showMetrics(measure(base, current.sensor)); setStatus("metrics", sec()); }
      showReview(f);
      setStatus("review", sec());
      showTips(f);
      setStatus("suggestions", sec());
      showCrop(renderCrop(base, f.crop));
      setStatus("crop", sec());
      recordAnalysis({ score: parseInt(f.score), habits: f.habits });   // 记进长期记忆
      keep(f, "deep");
    } catch (e) {
      if (my === run && e.name !== "AbortError") {
        setStatus("log", "未完成", "fail");
        ["review", "suggestions", "crop"].forEach((st) => failBox(st, e.message));
      }
    }
    finish(my);
  }

  // 思考过程里的一条：第几步 · 用了什么工具 · 为什么 · （放大 / 裁剪的图）
  function addLogEntry(st) {
    const row = el("div", "logrow slot" + (st.tool === "final" ? " final" : st.tool === "check" ? " check" : ""));
    const head = el("div", "loghead");
    head.append(el("span", "logn", String(st.step).padStart(2, "0")), el("span", "logtool", st.name));
    row.append(head, el("div", "logthought", st.thought || ""));
    if (st.note) row.append(el("div", "lognote", st.note));
    if (st.image) {
      const img = el("img", "logimg");
      img.src = st.image;
      img.alt = st.name;
      row.append(img);
    }
    $("log").append(row);
    talk.say(`${st.name}：${(st.thought || "").slice(0, 16)}`, row, st.tool === "final" ? "accent" : st.tool === "check" ? "bad" : "");
  }

  // 分析结果留在相册里那张照片上：以后打开大图直接看，不用再花钱分析
  function keep(r, mode) {
    if (!current?.id) return;
    const list = (xs, n) => (Array.isArray(xs) ? xs.filter(Boolean).slice(0, n) : []);
    const score = parseInt(r.score);
    onResult(current.id, {
      mode, at: Date.now(), score: Number.isFinite(score) ? score : null, composition: parseInt(r.composition) || null,
      title: String(r.title || "").slice(0, 20), summary: String(r.summary || "").slice(0, 60),
      highlights: list(r.highlights, 3), problems: list(r.problems, 3), nitpicks: list(r.nitpicks, 2),
      suggestions: list(r.suggestions, 3).map((x) => ({ action: String(x.action || ""), why: String(x.why || "") })),
      skills: r._skills || [],
    });
  }

  function finish(my) {
    if (my !== run) return;
    document.body.classList.remove("running");
    $("analyzeBtn").disabled = false;
    $("analyzeLabel").textContent = "再分析一次";
    pet.mode("idle");
    scan(false);
    talk.done().then(() => pet.caption("说完啦 · 戳戳我再听一遍"));
  }

  // ===== 四个方框 =====
  function showMetrics({ exposure: e, sharpness: sh, horizon: h, pitch }) {
    const tilt = h.found ? h.angle : null;
    const dark = e.verdict === "偏暗", bright = e.verdict === "过曝" || e.verdict === "高光偏多";
    const items = [
      { k: "曝光 Exposure", v: e.verdict, n: `中间亮度 ${e.median}%`, warn: dark || bright, say: `曝光${e.verdict}` },
      { k: "死白 / 死黑", v: `${e.over}/${e.under}%`, n: e.over >= 6 ? "高光丢细节" : e.under >= 10 ? "暗部丢细节" : "细节都在", warn: e.over >= 6 || e.under >= 10, say: `死白 ${e.over}%` },
      { k: "清晰 Sharpness", v: sh.verdict, n: sh.edge != null ? `边缘 ${sh.edge}px` : "边缘太少", warn: sh.verdict === "有点糊" || sh.verdict === "模糊", say: sh.verdict },
      tilt == null
        ? { k: "水平 Level", v: "—", n: h.converging ? "竖线汇聚" : "没有可靠的直线", warn: false, say: "没找到水平线" }
        : { k: "水平 Level", v: tilt + "°", n: (Math.abs(tilt) <= 1 ? "端正" : "倾斜") + ` · ${h.by === "拍摄时的陀螺仪" ? "陀螺仪" : "把握" + h.sure}`, warn: Math.abs(tilt) > 1, say: `水平 ${tilt}°` },
    ];
    if (pitch != null) items[3].n += pitch > 0 ? ` · 仰拍${pitch}°` : ` · 俯拍${-pitch}°`;
    const grid = el("div", "tiles");
    clearBox("meter").append(grid);
    for (const it of items) {
      const tile = el("div", "tile slot" + (it.warn ? " warn" : ""));
      tile.append(el("span", "k", it.k), el("span", "v", it.v), el("span", "n", it.n));
      grid.append(tile);
      talk.say(it.say, tile, it.warn ? "bad" : "");
    }
    if (dark) pet.mood({ eyeSize: 1.28 });                   // 暗 → 瞳孔放大
    else if (bright) pet.mood({ eye: 0.45 });                // 亮 → 眯眼
    if (tilt != null && Math.abs(tilt) > 1) pet.mood({ tilt: Math.max(-16, Math.min(16, tilt * 3)) });
  }

  function showReview(r) {
    const score = Math.max(0, Math.min(10, parseInt(r.score) || 0));
    const box = clearBox("review");
    const row = el("div", "scorerow");
    const scoreEl = el("div", "score slot", String(score));
    scoreEl.append(el("small", null, "/10"));
    const titleEl = el("h3", "title slot", r.title || "构图点评");
    // 两个分：总分（大字）+ 构图分；如果拍的时候教练打过分，也一起列出来，方便对照
    const comp = parseInt(r.composition), coach = current?.sensor?.coach;
    const sub = [Number.isFinite(comp) && `构图 ${comp}`, coach != null && `取景时 ${coach}`].filter(Boolean).join(" · ");
    const titleBox = el("div", "titlebox");
    titleBox.append(titleEl);
    const subEl = sub ? el("span", "subscore slot", sub) : null;
    if (subEl) titleBox.append(subEl);
    row.append(scoreEl, titleBox);
    const sumEl = el("p", "summary slot", r.summary || "");
    const chips = el("div", "chips");
    box.append(row, sumEl, chips);

    talk.say(`${score} 分`, scoreEl, "accent");
    talk.say(r.title || "构图点评", titleEl);
    if (subEl) talk.say(sub, subEl);
    if (r.summary) talk.say(r.summary, sumEl);
    for (const t of r.highlights || []) { const c = el("span", "chip good slot", t); chips.append(c); talk.say(t, c, "good"); }
    for (const t of r.problems || []) { const c = el("span", "chip bad slot", t); chips.append(c); talk.say(t, c, "bad"); }
    for (const t of r.nitpicks || []) { const c = el("span", "chip minor slot", t); chips.append(c); talk.say(t, c); }   // 小瑕疵：不扣分

    pet.mood({ smile: Math.max(-1, Math.min(1, (score - 6) / 3)), ear: score >= 8 ? 1 : score < 6 ? -1 : 0.2, blush: score >= 8 ? 0.8 : 0.3 });
    // 高分：欢呼撒花；低分：挠挠头（不是批评你，是它也在想怎么改）
    if (score >= 8) talk.done().then(() => { pet.celebrate(); pet.cheer(1600); });
    else if (score > 0 && score < 6) talk.done().then(() => pet.scratch(1600));
    speakAs(`这张我给${score}分。${r.summary || ""}`, { context: "review" });
  }

  function showTips(s) {
    const list = clearBox("tips");
    const tips = (s.suggestions || []).filter((t) => t && t.action);
    pet.tips = tips.map((t) => t.action);
    tips.forEach((t, i) => {
      const item = el("div", "tip slot");
      const body = el("div");
      body.append(el("div", "act", t.action), el("div", "why", t.why || ""));
      item.append(el("span", "num", String(i + 1).padStart(2, "0")), body);
      item.onclick = () => { pet.point($("preview"), 1600); pet.nod(); };   // 点一条建议：宠物指回照片
      list.append(item);
      talk.say(t.action, item, "accent");
    });
    placeSkillChip(list, s._skills, { flash: false });     // 📖 这次用到的摄影技能（分析时宠物手里拿着放大镜，不换书）
    // 只念最重要的一条（建议按重要程度排好了），其余的看屏幕就行，不然一口气念太长
    if (tips.length) speakAs(`最重要的一点：${tips[0].action}${tips.length > 1 ? `。还有 ${tips.length - 1} 条写在下面` : ""}`, { context: "review" });
  }

  // 裁剪后的照片存进相册：按裁剪比例从原图重新裁（分析时用的是缩小的图，直接存会糊）
  async function saveCrop(c, btn) {
    btn.disabled = true;
    btn.textContent = "保存中…";
    try {
      const img = await loadImage(current.src);
      const W = img.naturalWidth, H = img.naturalHeight, { l, t, r, b } = c.frac;
      const cut = document.createElement("canvas");
      cut.width = Math.round((r - l) * W);
      cut.height = Math.round((b - t) * H);
      cut.getContext("2d").drawImage(img, l * W, t * H, cut.width, cut.height, 0, 0, cut.width, cut.height);
      const blob = await new Promise((ok, bad) => cut.toBlob((x) => (x ? ok(x) : bad(new Error("图片生成失败"))), "image/jpeg", 0.92));
      const name = `PHOTA_crop_${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}.jpg`;
      if (!(await saveToGallery(blob, name))) {                 // 电脑浏览器里没有相册：直接下载
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
      btn.textContent = `✓ 已存 · ${cut.width}×${cut.height}`;
      pet.hop(0.6);
    } catch (e) {
      btn.textContent = "没存上，再点一次";
      btn.disabled = false;
      console.warn("保存裁剪失败", e);
    }
  }

  function showCrop(c) {
    const box = clearBox("crop");
    if (!c) {
      const p = el("p", "empty slot", "构图很完整，不需要再裁剪。");
      box.append(p);
      talk.say("不用裁剪", p);
      return;
    }
    const fig = el("figure", "cropfig slot");
    const img = el("img");
    img.src = c.annotated;
    const tabs = el("div", "tabs");
    Object.entries({ "标注": c.annotated, "裁剪后": c.cropped, "原图": current.src }).forEach(([name, src], i) => {
      const btn = el("button", i === 0 ? "on" : "", name);
      btn.onclick = () => {
        tabs.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
        btn.classList.add("on");
        img.src = src;
      };
      tabs.append(btn);
    });
    const save = el("button", "crop-save", "存到相册");
    save.onclick = () => saveCrop(c, save);
    tabs.append(save);
    fig.append(tabs, img, el("figcaption", null, `保留 ${c.kept}% · ${c.reason}`));
    box.append(fig);
    talk.say(`裁剪 · 保留 ${c.kept}%`, fig);
  }

  resetBoxes("待命");
  return { show, cancel: () => { run++; abort?.abort(); talk.cancel(); } };
}
