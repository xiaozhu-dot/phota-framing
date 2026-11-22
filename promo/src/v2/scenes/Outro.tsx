// 结尾：phota 文字标 + "拍之前教你，拍之后懂你。" + 功能一排
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { D, clamp, ease, mono, sans } from "../theme";
import { at, scene } from "../timeline";
import { fadeIn, useInOut } from "../ui";

const FEATURES = ["取景教练", "人像出片", "深度分析", "技能库", "相册", "摄影集"];

export const Outro: React.FC = () => {
  const { f, style } = useInOut(scene("outro").duration + 20);
  return (
    <AbsoluteFill style={{ ...style, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: sans }}>
      <div style={{ fontSize: 88, fontWeight: 500, letterSpacing: "-0.02em", color: D.ink }}>phota</div>
      <div style={{ width: interpolate(f, [6, 26], [0, 120], { ...clamp, easing: ease }), height: 3, margin: "20px 0 34px", backgroundColor: D.amber }} />
      <div style={{ fontSize: 34, lineHeight: 1.6, color: D.ink, opacity: fadeIn(f, at("o1")) }}>拍之前教你，</div>
      <div style={{ fontSize: 34, lineHeight: 1.6, color: D.amber, opacity: fadeIn(f, at("o2")) }}>拍之后懂你。</div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, width: 420, marginTop: 44 }}>
        {FEATURES.map((t, i) => (
          <span key={t} style={{ padding: "6px 12px", borderRadius: 2, border: `1px solid ${D.line}`, fontSize: 18, color: D.ink2, opacity: fadeIn(f, at("o3") + i * 4) }}>{t}</span>
        ))}
      </div>
      <div style={{ position: "absolute", bottom: 40, fontFamily: mono, fontSize: 14, color: D.ink3, opacity: fadeIn(f, at("o3", 1)) }}>照片：Wikimedia Commons</div>
    </AbsoluteFill>
  );
};
