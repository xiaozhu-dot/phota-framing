// 开场：和 App 打开时一样 —— 墨色底上一枚光圈，转一下像镜头对焦，"Phota" 浮出来
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, clamp, ease, pop, serifSC, wordmark } from "../theme";

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const out = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Img
        src={staticFile("mark.png")}
        style={{
          position: "absolute", left: 540 - 190, top: 330, width: 380, height: 380,
          scale: interpolate(frame, [0, 18, 30], [0.6, 1.08, 1], { ...clamp, easing: pop }),
          rotate: interpolate(frame, [0, 30], ["0deg", "-60deg"], { ...clamp, easing: ease }),
          opacity: interpolate(frame, [0, 6], [0, 1], clamp),
        }}
      />
      <div style={{ position: "absolute", left: 0, right: 0, top: 760, textAlign: "center", fontFamily: wordmark, fontStyle: "italic", fontWeight: 500,
        fontSize: 190, lineHeight: 1, letterSpacing: "0.02em", color: C.cream,
        opacity: interpolate(frame, [18, 34], [0, 1], clamp), translate: interpolate(frame, [18, 34], ["0px 30px", "0px 0px"], { ...clamp, easing: ease }),
        filter: `blur(${interpolate(frame, [18, 34], [10, 0], clamp)}px)` }}>
        Phota
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1000, textAlign: "center", fontFamily: serifSC, fontWeight: 700, fontSize: 60, letterSpacing: "0.32em", color: C.muted,
        opacity: interpolate(frame, [32, 48], [0, 1], clamp) }}>
        你的 AI 拍照伙伴
      </div>
    </AbsoluteFill>
  );
};
