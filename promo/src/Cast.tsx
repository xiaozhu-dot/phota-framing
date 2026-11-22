// 两位主持人一直站在画面下方：谁说话谁张嘴（嘴型跟着配音的音量），开口时蹦一下，另一位转头看着它
import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { blink, Pet } from "./Pet";
import { LINES, scene, speaking, type Who } from "./timeline";
import { clamp, pop, wordmark } from "./theme";

const SPOT: Record<Who, { x: number; y: number; delay: number }> = {
  crab: { x: 90, y: 1555, delay: 46 },
  pig: { x: 660, y: 1555, delay: 58 },
};
export const ENTRANCE = (who: Who) => scene("intro").from + SPOT[who].delay;   // 登场的帧（音效也用）

export const Cast: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { line, level } = speaking(frame);
  const outro = scene("outro"), coach = scene("coach");
  const shootAt = LINES.find((l) => l.id === "c3")!.from;
  return (
    <>
      {(["crab", "pig"] as Who[]).map((who) => {
        const me = SPOT[who];
        // 最近一次开口：蹦一下（蝴蝶结、眼镜跟着甩）
        const mine = LINES.filter((l) => l.who === who && l.from <= frame).pop();
        const since = mine ? frame - mine.from : 999;
        const hop = since < 14 ? Math.sin((since / 14) * Math.PI) * 46 : 0;
        const talking = line?.who === who;
        // 结尾一起开心地蹦；"按快门"之后也开心一下
        const party = frame >= outro.from + 10;
        const cheer = party || (frame >= shootAt + 20 && frame < coach.from + coach.duration);
        const partyHop = party ? Math.abs(Math.sin((frame - outro.from) / 7 + (who === "pig" ? 1.2 : 0))) * 34 : 0;
        const enter = interpolate(frame, [ENTRANCE(who), ENTRANCE(who) + 16], [0, 1], { ...clamp, easing: pop });
        const breathe = 1 + Math.sin(t * 2.4 + (who === "pig" ? 1 : 0)) * 0.012;
        // 视线：说话的看前方（手机），听的转头看说话的那位
        const lx = line ? (talking ? (who === "crab" ? 0.35 : -0.35) : who === "crab" ? 0.9 : -0.9) : Math.sin(t * 0.7 + (who === "pig" ? 2 : 0)) * 0.4;
        return (
          <div key={who} style={{ position: "absolute", left: me.x, top: me.y, width: 330, height: 330,
            translate: `0px ${-hop - partyHop + (1 - enter) * 260}px`, scale: `${enter * breathe} ${enter / breathe}`, transformOrigin: "50% 100%" }}>
            <Pet who={who} size={330} pose={{
              t, mouth: talking ? Math.min(1.15, level * 1.25) : 0, smile: cheer ? 0.9 : talking ? 0.55 : 0.4,
              joy: cheer ? 0.8 : 0, lx, ly: talking ? -0.3 : 0, open: cheer ? 1 : blink(t, who === "pig" ? 1 : 0),
              mode: party ? "excited" : "idle", bounce: since < 30 ? 900 * Math.exp(-since / 7) : 0,
            }} />
            {/* 名牌 */}
            <div style={{ position: "absolute", left: 0, right: 0, bottom: -8, textAlign: "center", fontFamily: wordmark, fontStyle: "italic",
              fontSize: 34, color: "#f1e9dc", opacity: talking || frame < scene("coach").from ? 0.95 : 0.45 }}>
              {who === "crab" ? "Crabo" : "Piggo"}
            </div>
          </div>
        );
      })}
    </>
  );
};
