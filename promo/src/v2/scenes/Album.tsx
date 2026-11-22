// 相册：按日期分组的网格，分数角标；连拍叠成一格 → 展开三张（两张糊、一张清楚）→ 收回只留最清楚的；最后长按多选
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import { D, clamp, ease, mono, sans } from "../theme";
import { at, scene } from "../timeline";
import { AppBar, fadeIn, popIn, SW, useInOut } from "../ui";

const G = 3, CELL = Math.floor((SW - 36 - G * 2) / 3);
const TODAY = [
  { src: "sparrow", burst: true },
  { src: "food", score: 7 },
  { src: "market", score: 6 },
];
const YESTERDAY = [
  { src: "lake", score: 8 },
  { src: "sea", score: 9 },
  { src: "room", score: 5 },
  { src: "bird", score: 8 },
];

const Cell: React.FC<{ src: string; score?: number; burst?: boolean; sel?: number; style?: React.CSSProperties }> = ({ src, score, burst, sel = 0, style }) => (
  <div style={{ position: "relative", width: CELL, height: CELL, overflow: "hidden", backgroundColor: D.s1, ...style }}>
    <Img src={staticFile(`photos/${src}.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover", scale: String(1 - 0.12 * sel) }} />
    {score != null && <span style={{ position: "absolute", left: 5, bottom: 5, padding: "1px 6px", borderRadius: 2, fontFamily: mono, fontSize: 16,
      backgroundColor: score >= 8 ? D.amber : D.scrim, color: score >= 8 ? D.onAmber : D.onPhoto }}>{score}</span>}
    {burst && <>
      <span style={{ position: "absolute", right: 5, top: 5, padding: "1px 6px", borderRadius: 2, fontFamily: mono, fontSize: 16, backgroundColor: D.scrim, color: D.onPhoto }}>×3</span>
      <span style={{ position: "absolute", right: 5, bottom: 5, padding: "1px 6px", borderRadius: 2, fontFamily: sans, fontSize: 15, backgroundColor: D.scrim, color: D.onPhoto }}>最清楚</span>
    </>}
    {sel > 0 && <span style={{ position: "absolute", left: 6, top: 6, width: 24, height: 24, borderRadius: 12, display: "grid", placeItems: "center", backgroundColor: D.amber, color: D.onAmber,
      fontSize: 16, fontWeight: 700, scale: String(sel) }}>✓</span>}
  </div>
);

export const Album: React.FC = () => {
  const { f, style } = useInOut(scene("album").duration);
  const m1 = at("m1");
  // 连拍展开：三张并排，两张糊的变暗，清楚的那张亮起来，然后收回
  const open = interpolate(f, [m1 + 30, m1 + 46, at("m1", 1) + 6, at("m1", 1) + 20], [0, 1, 1, 0], { ...clamp, easing: ease });
  const best = fadeIn(f, m1 + 56);
  // 场景快结束：长按 → 多选
  const selAt = at("m1", 1) + 26;
  const sel = (i: number) => popIn(f, selAt + i * 7, 10);
  const selecting = f >= selAt;
  return (
    <AbsoluteFill style={style}>
      <AppBar active={1} />
      <div style={{ position: "absolute", left: 18, right: 18, top: 122, fontFamily: sans }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 34, fontWeight: 500, color: D.ink }}>相册</span><span style={{ fontFamily: mono, fontSize: 18, color: D.ink3 }}>9 张</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {["全部", "人像", "街拍", "动物 3", "风景", "高分"].map((t, i) => (
            <span key={t} style={{ padding: "5px 12px", borderRadius: 2, fontSize: 17, border: `1px solid ${i === 0 ? D.amber : D.line}`, color: i === 0 ? D.amber : D.ink2, whiteSpace: "nowrap" }}>{t}</span>
          ))}
        </div>
        <div style={{ marginTop: 18, fontSize: 18, color: D.ink2 }}>今天</div>
        <div style={{ display: "flex", gap: G, marginTop: 8 }}>
          {TODAY.map((c, i) => <Cell key={c.src} {...c} sel={i === 0 ? sel(0) : i === 1 ? sel(1) : 0} />)}
        </div>
        <div style={{ marginTop: 18, fontSize: 18, color: D.ink2 }}>昨天</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: G, marginTop: 8 }}>
          {YESTERDAY.map((c, i) => <Cell key={c.src} {...c} sel={i === 1 ? sel(2) : 0} />)}
        </div>
      </div>
      {/* 连拍展开层 */}
      <AbsoluteFill style={{ backgroundColor: `rgba(18,17,16,${0.82 * open})`, opacity: open > 0.01 ? 1 : 0 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 330, textAlign: "center", fontFamily: sans, fontSize: 22, color: D.ink2, opacity: open }}>连拍 3 张 · 程序量边缘宽度</div>
        {[0, 1, 2].map((i) => {
          const isBest = i === 1;
          return (
            <div key={i} style={{ position: "absolute", top: 380, left: SW / 2 - 70 + (i - 1) * 156 * open, width: 140, opacity: open }}>
              <div style={{ width: 140, height: 140, overflow: "hidden", border: `2px solid ${isBest && best ? D.amber : "transparent"}` }}>
                <Img src={staticFile("photos/sparrow.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", filter: isBest ? undefined : `blur(${i === 0 ? 3 : 4}px)`,
                  opacity: isBest ? 1 : 1 - 0.4 * best }} />
              </div>
              <div style={{ marginTop: 8, textAlign: "center", fontFamily: mono, fontSize: 18, color: isBest ? D.amber : D.ink3 }}>{["3.4px", "1.6px", "4.1px"][i]}{isBest ? " ✓" : ""}</div>
            </div>
          );
        })}
      </AbsoluteFill>
      {/* 多选：顶部和底部的操作条 */}
      {selecting && <>
        <div style={{ position: "absolute", left: 0, right: 0, top: 50, height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px",
          backgroundColor: D.s1, borderBottom: `1px solid ${D.line}`, fontFamily: sans, fontSize: 21, opacity: fadeIn(f, selAt) }}>
          <span style={{ color: D.amber }}>取消</span><span style={{ color: D.ink, fontWeight: 500 }}>已选 {f >= selAt + 14 ? 3 : f >= selAt + 7 ? 2 : 1} 张</span><span style={{ color: D.amber }}>全选</span>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", gap: 8, padding: "12px 14px 26px", backgroundColor: D.s1, borderTop: `1px solid ${D.line}`,
          fontFamily: sans, fontSize: 20, opacity: fadeIn(f, selAt), translate: `0px ${(1 - fadeIn(f, selAt)) * 60}px` }}>
          <span style={{ flex: 1, padding: "12px 0", textAlign: "center", border: `1px solid ${D.lineStrong}`, borderRadius: 4, color: D.ink3 }}>分析</span>
          <span style={{ flex: 1.5, padding: "12px 0", textAlign: "center", borderRadius: 4, backgroundColor: D.amber, color: D.onAmber, fontWeight: 500 }}>编成摄影集</span>
          <span style={{ flex: 1, padding: "12px 0", textAlign: "center", border: `1px solid ${D.lineStrong}`, borderRadius: 4, color: D.alert }}>删除</span>
        </div>
      </>}
    </AbsoluteFill>
  );
};
