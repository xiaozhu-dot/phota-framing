// 第二版（横屏 16:9）：颜色和字体照 Phota 设计系统 —— 暗房深色底、琥珀色是唯一的强调色、IBM Plex + 思源黑体
import { Easing } from "remotion";
import { loadFont as loadPlex } from "@remotion/google-fonts/IBMPlexSans";
import { loadFont as loadPlexMono } from "@remotion/google-fonts/IBMPlexMono";
import { loadFont as loadNotoSC } from "@remotion/google-fonts/NotoSansSC";

export const D = {
  s0: "#121110", // 页面底色
  s1: "#1D1B18", // 卡片
  s2: "#2A2622", // 浮层
  line: "#38332D",
  lineStrong: "#7A7367",
  ink: "#EDE6DA",
  ink2: "#B3AA9C",
  ink3: "#958E83",
  amber: "#E8A33D",
  onAmber: "#1A1307",
  amberSoft: "#3A2B14",
  good: "#9CC7A4",
  alert: "#F08A6E",
  onPhoto: "#F4EFE6",
  scrim: "rgba(18,17,16,.66)",
  grid: "rgba(244,239,230,.22)",
  paper: "#F4EFE6",
  paperInk: "#1E1B17",
  tone1: "#2B2824",
  tone2: "#45403A",
  tone3: "#6E665B",
};

const plex = loadPlex("normal", { weights: ["400", "500"], subsets: ["latin"] });
const plexMono = loadPlexMono("normal", { weights: ["400", "500"], subsets: ["latin"] });
const sc = loadNotoSC("normal", { weights: ["400", "500"], ignoreTooManyRequestsWarning: true });
export const sans = `${plex.fontFamily}, ${sc.fontFamily}, sans-serif`;
export const mono = `${plexMono.fontFamily}, ${sc.fontFamily}, monospace`;

export const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
export const pop = Easing.bezier(0.3, 1.5, 0.5, 1);
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
