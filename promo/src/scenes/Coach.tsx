// 取景指导：鸟贴在画面右边 → 提示"手机往右移一点" → 画面跟着平移，鸟落到三分线上，分数 5 → 8 → "就是现在，按快门"，咔嚓
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { AppBar, Phone, ScoreRing } from "../ui";
import { C, clamp, ease, mono, pop, sans } from "../theme";
import { line, scene } from "../timeline";

const S = () => scene("coach").from;
export const coachTimes = () => {
  const p2 = line("p2"), c3 = line("c3");
  return {
    hint: p2.from - S() + Math.round(p2.frames * 0.45), // 说到"手机往右移"时出现提示
    panStart: p2.from - S() + Math.round(p2.frames * 0.7),
    panEnd: c3.from - S() + 6,
    ready: c3.from - S() + Math.round(c3.frames * 0.35), // "就是现在"
    shutter: c3.from - S() + Math.round(c3.frames * 0.82), // "按快门"
  };
};

export const Coach: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const T = coachTimes();
  const enter = interpolate(frame, [0, 18], [0, 1], { ...clamp, easing: ease });
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], clamp);
  // 取景框 640×853（4:3 竖拍）。照片高 900、宽 1313；鸟的中心在照片宽度的 45% 处（量过）：鸟在画面里的位置 = 偏移 + 591
  // 一开始鸟在画面 82% 的地方（挤在右边），手机右移后落到右边那条三分线（427）上
  const pan = interpolate(frame, [T.panStart, T.panEnd], [-66, -164], { ...clamp, easing: ease });
  const birdX = pan + 591;
  const score = frame < T.hint ? 5 : interpolate(frame, [T.panStart, T.panEnd], [5, 8], clamp);
  const ready = frame >= T.ready;
  const flash = interpolate(frame, [T.shutter, T.shutter + 2, T.shutter + 12], [0, 0.95, 0], clamp);
  const hint = frame < T.hint ? "让我看看…" : ready ? "就是现在，按快门" : "手机往右移一点，别贴着边";
  const showGuide = frame >= T.hint && frame < T.ready + 10;   // 程序算出来的"主体 → 目标"箭头
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Phone style={{ translate: `0px ${(1 - enter) * 120}px`, opacity: enter }}>
        <AppBar mode={0} />
        {/* 取景框 */}
        <div style={{ position: "absolute", left: 24, top: 170, width: 640, height: 853, borderRadius: 28, overflow: "hidden", backgroundColor: "#000" }}>
          <Img src={staticFile("photos/bird.jpg")} style={{ position: "absolute", top: -24, left: 0, width: 1313, height: 900, objectFit: "cover", translate: `${pan}px 0px` }} />
          {/* 三分线 */}
          {[1, 2].map((i) => <div key={"v" + i} style={{ position: "absolute", top: 0, bottom: 0, left: (640 * i) / 3, width: 1.5, backgroundColor: "rgba(255,255,255,.28)" }} />)}
          {[1, 2].map((i) => <div key={"h" + i} style={{ position: "absolute", left: 0, right: 0, top: (853 * i) / 3, height: 1.5, backgroundColor: "rgba(255,255,255,.28)" }} />)}
          {/* 主体在哪 → 应该在哪 */}
          <div style={{ position: "absolute", left: birdX - 200, top: 150, width: 400, height: 550, borderRadius: 28, border: `4px solid ${ready ? C.good : C.mid}`,
            opacity: interpolate(frame, [T.hint, T.hint + 8], [0, 1], clamp) }} />
          {showGuide && (
            <svg width={640} height={853} style={{ position: "absolute", inset: 0, opacity: interpolate(frame, [T.hint, T.hint + 8, T.ready, T.ready + 10], [0, 1, 1, 0], clamp) }}>
              <defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#fff" /></marker></defs>
              <circle cx={427} cy={425} r={16} fill="none" stroke="#fff" strokeWidth={4} strokeDasharray="6 6" />
              {birdX > 460 && <path d={`M${birdX} 425 L447 425`} stroke="#fff" strokeWidth={4} strokeDasharray="10 8" markerEnd="url(#ah)" />}
            </svg>
          )}
          {/* 顶部：分数圆环 + 主体 */}
          <div style={{ position: "absolute", left: 20, top: 20, display: "flex", alignItems: "center", gap: 14, padding: "8px 22px 8px 8px", borderRadius: 999,
            backgroundColor: "rgba(18,17,16,.55)", backdropFilter: "blur(12px)", border: `1.5px solid ${C.hair}`, fontFamily: sans, color: C.cream }}>
            <ScoreRing score={score} size={68} />
            <div style={{ lineHeight: 1.25 }}><div style={{ fontSize: 26, fontWeight: 700 }}>小鸟</div><div style={{ fontSize: 22, fontFamily: mono, color: C.muted }}>亮度 63%</div></div>
          </div>
          {/* 底部：指导的一句话 + 方向 */}
          <div style={{ position: "absolute", left: 20, right: 20, bottom: 22, display: "flex", alignItems: "center", gap: 16, padding: "18px 24px", borderRadius: 26,
            backgroundColor: ready ? C.coral : "rgba(18,17,16,.62)", backdropFilter: "blur(14px)", fontFamily: sans, fontSize: 34, fontWeight: 700, color: "#fff" }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: ready ? "#fff" : C.coral, flex: "none" }} />
            <span style={{ flex: 1 }}>{hint}</span>
            <span style={{ fontSize: 46, lineHeight: 1, opacity: frame >= T.hint ? 1 : 0 }}>{ready ? "●" : "→"}</span>
          </div>
          <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash }} />
        </div>
        {/* 模式 + 快门 */}
        <div style={{ position: "absolute", top: 1052, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 46, fontFamily: sans, fontSize: 28, fontWeight: 700, color: C.muted }}>
          <span>智能</span><span style={{ padding: "8px 30px", borderRadius: 999, backgroundColor: C.coral, color: "#fff" }}>指导</span><span style={{ color: C.cream }}>朗读</span>
        </div>
        <div style={{ position: "absolute", top: 1124, left: 344 - 62, width: 124, height: 124, borderRadius: 62, border: `6px solid ${C.cream}`, display: "grid", placeItems: "center",
          boxShadow: ready ? `0 0 0 ${interpolate(frame % 24, [0, 24], [0, 26])}px rgba(227,88,60,${interpolate(frame % 24, [0, 24], [0.5, 0])})` : "none" }}>
          <div style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: C.coral,
            scale: String(interpolate(frame, [T.shutter, T.shutter + 4, T.shutter + 12], [1, 0.82, 1], { ...clamp, easing: pop })) }} />
        </div>
      </Phone>
    </AbsoluteFill>
  );
};
