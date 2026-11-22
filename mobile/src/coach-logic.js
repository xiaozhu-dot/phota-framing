// 取景指导：AI 只说"主体在画面哪里、应该在哪里"，往哪边移手机由这里算 ——
// 大模型很容易把方向说反（主体太靠右，应该把手机往右移，它常说成"往左"），这一步交给程序就不会错
//
// 画面里的坐标：x 0 = 最左、1 = 最右；y 0 = 最上、1 = 最下
// 手机往右移（右转）→ 景物在画面里往左跑；镜头往下压 → 景物在画面里往上跑

const GOOD = 8;            // 构图分到这里就别再挑刺了：直接让用户拍
const NEAR = 0.08;         // 主体离目标位置不到画面的 8%：已经够准了
const SIZE_GAP = 0.25;     // 主体大小和目标差 25% 以上才建议走近 / 后退

const TEXT = {
  left: "手机往左移一点", right: "手机往右移一点",
  raise: "镜头往上抬一点", lower: "镜头往下压一点",
  closer: "走近一点", back: "往后退一步",
  wait: "等一下，时机还没到", shoot: "就是现在，按快门",
};

const num = (v) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : null);
const point = (p) => (p && num(p.x) != null && num(p.y) != null ? { x: num(p.x), y: num(p.y) } : null);

// 主体要从 at 挪到 to：手机该往哪边动？（挪得太少就返回 null）
export function panFor(at, to) {
  const dx = to.x - at.x, dy = to.y - at.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < NEAR) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "right" : "left";    // 主体要往左跑 → 手机往右
  return dy < 0 ? "lower" : "raise";                                     // 主体要往上跑 → 镜头往下压
}

// r：AI 的回答；last：上一次指导 { move, score }（没有就是 null）
// 返回 { move, hint, why }：why 说明程序做了什么决定（调试和测试用）
export function decide(r, last = null) {
  const score = Math.max(0, Math.min(10, parseInt(r.score) || 0));
  const reason = String(r.why || "").slice(0, 10);
  const say = (move, why) => {
    const own = String(r.hint || "").slice(0, 24);
    // AI 自己的话方向和我们算的一致才用（它说得更自然）；否则用标准说法 + 它给的理由
    const agrees = r.move === move && own;
    const hint = move === "shoot" ? (own && r.move === "shoot" ? own : score >= GOOD ? "很好！就是现在，按快门" : "差不多了，可以拍了")
      : agrees ? own : reason ? `${TEXT[move]}，${reason}` : TEXT[move];
    return { move, hint: hint.slice(0, 24), why };
  };

  if (score >= GOOD) return say("shoot", "score");
  // 照着上次的话做了，但分数没涨：再挑也挑不出好结果，别让用户来回折腾
  if (last && r.followed === true && score >= 7 && score <= last.score) return say("shoot", "plateau");

  const fix = String(r.fix || "");
  if (fix === "position") {
    const at = point(r.subject_at), to = point(r.target);
    const move = at && to ? panFor(at, to) : null;
    return move ? say(move, "pan") : say("shoot", "close-enough");
  }
  if (fix === "closer" || fix === "back") {
    const size = num(r.subject_size), want = num(r.target_size);
    if (size != null && want != null && Math.abs(want - size) / Math.max(want, 0.05) < SIZE_GAP) return say("shoot", "size-ok");
    if (size != null && want != null) return say(want > size ? "closer" : "back", "size");
    return say(fix, "size");
  }
  if (fix === "angle" && (r.move === "raise" || r.move === "lower")) return say(r.move, "angle");
  if (fix === "wait") return say("wait", "wait");
  if (fix === "none") return say("shoot", "none");
  // 老格式（只有 move）：照旧用
  return say(TEXT[r.move] ? r.move : "wait", "legacy");
}
