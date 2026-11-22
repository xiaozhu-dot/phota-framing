// 图像处理：把电脑版 Python（Pillow / OpenCV）做的事，改成在手机浏览器里用 canvas 完成

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("照片打不开，可能是格式不支持（比如 HEIC）"));
    img.src = src;
  });
}

// 把图片 / 视频画到 canvas 上：缩小到 maxSide 以内，quarter 表示顺时针转几个 90°
export function toCanvas(source, maxSide, quarter = 0) {
  const sw = source.videoWidth || source.naturalWidth || source.width;
  const sh = source.videoHeight || source.naturalHeight || source.height;
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.round(sw * k), h = Math.round(sh * k);
  const rotated = quarter % 2 !== 0;
  const c = document.createElement("canvas");
  c.width = rotated ? h : w;
  c.height = rotated ? w : h;
  const ctx = c.getContext("2d");
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((quarter * Math.PI) / 2);
  ctx.drawImage(source, -w / 2, -h / 2, w, h);
  return c;
}

export const toDataURL = (canvas, quality = 0.85) => canvas.toDataURL("image/jpeg", quality);

function grayscale(canvas) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
  return { g, w, h };
}

// 曝光：不只看"平均亮度"—— 平均值会冤枉白底美食、夜景这类本来就很亮 / 很暗的照片
//   太暗的真正标志：画面里连最亮的地方都不亮（最亮 1% 的像素 < 65%）
//   太亮的真正标志：大片"死白"（任何一个颜色通道冲到顶，细节就没了）
//   这两个阈值是用 eval/tools_bench.html 在 16 张原图 × 5 档明暗上测出来的（原图和拍坏的版本之间留了余量）
// ev：像相机测光表那样，画面平均亮度离"18% 灰"差几档（+1 = 亮一倍）。专业模式的测光表用它
export function exposureStats(canvas) {
  const c = toCanvas(canvas, 320);
  const d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  const hist = new Uint32Array(256);
  let sum = 0, lin = 0, clip = 0, crush = 0;
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    hist[y]++;
    sum += y;
    lin += ((y / 255 + 0.055) / 1.055) ** 2.4;                         // sRGB → 线性光强
    const hi = Math.max(d[i], d[i + 1], d[i + 2]);
    if (hi >= 250) clip++;
    if (hi <= 8) crush++;
  }
  const n = d.length / 4, r1 = (x) => Math.round(x * 10) / 10;
  const pct = (q) => { let acc = 0; for (let v = 0; v < 256; v++) if ((acc += hist[v]) >= q * n) return Math.round(v / 2.55); return 100; };
  const median = pct(0.5), highlights = pct(0.99), over = r1((clip / n) * 100), under = r1((crush / n) * 100);
  let verdict = "正常", note = "";
  if (highlights < 65) { verdict = "偏暗"; note = "画面里连最亮的地方都不亮，整体欠曝"; }
  else if (over >= 12) { verdict = "过曝"; note = `${over}% 的画面死白、没有细节（如果是白色背景或有意的高调风格，可以忽略）`; }
  else if (over >= 6) { verdict = "高光偏多"; note = `${over}% 的画面死白，亮部细节开始丢失`; }
  else if (median < 25) note = "整体偏暗但有高光，可能是有意的低调风格";
  if (under >= 10) note += `${note ? "；" : ""}${under}% 的画面死黑`;
  return {
    brightness: r1((sum / n / 255) * 100), median, highlights, over, under,
    ev: r1(Math.log2(lin / n / 0.18)), verdict, ...(note ? { note } : {}),
  };
}

// 清晰度：手抖 / 没对上焦，边缘会变"软"—— 从暗到亮要过渡好几个像素。所以直接量"边缘有多宽"：
//   1. 找最强的那些边缘点（只取一像素宽的中心线）
//   2. 沿着垂直于边缘的方向横切一刀，量亮度从 10% 升到 90% 走了多少像素
//   3. 取最锐利的 1/4 边缘的宽度 —— 背景虚化不算糊，只要主体（最锐的地方）是清楚的
//   为什么不用常见的"拉普拉斯方差"：噪点也是高频，暗光下一张糊照片会被噪点"骗"成清晰（测试台里试过，确实会）
//   阈值来自 eval/tools_bench.html（长边 800 像素时）：原图 1~2 像素，糊 1 像素 2~3，糊 2 像素 3.5~4.5，加噪点基本不变
export function sharpness(canvas) {
  const { g, w, h } = grayscale(toCanvas(canvas, 800));
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h), m = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      gx[i] = g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1];
      gy[i] = g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1];
      m[i] = Math.hypot(gx[i], gy[i]);
    }
  }
  const R = 7, cands = [];                                              // 横切的半长（像素）
  for (let y = R + 1; y < h - R - 1; y++) {
    for (let x = R + 1; x < w - R - 1; x++) {
      const i = y * w + x, M = m[i];
      if (M < 80) continue;
      const a = Math.round(gx[i] / M), b = Math.round(gy[i] / M);
      if (M >= m[i + b * w + a] && M >= m[i - b * w - a]) cands.push(i);  // 只留边缘的中心线
    }
  }
  cands.sort((p, q) => m[q] - m[p]);
  const at = (x, y) => {                                               // 双线性取值（横切线不一定落在整像素上）
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
    return g[i] * (1 - fx) * (1 - fy) + g[i + 1] * fx * (1 - fy) + g[i + w] * (1 - fx) * fy + g[i + w + 1] * fx * fy;
  };
  const STEP = 0.25, N = (2 * R) / STEP + 1, mid = R / STEP, widths = [];
  const p = new Float32Array(N);
  for (const i of cands) {
    if (widths.length >= 1500) break;
    const x = i % w, y = (i / w) | 0, nx = gx[i] / m[i], ny = gy[i] / m[i];
    let lo = 0, hi = 0, mn = Infinity, mx = -Infinity;
    for (let k = 0; k < N; k++) {
      const v = (p[k] = at(x + nx * (k * STEP - R), y + ny * (k * STEP - R)));
      if (v < mn) mn = v;
      if (v > mx) mx = v;
      if (k < 8) lo += v / 8;
      if (k >= N - 8) hi += v / 8;
    }
    const c = hi - lo;
    if (c < 30 || c < 0.7 * (mx - mn)) continue;                       // 不是干净的"台阶"（细线、密纹理），量不准，跳过
    const t10 = lo + 0.1 * c, t90 = lo + 0.9 * c;
    let a = mid, b = mid;
    while (a > 0 && p[a] > t10) a--;
    while (b < N - 1 && p[b] < t90) b++;
    if (a === 0 || b === N - 1) continue;
    // 在两个采样点之间插值，得到更细的位置
    const fa = a + (t10 - p[a]) / (p[a + 1] - p[a] || 1), fb = b - 1 + (t90 - p[b - 1]) / (p[b] - p[b - 1] || 1);
    widths.push((fb - fa) * STEP);
  }
  if (widths.length < 20) return { verdict: "看不出", note: "画面里清楚的边缘太少（纯色 / 很暗 / 雾气）" };
  widths.sort((x, y) => x - y);
  const edge = Math.round(widths[Math.floor(widths.length / 4)] * 10) / 10;
  return { edge, verdict: edge <= 2.4 ? "清晰" : edge <= 3.2 ? "有点糊" : "模糊" };
}

// 水平线倾斜：和电脑版 measure_horizon_tilt 同样的思路 ——
//   找"长直线"（自己实现的简化版霍夫变换），横线、竖线分别按长度投票，没把握就返回 found: false
// 正数表示画面向右下倾斜
export function horizonTilt(canvas) {
  const { g, w, h } = grayscale(toCanvas(canvas, 640));
  // 1. Sobel 求边缘，并做"非极大值抑制"让边缘变成一像素宽（这样一条线的票数 ≈ 它的长度）
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h), mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      gx[i] = g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1];
      gy[i] = g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1];
      mag[i] = Math.hypot(gx[i], gy[i]);
    }
  }
  const horizPts = [], vertPts = [];
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x, m = mag[i];
      if (m < 120) continue;
      if (Math.abs(gy[i]) > Math.abs(gx[i])) {                 // 接近水平的边缘
        if (m >= mag[i - w] && m >= mag[i + w]) horizPts.push(x, y);
      } else if (m >= mag[i - 1] && m >= mag[i + 1]) {         // 接近竖直的边缘（只要画面中间那段）
        if (x > w * 0.25 && x < w * 0.75) vertPts.push(x, y);
      }
    }
  }
  // 2. 霍夫投票：角度 -12°~12°（每 0.25°），同一条直线上的点会投进同一个格子
  function hough(pts, span, vertical) {
    const angles = [];
    for (let a = -12; a <= 12.001; a += 0.25) angles.push(a);
    const diag = Math.ceil(Math.hypot(w, h)), R = 2 * diag + 2;
    const acc = new Float32Array(angles.length * R);
    const cs = angles.map((a) => Math.cos((a * Math.PI) / 180)), sn = angles.map((a) => Math.sin((a * Math.PI) / 180));
    for (let p = 0; p < pts.length; p += 2) {
      const x = pts[p], y = pts[p + 1];
      for (let k = 0; k < angles.length; k++) {
        // 横线：沿着 (cos a, sin a) 方向；竖线：沿着 (-sin a, cos a) 方向。rho 是点到这条线的"法向距离"
        const rho = (vertical ? x * cs[k] + y * sn[k] : y * cs[k] - x * sn[k]) + diag;
        // 按距离把一票分给相邻两格（斜线在像素上是"台阶"，硬取整会把一条线的票拆散到两格里）
        const r0 = Math.floor(rho), f = rho - r0;
        acc[k * R + r0] += 1 - f;
        acc[k * R + r0 + 1] += f;
      }
    }
    // 3. 票多的格子只是"候选"：散落在同一方向上的纹理点（草地、水波）也能凑够票数。
    //    所以要回到点上核实 —— 沿着这条线排一排，必须是"连续"的一段（断口 ≤ 2% 画面），而且点足够密，才算一条真的直线。
    //    和 OpenCV 的 HoughLinesP 一个道理；用过的点打上标记，同一条线不会被不同的格子重复算
    const band = new Float32Array(angles.length * R);                // 相邻 3 格之和：容忍台阶和角度格子的误差
    for (let i = 1; i < band.length - 1; i++) band[i] = acc[i - 1] + acc[i] + acc[i + 1];
    const minLen = span * 0.25, maxGap = span * 0.02, cands = [];
    for (let k = 0; k < angles.length; k++) {
      for (let r = 3; r < R - 3; r++) {
        const v = band[k * R + r];
        if (v < minLen) continue;
        let peak = true;
        for (let dk = -1; dk <= 1 && peak; dk++) {
          for (let dr = -3; dr <= 3; dr++) {
            const kk = k + dk;
            if ((dk || dr) && kk >= 0 && kk < angles.length && band[kk * R + r + dr] > v) { peak = false; break; }
          }
        }
        if (peak) cands.push({ k, r, v });
      }
    }
    cands.sort((a, b) => b.v - a.v);
    const used = new Uint8Array(pts.length / 2), lines = [];
    for (const { k, r } of cands.slice(0, 120)) {
      const on = [];                                                 // 落在这条线上的点：[沿线位置, 点的编号]
      for (let p = 0, j = 0; p < pts.length; p += 2, j++) {
        if (used[j]) continue;
        const x = pts[p], y = pts[p + 1];
        const rho = (vertical ? x * cs[k] + y * sn[k] : y * cs[k] - x * sn[k]) + diag;
        if (Math.abs(rho - r) <= 1.5) on.push([vertical ? y * cs[k] - x * sn[k] : x * cs[k] + y * sn[k], j]);
      }
      if (on.length < minLen * 0.6) continue;
      on.sort((a, b) => a[0] - b[0]);
      let from = 0;
      for (let i = 1; i <= on.length; i++) {
        if (i < on.length && on[i][0] - on[i - 1][0] <= maxGap) continue;
        const len = on[i - 1][0] - on[from][0], count = i - from;
        if (len >= minLen && count >= len * 0.6) {                   // 够长，而且够密（真直线差不多每个像素都有点）
          lines.push({ a: angles[k], len: Math.min(len, span), at: (r - diag) / (vertical ? w : h) });   // at：线在画面里的位置（竖线 = 横坐标）
          for (let q = from; q < i; q++) used[on[q][1]] = 1;
        }
        from = i;
      }
    }
    return vote(lines, span);
  }
  // 4. 按长度投票：找一个角度，让它附近（±1°）的线加起来最长
  //    只在 ±8° 以内找：手滑拍歪一般不会超过这个角度；更斜的线多半本来就是斜的（树枝、布料花纹、楼梯），
  //    但它们仍然算进"总长"里 —— 画面里斜线越多，越没把握
  function vote(lines, span) {
    if (!lines.length) return null;
    let best = null, bestSum = -1, total = 0;
    for (const l of lines) total += l.len;
    for (let a = -8; a <= 8.001; a += 0.25) {
      let s = 0;
      for (const l of lines) if (Math.abs(l.a - a) <= 1) s += l.len;
      if (s > bestSum) { bestSum = s; best = a; }
    }
    const near = lines.filter((l) => Math.abs(l.a - best) <= 1);
    if (!near.length) return null;
    const support = bestSum / span, agree = bestSum / total, longest = Math.max(...near.map((l) => l.len)) / span;
    if (support < 0.9 || longest < 0.35 || agree < 0.5) return null;
    return { tilt: near.reduce((s, l) => s + l.a * l.len, 0) / bestSum, support, agree, near };
  }
  // 竖线"汇聚"：仰拍 / 俯拍时，左边的竖线和右边的竖线朝相反方向斜（往上收拢成梯形），这时竖线不能用来判断歪没歪。
  // 真的拍歪了，所有竖线朝同一个方向斜。办法：看竖线的角度是不是随着左右位置变化（线性回归的斜率）
  function converging(V) {
    if (!V || V.near.length < 2) return 0;
    const n = V.near, W = n.reduce((s, l) => s + l.len, 0);
    const mx = n.reduce((s, l) => s + l.at * l.len, 0) / W, ma = n.reduce((s, l) => s + l.a * l.len, 0) / W;
    let sxx = 0, sxa = 0;
    for (const l of n) { sxx += l.len * (l.at - mx) ** 2; sxa += l.len * (l.at - mx) * (l.a - ma); }
    const spread = Math.sqrt(sxx / W);
    if (spread < 0.04) return 0;                                       // 竖线都挤在一起，看不出来
    return (sxa / sxx) * 0.5;                                          // 从画面 1/4 处到 3/4 处，竖线角度差了多少度
  }

  const H = hough(horizPts, w, false);
  let V = hough(vertPts, h, true);
  const conv = converging(V);
  const keystone = Math.abs(conv) > 1.2;
  if (keystone) V = null;
  const base = keystone ? { converging: conv > 0 ? "上窄下宽（像是仰拍）" : "上宽下窄（像是俯拍）" } : {};
  let tilt, sure;
  if (H && V) {
    if (Math.abs(H.tilt - V.tilt) > 1.5) return { found: false, ...base, why: "横线和竖线说法不一致" };
    tilt = (H.tilt * H.support + V.tilt * V.support) / (H.support + V.support);
    sure = "高";                                                       // 横线、竖线两种证据互相印证
  } else if (H || V) {
    const one = H || V;
    tilt = one.tilt;
    sure = one.support >= 1.5 && one.agree >= 0.7 ? "高" : "中";      // 只有一种证据：要很多条线都同意才算高把握
  } else return { found: false, ...base, why: keystone ? "竖线因为透视汇聚，横线也不够" : "画面里没有足够长的直线" };
  return { found: true, angle: Math.round(tilt * 10) / 10, sure, by: H && V ? "横线+竖线" : H ? "横线" : "竖线", ...base };
}

// 一次测完：曝光、清晰度、水平
// sensor：用本 App 拍的照片，会带着按快门那一刻的陀螺仪读数 { tilt, pitch }（度）。
//   陀螺仪测的是手机本身歪了多少，比从画面里找直线准得多 —— 有就优先用它
export function measure(canvas, sensor = null) {
  const m = { exposure: exposureStats(canvas), sharpness: sharpness(canvas), horizon: horizonTilt(canvas) };
  if (sensor && Number.isFinite(sensor.tilt)) {
    m.horizon = { found: true, angle: Math.round(sensor.tilt * 10) / 10, sure: "高", by: "拍摄时的陀螺仪", fromImage: m.horizon };
  }
  if (sensor && Number.isFinite(sensor.pitch) && Math.abs(sensor.pitch) >= 8) m.pitch = Math.round(sensor.pitch);
  if (Number.isFinite(sensor?.coach)) m.coach = sensor.coach;
  if (sensor?.pro) m.shot = { text: sensor.pro, slow: sensor.shutter > 1 / 60 };   // 专业模式拍的：当时的 ISO、快门
  return m;
}

// 把测量结果写成 AI 好懂的话（快速分析、agent 的 measure 工具、实时教练都用这一份）
export function metricFacts(m) {
  const e = m.exposure, s = m.sharpness, h = m.horizon;
  const f = {
    曝光: e.verdict + (e.note ? `（${e.note}）` : ""),
    亮度: `平均 ${e.brightness}%，中间值 ${e.median}%，最亮处 ${e.highlights}%`,
    死白_百分比: e.over, 死黑_百分比: e.under,
    清晰度: s.verdict + (s.edge != null ? `（边缘过渡 ${s.edge} 像素，2.4 以内算清晰）` : s.note ? `（${s.note}）` : ""),
    水平: h.found
      ? `${h.angle > 0 ? "向右下" : h.angle < 0 ? "向右上" : ""}倾斜 ${Math.abs(h.angle)}°（依据：${h.by}；把握：${h.sure}）`
      : `没测出来（${h.why || "没有可靠的直线"}），请自己看画面判断`,
  };
  if (h.converging) f.竖线 = `汇聚，${h.converging}`;
  if (m.coach != null) f.取景时教练给的构图分 = `${m.coach}（只看构图；看的是拍摄前的预览小图）`;
  if (m.shot) f.拍摄参数 = m.shot.text + (m.shot.slow ? "（快门比 1/60 慢，手持容易抖糊）" : "");
  if (m.pitch != null) f.拍摄角度 = m.pitch > 0 ? `仰拍约 ${m.pitch}°（陀螺仪），建筑会上窄下宽` : `俯拍约 ${-m.pitch}°（陀螺仪）`;
  return f;
}

// 对齐线（给 agent 的 level_lines 工具用）：在图上画严格水平、竖直的细线，像拿尺子比一比
// 小角度的倾斜（2~5°）光看很难看出，但和一条笔直的线放在一起就很明显
export function levelLines(canvas) {
  const c = toCanvas(canvas, 1600);
  const g = c.getContext("2d"), { width: w, height: h } = c;
  g.strokeStyle = "rgba(255, 40, 60, .85)";
  g.lineWidth = Math.max(1, Math.round(Math.max(w, h) / 700));
  g.beginPath();
  for (let i = 1; i < 10; i++) { const y = Math.round((h * i) / 10) + 0.5; g.moveTo(0, y); g.lineTo(w, y); }
  for (let i = 1; i < 8; i++) { const x = Math.round((w * i) / 8) + 0.5; g.moveTo(x, 0); g.lineTo(x, h); }
  g.stroke();
  return c;
}

// 取出一块区域（给 agent 的"放大细看"工具用）。范围不合理返回 null
export function cropRegion(canvas, box) {
  const v = ["left", "top", "right", "bottom"].map((k) => Math.min(1, Math.max(0, Number(box?.[k]))));
  if (v.some(Number.isNaN)) return null;
  const [l, t, r, b] = v;
  if (r - l < 0.08 || b - t < 0.08) return null;
  const { width: W, height: H } = canvas;
  const c = document.createElement("canvas");
  c.width = Math.round((r - l) * W);
  c.height = Math.round((b - t) * H);
  c.getContext("2d").drawImage(canvas, l * W, t * H, c.width, c.height, 0, 0, c.width, c.height);
  return c;
}

// 裁剪：画标注图（框外压暗 + 框内三分线）和裁剪后的图。方案不合理就返回 null
export function renderCrop(canvas, crop) {
  if (!crop || typeof crop !== "object") return null;
  const v = ["left", "top", "right", "bottom"].map((k) => Math.min(1, Math.max(0, Number(crop[k]))));
  if (v.some(Number.isNaN)) return null;
  const [l, t, r, b] = v, kept = (r - l) * (b - t);
  if (r - l < 0.2 || b - t < 0.2 || kept < 0.3 || kept > 0.98) return null;

  const { width: W, height: H } = canvas;
  const box = { x: l * W, y: t * H, w: (r - l) * W, h: (b - t) * H };

  const ann = document.createElement("canvas");
  ann.width = W;
  ann.height = H;
  const a = ann.getContext("2d");
  a.drawImage(canvas, 0, 0);
  a.fillStyle = "rgba(0,0,0,.65)";
  a.fillRect(0, 0, W, H);
  a.drawImage(canvas, box.x, box.y, box.w, box.h, box.x, box.y, box.w, box.h);
  a.strokeStyle = "rgba(255,255,255,.85)";
  a.lineWidth = Math.max(1, W / 500);
  for (const i of [1, 2]) {
    a.beginPath();
    a.moveTo(box.x + (box.w * i) / 3, box.y); a.lineTo(box.x + (box.w * i) / 3, box.y + box.h);
    a.moveTo(box.x, box.y + (box.h * i) / 3); a.lineTo(box.x + box.w, box.y + (box.h * i) / 3);
    a.stroke();
  }
  a.lineWidth *= 2;
  a.strokeRect(box.x, box.y, box.w, box.h);

  const cut = document.createElement("canvas");
  cut.width = Math.round(box.w);
  cut.height = Math.round(box.h);
  cut.getContext("2d").drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, cut.width, cut.height);

  // frac：裁剪框占原图的比例，保存到相册时按这个比例从原图（全分辨率）重新裁
  return { annotated: toDataURL(ann), cropped: toDataURL(cut), kept: Math.round(kept * 100), reason: String(crop.reason || ""), frac: { l, t, r, b } };
}
