// 配乐和音效：用程序直接合成（和 App 摄影集里"即兴演奏"的配乐同一个思路），不用任何外部音频素材
// 运行：node scripts/make-music.mjs
// 输出：public/music.wav（约 66 秒，轻快的电钢琴 + 拨弦琶音 + 铺底）、public/sfx/*.wav（快门、提示音、翻页风声）
import { writeFile, mkdir } from "node:fs/promises";

const SR = 44100;
const root = new URL("../", import.meta.url);

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  let peak = 1e-6;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));             // 样本太多，不能用 Math.max(...)
  const k = 0.89 / peak;
  samples.forEach((v, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * k)) * 32767), 44 + i * 2));
  return buf;
}
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// 一个音：电钢琴（基音 + 二倍、三倍泛音，打击感的起音，指数衰减）
function note(out, t0, midi, dur, vel, bright = 1) {
  const f = hz(midi), start = Math.floor(t0 * SR), len = Math.floor((dur + 1.2) * SR);
  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / SR, env = Math.min(1, t / 0.004) * Math.exp(-t * (2.2 + midi / 40)) * (t > dur ? Math.exp(-(t - dur) * 6) : 1);
    const v = Math.sin(2 * Math.PI * f * t) + 0.32 * bright * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 3)
      + 0.12 * bright * Math.sin(6 * Math.PI * f * t) * Math.exp(-t * 6) + 0.05 * Math.sin(2 * Math.PI * f * 1.003 * t);
    out[start + i] += v * env * vel;
  }
}
// 铺底：几个略微走调的正弦叠在一起，慢慢起、慢慢收
function pad(out, t0, midis, dur, vel) {
  const start = Math.floor(t0 * SR), len = Math.floor(dur * SR);
  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / SR, env = Math.min(1, t / 0.9) * Math.min(1, (dur - t) / 0.9);
    let v = 0;
    for (const m of midis) { const f = hz(m); v += Math.sin(2 * Math.PI * f * t) + 0.6 * Math.sin(2 * Math.PI * f * 1.004 * t + 1); }
    out[start + i] += (v / midis.length) * env * vel;
  }
}

// ===== 配乐：96 BPM，F 大调，Fmaj7 → Em7 → Dm7 → Cmaj7（温暖、轻快、不抢台词）=====
const BPM = 96, beat = 60 / BPM, bar = beat * 4, LEN = Number(process.argv[2]) || 66;   // 第二版：node scripts/make-music.mjs 96 music-v2.wav
const music = new Float32Array(SR * LEN);
const chords = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];
const bars = Math.ceil(LEN / bar);
for (let b = 0; b < bars; b++) {
  const ch = chords[Math.floor(b / 2) % chords.length], t = b * bar;
  const intro = b < 2, end = b >= bars - 2;
  pad(music, t, ch.map((m) => m - 12), bar + 0.4, 0.16);
  if (!intro) note(music, t, ch[0] - 24, bar * 0.9, 0.34, 0.4);                  // 低音
  // 琶音：八分音符，偶尔跳过一个，听起来像随手弹的
  for (let k = 0; k < 8; k++) {
    if (intro && k % 2) continue;
    if (!intro && rand() < 0.12) continue;
    const m = ch[[0, 2, 1, 3, 2, 1, 3, 2][k]] + 12 + (k === 7 && rand() < 0.4 ? 12 : 0);
    note(music, t + k * beat / 2 + (rand() - 0.5) * 0.012, m, beat * 0.6, (k % 2 ? 0.16 : 0.22) * (end ? 0.7 : 1));
  }
  // 每两小节一个小旋律钩子
  if (!intro && b % 2 === 1) [0, 1.5, 2, 3].forEach((p, i) => note(music, t + p * beat, ch[[3, 2, 1, 2][i]] + 24, beat, 0.12, 1.4));
}
// 整体淡入淡出 + 简单的回声（让它更"空"一点）
for (let i = SR * LEN - 1; i >= 0; i--) {
  const d = Math.floor(0.28 * SR);
  if (i >= d) music[i] += music[i - d] * 0.22;
}
for (let i = 0; i < music.length; i++) music[i] *= Math.min(1, i / (SR * 1.5)) * Math.min(1, (music.length - i) / (SR * 3));

// ===== 音效 =====
const sfx = {};
{ // 快门：两声短促的咔嚓（机械快门的开和合）
  const s = new Float32Array(SR * 0.25);
  for (const [t0, amp] of [[0, 1], [0.07, 0.7]]) for (let i = 0; i < SR * 0.05; i++) {
    const t = i / SR, j = Math.floor((t0 + t) * SR);
    s[j] += (rand() * 2 - 1) * Math.exp(-t * 90) * amp + Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 140) * amp * 0.5;
  }
  sfx.shutter = s;
}
{ // 提示音：两个上行的清亮音（"就是现在"、出分数）
  const s = new Float32Array(SR * 1.4);
  note(s, 0, 84, 0.3, 0.5, 0.3); note(s, 0.11, 91, 0.6, 0.45, 0.3);
  sfx.chime = s;
}
{ // 风声：一小段经过滤波的噪声，先强后弱（转场、翻页）
  const s = new Float32Array(SR * 0.6); let lp = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / s.length; lp += (rand() * 2 - 1 - lp) * (0.04 + t * 0.1);
    s[i] = lp * Math.sin(Math.PI * t) ** 2;
  }
  sfx.whoosh = s;
}
{ // 冒泡：角色登场时"啵"的一下
  const s = new Float32Array(SR * 0.25);
  for (let i = 0; i < s.length; i++) { const t = i / SR; s[i] = Math.sin(2 * Math.PI * (300 + 900 * t / 0.25) * t) * Math.exp(-t * 22); }
  sfx.pop = s;
}

await mkdir(new URL("public/sfx/", root), { recursive: true });
await writeFile(new URL(`public/${process.argv[3] || "music.wav"}`, root), wav(music));
for (const [name, s] of Object.entries(sfx)) await writeFile(new URL(`public/sfx/${name}.wav`, root), wav(s));
console.log("配乐和音效已生成");
