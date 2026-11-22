// 工具测试台：标准答案确切已知的"故意拍坏"测试题，专门考 vision.js 里的测量工具
// 和 eval_horizon.py 的思路一样，只是题目多得多（16 张原图 × 多种角度 / 明暗 / 模糊），而且测的是手机版的 JS 代码
// 每次都重新加载（不用浏览器缓存的旧版本）
const vision = await import("../mobile/src/vision.js?t=" + Date.now());

const NAMES = ["animal_1", "animal_2", "architecture_1", "architecture_2", "food_1", "food_2", "interior_1", "interior_2",
  "landscape_1", "landscape_2", "portrait_1", "portrait_2", "seascape_1", "seascape_2", "street_1", "street_2"];
const TILTS = [-5, -3, -1.5, 1.5, 3, 5];
const out = document.getElementById("out");

function canvasOf(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

// 顺时针转 deg 度，再放大到刚好没有黑边（相当于转完再裁）
function tilt(src, deg) {
  const { width: w, height: h } = src;
  const t = (Math.abs(deg) * Math.PI) / 180;
  const s = Math.cos(t) + (Math.max(w, h) / Math.min(w, h)) * Math.sin(t);
  const c = canvasOf(w, h), g = c.getContext("2d");
  g.translate(w / 2, h / 2);
  g.rotate((deg * Math.PI) / 180);
  g.scale(s, s);
  g.drawImage(src, -w / 2, -h / 2);
  return c;
}

function filtered(src, filter) {
  const { width: w, height: h } = src;
  const c = canvasOf(w, h), g = c.getContext("2d");
  g.filter = filter;
  g.drawImage(src, 0, 0);
  return c;
}

// 噪点：模拟暗光下手机照片的颗粒（噪点会骗过一些清晰度算法）
function noisy(src, sigma) {
  const c = canvasOf(src.width, src.height), g = c.getContext("2d");
  g.drawImage(src, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  let seed = 7;                                                      // 固定的伪随机数，每次跑结果一样
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() + rnd() + rnd() - 1.5) * 2 * sigma;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(im, 0, 0);
  return c;
}

// 模糊：边缘会被"糊进"透明色，所以四边各裁掉一点
function blur(src, px) {
  const b = filtered(src, `blur(${px}px)`);
  const m = Math.ceil(px * 4), c = canvasOf(src.width - 2 * m, src.height - 2 * m);
  c.getContext("2d").drawImage(b, -m, -m);
  return c;
}

const table = (head, rows) =>
  `<table><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</table>`;

async function main() {
  const t0 = performance.now();
  const photos = [];
  for (const n of NAMES) photos.push({ name: n, c: vision.toCanvas(await vision.loadImage(`photos/${n}.jpg`), 1000) });
  let html = "";
  const summary = {};

  // ===== 1. 水平仪 =====
  {
    let right = 0, wrong = 0, abstain = 0, fp = 0, detected = 0, tilted = 0, err = 0, wrongHigh = 0, high = 0;
    const rows = [];
    for (const p of photos) {
      const cells = [p.name];
      for (const deg of [0, ...TILTS]) {
        const r = vision.horizonTilt(deg ? tilt(p.c, deg) : p.c);
        let mark;
        if (r.found && r.sure === "高") high++;
        if (!r.found) { mark = deg ? "—" : "✓"; deg ? abstain++ : right++; }
        else if (Math.abs(r.angle - deg) <= 1) { mark = r.angle.toFixed(1); right++; if (deg) err += Math.abs(r.angle - deg); }
        else { mark = `<b class="bad">${r.angle.toFixed(1)}</b>`; wrong++; if (!deg) fp++; if (r.sure === "高") wrongHigh++; }
        if (r.found && r.sure !== "高") mark += "<sup>中</sup>";
        if (r.converging) mark += "<sup>汇聚</sup>";
        if (deg) { tilted++; if (r.found && Math.abs(r.angle - deg) <= 1) detected++; }
        cells.push(mark);
      }
      rows.push(cells);
    }
    summary.horizon = { right, wrong, wrongHigh, high, abstain, falseAlarmOnOriginals: fp, tiltedDetected: `${detected}/${tilted}`, meanErr: +(err / Math.max(1, detected)).toFixed(2) };
    html += `<h2>1. 水平仪</h2><p>对 ${right} · 错 ${wrong} · 弃权 ${abstain} （其中高把握的错 ${wrongHigh}/${high}）｜ 原图误报 ${fp} ｜ 歪图测准 ${detected}/${tilted}（平均误差 ${summary.horizon.meanErr}°）</p>`;
    html += table(["照片", "原图", ...TILTS.map((d) => d + "°")], rows);
  }

  // ===== 2. 曝光 =====
  {
    const LEVELS = [{ f: 0.35, want: "暗" }, { f: 0.55, want: "暗?" }, { f: 1, want: "正常" }, { f: 1.5, want: "亮?" }, { f: 1.9, want: "亮" }];
    const verdictOf = (e) => e.verdict ?? (e.brightness < 35 ? "偏暗" : e.brightness > 65 ? "偏亮" : "正常");
    const kind = (v) => (/暗/.test(v) ? "暗" : /亮|过曝/.test(v) ? "亮" : "正常");
    const score = { 暗: [0, 0], 亮: [0, 0], 正常: [0, 0] };
    const rows = [];
    for (const p of photos) {
      const cells = [p.name];
      for (const L of LEVELS) {
        const e = vision.exposureStats(L.f === 1 ? p.c : filtered(p.c, `brightness(${L.f})`));
        const k = kind(verdictOf(e));
        const strict = L.want.replace("?", "");
        if (!L.want.endsWith("?")) { score[strict][1]++; if (k === strict) score[strict][0]++; }
        const ok = L.want.endsWith("?") ? k !== (strict === "暗" ? "亮" : "暗") : k === strict;
        cells.push(`<span class="${ok ? "" : "bad"}">${verdictOf(e)} ${e.brightness}%</span>`);
      }
      rows.push(cells);
    }
    summary.exposure = Object.fromEntries(Object.entries(score).map(([k, [a, b]]) => [k, `${a}/${b}`]));
    html += `<h2>2. 曝光判断</h2><p>太暗（×0.35）认出 ${summary.exposure.暗} ｜ 太亮（×1.9）认出 ${summary.exposure.亮} ｜ 原图判为正常 ${summary.exposure.正常}</p>`;
    html += table(["照片", ...LEVELS.map((L) => `×${L.f}`)], rows);
  }

  // ===== 3. 清晰度 =====
  {
    // [名字, 怎么做, 应该是]：清晰 / 不清晰 / 随意（糊 1 像素算"轻微"，判成什么都行，只统计）
    const CASES = [
      ["原图", (c) => c, "清晰"], ["原图+噪点", (c) => noisy(c, 12), "清晰"],
      ["糊 1px", (c) => blur(c, 1), "随意"], ["糊 2px", (c) => blur(c, 2), "不清晰"],
      ["糊 2px+噪点", (c) => noisy(blur(c, 2), 8), "不清晰"], ["糊 3px", (c) => blur(c, 3), "不清晰"],
    ];
    const rows = [], hit = CASES.map(() => 0);
    for (const p of photos) {
      const cells = [p.name];
      CASES.forEach(([, fn, want], j) => {
        const r = vision.sharpness(fn(p.c));
        const ok = want === "清晰" ? r.verdict === "清晰" : want === "不清晰" ? r.verdict !== "清晰" : r.verdict !== "清晰";
        hit[j] += ok;
        cells.push(`<span class="${ok || want === "随意" ? "" : "bad"}">${r.verdict} ${r.edge ?? ""}</span>`);
      });
      rows.push(cells);
    }
    summary.sharpness = Object.fromEntries(CASES.map(([n, , want], j) => [n, `${hit[j]}/16` + (want === "随意" ? "（认出轻微模糊）" : "")]));
    html += `<h2>3. 清晰度</h2><p>${CASES.map(([n], j) => `${n} ${hit[j]}/16`).join(" ｜ ")}（数字 = 最锐利的 1/4 边缘有多宽，像素）</p>`;
    html += table(["照片", ...CASES.map(([n]) => n)], rows);
  }

  summary.seconds = +((performance.now() - t0) / 1000).toFixed(1);
  out.innerHTML = `<pre>${JSON.stringify(summary, null, 2)}</pre>` + html;
  window.__bench = summary;
}

main().catch((e) => { out.textContent = "出错：" + e.stack; window.__bench = { error: String(e) }; });
