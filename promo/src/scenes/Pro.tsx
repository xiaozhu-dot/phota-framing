// PRO 模式：取景画面下面一排参数拨盘，ISO、快门的数字跳动，画面亮度跟着变
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { AppBar, Phone } from "../ui";
import { C, clamp, ease, mono, pop, sans } from "../theme";
import { line, scene } from "../timeline";

const ISO = ["自动", "100", "200", "400"];
const SHUTTER = ["自动", "1/125", "1/250", "1/500"];

export const Pro: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const c5 = line("c5"), S = scene("pro").from;
  const base = c5.from - S;
  const step = (k: number) => base + Math.round(c5.frames * k);
  const isoI = frame < step(0.45) ? 0 : frame < step(0.6) ? 1 : frame < step(0.75) ? 2 : 3;
  const shI = frame < step(0.7) ? 0 : frame < step(0.82) ? 1 : frame < step(0.92) ? 2 : 3;
  const sel = frame < step(0.68) ? 0 : 1;                           // 正在调哪一个
  const enter = interpolate(frame, [0, 16], [0, 1], { ...clamp, easing: ease });
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], clamp);
  const bright = 0.85 + isoI * 0.08 - shI * 0.06;
  const dials = [
    { k: "ISO", v: ISO[isoI], manual: isoI > 0, changedAt: [step(0.45), step(0.6), step(0.75)] },
    { k: "快门", v: SHUTTER[shI], manual: shI > 0, changedAt: [step(0.7), step(0.82), step(0.92)] },
    { k: "曝光", v: "±0" }, { k: "白平衡", v: "自动" }, { k: "对焦", v: "自动" }, { k: "光圈", v: "固定" },
  ];
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Phone style={{ translate: `0px ${(1 - enter) * 120}px`, opacity: enter }}>
        <AppBar mode={0} />
        <div style={{ position: "absolute", left: 24, top: 170, width: 640, height: 720, borderRadius: 28, overflow: "hidden" }}>
          <Img src={staticFile("photos/lake.jpg")} style={{ width: 640, height: 720, objectFit: "cover", filter: `brightness(${bright})` }} />
          {[1, 2].map((i) => <div key={"v" + i} style={{ position: "absolute", top: 0, bottom: 0, left: (640 * i) / 3, width: 1.5, backgroundColor: "rgba(255,255,255,.25)" }} />)}
          {[1, 2].map((i) => <div key={"h" + i} style={{ position: "absolute", left: 0, right: 0, top: (720 * i) / 3, height: 1.5, backgroundColor: "rgba(255,255,255,.25)" }} />)}
        </div>
        {/* 画幅和 PRO 开关（PRO 打开是黄色） */}
        <div style={{ position: "absolute", top: 905, right: 24, display: "flex", gap: 10, padding: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,.06)", fontFamily: mono, fontSize: 24, fontWeight: 700 }}>
          <span style={{ padding: "6px 14px", color: C.cream }}>4:3</span>
          <span style={{ padding: "6px 14px", color: C.cream }}>高清</span>
          <span style={{ padding: "6px 18px", borderRadius: 999, backgroundColor: "#ffcf6e", color: "#1d1b18",
            scale: String(interpolate(frame, [base, base + 10], [1.25, 1], { ...clamp, easing: pop })) }}>PRO</span>
        </div>
        {/* 参数拨盘 */}
        <div style={{ position: "absolute", left: 24, right: 24, top: 990, padding: 14, borderRadius: 24, backgroundColor: "#1c1b19", border: `1.5px solid ${C.hair}`,
          display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, fontFamily: sans }}>
          {dials.map((d, i) => {
            const last = d.changedAt?.filter((t) => frame >= t).pop();
            const bump = last != null ? interpolate(frame, [last, last + 8], [1.3, 1], { ...clamp, easing: pop }) : 1;
            return (
              <div key={d.k} style={{ display: "grid", placeItems: "center", gap: 2, padding: "12px 0", borderRadius: 16,
                backgroundColor: i === sel && frame >= step(0.3) ? "rgba(227,88,60,.18)" : "transparent", border: i === sel && frame >= step(0.3) ? `2px solid ${C.coral}` : "2px solid transparent" }}>
                <small style={{ fontFamily: mono, fontSize: 18, color: C.muted }}>{d.k}</small>
                <b style={{ fontSize: 27, color: d.manual ? "#ffcf6e" : C.cream, scale: String(bump) }}>{d.v}</b>
              </div>
            );
          })}
        </div>
        {/* 正在调的那个参数的滑杆 */}
        <div style={{ position: "absolute", left: 50, right: 50, top: 1160, opacity: interpolate(frame, [step(0.3), step(0.4)], [0, 1], clamp) }}>
          <div style={{ height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,.15)" }}>
            <div style={{ height: 6, borderRadius: 3, backgroundColor: C.coral, width: `${20 + (sel ? shI : isoI) * 25}%` }} />
          </div>
          <div style={{ marginTop: 14, fontFamily: mono, fontSize: 24, color: C.cream, textAlign: "center" }}>{sel ? `快门 ${SHUTTER[shI]}` : `ISO ${ISO[isoI]}`}</div>
        </div>
      </Phone>
    </AbsoluteFill>
  );
};
