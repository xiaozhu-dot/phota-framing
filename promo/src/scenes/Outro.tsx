// 结尾：光圈 + Phota + 一句话，两位伙伴在下面一起蹦；最后是照片的署名
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, clamp, ease, pop, sans, serifSC, wordmark } from "../theme";

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Img src={staticFile("mark.png")} style={{ position: "absolute", left: 540 - 150, top: 300, width: 300, height: 300,
        scale: interpolate(frame, [0, 18], [0.5, 1], { ...clamp, easing: pop }), rotate: interpolate(frame, [0, 40], ["60deg", "0deg"], { ...clamp, easing: ease }),
        opacity: interpolate(frame, [0, 8], [0, 1], clamp) }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 650, textAlign: "center", fontFamily: wordmark, fontStyle: "italic", fontWeight: 500, fontSize: 200, lineHeight: 1, color: C.cream,
        opacity: interpolate(frame, [10, 26], [0, 1], clamp), translate: interpolate(frame, [10, 26], ["0px 30px", "0px 0px"], { ...clamp, easing: ease }) }}>
        Phota
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 900, textAlign: "center", fontFamily: serifSC, fontWeight: 700, fontSize: 64, letterSpacing: "0.16em", color: C.cream,
        opacity: interpolate(frame, [24, 40], [0, 1], clamp) }}>
        和伙伴一起，拍得更好看
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1010, display: "flex", justifyContent: "center", gap: 20, fontFamily: sans, fontSize: 34, color: C.muted,
        opacity: interpolate(frame, [36, 52], [0, 1], clamp) }}>
        <span>取景指导</span><span style={{ color: C.coral }}>·</span><span>深度分析</span><span style={{ color: C.coral }}>·</span><span>摄影集</span>
      </div>
      <div style={{ position: "absolute", left: 90, right: 90, top: 1290, textAlign: "center", fontFamily: sans, fontSize: 22, lineHeight: 1.6, color: "rgba(241,233,220,.45)",
        opacity: interpolate(frame, [60, 76], [0, 1], clamp) }}>
        示例照片来自 Wikimedia Commons：Prosthetic Head、Dina Said、Dietmar Rabich、Wilfredor、Vyacheslav Argenberg、Amir Pashaei（CC BY 4.0 / CC BY-SA 4.0 / CC0）
      </div>
    </AbsoluteFill>
  );
};
