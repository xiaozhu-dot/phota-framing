// 相机：打开摄像头、缩放、照片比例、拍照
// 原则：取景框里看到什么，拍下来（以及发给 AI 教练看的）就是什么
//   比例：取景框按比例变形，视频居中铺满（object-fit: cover）；拍照时按同样的比例居中裁剪
//   缩放：手机支持硬件变焦就用硬件变焦；不支持就放大视频（数码变焦），拍照时按同样倍数居中裁剪

export const RATIOS = { "4:3": 4 / 3, "1:1": 1, "16:9": 16 / 9 };
export const QUALITY = { "标准": 1600, "高清": 2400, "原图": Infinity };

export function createCamera({ video, box, wrap, onZoom, onTap, onReopen }) {
  let stream = null, track = null;
  let hwZoom = null;               // 硬件变焦范围 { min, max }；null 表示只能数码变焦
  let zoom = 1;
  let ratio = "4:3";
  let facing = "environment";      // environment = 后置；user = 前置（自拍）。自拍时预览和照片都是镜像，和照镜子一样

  const constraints = () => ({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
  const mirrored = () => facing === "user";
  // 预览：数码变焦用 scale 放大；自拍再左右翻转
  const setTransform = () => { video.style.transform = [mirrored() ? "scaleX(-1)" : "", hwZoom || zoom === 1 ? "" : `scale(${zoom})`].join(" ").trim(); };

  async function open() {
    stream = await navigator.mediaDevices.getUserMedia(constraints());
    track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities?.() || {};
    hwZoom = caps.zoom && caps.zoom.max > caps.zoom.min ? { min: caps.zoom.min, max: Math.min(caps.zoom.max, 10) } : null;
    video.srcObject = stream;
    await video.play();
    zoom = 1;
    setTransform();
    if (hwZoom) await track.applyConstraints({ advanced: [{ zoom: Math.max(1, hwZoom.min) }] }).catch(() => {});
    layout();
    onZoom?.(zoom, range());
  }

  function close() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = track = null;
    video.srcObject = null;
  }

  const range = () => (hwZoom ? { min: hwZoom.min, max: hwZoom.max } : { min: 1, max: 4 });

  async function setZoom(z) {
    const r = range();
    zoom = Math.round(Math.max(r.min, Math.min(r.max, z)) * 10) / 10;
    if (hwZoom && track) {
      try {
        await track.applyConstraints({ advanced: [{ zoom }] });
      } catch {
        hwZoom = null;                                          // 硬件变焦失败：退回数码变焦
      }
    }
    setTransform();
    onZoom?.(zoom, range());
  }

  // 取景框按比例摆在可用区域中间。长边的方向跟着画面走：竖屏时竖着，横屏时横着
  // （和拍照时的裁剪规则一致，所以取景框里看到的 = 拍下来的）
  function layout() {
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const ar = RATIOS[ratio];
    const landscape = video.videoWidth ? video.videoWidth > video.videoHeight : W > H;
    let w, h;
    if (landscape) { h = Math.min(H, W / ar); w = h * ar; }
    else { w = Math.min(W, H / ar); h = w * ar; }
    box.style.width = Math.floor(w) + "px";
    box.style.height = Math.floor(h) + "px";
  }
  addEventListener("resize", layout);
  video.addEventListener("resize", layout);                    // 转屏后摄像头画面方向变了，也重新排一次
  // 取景区域本身变大变小（比如专业面板展开、面板里的内容加载出来）也要重新排 —— 只听窗口大小是不够的
  if ("ResizeObserver" in window) new ResizeObserver(() => layout()).observe(wrap);

  function setRatio(r) {
    ratio = RATIOS[r] ? r : "4:3";
    layout();
  }

  // 从画面（视频帧或全分辨率照片）里，按"当前比例 + 数码变焦"居中裁出取景框里的那部分
  function cropRect(sw, sh) {
    const digital = hwZoom ? 1 : zoom;
    let w = sw / digital, h = sh / digital;
    const ar = RATIOS[ratio];
    const portrait = sh >= sw;
    // 让长边 / 短边 = 比例，方向跟随原画面
    const long = portrait ? h : w, short = portrait ? w : h;
    if (long / short > ar) { if (portrait) h = w * ar; else w = h * ar; }
    else { if (portrait) w = h / ar; else h = w / ar; }
    return { x: (sw - w) / 2, y: (sh - h) / 2, w, h };
  }

  // 画的时候带上"数码模拟"的曝光补偿 / 白平衡（如果有），这样拍下的、AI 看到的、测光表读到的都和预览一致
  function draw(source, sw, sh, maxSide, quarter) {
    const c = cropRect(sw, sh);
    const k = Math.min(1, maxSide / Math.max(c.w, c.h));
    const w = Math.round(c.w * k), h = Math.round(c.h * k);
    const rotated = quarter % 2 !== 0;
    const canvas = document.createElement("canvas");
    canvas.width = rotated ? h : w;
    canvas.height = rotated ? w : h;
    const g = canvas.getContext("2d");
    if (simFilter) g.filter = simFilter;
    g.translate(canvas.width / 2, canvas.height / 2);
    if (mirrored()) g.scale(-1, 1);                             // 自拍：拍下的和预览一样是镜像
    g.rotate((quarter * Math.PI) / 2);
    g.drawImage(source, c.x, c.y, c.w, c.h, -w / 2, -h / 2, w, h);
    return canvas;
  }

  // ===== 专业参数：ISO、快门、曝光补偿、白平衡、对焦 =====
  // 网页相机的标准接口（MediaStream Image Capture）能调这些，但支不支持要看手机和浏览器：
  //   getCapabilities() 告诉我们这台相机能调哪些、范围多大；applyConstraints() 真正去调
  // 光圈：手机镜头的光圈是固定的（极少数手机例外），标准接口里也没有光圈，所以不能调
  // 曝光补偿、白平衡如果硬件不支持，就用"数码模拟"：预览加滤镜，拍照时按同样的滤镜处理（所见即所得）
  // 注意单位：exposureTime 是 100 微秒（1 = 1/10000 秒）
  function proCaps() {
    const c = track?.getCapabilities?.() || {};
    const range = (k) => (c[k] && c[k].max > c[k].min ? { min: c[k].min, max: c[k].max, step: c[k].step || 0 } : null);
    const manualExp = (c.exposureMode || []).includes("manual");
    const t = manualExp ? range("exposureTime") : null;
    return {
      shutter: t && { min: t.min / 10000, max: t.max / 10000 },      // 换算成秒
      iso: manualExp && t ? range("iso") : null,                       // ISO 必须和快门一起手动
      ev: range("exposureCompensation"),
      wb: (c.whiteBalanceMode || []).includes("manual") ? range("colorTemperature") : null,
      focus: (c.focusMode || []).includes("manual") ? range("focusDistance") : null,
    };
  }

  // 相机现在实际用的参数（自动模式下，有的手机会报告自动算出来的 ISO / 快门）
  function proNow() {
    const s = track?.getSettings?.() || {};
    return { iso: s.iso, shutter: s.exposureTime ? s.exposureTime / 10000 : undefined, ev: s.exposureCompensation,
             wb: s.colorTemperature, focus: s.focusDistance };
  }

  let simFilter = "";
  const svgNS = "http://www.w3.org/2000/svg";
  const simSvg = document.createElementNS(svgNS, "svg");
  simSvg.setAttribute("width", "0");
  simSvg.setAttribute("height", "0");
  simSvg.style.position = "absolute";
  simSvg.innerHTML = `<filter id="wbSim" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter>`;
  document.body.append(simSvg);

  // 色温 → 这种光的颜色（Tanner Helland 的黑体辐射近似公式），用来模拟白平衡
  function kelvinRGB(k) {
    const t = k / 100;
    const r = t <= 66 ? 255 : 329.7 * (t - 60) ** -0.1332;
    const g = t <= 66 ? 99.47 * Math.log(t) - 161.12 : 288.12 * (t - 60) ** -0.0755;
    const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
    return [r, g, b].map((v) => Math.max(1, Math.min(255, v)));
  }

  // p：{ iso, shutter, ev, wb, focus }，null 表示自动。返回哪些是真的调了、哪些是模拟的、哪些失败了
  async function applyPro(p) {
    const caps = proCaps(), now = proNow(), result = { hw: [], sim: [], failed: [] };
    const tryApply = async (name, c) => {
      try { await track.applyConstraints({ advanced: [c] }); result.hw.push(name); }
      catch { result.failed.push(name); }
    };
    if (!track) return result;
    const manual = (p.iso != null || p.shutter != null) && caps.shutter;
    if (manual) {
      const c = { exposureMode: "manual", exposureTime: Math.round((p.shutter ?? now.shutter ?? 1 / 60) * 10000) };
      if (caps.iso) c.iso = p.iso ?? now.iso ?? 100;
      await tryApply("exposure", c);
    } else if (caps.shutter) {
      await tryApply("exposure", caps.ev ? { exposureMode: "continuous", exposureCompensation: p.ev || 0 } : { exposureMode: "continuous" });
    } else if (caps.ev) {
      await tryApply("exposure", { exposureCompensation: p.ev || 0 });
    }
    if (caps.wb) await tryApply("wb", p.wb != null ? { whiteBalanceMode: "manual", colorTemperature: p.wb } : { whiteBalanceMode: "continuous" });
    if (caps.focus) await tryApply("focus", p.focus != null ? { focusMode: "manual", focusDistance: p.focus } : { focusMode: "continuous" });

    // 硬件不支持的，数码模拟
    const parts = [];
    if (!caps.ev && !manual && p.ev) { parts.push(`brightness(${(2 ** p.ev).toFixed(3)})`); result.sim.push("ev"); }
    if (!caps.wb && p.wb != null) {
      // 相机以为光是 p.wb 这个颜色，就会把这种颜色"校正"成白色；拿 5500K（日光）当基准
      const [r0, g0, b0] = kelvinRGB(5500), [r, g, b] = kelvinRGB(p.wb);
      const gains = [r0 / r, g0 / g, b0 / b], m = gains[1];
      const [kr, kg, kb] = gains.map((x) => (x / m).toFixed(3));
      simSvg.querySelector("feColorMatrix").setAttribute("values", `${kr} 0 0 0 0 0 ${kg} 0 0 0 0 0 ${kb} 0 0 0 0 0 1 0`);
      parts.push("url(#wbSim)");
      result.sim.push("wb");
    }
    simFilter = parts.join(" ");
    video.style.filter = simFilter;
    return result;
  }

  // 小图：给 AI 教练看、算亮度用（和取景框里看到的一致）
  function frame(maxSide, quarter = 0) {
    return draw(video, video.videoWidth, video.videoHeight, maxSide, quarter);
  }

  // 拍照：选"原图"时尽量用相机的完整分辨率（ImageCapture），不支持就用视频画面
  async function capture(quality, quarter = 0) {
    const maxSide = QUALITY[quality] ?? 2400;
    if (quality === "原图" && track && "ImageCapture" in window) {
      try {
        const bmp = await createImageBitmap(await new ImageCapture(track).takePhoto());
        reopen();                                               // 不等它：照片已经拿到了
        return draw(bmp, bmp.width, bmp.height, maxSide, quarter);
      } catch {}
    }
    return draw(video, video.videoWidth, video.videoHeight, maxSide, quarter);
  }

  // 点一下对焦：把点的位置换算成"整个摄像头画面里的位置"（取景框只是画面中间的一块），交给相机去对焦 / 测光
  // 网页接口叫 pointsOfInterest；相机不支持也没关系，界面上照样显示对焦框
  async function focusAt(nx, ny) {
    if (!track || !video.videoWidth) return false;
    const c = cropRect(video.videoWidth, video.videoHeight);
    if (mirrored()) nx = 1 - nx;
    const x = (c.x + nx * c.w) / video.videoWidth, y = (c.y + ny * c.h) / video.videoHeight;
    const modes = track.getCapabilities?.().focusMode || [];
    try {
      await track.applyConstraints({ advanced: [{ pointsOfInterest: [{ x, y }], ...(modes.includes("single-shot") ? { focusMode: "single-shot" } : {}) }] });
      return true;
    } catch { return false; }
  }

  // 重新打开摄像头：有些安卓手机用"拍静态照片"（takePhoto）之后，预览的白平衡会乱掉、画面发绿。
  // 关掉再开一次就复位了。变焦倍数保留；专业参数由 onReopen 通知外面重新设置
  async function reopen() {
    if (!stream) return;
    const z = zoom;
    stream.getTracks().forEach((t) => t.stop());
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints());
    } catch {
      stream = track = null;
      return;
    }
    track = stream.getVideoTracks()[0];
    video.srcObject = stream;
    await video.play().catch(() => {});
    await setZoom(z);
    onReopen?.();
  }

  // 双指捏合缩放；单指轻点 = 对焦
  const pointers = new Map();
  let pinch = null, tap = null;
  box.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, e);
    tap = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: zoom };
    }
  });
  box.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, e);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      setZoom(pinch.z * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch.d);
    }
  });
  const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; };
  box.addEventListener("pointerup", (e) => {
    const quick = tap && pointers.size === 1 && performance.now() - tap.t < 300 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 10;
    up(e);
    tap = null;
    if (!quick || e.target.closest("button")) return;
    const r = box.getBoundingClientRect();
    onTap?.(e.clientX - r.left, e.clientY - r.top, e);
    focusAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  });
  box.addEventListener("pointercancel", up);

  // 切换前后摄像头：关掉再按新方向打开
  async function flip() {
    facing = mirrored() ? "environment" : "user";
    close();
    await open();
    onReopen?.();
    return facing;
  }

  return {
    open, close, flip, setZoom, setRatio, frame, capture, layout, range, proCaps, proNow, applyPro, focusAt,
    get zoom() { return zoom; },
    get facing() { return facing; },
    get ready() { return Boolean(video.videoWidth) && Boolean(track); },
  };
}
