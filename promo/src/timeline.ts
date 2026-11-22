// 时间轴：每句台词多长，由真实配音决定（src/voice.json，由 scripts/make-voice.mjs 生成）
// 场景的长度 = 开头留白 + 各句台词（句间停顿） + 结尾留白，所以改了台词重新配音，画面会自动对上
import lines from "./lines.json";
import voice from "./voice.json";

export const FPS = 30;
export const GAP = 10; // 两句台词之间停顿的帧数

export type Who = "crab" | "pig";
export type SceneId = "intro" | "coach" | "analyze" | "pro" | "album" | "outro";

// 每个场景开头、结尾留多少帧给画面自己表演
const PAD: Record<SceneId, [number, number]> = {
  intro: [80, 18],
  coach: [30, 24],
  analyze: [30, 24],
  pro: [20, 30],
  album: [20, 50],
  outro: [16, 96],
};
const ORDER: SceneId[] = ["intro", "coach", "analyze", "pro", "album", "outro"];

export type Line = { id: string; who: Who; text: string; scene: SceneId; from: number; frames: number; env: number[] };
export type Scene = { id: SceneId; from: number; duration: number; lines: Line[] };

const byId = Object.fromEntries((voice as { id: string; frames: number; env: number[] }[]).map((v) => [v.id, v]));

export const SCENES: Scene[] = [];
export const LINES: Line[] = [];
{
  let t = 0;
  for (const id of ORDER) {
    const [lead, tail] = PAD[id];
    const from = t;
    let cur = from + lead;
    const own: Line[] = [];
    for (const l of lines.filter((x) => x.scene === id)) {
      const v = byId[l.id];
      if (!v) throw new Error(`台词 ${l.id} 还没有配音：先运行 node scripts/make-voice.mjs`);
      own.push({ id: l.id, who: l.who as Who, text: l.text, scene: id, from: cur, frames: v.frames, env: v.env });
      cur += v.frames + GAP;
    }
    const duration = cur - GAP + tail - from;
    SCENES.push({ id, from, duration, lines: own });
    LINES.push(...own);
    t = from + duration;
  }
}
export const TOTAL = SCENES[SCENES.length - 1].from + SCENES[SCENES.length - 1].duration;

export const scene = (id: SceneId) => SCENES.find((s) => s.id === id)!;
export const line = (id: string) => LINES.find((l) => l.id === id)!;

// 这一帧谁在说话、嘴张多大（0～1）
export function speaking(frame: number): { line: Line | null; level: number } {
  const l = LINES.find((x) => frame >= x.from && frame < x.from + x.frames) ?? null;
  return { line: l, level: l ? l.env[frame - l.from] ?? 0 : 0 };
}
// 最近一句话（说完后气泡还留一会儿）
export function lastLine(frame: number, hold = 24): Line | null {
  for (let i = LINES.length - 1; i >= 0; i--) {
    const l = LINES[i];
    if (frame >= l.from && frame < l.from + l.frames + hold) return l;
  }
  return null;
}
