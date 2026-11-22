// Uses the existing local Qianwen credential without printing or exporting it.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createCloudVoice } from '../mobile/src/cloud-voice.js';
const env = await readFile(new URL('../.env', import.meta.url), 'utf8');
const line = env.split(/\r?\n/).find(s => s.startsWith('QIANWEN_API_KEY='));
const apiKey = line?.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
if (!apiKey || apiKey.includes('在这里')) throw new Error('Local Qianwen credential is not configured');
const cloud = createCloudVoice({fetch:async (...args) => {
  const res = await fetch(...args);
  if (!res.ok) {
    const body = await res.clone().text();
    console.log(JSON.stringify({status:res.status,type:res.headers.get('content-type'),server:res.headers.get('server'),message:body.replaceAll(apiKey, '[redacted]').slice(0,500)}));
  }
  return res;
}});
const clips = [];
for (const gender of ['female', 'male']) {
  const start = Date.now();
  const config = {engine:'cloud',apiKey,model:process.argv[2] || 'qwen-audio-3.0-tts-plus',gender,rate:1};
  const clip = await cloud.synthesize('你好，今天一起拍照吧。往左挪一点，留住这束光。好，就是现在。', config, new AbortController().signal, 'coach');
  const cached = await cloud.synthesize('你好，今天一起拍照吧。往左挪一点，留住这束光。好，就是现在。', config, new AbortController().signal, 'coach');
  if (!cached.cached) throw new Error('Duplicate speech was not cached');
  clips.push({gender,...clip});
  console.log(JSON.stringify({gender, generated:true, milliseconds:Date.now()-start, duplicateCached:cached.cached, audioHost:new URL(clip.url).host}));
}
await mkdir(new URL('./results/', import.meta.url), {recursive:true});
await writeFile(new URL('./results/voice-clips.json', import.meta.url), JSON.stringify(clips));
