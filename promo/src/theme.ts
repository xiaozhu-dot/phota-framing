// 和 App 同一套颜色与字体（见 mobile/www/index.html 的 :root）
import { Easing } from "remotion";
import { loadFont as loadGaramond } from "@remotion/google-fonts/EBGaramond";
import { loadFont as loadSerifSC } from "@remotion/google-fonts/NotoSerifSC";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

export const C = {
  ink: "#1d1b18", // 墨色底（启动画面、取景器）
  dark: "#121110",
  dark2: "#1c1b19",
  cream: "#f1e9dc", // 奶油色（光圈外环、文字）
  paper: "#f1ede4",
  muted: "#a39c90",
  coral: "#e3583c", // 珊瑚红（强调色）
  coralDeep: "#c8432b",
  good: "#8be0a4", // 分数圆环：好
  mid: "#ffcf6e", // 中
  low: "#f07a5c", // 差
  hair: "rgba(241, 237, 228, .14)",
};

// "Phota" 字样：App 用的是 Palatino 一类的斜体衬线，这里用 EB Garamond 斜体
export const { fontFamily: wordmark } = loadGaramond("italic", { weights: ["500"], subsets: ["latin"] });
// 中文标题：宋体风格的衬线，配 App 的"有格调"
export const { fontFamily: serifSC } = loadSerifSC("normal", { weights: ["700"], ignoreTooManyRequestsWarning: true });
export const { fontFamily: mono } = loadMono("normal", { weights: ["500"], subsets: ["latin"] });
// 正文：和手机上一样用系统的中文黑体
export const sans = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

export const ease = Easing.bezier(0.2, 0.8, 0.2, 1); // App 里最常用的那条缓动曲线
export const pop = Easing.bezier(0.3, 1.5, 0.5, 1); // 带一点回弹
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
