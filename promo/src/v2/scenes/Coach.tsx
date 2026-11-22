// 实时取景：手机上先认场景（人像 → 街拍 → 动物）→ 小鸟太靠右 → 程序算出"手机往右移"→ 小鸟落到三分线，分数 5 → 8 → 就是现在 → 咔嚓
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import { D, clamp, ease, mono, sans } from "../theme";
import { at, scene } from "../timeline";
import { AppBar, HintBar, ScoreRing, Shutter, fadeIn, useInOut } from "../ui";

const FW = 496, FH = 661;                       // 取景框（3:4）
const PH = 700, PW = Math.round((1313 * PH) / 900); // 照片缩放后的尺寸；小鸟在照片宽度 45% 处
const BIRD = 0.45 * PW;

export const coachTimes = () => ({
  detect: at("k1", 0.2),
  hint: at("k2", 0.45),
  panStart: at("k2", 0.7),
  panEnd: at("k3") + 4,
  ready: at("k3", 0.3),
  shutter: at("k3", 0.8),
});

export const Coach: React.FC = () => {
  const { f, style } = useInOut(scene("coach").duration);
  const T = coachTimes();
  // 小鸟一开始在画面 82% 处，手机右移后落到右三分线（2/3）
  const pan = interpolate(f, [T.panStart, T.panEnd], [FW * 0.82 - BIRD, (FW * 2) / 3 - BIRD], { ...clamp, easing: ease });
  const birdX = pan + BIRD;
  const score = f < T.hint ? 5 : interpolate(f, [T.panStart, T.panEnd], [5, 8], clamp);
  const ready = f >= T.ready;
  const flash = interpolate(f, [T.shutter, T.shutter + 2, T.shutter + 12], [0, 0.9, 0], clamp);
  // 场景识别：在几个类别之间闪一下，最后定在"动物"
  const labels = ["人像", "人文街拍", "动物"];
  const li = f < T.detect ? -1 : Math.min(2, Math.floor((f - T.detect) / 9));
  const hint = f < T.hint ? "让我看看…" : ready ? "就是现在，按快门" : "手机往右移一点";
  const guide = interpolate(f, [T.hint, T.hint + 8, T.ready, T.ready + 10], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={style}>
      <AppBar active={0} />
      <div style={{ position: "absolute", left: 0, top: 110, width: FW, height: FH, overflow: "hidden", backgroundColor: "#000" }}>
        <Img src={staticFile("photos/bird.jpg")} style={{ position: "absolute", top: -20, left: 0, width: PW, height: PH, objectFit: "cover", translate: `${pan}px 0px` }} />
        {[1, 2].map((i) => <div key={"v" + i} style={{ position: "absolute", top: 0, bottom: 0, left: (FW * i) / 3, width: 1.5, backgroundColor: D.grid }} />)}
        {[1, 2].map((i) => <div key={"h" + i} style={{ position: "absolute", left: 0, right: 0, top: (FH * i) / 3, height: 1.5, backgroundColor: D.grid }} />)}
        {/* 主体框（就绪变绿）+ 主体 → 目标的箭头 */}
        <div style={{ position: "absolute", left: birdX - 150, top: 120, width: 300, height: 420, border: `2px solid ${ready ? D.good : D.amber}`, opacity: fadeIn(f, T.hint) }} />
        <svg width={FW} height={FH} style={{ position: "absolute", inset: 0, opacity: guide }}>
          <defs><marker id="ah2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill={D.onPhoto} /></marker></defs>
          <circle cx={(FW * 2) / 3} cy={330} r={13} fill="none" stroke={D.onPhoto} strokeWidth={3} strokeDasharray="5 5" />
          {birdX > (FW * 2) / 3 + 30 && <path d={`M${birdX} 330 L${(FW * 2) / 3 + 18} 330`} stroke={D.onPhoto} strokeWidth={3} strokeDasharray="9 7" markerEnd="url(#ah2)" />}
        </svg>
        {/* 左上：场景标签（端侧识别） */}
        <div style={{ position: "absolute", left: 14, top: 14, display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 2, backgroundColor: D.scrim, fontFamily: sans, fontSize: 22, color: D.onPhoto }}>
          <span style={{ fontFamily: mono, fontSize: 18, color: D.ink3 }}>场景</span>
          <span style={{ fontWeight: 500, color: li === 2 ? D.amber : D.onPhoto }}>{li < 0 ? "识别中…" : labels[li]}</span>
        </div>
        {/* 右上：分数 */}
        <div style={{ position: "absolute", right: 14, top: 10 }}><ScoreRing score={score} size={62} /></div>
        <HintBar text={hint} ready={ready} />
        <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 790, textAlign: "center", fontFamily: mono, fontSize: 18, color: D.ink3 }}>1/500s · ISO 200 · 26mm</div>
      <Shutter ready={ready} pressAt={T.shutter} y={830} />
    </AbsoluteFill>
  );
};
