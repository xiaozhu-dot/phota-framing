// 千问 AI 平台；模型、音色和计价核对于 2026-10-19。
// https://platform.qianwenai.com/docs/developer-guides/speech/tts
import { companionFor } from './companions.js';
export const CLOUD_MODELS = [
  { id: 'qwen-audio-3.0-tts-plus', label: '细腻表达 · 支持 Token Plan', price: '按量约 1.4 元／万字符；套餐按额度抵扣', female: 'longanlingxin', male: 'longanlufeng', express: true },
  { id: 'qwen3-tts-flash', label: '经济档 · 需账号支持', price: '约 0.8 元／万字符；请先试听确认账号支持', female: 'Cherry', male: 'Ethan', express: false },
];
const HOST = 'https://maas.qianwenaiapi.com';
const modelFor = config => CLOUD_MODELS.find(m => m.id === config.model) || CLOUD_MODELS[0];
export function speechConfig(settings) {
  const official = entry => {
    try { return new URL(entry?.baseUrl).origin === HOST ? entry.apiKey || '' : ''; }
    catch { return ''; }
  };
  const savedKey = settings.preset === 'qianwen' ? official(settings) : '';
  return {
    engine: settings.voiceEngine || 'cloud',
    apiKey: settings.voiceApiKey?.trim() || savedKey || official(settings.saved?.qianwen),
    model: settings.voiceModel || CLOUD_MODELS[0].id,
    gender: companionFor(settings.pet).gender,
    voice: '', pitch: 1, rate: settings.voiceRate ?? 1,
  };
}
export function cloudConfigError(config) {
  if (!config.apiKey?.trim()) return '请先填写千问 AI 平台密钥，或在语音设置中单独填写';
  if (config.apiKey.startsWith('sk-sp-') && !modelFor(config).express) return 'Token Plan 密钥请选「细腻表达」语音档位';
  return '';
}
export const speechAbort = () => new DOMException('Speech cancelled', 'AbortError');
export function createCloudVoice({ fetch: request = (...args) => globalThis.fetch(...args), timeoutMs = 20000 } = {}) {
  const cache = new Map();
  async function synthesize(text, config, signal, context = 'general') {
    const problem = cloudConfigError(config);
    if (problem) throw new Error(problem);
    if (signal.aborted) throw speechAbort();
    const model = modelFor(config), voice = model[config.gender === 'male' ? 'male' : 'female'];
    const rate = Math.max(.85, Math.min(1.15, Number(config.rate) || 1));
    const cacheKey = JSON.stringify([config.apiKey, model.id, voice, rate, context, text]);
    const hit = cache.get(cacheKey);
    if (hit?.expires > Date.now()) return { ...hit, cached: true };
    cache.delete(cacheKey);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(cancel, timeoutMs);
    let abortListener;
    const interrupted = new Promise((_, reject) => {
      abortListener = () => reject(signal.aborted ? speechAbort() : new Error('语音生成超时，请稍后重试'));
      controller.signal.addEventListener('abort', abortListener, { once: true });
    });
    try {
      const input = model.express ? {
        text, voice, format: 'mp3', sample_rate: 24000, rate, pitch: 1, language_hints: ['zh'],
        instruction: `用清爽自然的年轻${config.gender === 'male' ? '男' : '女'}声，像身边的朋友聊天，语气亲切，轻松克制，停顿自然，不用播音腔，不刻意卖萌。` +
          (context === 'coach' ? '拍摄提示短而清楚，动作词稍作强调。' : context === 'album' ? '像分享回忆一样舒缓地讲述。' : '点评时耐心一点，句尾自然收住。'),
      } : { text, voice, language_type: 'Chinese' };
      const endpoint = model.express ? '/audio/tts/SpeechSynthesizer' : '/aigc/multimodal-generation/generation';
      const res = await Promise.race([request(`${HOST}/api/v1/services${endpoint}`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey.trim()}` },
        body: JSON.stringify({ model: model.id, input }),
      }), interrupted]);
      if (signal.aborted) throw speechAbort();
      if (!res.ok) throw new Error(({401:'千问语音密钥无效',403:'当前密钥没有这个语音模型的权限',429:'千问语音额度不足或请求过于频繁'}[res.status]) || `千问语音服务暂不可用（${res.status}）`);
      const data = await Promise.race([res.json(), interrupted]);
      if (signal.aborted) throw speechAbort();
      if (!data.output?.audio?.url) throw new Error('千问没有返回可播放的语音');
      const url = new URL(data.output.audio.url);
      if (url.protocol === 'http:' && url.hostname.endsWith('.aliyuncs.com')) url.protocol = 'https:';
      if (url.protocol !== 'https:') throw new Error('千问返回的音频地址无法安全播放');
      const clip = {
        url: url.href, playbackRate: model.express ? 1 : rate,
        expires: Math.min(Date.now() + 30 * 60 * 1000, (data.output.audio.expires_at || Date.now() / 1000 + 1800) * 1000 - 60000),
        cached: false,
      };
      cache.set(cacheKey, clip);
      while (cache.size > 32) cache.delete(cache.keys().next().value);
      return clip;
    } catch (error) {
      if (signal.aborted) throw speechAbort();
      if (controller.signal.aborted) throw new Error('语音生成超时，请稍后重试');
      throw error;
    } finally {
      clearTimeout(timeout); signal.removeEventListener('abort', cancel);
      controller.signal.removeEventListener('abort', abortListener);
    }
  }
  return { synthesize, clear: () => cache.clear() };
}
export function playCloudAudio(url, { signal, onStart, rate = 1 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(speechAbort());
    const audio = new Audio();
    audio.preload = 'auto'; audio.preservesPitch = true; audio.playbackRate = rate;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', cancel);
      audio.onplaying = audio.onended = audio.onerror = null;
      audio.pause(); audio.removeAttribute('src'); audio.load();
      error ? reject(error) : resolve();
    };
    const cancel = () => finish(speechAbort());
    const timer = setTimeout(() => finish(new Error('语音播放超时')), 120000);
    signal.addEventListener('abort', cancel, { once: true });
    audio.onplaying = () => onStart?.(); audio.onended = () => finish();
    audio.onerror = () => finish(new Error('语音无法播放，请检查网络'));
    audio.src = url;
    audio.play().catch(() => finish(new Error('播放未获允许，请点试听后重试')));
  });
}
