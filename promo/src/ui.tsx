// 几个各场景共用的部件：背景、手机外壳、分数圆环、对话气泡
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, clamp, ease, mono, sans, wordmark } from "./theme";

// 墨色底 + 中间偏上一点暖光 + 细细的胶片颗粒（和 App 图标的底一样）
export const Backdrop: React.FC<{ glow?: string }> = ({ glow = "rgba(120, 82, 56, .55)" }) => (
  <AbsoluteFill style={{ backgroundColor: C.ink }}>
    <AbsoluteFill style={{ background: `radial-gradient(70% 45% at 50% 32%, ${glow}, transparent 70%)` }} />
    <AbsoluteFill style={{ opacity: 0.09, mixBlendMode: "overlay" }}>
      <svg width="100%" height="100%">
        <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" /></filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  </AbsoluteFill>
);

// 手机外壳：深色边框 + 圆角屏幕，里面放 App 画面
export const Phone: React.FC<{ children: React.ReactNode; width?: number; height?: number; style?: React.CSSProperties }> = ({ children, width = 720, height = 1300, style }) => (
  <div style={{ position: "absolute", left: (1080 - width) / 2, top: 110, width, height, borderRadius: 86, padding: 16,
    background: "linear-gradient(160deg, #3a3631, #141210 60%)", boxShadow: "0 60px 120px -40px rgba(0,0,0,.9), inset 0 0 0 2px rgba(255,255,255,.08)", ...style }}>
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 72, overflow: "hidden", backgroundColor: C.dark }}>
      {children}
      {/* 屏幕顶上的小药丸（前摄像头） */}
      <div style={{ position: "absolute", top: 22, left: "50%", width: 150, height: 40, marginLeft: -75, borderRadius: 20, backgroundColor: "#000" }} />
    </div>
  </div>
);

// App 顶栏：logo + 三个模式（当前的那个是红色胶囊）
export const AppBar: React.FC<{ mode: 0 | 1 | 2 }> = ({ mode }) => (
  <div style={{ position: "absolute", top: 80, left: 34, right: 34, display: "flex", alignItems: "center", gap: 18, fontFamily: sans }}>
    <Img src={staticFile("icon.png")} style={{ width: 52, height: 52, borderRadius: 16 }} />
    <span style={{ fontFamily: wordmark, fontStyle: "italic", fontSize: 42, color: C.cream }}>Phota</span>
    <div style={{ marginLeft: "auto", display: "flex", padding: 4, borderRadius: 999, border: `2px solid ${C.hair}` }}>
      {["取景", "照片", "摄影集"].map((t, i) => (
        <span key={t} style={{ padding: "8px 22px", borderRadius: 999, fontSize: 26, fontWeight: 700, color: i === mode ? "#fff" : C.muted, backgroundColor: i === mode ? C.coral : "transparent" }}>{t}</span>
      ))}
    </div>
  </div>
);

// 分数圆环：分数越高越满，颜色红 → 黄 → 绿（和 App 取景页一样）
export const ScoreRing: React.FC<{ score: number; size?: number; label?: boolean }> = ({ score, size = 76, label = true }) => {
  const color = score >= 8 ? C.good : score >= 6 ? C.mid : C.low;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg viewBox="0 0 36 36" width={size} height={size} style={{ rotate: "-90deg" }}>
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth={3} />
        <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeDasharray="100" strokeDashoffset={100 - (score / 10) * 100} pathLength={100} />
      </svg>
      {label && <b style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: mono, fontSize: size * 0.4, color: "#fff" }}>{Math.round(score)}</b>}
    </div>
  );
};

// 对话气泡（App 里宠物说话也是这个样子：奶白色、圆角、深色字）。字一个个冒出来，说完淡出
export const Bubble: React.FC<{ text: string; start: number; frames: number; side: "left" | "right" }> = ({ text, start, frames, side }) => {
  const frame = useCurrentFrame();
  const f = frame - start;
  const shown = Math.ceil(interpolate(f, [0, Math.max(8, frames * 0.75)], [0, [...text].length], clamp));
  const inOut = interpolate(f, [0, 8, frames + 12, frames + 22], [0, 1, 1, 0], { ...clamp, easing: ease });
  return (
    <div style={{ position: "absolute", left: 80, right: 80, top: 1452, display: "flex", justifyContent: side === "left" ? "flex-start" : "flex-end",
      opacity: inOut, translate: `0px ${(1 - inOut) * 24}px`, scale: String(0.94 + inOut * 0.06) }}>
      <div style={{ position: "relative", maxWidth: 860, padding: "26px 40px", borderRadius: 44, fontFamily: sans, fontSize: 48, fontWeight: 700, lineHeight: 1.35, color: "#1d1b18",
        background: "radial-gradient(120% 140% at 30% 15%, #fff 40%, #f1ede4)", boxShadow: "0 24px 50px -20px rgba(0,0,0,.8)" }}>
        {/* 气泡的小尾巴，指向说话的那位 */}
        <div style={{ position: "absolute", bottom: -16, [side === "left" ? "left" : "right"]: 110, width: 36, height: 36, rotate: "45deg", backgroundColor: "#f6f2ea" }} />
        <span style={{ position: "relative" }}>
          {[...text].map((ch, i) => <span key={i} style={{ opacity: i < shown ? 1 : 0 }}>{ch}</span>)}
        </span>
      </div>
    </div>
  );
};
