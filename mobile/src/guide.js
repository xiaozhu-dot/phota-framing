// 新手引导：第一次进拍摄页时，宠物一蹦一蹦走到各个按钮旁边，用气泡介绍一遍
//   每次只讲一个；点「下一步」继续，「跳过」直接结束；设置里能重看。不讲 AI 密钥怎么填
//   减少动态效果时宠物不走动，只有气泡和高亮框
const KEY = "phota-guide-v1";
const STEPS = [
  { at: ".live-ctl .pet svg", text: "我是你的拍照伙伴。点我一下，我就看看取景，给你一步建议。", act: (pet) => pet.cheer(1200) },
  { at: ".live-ctl .pet svg", text: "长按我，可以开关「自动指导」。关掉时我就去睡觉；睡着时点我，我也会半睁眼帮你看一眼。", act: "sleepDemo" },
  { at: "#liveShutter", text: "按这里拍照。照片会存进手机相册，也会出现在「相册」里。" },
  { at: "#tFlip", text: "切到前置摄像头就能自拍，我会直接对你说怎么摆。" },
  { at: "#sceneTag", text: "我会自己认出你在拍人像、街拍、动物还是风景，换着法子指导你。" },
  { at: "#tMore", text: "照片比例、清晰度、专业参数和朗读都收在这里。" },
  { at: '.seg button[data-mode="album"]', text: "拍过的照片都在「相册」：点一张看大图，长按可以多选，让我分析、删除或者编成摄影集。" },
  { at: '.seg button[data-mode="books"]', text: "编好的摄影集和配文都存在「摄影集」里，随时回来看、换风格、分享。" },
  { at: "#btnSettings", text: "设置在这里：个人资料、AI 连接、摄影技能都在里面。摄影技能是我的拍照经验，指导时会按场景自动用上。" },
];

const CSS = `
.guide-ring { position: fixed; z-index: 60; border: 2px solid var(--amber); border-radius: var(--radius-sm); pointer-events: none;
  box-shadow: 0 0 0 9999px rgba(10, 9, 8, .55); transition: left .2s var(--ease), top .2s var(--ease), width .2s var(--ease), height .2s var(--ease); }
.guide-catch { position: fixed; inset: 0; z-index: 59; }
.guide-tip { position: fixed; z-index: 61; left: 16px; right: 16px; max-width: 360px; margin: 0 auto; padding: 14px 14px 10px; border-radius: var(--radius-sm);
  background: var(--surface-1); color: var(--ink-1); border: var(--stroke-hairline) solid var(--line-strong); box-shadow: 0 10px 30px rgba(0,0,0,.45);
  font: 15px/1.55 var(--font-sans); }
.guide-tip p { margin: 0 0 10px; }
.guide-tip .row { display: flex; align-items: center; gap: 8px; }
.guide-tip .n { flex: 1; font: 12px/1 var(--font-mono); color: var(--ink-3); }
@media (prefers-reduced-motion: reduce) { .guide-ring { transition: none; } }`;

export function setupGuide({ pet, setMode, auto = () => true }) {
  let running = false;
  const done = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
  const markDone = () => { try { localStorage.setItem(KEY, "1"); } catch {} };

  async function start(force = false) {
    if (running || (!force && done())) return;
    if (document.body.dataset.mode !== "live") setMode("live");
    running = true;
    document.head.append(Object.assign(document.createElement("style"), { textContent: CSS }));
    const catcher = Object.assign(document.createElement("div"), { className: "guide-catch" });
    const ring = Object.assign(document.createElement("div"), { className: "guide-ring" });
    const tip = Object.assign(document.createElement("div"), { className: "guide-tip", role: "dialog" });
    tip.setAttribute("aria-live", "polite");
    document.body.append(catcher, ring, tip);
    let i = 0, finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      catcher.remove(); ring.remove(); tip.remove();
      markDone();
      pet.walkTo();
      running = false;
    };
    async function show() {
      const step = STEPS[i], target = document.querySelector(step.at);
      if (!target || !target.getClientRects().length) { i++; return i < STEPS.length ? show() : finish(); }
      const r = target.getBoundingClientRect(), pad = 6;
      Object.assign(ring.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
      const self = step.at.includes(".pet");
      // 宠物走到按钮旁边（自己介绍自己时不走），再指着它
      if (!self) {
        const left = r.left + r.width / 2 < innerWidth / 2;
        await pet.walkTo(target, { dx: left ? r.width / 2 + 46 : -(r.width / 2 + 46), dy: r.top < innerHeight / 2 ? 60 : -10 });
        if (finished) return;
        pet.point(target, 2600, false);
      } else {
        await pet.walkTo();
        if (step.act === "sleepDemo") {
          pet.sleep(true);
          setTimeout(() => pet.peek(true), 1600);
          setTimeout(() => { if (auto()) pet.sleep(false); else pet.peek(false); }, 3000);
        } else step.act?.(pet);
      }
      const below = r.top < innerHeight / 2;
      tip.style.top = below ? Math.min(innerHeight - 180, r.bottom + 16) + "px" : "";
      tip.style.bottom = below ? "" : Math.max(16, innerHeight - r.top + 16) + "px";
      tip.innerHTML = `<p></p><div class="row"><span class="n">${i + 1} / ${STEPS.length}</span>
        <button class="chip-btn" data-skip>跳过</button><button class="chip-btn strong" data-next>${i === STEPS.length - 1 ? "知道了" : "下一步"}</button></div>`;
      tip.querySelector("p").textContent = step.text;
      pet.caption(step.text.split("。")[0]);
      tip.querySelector("[data-skip]").onclick = finish;
      tip.querySelector("[data-next]").onclick = () => { i++; if (i < STEPS.length) show(); else finish(); };
      tip.querySelector("[data-next]").focus();
    }
    show();
  }

  return { start };
}
