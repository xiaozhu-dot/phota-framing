// 只处理朗读格式和发音，不改写摄影建议或参数。
function chineseNumber(value) {
  const n = Number(value), digits = '零一二三四五六七八九';
  if (!Number.isInteger(n) || n < 1 || n > 99999) return value;
  let text = '', zero = false;
  for (const [unit, label] of [[10000,'万'],[1000,'千'],[100,'百'],[10,'十'],[1,'']]) {
    const d = Math.floor(n / unit) % 10;
    if (d) { text += (zero ? '零' : '') + digits[d] + label; zero = false; }
    else if (text) zero = true;
  }
  return text.replace(/^一十/, '十');
}
export function prepareSpeech(text) {
  return String(text ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:[-*#>]\s+)+/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\b1\/(\d{1,5})\b/g, (_, denominator) => `${chineseNumber(denominator)}分之一`)
    .replace(/\bISO\s*/gi, '感光度 ')
    .replace(/([+−-])(\d+(?:\.\d+)?)\s*(?:EV|档)/gi, (_, sign, n) => `${sign === '+' ? '加' : '减'}${n} 档`)
    .replace(/\bEV\b/g, '曝光值')
    .replace(/(\d+(?:\.\d+)?)\s*[×x](?=[，。；！\s]|$)/g, '$1倍')
    .replace(/(\d{3,5})\s*K\b/gi, '$1开尔文')
    .replace(/[～~]+/g, '，')
    .replace(/\s+/g, ' ')
    .replace(/([。！？；，：])\s+/g, '$1')
    .trim();
}
export function splitSpeech(text, limit = 480) {
  const chunks = [];
  let rest = text;
  while (rest.length > limit) {
    const prefix = rest.slice(0, limit);
    const punctuation = Math.max(...['。','！','？','；','，'].map(c => prefix.lastIndexOf(c)));
    let end = punctuation >= limit / 3 ? punctuation + 1 : limit;
    if (/[\uD800-\uDBFF]/.test(rest[end - 1])) end--;
    chunks.push(rest.slice(0, end)); rest = rest.slice(end);
  }
  if (rest) chunks.push(rest);
  return chunks;
}
