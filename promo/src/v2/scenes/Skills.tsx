// 摄影技能库：设置里的技能列表；拍的是美食 → 只挑出「美食与静物」「逆光与夜景」→ 照片上出现 📖 标签
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { D, mono, sans } from "../theme";
import { at, scene } from "../timeline";
import { fadeIn, popIn, useInOut } from "../ui";

const SKILLS = [
  { name: "人文街拍", d: "路人不能指挥，只指导拍照的人" },
  { name: "动物", d: "蹲到它眼睛的高度" },
  { name: "专业参数", d: "先定快门，再用 ISO 补亮度" },
  { name: "人像姿势", d: "重心放一条腿，身体侧转" },
  { name: "逆光与夜景", d: "先保住亮部，再提暗部", pick: true },
  { name: "美食与静物", d: "平的俯拍，高的平视", pick: true },
  { name: "社交配文", d: "第一句就要抓人" },
];

export const Skills: React.FC = () => {
  const { f, style } = useInOut(scene("skills").duration);
  const s1 = at("s1");
  const pick = fadeIn(f, at("s1", 0.55), 12);
  const chip = popIn(f, at("s1", 1) - 4, 14);
  return (
    <AbsoluteFill style={style}>
      <div style={{ position: "absolute", left: 22, right: 22, top: 58, fontFamily: sans }}>
        <div style={{ fontSize: 22, color: D.ink3 }}>‹ 设置</div>
        <div style={{ marginTop: 10, fontSize: 34, fontWeight: 500, color: D.ink }}>摄影技能</div>
        {/* 现在拍的东西：美食 */}
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, opacity: fadeIn(f, s1 - 10) }}>
          <Img src={staticFile("photos/food.jpg")} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 2 }} />
          <span style={{ fontFamily: mono, fontSize: 18, color: D.ink2 }}>功能：照片分析 · 场景：风景 / 其他</span>
        </div>
      </div>
      <div style={{ position: "absolute", left: 22, right: 22, top: 228, display: "flex", flexDirection: "column", border: `1px solid ${D.line}`, borderRadius: 4, backgroundColor: D.s1 }}>
        {SKILLS.map((s, i) => {
          const on = s.pick ? pick : 0;
          return (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderTop: i ? `1px solid ${D.line}` : "none",
              backgroundColor: on ? `rgba(58,43,20,${on})` : "transparent", opacity: 1 - (s.pick ? 0 : pick * 0.55), fontFamily: sans }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 23, fontWeight: 500, color: on > 0.5 ? D.amber : D.ink }}>{s.name}</div>
                <div style={{ fontSize: 17, color: D.ink3, marginTop: 2 }}>{s.d}</div>
              </div>
              {s.pick && <span style={{ fontFamily: mono, fontSize: 17, padding: "2px 8px", borderRadius: 2, backgroundColor: D.amber, color: D.onAmber, opacity: on }}>已挑选</span>}
              <div style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: D.amber, position: "relative", flex: "none" }}>
                <div style={{ position: "absolute", right: 3, top: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: D.onAmber }} />
              </div>
            </div>
          );
        })}
      </div>
      {/* AI 回答里说明用了哪条 */}
      <div style={{ position: "absolute", left: 22, right: 22, top: 836, display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 4,
        backgroundColor: D.s2, border: `1px solid ${D.amber}`, opacity: chip, scale: String(0.85 + 0.15 * chip), fontFamily: sans }}>
        <span style={{ fontSize: 26 }}>📖</span>
        <span style={{ fontSize: 22, color: D.ink }}>这次用到：<b style={{ color: D.amber, fontWeight: 500 }}>美食与静物</b></span>
      </div>
    </AbsoluteFill>
  );
};
