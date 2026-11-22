// 成长曲线：设置里的「成长与用量」，折线一点点画出来，最后一句"在进步"
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { D, clamp, mono, sans } from "../theme";
import { at, scene } from "../timeline";
import { fadeIn, SW, useInOut } from "../ui";

const PTS = [5, 6, 5.5, 6.5, 6, 7, 7.5, 7, 8, 8.5];
const CW = SW - 60, CH = 260, L = 34, T = 14, B = 26;

export const Growth: React.FC = () => {
  const { f, style } = useInOut(scene("growth").duration);
  const g1 = at("g1");
  const draw = interpolate(f, [g1 - 10, at("g1", 1)], [0, 1], clamp);
  const x = (i: number) => L + (i * (CW - L - 8)) / (PTS.length - 1);
  const y = (v: number) => T + ((10 - v) * (CH - T - B)) / 10;
  const n = draw * (PTS.length - 1);
  const shown = PTS.slice(0, Math.floor(n) + 1);
  const lastI = Math.floor(n), frac = n - lastI;
  const tip = lastI < PTS.length - 1 ? { x: x(lastI) + (x(lastI + 1) - x(lastI)) * frac, y: y(PTS[lastI] + (PTS[lastI + 1] - PTS[lastI]) * frac) } : { x: x(lastI), y: y(PTS[lastI]) };
  const path = shown.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("") + ` L${tip.x},${tip.y}`;
  return (
    <AbsoluteFill style={style}>
      <div style={{ position: "absolute", left: 22, right: 22, top: 58, fontFamily: sans }}>
        <div style={{ fontSize: 22, color: D.ink3 }}>‹ 设置</div>
        <div style={{ marginTop: 10, fontSize: 34, fontWeight: 500, color: D.ink }}>成长与用量</div>
        <div style={{ marginTop: 22, fontFamily: mono, fontSize: 18, letterSpacing: "0.06em", color: D.ink3 }}>成长曲线</div>
        <div style={{ marginTop: 10, padding: "18px 8px 8px", borderRadius: 4, backgroundColor: D.s1, border: `1px solid ${D.line}` }}>
          <svg width={CW} height={CH}>
            {[0, 5, 10].map((v) => <g key={v}><line x1={L} x2={CW - 8} y1={y(v)} y2={y(v)} stroke={D.line} /><text x={L - 8} y={y(v) + 5} textAnchor="end" fill={D.ink3} fontSize={14} fontFamily="monospace">{v}</text></g>)}
            <path d={path} fill="none" stroke={D.amber} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            {shown.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={5} fill={i === PTS.length - 1 && draw >= 1 ? D.amber : D.s1} stroke={D.amber} strokeWidth={2.5} />)}
          </svg>
        </div>
        <div style={{ marginTop: 16, fontSize: 21, lineHeight: 1.5, color: D.ink, opacity: fadeIn(f, at("g1", 1)) }}>
          共 10 次 · 最近 3 次比最早 3 次<b style={{ color: D.amber, fontWeight: 500 }}>高了 2.2 分</b>，在进步
        </div>
        <div style={{ marginTop: 30, fontFamily: mono, fontSize: 18, letterSpacing: "0.06em", color: D.ink3 }}>拍照习惯</div>
        <div style={{ marginTop: 10, padding: 16, borderRadius: 4, backgroundColor: D.s1, border: `1px solid ${D.line}`, fontSize: 20, lineHeight: 1.6, color: D.ink2 }}>
          常犯：<span style={{ color: D.ink }}>水平</span>（4 次）· <span style={{ color: D.ink }}>主体太小</span>（3 次）<br />下次指导会先提醒这两点
        </div>
      </div>
    </AbsoluteFill>
  );
};
