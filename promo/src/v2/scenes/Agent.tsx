// 深度分析 Agent：上面是照片，下面一条条日志 —— 思考 → measure → zoom_in → level_lines → try_crop → 结论
// 照片上同步出现：放大镜、水平参考线、裁剪框；最后拉直、出分数
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import { D, clamp, ease, mono, sans } from "../theme";
import { at, scene } from "../timeline";
import { AppBar, ScoreRing, fadeIn, popIn, SW, useInOut } from "../ui";

const PW = SW, PHt = 330;

export const agentTimes = () => {
  const a1 = at("a1"), a2 = at("a2");
  const span = at("a1", 1) - a1;
  return {
    think: a1 - 6,
    measure: a1 + Math.round(span * 0.28),
    zoom: a1 + Math.round(span * 0.5),
    level: a1 + Math.round(span * 0.75),
    crop: a2 + 4,
    final: at("a2", 1) + 6,
  };
};

const Row: React.FC<{ k: number; tool?: string; text: string }> = ({ k, tool, text }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, opacity: k, translate: `0px ${(1 - k) * 14}px`, fontFamily: sans, fontSize: 21, lineHeight: 1.35, color: D.ink2 }}>
    {tool ? <span style={{ flex: "none", fontFamily: mono, fontSize: 18, padding: "3px 9px", borderRadius: 2, border: `1px solid ${D.amber}`, color: D.amber }}>{tool}</span>
      : <span style={{ flex: "none", fontFamily: mono, fontSize: 18, padding: "3px 9px", borderRadius: 2, backgroundColor: D.amber, color: D.onAmber }}>思考</span>}
    <span>{text}</span>
  </div>
);

export const Agent: React.FC = () => {
  const { f, style } = useInOut(scene("agent").duration);
  const T = agentTimes();
  const tilt = interpolate(f, [T.crop + 4, T.crop + 24], [2.2, 0], { ...clamp, easing: ease });
  const zoom = fadeIn(f, T.zoom) * (1 - fadeIn(f, T.level));
  const level = fadeIn(f, T.level) * (1 - fadeIn(f, T.final));
  const crop = fadeIn(f, T.crop);
  const fin = popIn(f, T.final, 14);
  return (
    <AbsoluteFill style={style}>
      <AppBar active={1} />
      <div style={{ position: "absolute", left: 0, top: 110, width: PW, height: PHt, overflow: "hidden", backgroundColor: "#000" }}>
        <Img src={staticFile("photos/lake.jpg")} style={{ position: "absolute", inset: -30, width: PW + 60, height: PHt + 60, objectFit: "cover", rotate: `${tilt}deg` }} />
        {/* 放大镜 */}
        <div style={{ position: "absolute", left: 300, top: 60, width: 150, height: 150, borderRadius: 75, overflow: "hidden", border: `3px solid ${D.onPhoto}`, opacity: zoom }}>
          <Img src={staticFile("photos/lake.jpg")} style={{ position: "absolute", left: -560, top: -120, width: (PW + 60) * 2.2, height: (PHt + 60) * 2.2, objectFit: "cover", rotate: `${tilt}deg` }} />
        </div>
        {/* 水平参考线 */}
        <svg width={PW} height={PHt} style={{ position: "absolute", inset: 0, opacity: level }}>
          {[0.3, 0.5, 0.7].map((y) => <line key={y} x1={0} x2={PW} y1={PHt * y} y2={PHt * y} stroke={D.good} strokeWidth={2} />)}
          {[0.25, 0.75].map((x) => <line key={x} y1={0} y2={PHt} x1={PW * x} x2={PW * x} stroke={D.good} strokeWidth={2} />)}
        </svg>
        {/* 试裁剪：框外压暗 */}
        <div style={{ position: "absolute", left: 40, top: 24, right: 20, bottom: 30, border: `2px solid ${D.amber}`, boxShadow: `0 0 0 400px rgba(18,17,16,${0.6 * crop})`, opacity: crop }} />
      </div>
      {/* Agent 日志 */}
      <div style={{ position: "absolute", left: 18, right: 18, top: 462, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontFamily: mono, fontSize: 18, letterSpacing: "0.08em", color: D.ink3 }}>深度分析 · 第 {Math.min(5, 1 + [T.measure, T.zoom, T.level, T.crop].filter((t) => f >= t).length)} / 6 步</div>
        <Row k={fadeIn(f, T.think)} text="地平线好像有点歪，先量一量" />
        <Row k={fadeIn(f, T.measure)} tool="measure" text="曝光正常 · 清晰 · 倾斜 2.2°" />
        <Row k={fadeIn(f, T.zoom)} tool="zoom_in" text="放大看主体：是清楚的" />
        <Row k={fadeIn(f, T.level)} tool="level_lines" text="对着参考线：确实歪了" />
        <Row k={fadeIn(f, T.crop)} tool="try_crop" text="拉直 2°，裁掉左边杂物" />
      </div>
      {/* 结论卡片 */}
      <div style={{ position: "absolute", left: 18, right: 18, top: 780, display: "flex", alignItems: "center", gap: 16, padding: "16px 18px", borderRadius: 4,
        backgroundColor: D.s2, border: `1px solid ${D.line}`, opacity: fin, scale: String(0.9 + 0.1 * fin) }}>
        <ScoreRing score={8} size={64} />
        <div style={{ fontFamily: sans, color: D.ink }}>
          <div style={{ fontSize: 25, fontWeight: 500 }}>傍晚的湖面</div>
          <div style={{ fontSize: 19, color: D.ink2, marginTop: 4 }}>下次：先找地平线，再按快门</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
