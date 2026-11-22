// 收集版：判断一个"指导回合"什么时候开始、什么时候结束（不碰界面，方便测试）
//   回合 = 几步指导 + 之后按的快门（可以连拍几张）。第一次指导时存下「指导前画面」(before)
//   结束：拍完后 AI 开始下一轮指导 / 场景变了 / 切换前后摄像头 / 离开拍摄页 / 后台超过 2 分钟 / 拍完 5 分钟没有新指导
//   没拍照的回合不算，直接丢掉（指导前画面也一起丢掉）
export const ROUND_LIMITS = { hiddenMs: 2 * 60 * 1000, idleAfterShotMs: 5 * 60 * 1000 };

// 速度和步数：自动记录，不问人
export function roundMetrics(r) {
  const ok = r.steps.filter((s) => !s.error);
  const firstShot = r.shots[0]?.at;
  return {
    steps: r.steps.length,
    failedSteps: r.steps.length - ok.length,
    waitMs: ok.map((s) => s.ms).filter(Number.isFinite),
    toShotMs: firstShot != null && r.steps[0] ? firstShot - r.steps[0].at : null,
  };
}

export function createRoundTracker({ now = Date.now, newId, onEnd }) {
  let round = null, hiddenAt = null;

  function end(reason) {
    const r = round;
    round = null;
    if (!r?.shots.length) return null;
    r.endedAt = now();
    r.endReason = reason;
    r.metrics = roundMetrics(r);
    onEnd?.(r);
    return r;
  }
  function tick() {
    const last = round?.shots.at(-1);
    return last && now() - last.at > ROUND_LIMITS.idleAfterShotMs ? end("idle") : null;
  }

  return {
    current: () => round,
    // step: { scene, status, hint, ... }；before：这一回合第一次指导时的画面（只有新回合才用得上）
    guidance(step, before) {
      if (round && step.scene && round.scene && step.scene !== round.scene) {
        if (round.shots.length) end("scene"); else round = null;            // 场景变了：没拍过照的旧步骤丢掉
      }
      if (round?.shots.length) end("next");
      round ??= { id: newId(), startedAt: now(), scene: step.scene, before, steps: [], shots: [] };
      round.scene ??= step.scene;
      round.before ??= before;
      round.steps.push({ at: now(), ...step });
    },
    // 至少有一步成功的指导，快门才算进回合
    shot(shot) {
      if (!round?.steps.some((s) => !s.error)) return false;
      round.shots.push({ at: now(), ...shot });
      return true;
    },
    // 换个拍法：拍过照就结束回合（返回 true），没拍过就清掉旧步骤重新开始
    restart() {
      if (round?.shots.length) return Boolean(end("restart"));
      round = null;
      return false;
    },
    // 场景变了：拍过照的回合马上结束；没拍过的留着，等下一次指导时再按新场景处理
    scene: (next) => (round?.shots.length && round.scene && next !== round.scene ? end("scene") : null),
    switchCamera: () => (round?.shots.length ? end("camera") : (round = null)),
    leave: () => end("leave"),
    hidden() { hiddenAt = now(); },
    visible() {
      const away = hiddenAt == null ? 0 : now() - hiddenAt;
      hiddenAt = null;
      return away > ROUND_LIMITS.hiddenMs ? end("background") : tick();
    },
    tick,
  };
}
