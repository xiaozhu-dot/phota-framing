// 第二版的时间轴：和第一版同一个思路 —— 每句台词多长由真实配音决定（src/v2/voice.json）
// 场景长度 = 开头留白 + 各句台词（句间停顿） + 结尾留白；改台词重新配音，画面自动对上
import lines from "./lines.json";
import voice from "./voice.json";

export const FPS = 30;
export const GAP = 10;

export type Who = "crab" | "pig";
export type SceneId = "hook" | "coach" | "portrait" | "agent" | "skills" | "album" | "book" | "growth" | "outro";

// 每个场景开头、结尾留给画面自己表演的帧数
const PAD: Record<SceneId, [number, number]> = {
  hook: [56, 34],
  coach: [60, 44],
  portrait: [30, 46],
  agent: [30, 84],
  skills: [30, 54],
  album: [30, 60],
  book: [30, 74],
  growth: [24, 54],
  outro: [20, 120],
};
export const ORDER: SceneId[] = ["hook", "coach", "portrait", "agent", "skills", "album", "book", "growth", "outro"];

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
      if (!v) throw new Error(`台词 ${l.id} 还没有配音：先运行 node scripts/make-voice.mjs v2`);
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
// 某句台词在它所在场景里的开始帧（场景内的组件用相对时间）
export const at = (id: string, k = 0) => { const l = line(id); return l.from - scene(l.scene).from + Math.round(l.frames * k); };

export function speaking(frame: number): { line: Line | null; level: number } {
  const l = LINES.find((x) => frame >= x.from && frame < x.from + x.frames) ?? null;
  return { line: l, level: l ? l.env[frame - l.from] ?? 0 : 0 };
}
