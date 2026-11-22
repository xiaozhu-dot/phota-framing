// 开场：页面底色上一个文字标 phota（下面一短条琥珀线）——HTML 一加载就显示，不用等脚本；停一下后干脆地淡出，露出取景页
// 设计系统：动效像快门一样干脆（60–120ms 级别、ease-out、不回弹）；点一下可以跳过；"减少动态效果"时直接淡出
export function playIntro() {
  const intro = document.getElementById("intro");
  if (!intro) return;
  const finish = () => intro.remove();
  if (!intro.animate || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    intro.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" }).finished.then(finish) ?? finish();
    return;
  }
  const ease = "cubic-bezier(.2, 0, 0, 1)";
  let done = false;
  const leave = () => {
    if (done) return;
    done = true;
    intro.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: ease, fill: "forwards" }).finished.then(finish);
  };
  setTimeout(leave, 700);
  intro.addEventListener("pointerdown", leave, { once: true });
}
