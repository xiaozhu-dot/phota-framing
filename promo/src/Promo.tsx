// 整支宣传片：背景 → 各场景（按配音算好的时间排）→ 两位主持人和对话气泡 → 声音（配音、配乐、音效）
import React from "react";
import { AbsoluteFill, interpolate, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { Backdrop, Bubble } from "./ui";
import { Cast, ENTRANCE } from "./Cast";
import { LINES, SCENES, scene, speaking, TOTAL, type SceneId } from "./timeline";
import { Intro } from "./scenes/Intro";
import { Coach, coachTimes } from "./scenes/Coach";
import { Analyze } from "./scenes/Analyze";
import { Pro } from "./scenes/Pro";
import { Album } from "./scenes/Album";
import { Outro } from "./scenes/Outro";
import { clamp } from "./theme";

const VIEW: Record<SceneId, React.FC> = { intro: Intro, coach: Coach, analyze: Analyze, pro: Pro, album: Album, outro: Outro };

// 配乐：有人说话时自动压低（"闪避"），说完再慢慢回来；开头渐入、结尾渐出
function musicVolume(f: number) {
  let near = 99;
  for (let d = -8; d <= 8; d += 2) if (speaking(f + d).line) near = Math.min(near, Math.abs(d));
  const duck = near === 99 ? 0 : interpolate(near, [0, 8], [1, 0], clamp);
  const fade = interpolate(f, [0, 30, TOTAL - 60, TOTAL], [0, 1, 1, 0], clamp);
  return (0.34 - duck * 0.22) * fade;
}

export const Promo: React.FC = () => {
  const coach = scene("coach"), T = coachTimes(), an = scene("analyze");
  return (
    <AbsoluteFill>
      <Backdrop />
      {SCENES.map((s) => {
        const View = VIEW[s.id];
        return (
          <Sequence key={s.id} name={s.id} from={s.from} durationInFrames={s.duration}>
            <View />
          </Sequence>
        );
      })}
      <Cast />
      {LINES.map((l) => (
        <Sequence key={l.id} name={`气泡 ${l.id}`} from={l.from} durationInFrames={l.frames + 24} layout="none">
          <Bubble text={l.text} start={0} frames={l.frames} side={l.who === "crab" ? "left" : "right"} />
        </Sequence>
      ))}

      {/* ===== 声音 ===== */}
      <Audio src={staticFile("music.wav")} volume={musicVolume} />
      {LINES.map((l) => <Audio key={l.id} name={`配音 ${l.id}`} from={l.from} src={staticFile(`voice/${l.id}.wav`)} volume={1} />)}
      <Audio name="登场 Crabo" from={ENTRANCE("crab")} src={staticFile("sfx/pop.wav")} volume={0.5} />
      <Audio name="登场 Piggo" from={ENTRANCE("pig")} src={staticFile("sfx/pop.wav")} volume={0.5} />
      {SCENES.slice(1).map((s) => <Audio key={s.id} name={`转场 ${s.id}`} from={s.from - 4} src={staticFile("sfx/whoosh.wav")} volume={0.45} />)}
      <Audio name="就是现在" from={coach.from + T.ready} src={staticFile("sfx/chime.wav")} volume={0.45} />
      <Audio name="快门" from={coach.from + T.shutter} src={staticFile("sfx/shutter.wav")} volume={0.8} />
      <Audio name="出分数" from={an.from + an.duration - 60} src={staticFile("sfx/chime.wav")} volume={0.3} />
    </AbsoluteFill>
  );
};
