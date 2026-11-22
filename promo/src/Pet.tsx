// Crabo 和 Piggo：外形、配色、每个部位怎么动，都照搬 App 里的 static/pet.js
// 区别：App 里靠弹簧物理实时算；视频里每一帧的样子只由帧号决定（渲染多少次都一模一样）
import React from "react";
import type { Who } from "./timeline";

export type PetPose = {
  t: number; // 秒
  mouth: number; // 0～1.2：张嘴（跟着配音的音量）
  smile?: number; // -1～1
  joy?: number; // 0～1：开心（眼睛眯成弯弯、钳子举高）
  lx?: number; // -1～1：往左 / 右看
  ly?: number;
  open?: number; // 眼睛睁开程度（眨眼时变小）
  mode?: "idle" | "excited" | "thinking";
  bounce?: number; // 跳起来的速度（甩动蝴蝶结、眼镜用）
};

const CSS = `
.pv .eye { fill: #2a2420; } .pv .hi { fill: #fff; } .pv .white { fill: #fff; }
.pv .arc { fill: none; stroke: #2a2420; stroke-width: 3.6; stroke-linecap: round; }
.pv .mouth { fill: #c65a5d; stroke: #2a2420; stroke-width: 3.2; stroke-linejoin: round; stroke-linecap: round; }
.pv .blush { fill: #ef9f9c; } .pv .shadow { fill: #000; opacity: .22; }
.pv .shell, .pv .claw { fill: #f08468; } .pv .belly { fill: #f8b49c; opacity: .7; } .pv .spot { fill: #fff; opacity: .35; }
.pv .legs path, .pv .arm, .pv .stalk { fill: none; stroke: #dd664d; stroke-linecap: round; }
.pv .legs path { stroke-width: 7; } .pv .arm { stroke-width: 9; } .pv .stalk { stroke-width: 6; }
.pv .bowc { fill: #e2557f; } .pv .knot { fill: #c43d66; }
.pv .bowhi { fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; opacity: .55; }
.pv .skin { fill: #f5b4c0; } .pv .pinner { fill: #ea8fa1; } .pv .hoof, .pv .nose { fill: #ec97a8; } .pv .nostril { fill: #b5546a; }
.pv .ptail { fill: none; stroke: #ec97a8; stroke-width: 4; stroke-linecap: round; }
.pv .lens { fill: rgba(255,255,255,.18); stroke: #3a2f2c; stroke-width: 3.4; }
.pv .frame { fill: none; stroke: #3a2f2c; stroke-width: 3.4; stroke-linecap: round; }
.pv .lglint { fill: none; stroke: #fff; stroke-width: 2.2; stroke-linecap: round; opacity: .7; }`;

function mouthPath(cx: number, cy: number, s: number, o: number, k = 1) {
  const w = (9 + o * 2) * k, corner = cy - s * 4.5 * k, mid = cy + s * 4 * k;
  return `M${cx - w} ${corner} Q${cx} ${mid - o * 2 * k} ${cx + w} ${corner} Q${cx} ${mid + o * 13 * k} ${cx - w} ${corner} Z`;
}
function clawPath(cx: number, cy: number, r: number, dir: number, open: number) {
  const a1 = ((dir + open / 2) * Math.PI) / 180, a2 = ((dir - open / 2) * Math.PI) / 180;
  return `M${cx} ${cy} L${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} A${r} ${r} 0 1 1 ${cx + r * Math.cos(a2)} ${cy + r * Math.sin(a2)} Z`;
}

const Crab: React.FC<{ p: Required<PetPose> }> = ({ p }) => {
  const lean = p.lx * 12, es = 1, open = p.open;
  const wave = Math.sin(p.t * (1.6 + p.joy * 6)) * (5 + p.joy * 14);
  const raise = p.joy * 22 + (p.mode === "excited" ? 14 : 0);
  const clack = (p.joy + (p.mode === "excited" ? 1 : 0)) * Math.abs(Math.sin(p.t * 9)) * 30;
  const claw = 18 + p.mouth * 46 + clack;
  const legSpeed = p.mode === "excited" ? 16 : p.mode === "thinking" ? 7 : 2;
  const legAmp = p.mode === "excited" ? 12 : p.mode === "thinking" ? 7 : 2.5;
  const legs = ["M60 152 Q42 158 34 174", "M64 162 Q48 170 46 184", "M72 168 Q62 178 62 189", "M140 152 Q158 158 166 174", "M136 162 Q152 170 154 184", "M128 168 Q138 178 138 189"];
  const bow = -12 + Math.max(-28, Math.min(28, p.bounce * 0.02)) * Math.cos(p.t * 9);
  const eye = (bx: number, i: number) => (
    <g key={i} transform={`rotate(${(i ? 1 : -1) * 0 + lean} ${i ? 114 : 86} 100)`}>
      <path className="stalk" d={i ? "M114 100 Q116 86 118 72" : "M86 100 Q84 86 82 72"} />
      <ellipse className="white" cx={bx} cy={64} rx={12} ry={12 * Math.max(open, 0.12)} style={{ opacity: 1 - p.joy * 0.15 }} />
      <ellipse className="eye" cx={bx + p.lx * 4} cy={65 + p.ly * 4} rx={6 * es} ry={7 * es * open} />
      <circle className="hi" cx={bx + 2.5 * es + p.lx * 4} cy={65 - 3.5 * es * open + p.ly * 4} r={2.2} style={{ opacity: open > 0.4 ? 1 : 0 }} />
      <path className="arc" d={i ? "M111 67 Q118 58 125 67" : "M75 67 Q82 58 89 67"} style={{ opacity: p.joy }} />
    </g>
  );
  return (
    <>
      <ellipse className="shadow" cx="100" cy="191" rx="64" ry="6" />
      <g>
        <g className="legs">
          {legs.map((d, i) => {
            const [rx, ry] = d.match(/M(\d+) (\d+)/)!.slice(1).map(Number);
            return <path key={i} d={d} transform={`rotate(${Math.sin(p.t * legSpeed + i * 1.3) * legAmp * (i < 3 ? 1 : -1)} ${rx} ${ry})`} />;
          })}
        </g>
        <g transform={`rotate(${wave + raise} 48 132)`}><path className="arm" d="M48 132 Q30 124 28 98" /><path className="claw" d={clawPath(28, 88, 17, -120, claw)} /></g>
        <g transform={`rotate(${-wave - raise} 152 132)`}><path className="arm" d="M152 132 Q170 124 172 98" /><path className="claw" d={clawPath(172, 88, 17, -60, claw)} /></g>
        {eye(82, 0)}
        {eye(118, 1)}
        <path className="shell" d="M100 94 C150 94 166 118 166 140 C166 164 138 180 100 180 C62 180 34 164 34 140 C34 118 50 94 100 94 Z" />
        <ellipse className="belly" cx="100" cy="164" rx="42" ry="12" />
        <circle className="spot" cx="72" cy="114" r="3.2" /><circle className="spot" cx="64" cy="126" r="2" /><circle className="spot" cx="140" cy="124" r="2.4" />
        <g transform={`rotate(${bow} 136 100)`}>
          <path className="bowc" d="M136 100 C122 86 112 94 115 103 C118 112 129 107 136 100 Z" />
          <path className="bowc" d="M136 100 C150 86 160 94 157 103 C154 112 143 107 136 100 Z" />
          <path className="bowc" d="M136 100 L129 116 L134 113.5 L136 117 Z" />
          <path className="bowc" d="M136 100 L143 116 L138 113.5 L136 117 Z" />
          <circle className="knot" cx="136" cy="100" r="5" />
          <path className="bowhi" d="M119 99 Q121 94 126 94" /><path className="bowhi" d="M146 94 Q151 94 153 99" />
        </g>
        <g transform={`translate(${p.lx * 6} ${p.ly * 4})`}>
          <ellipse className="blush" cx="70" cy="144" rx="10" ry="5.5" style={{ opacity: 0.6 + p.joy * 0.4 }} />
          <ellipse className="blush" cx="130" cy="144" rx="10" ry="5.5" style={{ opacity: 0.6 + p.joy * 0.4 }} />
          <path className="mouth" d={mouthPath(100, 140, p.smile, p.mouth, 0.85)} />
        </g>
      </g>
    </>
  );
};

const Pig: React.FC<{ p: Required<PetPose> }> = ({ p }) => {
  const open = p.open;
  const gy = Math.max(-3, Math.min(9, Math.max(-3, Math.min(7, -p.bounce * 0.012)) * Math.cos(p.t * 8)));
  const sniff = Math.max(0, Math.sin(p.t * 2.1)) ** 12 * 0.08;
  const s = 1 + p.mouth * 0.08 + sniff;
  const wag = Math.sin(p.t * (2 + p.joy * 6)) * (10 + p.joy * 14);
  const ear = p.mode === "excited" ? Math.sin(p.t * 10) * 6 : 0;
  return (
    <>
      <ellipse className="shadow" cx="100" cy="191" rx="56" ry="6" />
      <g>
        <path className="ptail" d="M172 150 c12 -3 13 -15 4 -16 c-8 -1 -8 9 0 9" transform={`rotate(${wag} 172 150)`} />
        <g transform={`rotate(${-ear} 68 66)`}><path className="skin" d="M48 82 Q30 48 56 38 Q76 46 88 64 Z" /><path className="pinner" d="M55 72 Q45 52 58 46 Q70 52 77 63 Z" /></g>
        <g transform={`rotate(${ear} 132 66)`}><path className="skin" d="M152 82 Q170 48 144 38 Q124 46 112 64 Z" /><path className="pinner" d="M145 72 Q155 52 142 46 Q130 52 123 63 Z" /></g>
        <path className="skin" d="M100 52 C152 52 176 90 176 128 C176 166 144 188 100 188 C56 188 24 166 24 128 C24 90 48 52 100 52 Z" />
        <ellipse className="hoof" cx="74" cy="186" rx="14" ry="7" />
        <ellipse className="hoof" cx="126" cy="186" rx="14" ry="7" />
        <g transform={`translate(${p.lx * 7} ${p.ly * 5})`}>
          <ellipse className="blush" cx="56" cy="136" rx="11" ry="6.5" style={{ opacity: 0.6 + p.joy * 0.4 }} />
          <ellipse className="blush" cx="144" cy="136" rx="11" ry="6.5" style={{ opacity: 0.6 + p.joy * 0.4 }} />
          {[78, 122].map((bx, i) => (
            <g key={i}>
              <ellipse className="eye" cx={bx + p.lx * 3} cy={108 + p.ly * 2.5} rx={6} ry={7.5 * open} />
              <circle className="hi" cx={bx + 2 + p.lx * 3} cy={108 - 3 * open + p.ly * 2.5} r={2.2} style={{ opacity: open > 0.4 ? 1 : 0 }} />
              <path className="arc" d={i ? "M115 110 Q122 102 129 110" : "M71 110 Q78 102 85 110"} style={{ opacity: p.joy }} />
            </g>
          ))}
          <g transform={`translate(${p.lx * 1.5} ${gy})`}>
            <circle className="lens" cx="78" cy="108" r="17" />
            <circle className="lens" cx="122" cy="108" r="17" />
            <path className="frame" d="M95 106 Q100 100 105 106 M61 104 L44 97 M139 104 L156 97" />
            <path className="lglint" d="M67 99 Q71 93 78 92 M111 99 Q115 93 122 92" />
          </g>
          <g transform={`translate(100 137) scale(${s} ${2 - s}) translate(-100 -137)`}>
            <ellipse className="nose" cx="100" cy="137" rx="17" ry="12" />
            <ellipse className="nostril" cx="94" cy="137" rx="2.6" ry="3.6" />
            <ellipse className="nostril" cx="106" cy="137" rx="2.6" ry="3.6" />
          </g>
          <path className="mouth" d={mouthPath(100, 156, p.smile, p.mouth, 0.75)} />
        </g>
      </g>
    </>
  );
};

// 眨眼：每个角色有自己的节奏（不会两个一起眨）
export function blink(t: number, offset: number) {
  const period = 3.3 + offset * 0.9, phase = (t + offset * 1.7) % period;
  return phase < 0.14 ? Math.max(0.08, Math.abs(phase - 0.07) / 0.07) : 1;
}

export const Pet: React.FC<{ who: Who; pose: PetPose; size: number }> = ({ who, pose, size }) => {
  const p: Required<PetPose> = { smile: 0.45, joy: 0, lx: 0, ly: 0, open: 1, mode: "idle", bounce: 0, ...pose };
  return (
    <svg className="pv" viewBox="0 0 200 200" width={size} height={size} style={{ overflow: "visible", display: "block" }}>
      <style>{CSS}</style>
      {who === "crab" ? <Crab p={p} /> : <Pig p={p} />}
    </svg>
  );
};
