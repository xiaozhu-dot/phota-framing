// 云端使用千问 AI 平台；没有配置或暂时断网时退回系统语音。
import { TextToSpeech } from "@capacitor-community/text-to-speech";
import { createSpeechController } from "./speech-controller.js";
const listeners = new Set();
let lastStatus = { state: "idle", message: "" };
const controller = createSpeechController({ native: TextToSpeech,
  onStatus(status) { lastStatus = status; listeners.forEach(fn => fn(status)); },
});
export const setVoice = on => controller.setEnabled(on);
export const setVoiceStyle = style => controller.configure(style);
export const chineseVoices = () => controller.voices();
export const speak = (text, options) => controller.speak(text, options);
export const stop = () => controller.stop();
export function onVoiceStatus(callback) {
  listeners.add(callback); callback(lastStatus);
  return () => listeners.delete(callback);
}
