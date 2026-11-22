// 气泡：从宠物嘴里吐出来，沿弧线飞到页面上的某个位置（slot），落地后 slot 显示出来
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const backOut = (p) => 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2);

// 一个"频道"：里面的气泡排队吐出；cancel() 后还没飞完的全部作废
export function channel({ scroll = true } = {}) {
  let gen = 0;
  let chain = Promise.resolve();
  return {
    cancel() { gen++; chain = Promise.resolve(); },
    say(text, slot, variant = "") {
      const my = gen;
      chain = chain.then(async () => {
        if (my !== gen) return;
        if (scroll) await ensureVisible(slot);
        if (my !== gen) return;
        launch(text, slot, variant, () => my !== gen);
        await sleep(reduceMotion ? 0 : 300);
      });
      return chain;
    },
    done() { return chain; },
  };
}

async function ensureVisible(slot) {
  const r = slot.getBoundingClientRect();
  if (r.top > 60 && r.bottom < innerHeight - 150) return;  // 底部留给停靠的宠物
  slot.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  await sleep(reduceMotion ? 0 : 480);
}

function launch(text, slot, variant, cancelled) {
  if (reduceMotion) return land(slot);
  const start = window.pet.emit(slot);
  const b = document.createElement("div");
  b.className = "bubble " + variant;
  b.textContent = text;
  document.body.append(b);
  const bw = b.offsetWidth, bh = b.offsetHeight;
  const place = (x, y, s, rot) => (b.style.transform = `translate(${x - bw / 2}px, ${y - bh / 2}px) scale(${s}) rotate(${rot}deg)`);
  place(start.x, start.y, 0.3, 0);

  const r0 = slot.getBoundingClientRect();
  const dist = Math.hypot(r0.left + r0.width / 2 - start.x, r0.top + r0.height / 2 - start.y);
  const dur = Math.min(1200, 600 + dist * 0.55);
  const lift = 50 + dist * 0.2;
  const t0 = performance.now();

  function step(now) {
    if (cancelled()) return b.remove();
    const p = Math.min(1, (now - t0) / dur), e = easeInOut(p);
    const r = slot.getBoundingClientRect();
    const ex = r.left + r.width / 2, ey = r.top + r.height / 2;
    const cx = (start.x + ex) / 2, cy = Math.min(start.y, ey) - lift;
    const x = (1 - e) ** 2 * start.x + 2 * (1 - e) * e * cx + e * e * ex;
    const y = (1 - e) ** 2 * start.y + 2 * (1 - e) * e * cy + e * e * ey;
    const s = p < 0.25 ? 0.3 + 0.7 * backOut(p / 0.25) : 1 - Math.max(0, p - 0.85) * 0.6;
    place(x, y, s, Math.sin(p * Math.PI * 3) * (1 - p) * 6);
    if (p < 1) requestAnimationFrame(step);
    else { b.remove(); land(slot, ex, ey); }
  }
  requestAnimationFrame(step);
}

function land(slot, x, y) {
  slot.classList.remove("landed");
  void slot.offsetWidth;
  slot.classList.add("landed");
  const frame = slot.closest(".frame");
  if (frame) { frame.classList.remove("hit"); void frame.offsetWidth; frame.classList.add("hit"); }
  if (x != null && !reduceMotion) {
    const r = document.createElement("i");
    r.className = "ripple";
    r.style.left = x + "px";
    r.style.top = y + "px";
    r.onanimationend = () => r.remove();
    document.body.append(r);
  }
}
