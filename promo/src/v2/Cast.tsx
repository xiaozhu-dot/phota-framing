// 两位主持人站在画面左下（Crabo）和右下（Piggo）：谁说话谁张嘴（跟着配音的音量）、开口时蹦一下，另一位转头看它
import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { blink, Pet } from "../Pet";
import { LINES, scene, speaking, type Who } from "./timeline";
import { D, clamp, pop, sans } from "./theme";

const SIZE = 300;
const SPOT: Record<Who, { x: number; y: number; delay: number }> = {
  crab: { x: 200, y: 730, delay: 18 },
  pig: { x: 1420, y: 730, delay: 30 },
};
export const ENTRANCE = (who: Who) => scene("hook").from + SPOT[who].delay;

export const Cast: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { line, level } = speaking(frame);
  const outro = scene("outro"), coach = scene("coach");
  const shootAt = LINES.find((l) => l.id === "k3")!.from;
  return (
    <>
      {(["crab", "pig"] as Who[]).map((who) => {
        const me = SPOT[who];
        const mine = LINES.filter((l) => l.who === who && l.from <= frame).pop();
        const since = mine ? frame - mine.from : 999;
        const hop = since < 14 ? Math.sin((since / 14) * Math.PI) * 40 : 0;
        const talking = line?.who === who;
        const party = frame >= outro.from + 10;
        const cheer = party || (frame >= shootAt + 20 && frame < coach.from + coach.duration);
        const partyHop = party ? Math.abs(Math.sin((frame - outro.from) / 7 + (who === "pig" ? 1.2 : 0))) * 30 : 0;
        const enter = interpolate(frame, [ENTRANCE(who), ENTRANCE(who) + 16], [0, 1], { ...clamp, easing: pop });
        const breathe = 1 + Math.sin(t * 2.4 + (who === "pig" ? 1 : 0)) * 0.012;
        // 视线：说话的看向中间的手机，听的看说话的那位
        const lx = line ? (talking ? (who === "crab" ? 0.6 : -0.6) : who === "crab" ? 0.9 : -0.9) : Math.sin(t * 0.7 + (who === "pig" ? 2 : 0)) * 0.4;
        return (
          <div key={who} style={{ position: "absolute", left: me.x, top: me.y, width: SIZE, height: SIZE,
            translate: `0px ${-hop - partyHop + (1 - enter) * 260}px`, scale: `${enter * breathe} ${enter / breathe}`, transformOrigin: "50% 100%" }}>
            <Pet who={who} size={SIZE} pose={{
              t, mouth: talking ? Math.min(1.15, level * 1.25) : 0, smile: cheer ? 0.9 : talking ? 0.55 : 0.4,
              joy: cheer ? 0.8 : 0, lx, ly: talking ? -0.3 : 0, open: cheer ? 1 : blink(t, who === "pig" ? 1 : 0),
              mode: party ? "excited" : "idle", bounce: since < 30 ? 900 * Math.exp(-since / 7) : 0,
            }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: -14, textAlign: "center", fontFamily: sans, fontSize: 26, fontWeight: 500,
              color: talking ? D.amber : D.ink3 }}>
              {who === "crab" ? "Crabo" : "Piggo"}
            </div>
          </div>
        );
      })}
    </>
  );
};
