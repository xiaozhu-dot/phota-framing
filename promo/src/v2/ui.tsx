// 第二版共用的部件：背景、手机、App 顶栏、两侧的说明（章节标题 + AI 原理）、对话气泡、分数圆环、快门
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { D, clamp, ease, mono, pop, sans } from "./theme";

export const W = 1920, H = 1080;
// 手机在画面正中；屏幕里的坐标是 496 × 976
export const PHONE = { x: 700, y: 40, w: 520, h: 1000, pad: 12 };
export const SW = PHONE.w - PHONE.pad * 2, SH = PHONE.h - PHONE.pad * 2;

// 暗房底色 + 很淡的安全灯暖光（照片之外不加颗粒）
export const Backdrop: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: D.s0 }}>
    <AbsoluteFill style={{ background: "radial-gradient(42% 60% at 50% 46%, rgba(232,163,61,.10), transparent 70%)" }} />
  </AbsoluteFill>
);

export const Phone: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: "absolute", left: PHONE.x, top: PHONE.y, width: PHONE.w, height: PHONE.h, borderRadius: 64, padding: PHONE.pad,
    background: "linear-gradient(160deg, #3a3631, #161412 60%)", boxShadow: "0 40px 90px -30px rgba(0,0,0,.9), inset 0 0 0 2px rgba(255,255,255,.07)" }}>
    <div style={{ position: "relative", width: SW, height: SH, borderRadius: 52, overflow: "hidden", backgroundColor: D.s0 }}>
      {children}
      <div style={{ position: "absolute", top: 14, left: "50%", width: 104, height: 28, marginLeft: -52, borderRadius: 14, backgroundColor: "#000" }} />
    </div>
  </div>
);

// App 顶栏：小写文字标 phota + 拍摄 / 相册 / 摄影集，选中的那个下面一条琥珀线（和现在的 App 一样）
export const AppBar: React.FC<{ active: 0 | 1 | 2 | -1 }> = ({ active }) => (
  <div style={{ position: "absolute", top: 54, left: 24, right: 24, height: 48, display: "flex", alignItems: "center", gap: 18, fontFamily: sans, borderBottom: `1px solid ${D.line}` }}>
    <span style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em", color: D.ink }}>phota</span>
    <div style={{ marginLeft: "auto", display: "flex", gap: 18 }}>
      {["拍摄", "相册", "摄影集"].map((t, i) => (
        <span key={t} style={{ paddingBottom: 8, fontSize: 21, fontWeight: 500, color: i === active ? D.ink : D.ink3, borderBottom: `3px solid ${i === active ? D.amber : "transparent"}` }}>{t}</span>
      ))}
    </div>
  </div>
);

// 标签：大模型（琥珀填充）/ 程序（绿色描边）/ 端侧（浅色描边）/ 其他
export type TagKind = "llm" | "code" | "device" | "other";
export const Tag: React.FC<{ kind: TagKind; children: React.ReactNode; size?: number }> = ({ kind, children, size = 24 }) => {
  const s: React.CSSProperties =
    kind === "llm" ? { backgroundColor: D.amber, color: D.onAmber, border: `1px solid ${D.amber}` }
    : kind === "code" ? { color: D.good, border: `1px solid ${D.good}` }
    : kind === "device" ? { color: D.ink, border: `1px solid ${D.ink2}` }
    : { color: D.ink2, border: `1px solid ${D.lineStrong}` };
  return <span style={{ display: "inline-block", flex: "none", fontFamily: mono, fontSize: size, lineHeight: 1.3, padding: "3px 12px", borderRadius: 2, whiteSpace: "nowrap", ...s }}>{children}</span>;
};

// 左上：章节标题；右上：这一段用到的 AI 原理（逐条出现）
export type Chip = { kind: TagKind; tag: string; text: string; at: number };
export const Panel: React.FC<{ eyebrow: string; title: string; chips: Chip[]; duration: number }> = ({ eyebrow, title, chips, duration }) => {
  const f = useCurrentFrame();
  const enter = interpolate(f, [4, 22], [0, 1], { ...clamp, easing: ease });
  const out = interpolate(f, [duration - 12, duration], [1, 0], clamp);
  return (
    <>
      <div style={{ position: "absolute", left: 110, top: 120, width: 540, opacity: enter * out, translate: `${(1 - enter) * -30}px 0px`, fontFamily: sans }}>
        <div style={{ fontFamily: mono, fontSize: 24, letterSpacing: "0.08em", color: D.amber }}>{eyebrow}</div>
        <div style={{ marginTop: 18, fontSize: 54, lineHeight: 1.2, fontWeight: 500, letterSpacing: "-0.01em", color: D.ink }}>{title}</div>
      </div>
      {chips.length > 0 && (
        <div style={{ position: "absolute", left: 1270, top: 120, width: 560, display: "flex", flexDirection: "column", gap: 12, opacity: out, fontFamily: sans }}>
          <div style={{ fontFamily: mono, fontSize: 22, letterSpacing: "0.08em", color: D.ink3, opacity: enter }}>AI 原理</div>
          {chips.map((c, i) => {
            const k = interpolate(f, [c.at, c.at + 12], [0, 1], { ...clamp, easing: ease });
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 4, backgroundColor: D.s1, border: `1px solid ${D.line}`,
                opacity: k, translate: `${(1 - k) * 30}px 0px` }}>
                <Tag kind={c.kind} size={20}>{c.tag}</Tag>
                <span style={{ fontSize: 26, lineHeight: 1.35, color: D.ink }}>{c.text}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

// 对话气泡：说话的那位头顶上方，字一个个冒出来
export const Bubble: React.FC<{ text: string; frames: number; side: "left" | "right" }> = ({ text, frames, side }) => {
  const f = useCurrentFrame();
  const shown = Math.ceil(interpolate(f, [0, Math.max(8, frames * 0.72)], [0, [...text].length], clamp));
  const k = interpolate(f, [0, 8, frames + 10, frames + 20], [0, 1, 1, 0], { ...clamp, easing: ease });
  return (
    <div style={{ position: "absolute", [side]: 90, bottom: 372, width: 560, display: "flex", justifyContent: side === "left" ? "flex-start" : "flex-end",
      opacity: k, translate: `0px ${(1 - k) * 18}px` }}>
      <div style={{ position: "relative", padding: "22px 30px", borderRadius: 6, backgroundColor: D.paper, color: D.paperInk, fontFamily: sans, fontSize: 36, fontWeight: 500, lineHeight: 1.4 }}>
        <div style={{ position: "absolute", bottom: -12, [side]: 120, width: 26, height: 26, rotate: "45deg", backgroundColor: D.paper }} />
        <span style={{ position: "relative" }}>{[...text].map((ch, i) => <span key={i} style={{ opacity: i < shown ? 1 : 0 }}>{ch}</span>)}</span>
      </div>
    </div>
  );
};

// 分数圆环：≥8 变成绿色
export const ScoreRing: React.FC<{ score: number; size?: number }> = ({ score, size = 60 }) => {
  const color = score >= 8 ? D.good : D.amber;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg viewBox="0 0 36 36" width={size} height={size} style={{ rotate: "-90deg" }}>
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(244,239,230,.2)" strokeWidth={3} />
        <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" pathLength={100} strokeDasharray="100" strokeDashoffset={100 - (score / 10) * 100} />
      </svg>
      <b style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: mono, fontWeight: 500, fontSize: size * 0.4, color: D.onPhoto }}>{Math.round(score)}</b>
    </div>
  );
};

// 快门：外圈 + 内圈（就绪时琥珀色，按下缩到 90%）
export const Shutter: React.FC<{ ready: boolean; pressAt?: number; y?: number }> = ({ ready, pressAt = -99, y = 820 }) => {
  const f = useCurrentFrame();
  const press = interpolate(f, [pressAt, pressAt + 3, pressAt + 9], [1, 0.9, 1], clamp);
  return (
    <div style={{ position: "absolute", left: SW / 2 - 46, top: y, width: 92, height: 92, borderRadius: 46, border: `4px solid ${D.onPhoto}`, display: "grid", placeItems: "center" }}>
      <div style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: ready ? D.amber : D.onPhoto, scale: String(press) }} />
    </div>
  );
};

// 取景画面上的一句提示（深色半透明底）
export const HintBar: React.FC<{ text: string; ready?: boolean; style?: React.CSSProperties }> = ({ text, ready, style }) => (
  <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderRadius: 4,
    backgroundColor: ready ? D.amber : D.scrim, color: ready ? D.onAmber : D.onPhoto, fontFamily: sans, fontSize: 25, fontWeight: 500, ...style }}>
    <span style={{ width: 10, height: 10, borderRadius: 5, flex: "none", backgroundColor: ready ? D.onAmber : D.amber }} />
    <span style={{ flex: 1 }}>{text}</span>
  </div>
);

// 场景在手机里的进出：淡入 + 轻微上移，结尾淡出
export const useInOut = (duration: number) => {
  const f = useCurrentFrame();
  const enter = interpolate(f, [0, 14], [0, 1], { ...clamp, easing: ease });
  const out = interpolate(f, [duration - 10, duration], [1, 0], clamp);
  return { f, enter, out, style: { opacity: enter * out, translate: `0px ${(1 - enter) * 30}px` } as React.CSSProperties };
};
export const popIn = (f: number, at: number, len = 12) => interpolate(f, [at, at + len], [0, 1], { ...clamp, easing: pop });
export const fadeIn = (f: number, at: number, len = 10) => interpolate(f, [at, at + len], [0, 1], { ...clamp, easing: ease });
