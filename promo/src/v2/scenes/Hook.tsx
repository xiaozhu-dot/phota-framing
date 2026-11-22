// 开场：一张拍坏的照片（歪、糊、杆子插在头上）→ 一个个红框标出来 → 切到 phota 启动画面
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { D, clamp, ease, mono, sans } from "../theme";
import { PortraitArt, VF } from "../PortraitArt";
import { at, scene } from "../timeline";
import { fadeIn, popIn, SH, SW, useInOut } from "../ui";

const Mark: React.FC<{ x: number; y: number; k: number; children: React.ReactNode }> = ({ x, y, k, children }) => (
  <div style={{ position: "absolute", left: x, top: y, padding: "6px 14px", borderRadius: 2, border: `2px solid ${D.alert}`, backgroundColor: "rgba(18,17,16,.75)",
    color: D.alert, fontFamily: sans, fontSize: 24, fontWeight: 500, opacity: k, scale: String(0.7 + 0.3 * k) }}>{children}</div>
);

export const Hook: React.FC = () => {
  const { f, style } = useInOut(scene("hook").duration);
  const h1 = at("h1"), h2 = at("h2");
  const splash = fadeIn(f, h2 - 4, 14);
  const shake = f < h1 ? Math.sin(f / 2.3) * 3 : 0;   // 手抖
  return (
    <AbsoluteFill style={style}>
      <div style={{ position: "absolute", left: 0, top: 110, width: VF.w, height: VF.h, translate: `${shake}px 0px` }}>
        <PortraitArt tilt={7} blur={interpolate(f, [0, 30], [0, 3.5], clamp)} />
        {/* 歪掉的地平线 */}
        <svg width={VF.w} height={VF.h} style={{ position: "absolute", inset: 0, opacity: popIn(f, h1 + 8) }}>
          <line x1={0} y1={470} x2={VF.w} y2={530} stroke={D.alert} strokeWidth={3} strokeDasharray="12 8" />
          <line x1={0} y1={500} x2={VF.w} y2={500} stroke={D.onPhoto} strokeWidth={2} opacity={0.5} />
        </svg>
        <Mark x={300} y={440} k={popIn(f, h1 + 8)}>歪了 7°</Mark>
        <Mark x={40} y={540} k={popIn(f, h1 + 22)}>糊了</Mark>
        <Mark x={230} y={120} k={popIn(f, h1 + Math.round(scene("hook").lines[0].frames * 0.6))}>杆子插在头上</Mark>
      </div>
      {/* phota 启动画面 */}
      <AbsoluteFill style={{ backgroundColor: D.s0, opacity: splash, display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center", fontFamily: sans }}>
          <div style={{ fontSize: 84, fontWeight: 500, letterSpacing: "-0.02em", color: D.ink, translate: `0px ${(1 - splash) * 20}px` }}>phota</div>
          <div style={{ width: interpolate(f, [h2 + 6, h2 + 26], [0, 120], { ...clamp, easing: ease }), height: 3, margin: "18px auto", backgroundColor: D.amber }} />
          <div style={{ fontFamily: mono, fontSize: 22, letterSpacing: "0.08em", color: D.ink3 }}>AI 摄影教练</div>
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, top: SH - 120, width: SW, textAlign: "center", fontFamily: mono, fontSize: 20, color: D.ink3, opacity: 1 - splash }}>IMG_0412.JPG</div>
    </AbsoluteFill>
  );
};
