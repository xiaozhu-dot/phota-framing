import { prepareSpeech, splitSpeech } from './speech-text.js';
import { createCloudVoice, playCloudAudio, cloudConfigError, speechAbort } from './cloud-voice.js';
const FEMALE = /female|woman|女|xiaoxiao|xiaoyi|huihui|yaoyao|tingting|meijia|sinji|cmn-cn-x-c[ce]/i;
const MALE = /(?:^|[^a-z])male|男|yunxi|yunjian|kangkang|cmn-cn-x-c[bd]/i;
export function createSpeechController({ native, cloud = createCloudVoice(), play = playCloudAudio, onStatus = () => {} }) {
  let enabled = true, generation = 0, queue = Promise.resolve(), current = null;
  let config = { engine: 'system', voice: '', pitch: 1, rate: 1, gender: 'female' };
  let voiceList = null, nativeStop = Promise.resolve(), retryAfter = 0;
  const status = (state, message = '') => onStatus({ state, message });
  async function voices() {
    if (voiceList?.length) return voiceList;
    try {
      const { voices: all } = await native.getSupportedVoices();
      voiceList = all.map((v, index) => ({
        index, id: v.voiceURI || v.name, name: v.name || v.voiceURI, lang: v.lang,
        female: FEMALE.test(`${v.name} ${v.voiceURI}`), male: MALE.test(`${v.name} ${v.voiceURI}`),
      })).filter(v => /^(?:zh|cmn)(?:-|$)/i.test(v.lang)).sort((a,b) => Number(b.female) - Number(a.female));
    } catch { voiceList = []; }
    return voiceList;
  }
  function stop() {
    generation++;
    current?.controller.abort(); current?.finish(); current = null;
    queue = Promise.resolve();
    nativeStop = Promise.resolve().then(() => native.stop()).catch(() => {});
    status('idle', '已停止朗读');
  }
  function configure(next) {
    const merged = { ...config, ...next };
    if (JSON.stringify(merged) !== JSON.stringify(config)) { stop(); retryAfter = 0; }
    config = merged;
  }
  function speak(text, { flush = false, force = false, strict = false, context = 'general', onStart, onEnd } = {}) {
    const prepared = prepareSpeech(text);
    if ((!enabled && !force) || !prepared) return Promise.resolve();
    if (flush) stop();
    const my = generation, chosen = { ...config };
    const task = queue.then(async () => {
      if (my !== generation || (!enabled && !force)) return;
      const controller = new AbortController(), { signal } = controller;
      let started = false, partStarted = false, ended = false, failed = false;
      let useSystem = chosen.engine !== 'cloud';
      const job = { controller, finish: () => { if (started && !ended) { ended = true; onEnd?.(); } } };
      current = job;
      const start = (engine = chosen.engine) => {
        if (signal.aborted || current !== job) return;
        partStarted = true;
        if (started) return;
        started = true; status('speaking', engine === 'cloud' ? '千问语音播放中' : '系统语音播放中'); onStart?.();
      };
      const check = () => { if (signal.aborted || my !== generation) throw speechAbort(); };
      const system = async (part) => {
        const list = await voices(); check();
        const selected = list.find(v => v.id === chosen.voice) || list.find(v => v.name === chosen.voice) || list.find(v => chosen.gender === 'male' ? v.male : v.female);
        check(); start('system');
        await native.speak({ text:part, lang:selected?.lang || 'zh-CN', rate:Math.max(.85, Math.min(1.15, Number(chosen.rate) || 1)), pitch:Math.max(.8, Math.min(1.3, Number(chosen.pitch) || 1)), volume:1, queueStrategy:0, ...(selected ? {voice:selected.index} : {}) });
      };
      let abortListener;
      const aborted = new Promise((_, reject) => {
        abortListener = () => reject(speechAbort()); signal.addEventListener('abort', abortListener, { once: true });
      });
      const work = async () => {
        await nativeStop; check();
        for (const part of splitSpeech(prepared)) {
          check(); partStarted = false;
          if (useSystem) { await system(part); continue; }
          try {
            const error = cloudConfigError(chosen);
            if (error) throw new Error(error);
            if (!strict && Date.now() < retryAfter) throw new Error('千问语音暂不可用，稍后再试');
            status('loading', '正在生成千问语音…');
            const clip = await cloud.synthesize(part, chosen, signal, context); check();
            await play(clip.url, { signal, onStart:start, rate:clip.playbackRate || 1 });
          } catch (error) {
            check();
            if (strict || partStarted) throw error;
            useSystem = true;
            retryAfter = Date.now() + 30000; status('fallback', `${error.message}；暂用系统语音`);
            await system(part);
          }
        }
      };
      try { await Promise.race([work(), aborted]); }
      catch (error) {
        if (error.name !== 'AbortError') { failed = true; status('error', error.message || '朗读失败'); if (strict) throw error; }
      } finally {
        signal.removeEventListener('abort', abortListener);
        if (current === job) { job.finish(); current = null; if (!failed && !signal.aborted) status('done', '朗读完成'); }
      }
    });
    queue = task.catch(() => {});
    return task;
  }
  return { speak, stop, configure, voices, setEnabled(on) { enabled = Boolean(on); if (!enabled) stop(); } };
}
