// 摄影集：像 App 生成的摄影集一样，一页页翻过去 —— 每页一种风格（晨光、海风、胶片、初雪），一句短诗一个字一个字浮现
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Phone } from "../ui";
import { C, clamp, ease, mono, serifSC, wordmark } from "../theme";

type Page = { bg: string; ink: string; muted: string; accent: string; photo?: string; line: string; sub: string; tilt: number; paper: string };
const PAGES: Page[] = [
  { bg: "linear-gradient(180deg, #f0d7b6, #f6ecdc)", ink: "#3b2e22", muted: "#a08b72", accent: "#d9774a", paper: "#fffaf2", line: "周末的光", sub: "A PHOTO ALBUM · 晨光", tilt: 0 },
  { bg: "linear-gradient(180deg, #165266, #0b2230)", ink: "#e8f5f5", muted: "#7fa7ae", accent: "#6fd3d0", paper: "#f4f8f8", photo: "sea", line: "风从海上来", sub: "01 / 04 · 海风", tilt: -2.2 },
  { bg: "#100f0e", ink: "#efe9de", muted: "#9a9286", accent: "#e3583c", paper: "#0c0b0a", photo: "market", line: "街角的笑声", sub: "02 / 04 · 胶片", tilt: 1.6 },
  { bg: "linear-gradient(180deg, #cfdcea, #e9eff6)", ink: "#26354a", muted: "#7d8ea5", accent: "#5d86b8", paper: "#fff", photo: "lake", line: "山把湖抱住", sub: "03 / 04 · 初雪", tilt: -1.4 },
  { bg: "linear-gradient(180deg, #f0d7b6, #f6ecdc)", ink: "#3b2e22", muted: "#a08b72", accent: "#d9774a", paper: "#fffaf2", photo: "room", line: "光落在窗边", sub: "04 / 04 · 晨光", tilt: 2 },
];
const FLIP = 22;

export const Album: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const n = PAGES.length;
  const every = Math.floor((durationInFrames - 70) / (n - 1));           // 翻页节奏随场景长度调整
  const flipAt = (i: number) => 34 + i * every;
  const enter = interpolate(frame, [0, 16], [0, 1], { ...clamp, easing: ease });
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Phone style={{ translate: `0px ${(1 - enter) * 120}px`, opacity: enter }}>
        <div style={{ position: "absolute", inset: 0, perspective: 2200 }}>
          {PAGES.map((p, i) => {
            const rot = i < n - 1 ? interpolate(frame, [flipAt(i), flipAt(i) + FLIP], [0, -180], { ...clamp, easing: ease }) : 0;
            const shown = i === 0 ? 0 : flipAt(i - 1) + 10;               // 这一页露出来的时候
            const k = (d: number) => interpolate(frame, [shown + d, shown + d + 18], [0, 1], { ...clamp, easing: ease });
            return (
              <div key={i} style={{ position: "absolute", inset: 0, zIndex: n - i, transformOrigin: "0% 50%", rotate: `0 1 0 ${rot}deg`, backfaceVisibility: "hidden",
                background: p.bg, display: rot <= -179 ? "none" : "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 44, padding: "120px 56px",
                boxShadow: "0 0 50px -10px rgba(0,0,0,.4)" }}>
                {/* 翻页时纸面的阴影 + 书脊 */}
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,.06), rgba(0,0,0,.35))", opacity: Math.min(1, -rot / 100) }} />
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 22, background: "linear-gradient(90deg, rgba(0,0,0,.2), transparent)" }} />
                {p.photo ? (
                  <div style={{ padding: i === 2 ? 8 : "14px 14px 16px", backgroundColor: p.paper, boxShadow: "0 30px 60px -28px rgba(0,0,0,.8)", rotate: `${p.tilt}deg`,
                    opacity: k(0), scale: String(0.92 + k(0) * 0.08) }}>
                    <Img src={staticFile(`photos/${p.photo}.jpg`)} style={{ display: "block", width: 540, height: 380, objectFit: "cover", filter: i === 2 ? "contrast(1.05) saturate(.85) sepia(.15)" : "none" }} />
                  </div>
                ) : (
                  <div style={{ fontFamily: wordmark, fontStyle: "italic", fontSize: 40, color: p.accent, letterSpacing: "0.1em", opacity: k(0) }}>Phota · 摄影集</div>
                )}
                <div style={{ display: "flex", fontFamily: serifSC, fontWeight: 700, fontSize: i === 0 ? 108 : 70, letterSpacing: "0.1em", color: p.ink }}>
                  {[...p.line].map((ch, j) => {
                    const c = interpolate(frame, [shown + 12 + j * 4, shown + 30 + j * 4], [0, 1], { ...clamp, easing: ease });
                    return <span key={j} style={{ opacity: c, translate: `0px ${(1 - c) * 26}px`, filter: `blur(${(1 - c) * 6}px)` }}>{ch}</span>;
                  })}
                </div>
                <div style={{ fontFamily: mono, fontSize: 22, letterSpacing: "0.24em", color: p.muted, opacity: k(30) }}>{p.sub}</div>
              </div>
            );
          })}
        </div>
        {/* 配乐开关：三根跳动的小竖条 */}
        <div style={{ position: "absolute", top: 82, right: 34, zIndex: 20, width: 70, height: 70, borderRadius: 35, display: "flex", gap: 6, alignItems: "center", justifyContent: "center",
          backgroundColor: "rgba(128,128,128,.22)", border: "1.5px solid rgba(128,128,128,.4)" }}>
          {[0, 1, 2].map((b) => <i key={b} style={{ width: 6, borderRadius: 3, backgroundColor: C.cream, height: 8 + Math.abs(Math.sin(frame / 6 + b * 1.3)) * 22 }} />)}
        </div>
      </Phone>
    </AbsoluteFill>
  );
};
