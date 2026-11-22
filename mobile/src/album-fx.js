// 摄影集的氛围粒子：光斑 / 气泡 / 雨丝 / 彩纸 / 雪花 / 胶片灰尘
// 翻页滑动时会"起风"：滑得越快，粒子被吹得越斜 —— 让画面跟着手指动起来
//
// 和 album-music.js 一样，这个函数会被原样放进导出的 HTML 里运行，不能引用外面的东西
export function albumFx() {
  function start(canvas, style) {
    const g = canvas.getContext("2d");
    let W = 0, H = 0, dpr = 1, wind = 0, windTarget = 0, raf = 0;
    const R = Math.random;
    function size() {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = innerWidth; H = innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    addEventListener("resize", size);

    const COUNTS = { dawn: 26, sea: 34, rain: 140, summer: 54, snow: 110, film: 40 };
    const CONFETTI = ["#ff6b4a", "#ffd23f", "#3bceac", "#6a8dff", "#ff9ecb", "#fff"];
    const make = (fresh) => {
      const p = { x: R() * W, y: fresh ? R() * H : (style === "dawn" || style === "sea" ? H + 20 : -20), s: R(), a: R() * 6.28, v: R() };
      if (style === "summer") p.c = CONFETTI[Math.floor(R() * CONFETTI.length)];
      return p;
    };
    const ps = Array.from({ length: COUNTS[style] || 30 }, () => make(true));
    let last = performance.now(), scratch = 0;

    function frame(now) {
      const dt = Math.min(50, now - last) / 16.7;
      last = now;
      wind += (windTarget - wind) * 0.06;
      windTarget *= 0.92;
      g.clearRect(0, 0, W, H);
      for (const p of ps) {
        p.a += 0.02 * dt;
        if (style === "dawn") {                                          // 暖色光斑：慢慢上浮、闪烁
          p.y -= (0.15 + p.v * 0.25) * dt; p.x += (Math.sin(p.a * 0.5) * 0.2 + wind * 0.4) * dt;
          const r = 8 + p.s * 34, al = 0.08 + 0.1 * Math.sin(p.a + p.v * 6) ** 2;
          const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          grd.addColorStop(0, `rgba(255,214,150,${al})`); grd.addColorStop(1, "rgba(255,214,150,0)");
          g.fillStyle = grd; g.beginPath(); g.arc(p.x, p.y, r, 0, 6.28); g.fill();
          if (p.y < -60) Object.assign(p, make(false));
        } else if (style === "sea") {                                     // 气泡：摇摇晃晃往上冒
          p.y -= (0.4 + p.v * 0.9) * dt; p.x += (Math.sin(p.a * 2) * 0.5 + wind * 0.5) * dt;
          const r = 2 + p.s * 7;
          g.strokeStyle = `rgba(190,240,245,${0.25 + p.s * 0.3})`; g.lineWidth = 1;
          g.beginPath(); g.arc(p.x, p.y, r, 0, 6.28); g.stroke();
          g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.arc(p.x - r * 0.35, p.y - r * 0.35, r * 0.22, 0, 6.28); g.fill();
          if (p.y < -20) Object.assign(p, make(false));
        } else if (style === "rain") {                                    // 雨丝：斜斜地落下，风越大越斜
          const sp = 9 + p.v * 9, slant = 0.18 + wind * 0.08;
          p.y += sp * dt; p.x += sp * slant * dt;
          g.strokeStyle = `rgba(170,190,255,${0.12 + p.s * 0.22})`; g.lineWidth = 0.6 + p.s * 0.8;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - sp * slant * 1.6, p.y - sp * 1.6); g.stroke();
          if (p.y > H + 20 || p.x > W + 40) { Object.assign(p, make(false)); p.x = R() * (W + 200) - 200; }
        } else if (style === "summer") {                                  // 彩纸：翻转着飘落
          p.y += (0.8 + p.v * 1.2) * dt; p.x += (Math.sin(p.a) * 0.8 + wind * 1.2) * dt;
          g.save(); g.translate(p.x, p.y); g.rotate(p.a * 2 + p.v * 6);
          g.scale(1, Math.cos(p.a * 3 + p.v * 9));                       // 翻面：宽度忽大忽小
          g.fillStyle = p.c; g.globalAlpha = 0.8; g.fillRect(-4, -2.5, 8, 5); g.restore();
          if (p.y > H + 20) Object.assign(p, make(false));
        } else if (style === "snow") {                                    // 雪花：大的近、落得快，小的远、落得慢
          p.y += (0.3 + p.s * 1.1) * dt; p.x += (Math.sin(p.a + p.v * 6) * 0.4 + wind * (0.5 + p.s)) * dt;
          g.fillStyle = `rgba(255,255,255,${0.45 + p.s * 0.5})`;
          g.beginPath(); g.arc(p.x, p.y, 0.8 + p.s * 2.6, 0, 6.28); g.fill();
          if (p.y > H + 10) Object.assign(p, make(false));
          if (p.x > W + 10) p.x -= W + 20; if (p.x < -10) p.x += W + 20;
        } else {                                                          // 胶片：灰尘一闪一闪
          if (R() < 0.04 * dt) Object.assign(p, make(true));
          g.fillStyle = `rgba(255,250,235,${0.25 * p.s})`;
          g.fillRect(p.x, p.y, 1 + p.s * 2, 1 + p.v * 2);
        }
      }
      if (style === "film") {                                             // 偶尔一道竖着的划痕
        if (scratch <= 0 && R() < 0.01) scratch = 8 + R() * 14, canvas._sx = R() * W;
        if (scratch > 0) { scratch -= dt; g.fillStyle = "rgba(255,250,235,.12)"; g.fillRect(canvas._sx + Math.sin(now / 40) * 2, 0, 1, H); }
      }
      raf = requestAnimationFrame(frame);
    }
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) raf = requestAnimationFrame(frame);
    return { gust(v) { windTarget = Math.max(-6, Math.min(6, v)); }, stop() { cancelAnimationFrame(raf); } };
  }
  window.AlbumFx = { start };
}
