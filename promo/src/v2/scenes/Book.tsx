// 摄影集：关键信息（AI 先猜好"海边"，地名要问）→ 打字"青岛 · 小麦岛"→ 生成 → 摄影集一页 + 3 条配文（带话题标签）
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import { D, clamp, ease, mono, sans } from "../theme";
import { at, scene } from "../timeline";
import { AppBar, fadeIn, popIn, useInOut } from "../ui";

const PLACE = "青岛 · 小麦岛";
const typed = (f: number, from: number, text: string, per = 3) => [...text].slice(0, Math.max(0, Math.floor((f - from) / per))).join("");

export const Book: React.FC = () => {
  const { f, style } = useInOut(scene("book").duration);
  const b2 = at("b2");
  const typeAt = at("b1", 0.45);
  const pressAt = at("b1", 1) + 2;
  const swap = interpolate(f, [pressAt + 6, pressAt + 20], [0, 1], { ...clamp, easing: ease });   // 表单 → 摄影集
  const caret = Math.floor(f / 8) % 2 === 0 && f < pressAt;
  return (
    <AbsoluteFill style={style}>
      <AppBar active={swap > 0.5 ? 2 : 1} />
      {/* ① 关键信息 */}
      <div style={{ position: "absolute", left: 18, right: 18, top: 126, opacity: 1 - swap, translate: `${-swap * 60}px 0px`, fontFamily: sans }}>
        <div style={{ fontFamily: mono, fontSize: 18, letterSpacing: "0.08em", color: D.amber }}>关键信息</div>
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          {["sea", "lake", "sparrow"].map((p) => <Img key={p} src={staticFile(`photos/${p}.jpg`)} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 2 }} />)}
        </div>
        <div style={{ marginTop: 14, fontSize: 18, lineHeight: 1.5, color: D.ink3 }}>都可以不填。没写的，伙伴不会乱编。</div>
        {[
          { label: "在哪儿拍的？", value: typed(f, typeAt, PLACE), guess: "AI 猜：海边", active: true },
          { label: "那天在做什么？", value: "周末散步", guess: "AI 猜的，可以改" },
          { label: "和谁一起？", value: "", guess: "看不出来，留空" },
        ].map((r) => (
          <div key={r.label} style={{ marginTop: 16 }}>
            <div style={{ fontSize: 20, color: D.ink }}>{r.label}</div>
            <div style={{ marginTop: 8, padding: "12px 14px", borderRadius: 4, border: `1px solid ${r.active ? D.amber : D.lineStrong}`, fontSize: 22, color: r.value ? D.ink : D.ink3, minHeight: 30 }}>
              {r.value || r.guess}{r.active && caret ? "|" : ""}
            </div>
          </div>
        ))}
        <div style={{ marginTop: 22, padding: "14px 0", textAlign: "center", borderRadius: 4, backgroundColor: D.amber, color: D.onAmber, fontSize: 22, fontWeight: 500,
          scale: String(interpolate(f, [pressAt, pressAt + 3, pressAt + 9], [1, 0.95, 1], clamp)) }}>生成摄影集和配文</div>
      </div>
      {/* ② 摄影集 + 配文 */}
      <div style={{ position: "absolute", left: 18, right: 18, top: 126, opacity: swap, translate: `${(1 - swap) * 60}px 0px`, fontFamily: sans }}>
        <div style={{ position: "relative", height: 380, overflow: "hidden", borderRadius: 4 }}>
          <Img src={staticFile("photos/sea.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", scale: String(1 + 0.06 * fadeIn(f, pressAt + 10, 80)) }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "40px 18px 16px", background: "linear-gradient(transparent, rgba(18,17,16,.8))", color: D.onPhoto }}>
            <div style={{ fontSize: 30, fontWeight: 500 }}>海边的周末</div>
            <div style={{ fontFamily: mono, fontSize: 16, marginTop: 6, color: "rgba(244,239,230,.75)" }}>青岛 · 小麦岛 · 2026.11.15</div>
          </div>
        </div>
        <div style={{ marginTop: 16, fontFamily: mono, fontSize: 17, letterSpacing: "0.06em", color: D.ink3 }}>配文 · 点复制</div>
        {[
          { t: "风把头发吹乱的那一刻，正好是傍晚六点。", h: "#青岛 #小麦岛 #海边日落" },
          { t: "走了很远，只为看这一片会发光的海。", h: "#周末去哪儿 #胶片感" },
        ].map((c, i) => {
          const k = popIn(f, b2 + i * 10, 12);
          return (
            <div key={i} style={{ marginTop: 10, padding: "12px 14px", borderRadius: 4, backgroundColor: D.s1, border: `1px solid ${D.line}`, opacity: k, translate: `0px ${(1 - k) * 16}px` }}>
              <div style={{ fontSize: 20, lineHeight: 1.45, color: D.ink }}>{c.t}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 18 }}>
                <span style={{ color: D.amber }}>{c.h}</span><span style={{ color: D.ink3 }}>复制</span>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
