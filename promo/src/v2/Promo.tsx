// 第二版宣传片（横屏 16:9，约 90 秒，课程汇报开场用）
// 画面：中间一台手机演示 App；左上章节标题；右上这一段用到的 AI 原理；左下 Crabo、右下 Piggo 对话
import React from "react";
import { AbsoluteFill, interpolate, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { Backdrop, Bubble, Panel, Phone, type Chip } from "./ui";
import { Cast, ENTRANCE } from "./Cast";
import { at, LINES, SCENES, scene, speaking, TOTAL, type SceneId } from "./timeline";
import { clamp } from "./theme";
import { Hook } from "./scenes/Hook";
import { Coach, coachTimes } from "./scenes/Coach";
import { Portrait } from "./scenes/Portrait";
import { Agent, agentTimes } from "./scenes/Agent";
import { Skills } from "./scenes/Skills";
import { Album } from "./scenes/Album";
import { Book } from "./scenes/Book";
import { Growth } from "./scenes/Growth";
import { Outro } from "./scenes/Outro";

const SCREEN: Record<SceneId, React.FC> = { hook: Hook, coach: Coach, portrait: Portrait, agent: Agent, skills: Skills, album: Album, book: Book, growth: Growth, outro: Outro };

// 每一段的章节标题和 AI 原理（at：在这一段里第几帧出现）
const PANELS: () => Record<SceneId, { eyebrow: string; title: string; chips: Chip[] }> = () => ({
  hook: { eyebrow: "PHOTA · AI 摄影教练", title: "拍照时，身边没有老师", chips: [] },
  coach: { eyebrow: "01 · 实时取景教练", title: "看懂画面，算准方向", chips: [
    { kind: "device", tag: "端侧模型", text: "MediaPipe 离线认场景", at: at("k1", 0.2) },
    { kind: "llm", tag: "大模型", text: "只回 JSON：主体在哪、该在哪", at: at("k2") },
    { kind: "code", tag: "程序", text: "算出手机往哪移，不会说反", at: at("k2", 0.6) },
  ] },
  portrait: { eyebrow: "02 · 人像出片", title: "观察和决策分开", chips: [
    { kind: "llm", tag: "观察员", text: "只描述：头和杆子重叠了", at: at("r1") },
    { kind: "code", tag: "程序", text: "视差：近处动得多，定方向", at: at("r1", 0.55) },
    { kind: "llm", tag: "导演", text: "从 20 个动作里选一个", at: at("r2") },
  ] },
  agent: { eyebrow: "03 · 深度分析 Agent", title: "自己决定下一步查什么", chips: [
    { kind: "llm", tag: "循环", text: "思考 → 用工具 → 看结果", at: at("a1") },
    { kind: "code", tag: "工具", text: "测量 · 放大 · 比水平 · 试裁剪", at: at("a1", 0.4) },
    { kind: "code", tag: "自检", text: "测量当事实，对不上就重想", at: at("a2") },
  ] },
  skills: { eyebrow: "04 · 摄影技能库", title: "经验按需放进提示词", chips: [
    { kind: "other", tag: "检索", text: "按功能 + 场景挑最多 3 条", at: at("s1", 0.3) },
    { kind: "llm", tag: "透明", text: "AI 说出它用了哪一条", at: at("s1", 0.85) },
  ] },
  album: { eyebrow: "05 · 相册", title: "能算的，不问 AI", chips: [
    { kind: "code", tag: "程序", text: "量边缘宽度，挑最清楚的", at: at("m1", 0.4) },
    { kind: "device", tag: "端侧模型", text: "导入的照片也认场景", at: at("m1", 0.8) },
  ] },
  book: { eyebrow: "06 · 摄影集", title: "先问清楚，再动笔", chips: [
    { kind: "llm", tag: "大模型", text: "看照片，决定要问什么", at: at("b1") },
    { kind: "other", tag: "规则", text: "没填的地名、人名不许编", at: at("b1", 0.6) },
    { kind: "llm", tag: "生成", text: "摄影集文字 + 3 条配文", at: at("b2") },
  ] },
  growth: { eyebrow: "07 · 成长曲线", title: "每次分析都算数", chips: [
    { kind: "other", tag: "记忆", text: "记下常犯的问题，下次先提醒", at: at("g1", 0.3) },
  ] },
  outro: { eyebrow: "AI APPLICATION COURSE · 2026", title: "phota", chips: [] },
});

// 配乐：有人说话时压低，开头渐入、结尾渐出
function musicVolume(f: number) {
  let near = 99;
  for (let d = -8; d <= 8; d += 2) if (speaking(f + d).line) near = Math.min(near, Math.abs(d));
  const duck = near === 99 ? 0 : interpolate(near, [0, 8], [1, 0], clamp);
  const fade = interpolate(f, [0, 30, TOTAL - 60, TOTAL], [0, 1, 1, 0], clamp);
  return (0.34 - duck * 0.22) * fade;
}

export const PromoV2: React.FC = () => {
  const panels = PANELS();
  const co = scene("coach"), C = coachTimes(), ag = scene("agent"), A = agentTimes(), sk = scene("skills"), bk = scene("book");
  return (
    <AbsoluteFill>
      <Backdrop />
      <Phone>
        {SCENES.map((s) => {
          const View = SCREEN[s.id];
          return <Sequence key={s.id} name={`手机 ${s.id}`} from={s.from} durationInFrames={s.duration} layout="none"><AbsoluteFill><View /></AbsoluteFill></Sequence>;
        })}
      </Phone>
      {SCENES.map((s) => (
        <Sequence key={s.id} name={`说明 ${s.id}`} from={s.from} durationInFrames={s.duration} layout="none">
          <Panel {...panels[s.id]} duration={s.duration} />
        </Sequence>
      ))}
      <Cast />
      {LINES.map((l) => (
        <Sequence key={l.id} name={`气泡 ${l.id}`} from={l.from} durationInFrames={l.frames + 22} layout="none">
          <Bubble text={l.text} frames={l.frames} side={l.who === "crab" ? "left" : "right"} />
        </Sequence>
      ))}

      {/* ===== 声音 ===== */}
      <Audio src={staticFile("music-v2.wav")} volume={musicVolume} />
      {LINES.map((l) => <Audio key={l.id} name={`配音 ${l.id}`} from={l.from} src={staticFile(`voice/v2/${l.id}.wav`)} volume={1} />)}
      <Audio name="登场 Crabo" from={ENTRANCE("crab")} src={staticFile("sfx/pop.wav")} volume={0.5} />
      <Audio name="登场 Piggo" from={ENTRANCE("pig")} src={staticFile("sfx/pop.wav")} volume={0.5} />
      {SCENES.slice(1).map((s) => <Audio key={s.id} name={`转场 ${s.id}`} from={s.from - 4} src={staticFile("sfx/whoosh.wav")} volume={0.4} />)}
      <Audio name="就是现在" from={co.from + C.ready} src={staticFile("sfx/chime.wav")} volume={0.45} />
      <Audio name="快门" from={co.from + C.shutter} src={staticFile("sfx/shutter.wav")} volume={0.8} />
      <Audio name="出分数" from={ag.from + A.final} src={staticFile("sfx/chime.wav")} volume={0.35} />
      <Audio name="技能标签" from={sk.from + at("s1", 1) - 4} src={staticFile("sfx/pop.wav")} volume={0.4} />
      <Audio name="生成摄影集" from={bk.from + at("b1", 1) + 2} src={staticFile("sfx/shutter.wav")} volume={0.35} />
    </AbsoluteFill>
  );
};
export { TOTAL as TOTAL_V2 };
