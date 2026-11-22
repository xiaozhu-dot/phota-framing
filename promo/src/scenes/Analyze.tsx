// 深度分析：照片卡片 + agent 的思考记录一条条出现（测量 → 放大细看 → 试裁剪 → 自检 → 结论）
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { AppBar, Phone, ScoreRing } from "../ui";
import { C, clamp, ease, mono, pop, sans, serifSC } from "../theme";
import { line, scene } from "../timeline";

export const Analyze: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const S = scene("analyze").from, c4 = line("c4"), p4 = line("p4");
  const at = (l: { from: number; frames: number }, k: number) => l.from - S + Math.round(l.frames * k);
  const steps = [
    { at: at(c4, 0.02), n: "01", tool: "测量", note: "曝光正常 · 清晰 · 水平 0.4°" },
    { at: at(c4, 0.3), n: "02", tool: "放大细看", note: "盘子边缘对焦清楚" },
    { at: at(c4, 0.62), n: "03", tool: "试裁剪", note: "裁掉左边空出来的桌面" },
    { at: at(p4, 0.15), n: "04", tool: "自检", note: "结论和测量对得上 ✓", check: true },
    { at: at(p4, 0.7), n: "05", tool: "结论", note: "构图 8 分 · 1 个小瑕疵", final: true },
  ];
  const enter = interpolate(frame, [0, 18], [0, 1], { ...clamp, easing: ease });
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], clamp);
  const zoom = interpolate(frame, [steps[1].at, steps[1].at + 10, steps[2].at - 4, steps[2].at + 4], [0, 1, 1, 0], { ...clamp, easing: ease });
  const crop = interpolate(frame, [steps[2].at, steps[2].at + 14], [0, 1], { ...clamp, easing: ease });
  const final = interpolate(frame, [steps[4].at, steps[4].at + 14], [0, 1], { ...clamp, easing: pop });
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Phone style={{ translate: `0px ${(1 - enter) * 120}px`, opacity: enter, backgroundColor: undefined }}>
        <AbsoluteFill style={{ backgroundColor: "#141311" }} />
        <AppBar mode={1} />
        {/* 照片 */}
        <div style={{ position: "absolute", left: 24, top: 170, width: 640, height: 444, borderRadius: 24, overflow: "hidden" }}>
          <Img src={staticFile("photos/food.jpg")} style={{ width: 640, height: 444, objectFit: "cover",
            scale: String(1 + zoom * 1.4), transformOrigin: "62% 48%" }} />
          {/* 试裁剪：框外压暗 */}
          <div style={{ position: "absolute", left: 640 * 0.16 * crop, top: 444 * 0.06 * crop, right: 640 * 0.04 * crop, bottom: 444 * 0.06 * crop,
            boxShadow: `0 0 0 999px rgba(0,0,0,${0.6 * crop})`, border: crop ? "3px solid rgba(255,255,255,.9)" : "none" }} />
          {zoom > 0.05 && <div style={{ position: "absolute", right: 18, top: 18, padding: "6px 14px", borderRadius: 999, backgroundColor: "rgba(0,0,0,.6)", fontFamily: mono, fontSize: 22, color: "#fff", opacity: zoom }}>2.4× 放大</div>}
          {/* 分数 */}
          <div style={{ position: "absolute", left: 20, bottom: 20, display: "flex", alignItems: "center", gap: 14, padding: "10px 24px 10px 10px", borderRadius: 999,
            backgroundColor: "rgba(18,17,16,.7)", opacity: final, scale: String(0.8 + final * 0.2), fontFamily: sans, color: "#fff" }}>
            <ScoreRing score={8 * final} size={72} />
            <span style={{ fontSize: 30, fontWeight: 700 }}>构图 8 分</span>
          </div>
        </div>
        {/* 思考记录 */}
        <div style={{ position: "absolute", left: 24, right: 24, top: 646, fontFamily: sans }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
            <span style={{ fontFamily: serifSC, fontWeight: 700, fontSize: 36, color: C.cream }}>深度分析</span>
            <span style={{ fontFamily: mono, fontSize: 22, color: frame >= steps[4].at ? C.good : C.coral, letterSpacing: "0.1em" }}>{frame >= steps[4].at ? "完成" : "思考中…"}</span>
          </div>
          {steps.map((s) => {
            const k = interpolate(frame, [s.at, s.at + 10], [0, 1], { ...clamp, easing: ease });
            return (
              <div key={s.n} style={{ display: "flex", gap: 18, alignItems: "baseline", padding: "16px 4px", borderTop: `1.5px solid ${C.hair}`,
                opacity: k, translate: `${(1 - k) * 40}px 0px` }}>
                <span style={{ fontFamily: mono, fontSize: 24, color: C.coral, width: 40 }}>{s.n}</span>
                <span style={{ fontSize: 32, fontWeight: 700, color: s.final ? C.coral : s.check ? C.good : C.cream, width: 150, flex: "none" }}>{s.tool}</span>
                <span style={{ fontSize: 27, color: C.muted, lineHeight: 1.4 }}>{s.note}</span>
              </div>
            );
          })}
        </div>
      </Phone>
    </AbsoluteFill>
  );
};
