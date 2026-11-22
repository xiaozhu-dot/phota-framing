// 人像：杆子插在头上 → "往左走两步"→ 视差让杆子从头后面挪开 → 骨架上下巴的点变琥珀色："下巴微抬，看向窗外"
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { D, clamp, ease, mono } from "../theme";
import { PortraitArt, VF } from "../PortraitArt";
import { at, scene } from "../timeline";
import { AppBar, HintBar, ScoreRing, Shutter, fadeIn, useInOut } from "../ui";

export const Portrait: React.FC = () => {
  const { f, style } = useInOut(scene("portrait").duration);
  const r1 = at("r1"), r2 = at("r2");
  const o = interpolate(f, [at("r1", 0.55), at("r1", 1) + 6], [0, 1], { ...clamp, easing: ease });
  const chin = interpolate(f, [at("r2", 0.3), at("r2", 0.6)], [0, 1], { ...clamp, easing: ease });
  const look = interpolate(f, [at("r2", 0.6), at("r2", 0.9)], [0, 1], { ...clamp, easing: ease });
  const done = f > at("r2", 1) + 8;
  const hint = f < r2 ? (o < 1 ? "往左走两步，别让杆子挡在头后" : "很好，杆子让开了") : done ? "就是现在" : "下巴微抬，看向窗外";
  const personX = 250 + 44 * o;
  const joint = (x: number, y: number, hot = false) => <circle cx={x} cy={y} r={hot ? 8 : 6} fill={hot ? D.amber : "none"} stroke={hot ? D.amber : D.onPhoto} strokeWidth={2} />;
  const skel = fadeIn(f, r2 - 6);
  return (
    <AbsoluteFill style={style}>
      <AppBar active={0} />
      <div style={{ position: "absolute", left: 0, top: 110, width: VF.w, height: VF.h, overflow: "hidden" }}>
        <PortraitArt o={o} chin={chin} look={look} />
        {/* 头和杆子重叠的地方：红框（走开后消失） */}
        <div style={{ position: "absolute", left: 250 - 56, top: 168, width: 112, height: 130, border: `2px solid ${D.alert}`, opacity: fadeIn(f, r1 - 4) * (1 - o) }} />
        {/* 姿态骨架：肩、颈、下巴；需要调整的点用琥珀色 */}
        <svg width={VF.w} height={VF.h} style={{ position: "absolute", inset: 0, opacity: skel }}>
          <g transform={`translate(${personX} 0)`}>
            <line x1={-70} y1={350} x2={70} y2={350} stroke={D.onPhoto} strokeWidth={2} />
            <line x1={0} y1={290} x2={0} y2={350} stroke={D.onPhoto} strokeWidth={2} />
            {joint(-70, 350)}{joint(70, 350)}{joint(0, 290)}{joint(0, 282 - 6 * chin, true)}
          </g>
        </svg>
        <div style={{ position: "absolute", left: personX + 26, top: 252, padding: "4px 10px", borderRadius: 2, backgroundColor: D.amber, color: D.onAmber, fontFamily: mono, fontSize: 18, opacity: skel }}>下巴 ↑</div>
        <div style={{ position: "absolute", left: 14, top: 14, padding: "8px 14px", borderRadius: 2, backgroundColor: D.scrim, color: D.amber, fontSize: 22, fontWeight: 500 }}>人像</div>
        <div style={{ position: "absolute", right: 14, top: 10 }}><ScoreRing score={interpolate(f, [r1, at("r1", 1), r2, at("r2", 1)], [5, 7, 7, 8.6], clamp)} size={62} /></div>
        <HintBar text={hint} ready={done} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 790, textAlign: "center", fontFamily: mono, fontSize: 18, color: D.ink3 }}>给摄影师 · 给模特</div>
      <Shutter ready={done} y={830} />
    </AbsoluteFill>
  );
};
