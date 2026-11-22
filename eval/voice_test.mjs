import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSpeech, splitSpeech } from '../mobile/src/speech-text.js';
import { createSpeechController } from '../mobile/src/speech-controller.js';
import { createCloudVoice, cloudConfigError, speechConfig, playCloudAudio } from '../mobile/src/cloud-voice.js';

const tick = () => new Promise(r => setImmediate(r));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const key = { engine: 'cloud', apiKey: 'test-voice-key', model:'qwen-audio-3.0-tts-plus', gender:'female', rate: 1 };
const response = () => ({ ok: true, json: async () => ({ output: { audio: { url: 'https://audio.example/voice.wav', expires_at: Date.now()/1000 + 3600 } } }) });
const native = (overrides = {}) => ({ getSupportedVoices: async () => ({ voices: [] }), speak: async () => {}, stop: async () => {}, ...overrides });

test('speech keeps photographic values, while removing presentation markup', () => {
  assert.equal(prepareSpeech('**很好**！\n- 快门 1/125 秒，ISO 800，曝光 +0.7 EV，放大 2×。'), '很好！快门 一百二十五分之一 秒，感光度 800，曝光 加0.7 档，放大 2倍。');
  assert.ok(!prepareSpeech('[建议](https://example.com) <script>bad()</script>').includes('https://'));
});
test('long speech chunks stay inside the provider limit and preserve punctuation', () => {
  const text = '很好，向左一点。'.repeat(180);
  const chunks = splitSpeech(text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every(s => s.length <= 500));
});
test('native voice selection uses unique URI even when Android display names match', async () => {
  const calls = [];
  const voices = [{ name:'中文 中国', voiceURI:'cmn-cn-x-cca-local', lang:'zh-CN' }, { name:'中文 中国', voiceURI:'cmn-cn-x-ccc-local', lang:'zh-CN' }];
  const speech = createSpeechController({ native: native({ getSupportedVoices:async () => ({voices}), speak:async p => calls.push(p) }) });
  speech.configure({ engine:'system', voice:'cmn-cn-x-ccc-local' });
  const list = await speech.voices();
  assert.equal(new Set(list.map(v => v.id)).size, 2);
  await speech.speak('你好');
  assert.equal(calls[0].voice, 1);
  assert.equal(calls[0].pitch, 1);
});
test('stopping during native voice lookup never starts the obsolete sentence', async () => {
  const load = deferred(), calls = [];
  const speech = createSpeechController({ native: native({ getSupportedVoices: () => load.promise, speak:async p => calls.push(p) }) });
  const old = speech.speak('旧提示');
  await tick(); speech.stop(); load.resolve({voices:[]}); await old;
  assert.equal(calls.length, 0);
});
test('flush immediately releases a native speak promise that never settles on Android stop', async () => {
  const calls = [];
  const speech = createSpeechController({ native: native({ speak: p => { calls.push(p.text); return p.text === '旧提示' ? new Promise(() => {}) : Promise.resolve(); } }) });
  const old = speech.speak('旧提示'); await tick();
  await speech.speak('新提示', {flush:true});
  await old;
  assert.deepEqual(calls, ['旧提示','新提示']);
});
test('cloud requests use Qianwen credentials and the documented Qianwen endpoint', async () => {
  const calls = [];
  const cloud = createCloudVoice({ fetch:async (url, options) => { calls.push({url, options}); return response(); } });
  const result = await cloud.synthesize('很好，再往左一点。', key, new AbortController().signal, 'coach');
  assert.equal(result.url, 'https://audio.example/voice.wav');
  assert.equal(calls[0].url, 'https://maas.qianwenaiapi.com/api/v1/services/audio/tts/SpeechSynthesizer');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-voice-key');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, 'qwen-audio-3.0-tts-plus');
  assert.equal(body.input.voice, 'longanlingxin');
  assert.match(body.input.instruction, /自然/);
  assert.equal(body.input.pitch, 1);
  assert.equal(body.input.language_hints[0], 'zh');
});
test('cloud audio cache reuses a clip, but never a different voice or credential', async () => {
  let calls = 0;
  const cloud = createCloudVoice({ fetch:async () => { calls++; return response(); } });
  const signal = new AbortController().signal;
  await cloud.synthesize('你好', key, signal); await cloud.synthesize('你好', key, signal);
  assert.equal(calls, 1);
  await cloud.synthesize('你好', {...key, apiKey:'different'}, signal);
  await cloud.synthesize('你好', {...key, gender:'male'}, signal);
  assert.equal(calls, 3);
});
test('economy male and female voices use Qwen3 format without unsupported style fields', async () => {
  const requests = [];
  const cloud = createCloudVoice({fetch:async (url, options) => { requests.push({url, body:JSON.parse(options.body)}); return response(); }});
  for (const gender of ['female','male']) await cloud.synthesize('你好', {...key, model:'qwen3-tts-flash', gender}, new AbortController().signal);
  assert.deepEqual(requests.map(r => r.body.input.voice), ['Cherry','Ethan']);
  assert.ok(requests.every(r => r.url === 'https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation' && r.body.input.language_type === 'Chinese' && !r.body.input.instruction));
});
test('credentials are reused only from an official Qianwen host', () => {
  assert.equal(speechConfig({preset:'qianwen',baseUrl:'https://maas.qianwenaiapi.com/compatible-mode/v1',apiKey:'qwen'}).apiKey, 'qwen');
  assert.equal(speechConfig({preset:'qianwen',baseUrl:'https://other.example/v1',apiKey:'other'}).apiKey, '');
  assert.equal(speechConfig({preset:'custom',baseUrl:'https://other.example/v1',apiKey:'other',saved:{qianwen:{baseUrl:'https://maas.qianwenaiapi.com/compatible-mode/v1',apiKey:'saved'}}}).apiKey, 'saved');
});
test('invalid cloud setup does not send any request', async () => {
  let calls = 0;
  const cloud = createCloudVoice({ fetch:async () => { calls++; return response(); } });
  assert.match(cloudConfigError({...key, apiKey:''}), /密钥/);
  await assert.rejects(cloud.synthesize('你好', {...key, apiKey:''}, new AbortController().signal), /密钥/);
  assert.equal(calls, 0);
});
test('a late cloud result cannot play after cancellation', async () => {
  const result = deferred(), played = [], status = [];
  const speech = createSpeechController({ native:native(), cloud:{synthesize:() => result.promise}, play:async url => played.push(url), onStatus:s => status.push(s) });
  speech.configure(key);
  const old = speech.speak('旧提示'); await tick(); speech.stop();
  result.resolve({url:'https://audio.example/old.wav'}); await old; await tick();
  assert.deepEqual(played, []);
  assert.ok(!status.some(s => s.state === 'fallback'));
});
test('network failure falls back once, but an explicit cloud preview reports the error', async () => {
  const calls = [], status = [];
  const speech = createSpeechController({ native:native({speak:async p => calls.push(p.text)}), cloud:{synthesize:async () => {throw new Error('网络暂不可用');}}, onStatus:s => status.push(s) });
  speech.configure(key);
  await speech.speak('向左一点');
  assert.deepEqual(calls, ['向左一点']);
  assert.ok(status.some(s => s.state === 'fallback'));
  await assert.rejects(speech.speak('试听', {strict:true}), /网络/);
  assert.equal(calls.length, 1);
});
test('a long utterance continues every chunk after falling back to system speech', async () => {
  const calls = []; let cloudCalls = 0;
  const speech = createSpeechController({native:native({speak:async p => calls.push(p.text)}),cloud:{synthesize:async () => {cloudCalls++;throw new Error('offline');}}});
  speech.configure(key);
  const text = '向左一点，留住这束光。'.repeat(60);
  await speech.speak(text);
  assert.equal(calls.join(''),prepareSpeech(text));
  assert.equal(cloudCalls,1);
});
test('a later cloud chunk can fall back without repeating earlier completed audio', async () => {
  const spoken = [], text = '很好，留住这束光。'.repeat(70); let syntheses=0;
  const chunks = splitSpeech(prepareSpeech(text));
  const speech = createSpeechController({native:native({speak:async p => spoken.push(p.text)}),cloud:{synthesize:async () => {if(syntheses++) throw new Error('offline'); return {url:'https://audio.example/first'};}},play:async (_,{onStart})=>onStart()});
  speech.configure(key); await speech.speak(text);
  assert.equal(spoken.join(''),chunks.slice(1).join(''));
});
test('muting prevents queued speech; errors do not poison the next sentence', async () => {
  const calls = [];
  const speech = createSpeechController({native:native({speak:async p => {calls.push(p.text); if(p.text === '失败') throw new Error('tts');}})});
  await speech.speak('失败'); await speech.speak('继续');
  speech.setEnabled(false); await speech.speak('不读');
  assert.deepEqual(calls, ['失败','继续']);
});
test('a bridge that ignores fetch abort still times out and releases synthesis', async () => {
  const cloud = createCloudVoice({fetch:() => new Promise(() => {}),timeoutMs:20});
  await assert.rejects(cloud.synthesize('你好',key,new AbortController().signal), /超时/);
});
test('stopping playback releases audio resources and rejects immediately', async () => {
  const realAudio = globalThis.Audio;
  let audio, pauses = 0, released = false;
  globalThis.Audio = class { constructor() {audio=this;} play() { this.onplaying?.(); return Promise.resolve(); } pause(){pauses++;} removeAttribute(){released=true;} load(){} };
  try {
    const controller = new AbortController(); let starts = 0;
    const playing = playCloudAudio('https://audio.example/test.wav',{signal:controller.signal,onStart:()=>starts++});
    controller.abort(); await assert.rejects(playing,{name:'AbortError'});
    assert.equal(starts,1); assert.equal(pauses,1); assert.equal(released,true); assert.equal(audio.onended,null);
  } finally { globalThis.Audio = realAudio; }
});
