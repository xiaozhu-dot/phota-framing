// 配音：用千问 AI 平台的语音合成，给每句台词生成一段 wav，并算出每一帧的音量（让嘴巴跟着动）
// 和 App 里同一个模型、同一对声音：Crabo = 年轻女声 longanlingxin，Piggo = 年轻男声 longanlufeng
//
// 运行：node scripts/make-voice.mjs        （台词没改的句子会跳过，不重复花钱）
// 输出：public/voice/<id>.wav、src/voice.json（每句的帧数和逐帧音量）
// 第二版（横屏 90 秒）：node scripts/make-voice.mjs v2 → 读 src/v2/lines.json，写 public/voice/v2/、src/v2/voice.json
// 密钥从仓库根目录的 .env 里读 QIANWEN_API_KEY，只在请求头里用，不打印、不写进任何文件
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const FPS = 30;
const HOST = "https://maas.qianwenaiapi.com";
const MODEL = "qwen-audio-3.0-tts-plus";
const VOICE = { crab: "longanlingxin", pig: "longanlufeng" };
const STYLE = {
  crab: "活泼开朗的年轻女孩，在向朋友介绍自己最喜欢的拍照 App，语气轻快、带着笑意，咬字清楚，不夸张不卖萌。",
  pig: "温和稳重的年轻男生，带一点幽默感，像朋友在认真推荐一个好东西，语速适中，句尾自然收住。",
};

const root = new URL("../", import.meta.url);
const SET = process.argv[2] ? `${process.argv[2]}/` : "";           // 台词集：不写 = 第一版
const lines = JSON.parse(await readFile(new URL(`src/${SET}lines.json`, root), "utf8"));
const env = await readFile(new URL("../.env", root), "utf8");
const keyLine = env.split(/\r?\n/).find((s) => s.startsWith("QIANWEN_API_KEY="));
const apiKey = keyLine?.slice(keyLine.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
if (!apiKey) throw new Error(".env 里没有 QIANWEN_API_KEY");

let old = {};
try { old = Object.fromEntries(JSON.parse(await readFile(new URL(`src/${SET}voice.json`, root), "utf8")).map((v) => [v.id, v])); } catch {}
await mkdir(new URL(`public/voice/${SET}`, root), { recursive: true });

// 读 16 位 PCM 的 wav：返回采样率和归一化的样本
function readWav(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF") throw new Error("不是 wav");
  let off = 12, rate = 0, bits = 0, ch = 1;
  while (off < buf.length - 8) {
    const id = buf.toString("ascii", off, off + 4), size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") { ch = buf.readUInt16LE(off + 10); rate = buf.readUInt32LE(off + 12); bits = buf.readUInt16LE(off + 22); }
    if (id === "data") {
      if (bits !== 16) throw new Error(`只支持 16 位 wav（这个是 ${bits} 位）`);
      const n = Math.floor(Math.min(size, buf.length - off - 8) / 2 / ch), s = new Float32Array(n);
      for (let i = 0; i < n; i++) s[i] = buf.readInt16LE(off + 8 + i * 2 * ch) / 32768;
      return { rate, samples: s };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error("wav 里没有数据");
}

// 每一帧的响度（0～1），用来驱动嘴巴开合
function envelope({ rate, samples }) {
  const per = rate / FPS, frames = Math.ceil(samples.length / per), out = [];
  for (let f = 0; f < frames; f++) {
    let sum = 0, n = 0;
    for (let i = Math.floor(f * per); i < Math.min(samples.length, (f + 1) * per); i++) { sum += samples[i] ** 2; n++; }
    out.push(n ? Math.sqrt(sum / n) : 0);
  }
  const peak = Math.max(...out, 1e-6);
  return out.map((v) => Math.round(Math.min(1, v / peak) ** 0.7 * 100) / 100);
}

const result = [];
for (const line of lines) {
  const say = line.say || line.text;
  const hash = createHash("sha1").update(JSON.stringify([MODEL, VOICE[line.who], STYLE[line.who], say])).digest("hex").slice(0, 10);
  const file = new URL(`public/voice/${SET}${line.id}.wav`, root);
  if (old[line.id]?.hash === hash && (await stat(file).catch(() => null))) { result.push(old[line.id]); console.log(`跳过 ${line.id}（没改）`); continue; }

  const res = await fetch(`${HOST}/api/v1/services/audio/tts/SpeechSynthesizer`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, input: { text: say, voice: VOICE[line.who], format: "wav", sample_rate: 24000, rate: 1, pitch: 1, language_hints: ["zh"], instruction: STYLE[line.who] } }),
  });
  if (!res.ok) throw new Error(`${line.id}：语音合成失败 ${res.status} ${(await res.text()).replaceAll(apiKey, "[密钥]").slice(0, 200)}`);
  const url = (await res.json()).output?.audio?.url;
  if (!url) throw new Error(`${line.id}：没有返回音频`);
  let audio = Buffer.from(await (await fetch(url.replace(/^http:/, "https:"))).arrayBuffer());
  if (audio.toString("ascii", 0, 4) !== "RIFF") {                   // 万一返回的不是 wav：用 Remotion 自带的 ffmpeg 转一下
    const tmp = new URL(`public/voice/${SET}${line.id}.tmp`, root);
    await writeFile(tmp, audio);
    execFileSync("npx", ["remotion", "ffmpeg", "-y", "-i", tmp.pathname.slice(1), "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", file.pathname.slice(1)], { stdio: "ignore", shell: true });
    audio = await readFile(file);
  }
  await writeFile(file, audio);
  const wav = readWav(audio), env_ = envelope(wav);
  result.push({ id: line.id, hash, frames: env_.length, env: env_ });
  console.log(`生成 ${line.id}：${(wav.samples.length / wav.rate).toFixed(2)} 秒`);
}
await writeFile(new URL(`src/${SET}voice.json`, root), JSON.stringify(result));
console.log(`完成：${result.length} 句，共 ${(result.reduce((a, v) => a + v.frames, 0) / FPS).toFixed(1)} 秒`);
