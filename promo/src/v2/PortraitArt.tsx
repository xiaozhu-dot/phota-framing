// 一张手绘风的人像取景画面：墙、窗、地面、背后的电线杆、一个人
// o：摄影师往左走了多少（0～1）。视差：近处的人在画面里移动得多，远处的杆子移动得少，于是杆子从头后面"挪开"
// tilt：画面歪了几度；blur：糊的程度；chin：下巴抬起（0～1）；look：看向窗户（0～1）
import React from "react";
import { D } from "./theme";

export const VF = { w: 496, h: 661 };

export const PortraitArt: React.FC<{ o?: number; tilt?: number; blur?: number; chin?: number; look?: number }> = ({ o = 0, tilt = 0, blur = 0, chin = 0, look = 0 }) => {
  const personX = 250 + 44 * o;   // 近：移动多
  const poleX = 250 - 66 * o;     // 远：移动少（方向相反是因为画面又重新把人放回中间附近）
  const headY = 236;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", backgroundColor: D.tone2 }}>
      <div style={{ position: "absolute", inset: -40, rotate: `${tilt}deg`, filter: blur ? `blur(${blur}px)` : undefined }}>
        <svg width={VF.w + 80} height={VF.h + 80} viewBox={`-40 -40 ${VF.w + 80} ${VF.h + 80}`}>
          {/* 墙 + 窗（左上，亮） */}
          <rect x={-40} y={-40} width={VF.w + 80} height={VF.h + 80} fill={D.tone2} />
          <g transform={`translate(${-22 * o} 0)`}>
            <rect x={28} y={70} width={150} height={210} fill="#8f8574" />
            <rect x={28} y={70} width={150} height={210} fill="none" stroke={D.tone1} strokeWidth={8} />
            <line x1={103} y1={70} x2={103} y2={280} stroke={D.tone1} strokeWidth={6} />
            <line x1={28} y1={175} x2={178} y2={175} stroke={D.tone1} strokeWidth={6} />
          </g>
          {/* 地面 */}
          <rect x={-40} y={500} width={VF.w + 80} height={240} fill={D.tone1} />
          {/* 远处的电线杆 */}
          <g transform={`translate(${poleX} 0)`}>
            <rect x={-9} y={-40} width={18} height={560} fill="#24211e" />
            <rect x={-46} y={40} width={92} height={10} fill="#24211e" />
          </g>
          {/* 人：身体 + 头（下巴抬起时头往后仰一点、转向窗户） */}
          <g transform={`translate(${personX} 0)`}>
            <path d="M-96 661 C-92 420 -70 330 0 318 C70 330 92 420 96 661 Z" fill="#8a4a3f" />
            <rect x={-18} y={headY + 34} width={36} height={52} fill="#c99b80" />
            <g transform={`rotate(${-8 * chin - 6 * look} 0 ${headY + 40})`}>
              <ellipse cx={0} cy={headY} rx={44} ry={52} fill="#d7a98c" />
              <path d={`M-46 ${headY - 6} C-46 ${headY - 66} 46 ${headY - 66} 46 ${headY - 6} C30 ${headY - 34} -30 ${headY - 34} -46 ${headY - 6} Z`} fill="#2a2420" />
              {/* 眼睛：看向窗户（画面左边） */}
              <circle cx={-16 - 7 * look} cy={headY + 4 - 3 * chin} r={4} fill="#2a2420" />
              <circle cx={16 - 7 * look} cy={headY + 4 - 3 * chin} r={4} fill="#2a2420" />
              <path d={`M-10 ${headY + 26} Q0 ${headY + 32} 10 ${headY + 26}`} stroke="#8a4a3f" strokeWidth={3} fill="none" strokeLinecap="round" />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
};
