// 场景识别：在手机本地看一眼取景画面，判断是人像 / 人文街拍 / 动物 / 风景（不联网、不花钱）
//   用 Google MediaPipe 的物体检测（Apache-2.0 开源，模型 efficientdet_lite0，能认出人、猫、狗、鸟等）
//   识别程序和模型都打包在 App 里：www/mediapipe/（打包时从 node_modules 复制）和 www/models/
//
//   规则（classifyScene，纯函数，方便测试）：
//     自拍                                → 人像
//     1~3 个人，最大的那个人占画面 ≥ 8%      → 人像（主角清楚、能指挥）
//     有动物，最大的占画面 ≥ 2%              → 动物
//     有人（人小或人多）                     → 人文街拍
//     都没有                                → 风景 / 其他
//   换场景要连续几次判断一致才算（createSceneSmoother），免得在两类之间来回跳
export const ANIMALS = ["cat", "dog", "bird", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe"];
const LIMITS = { portraitArea: 0.08, maxPortraitPeople: 3, animalArea: 0.02, personArea: 0.004 };

// dets：[{ label, score, area }]，area = 框的面积占画面的比例
export function classifyScene(dets, { selfie = false } = {}) {
  if (selfie) return "portrait";
  const people = dets.filter((d) => d.label === "person" && d.area >= LIMITS.personArea);
  const biggest = Math.max(0, ...people.map((d) => d.area));
  if (people.length && people.length <= LIMITS.maxPortraitPeople && biggest >= LIMITS.portraitArea) return "portrait";
  if (dets.some((d) => ANIMALS.includes(d.label) && d.area >= LIMITS.animalArea)) return "animal";
  if (people.length) return "street";
  return "landscape";
}

export function createSceneSmoother(need = 3, initial = "landscape") {
  let scene = initial, candidate = null, count = 0;
  return {
    get scene() { return scene; },
    // 返回 true 表示场景刚换了
    push(next) {
      if (next === scene) { candidate = null; count = 0; return false; }
      if (next !== candidate) { candidate = next; count = 0; }
      if (++count < need) return false;
      scene = next; candidate = null; count = 0;
      return true;
    },
    set(next) { scene = next; candidate = null; count = 0; },
  };
}

// 识别器：第一次用时才加载（约 1 秒）；加载失败就一直返回 null，App 照常用构图指导
let loading = null;
export function loadDetector() {
  loading ??= (async () => {
    const { ObjectDetector } = await import("@mediapipe/tasks-vision");
    const base = new URL("mediapipe/", document.baseURI).href;
    return ObjectDetector.createFromOptions(
      { wasmLoaderPath: base + "vision_wasm_internal.js", wasmBinaryPath: base + "vision_wasm_internal.wasm" },
      {
        baseOptions: { modelAssetPath: new URL("models/efficientdet_lite0.tflite", document.baseURI).href, delegate: "CPU" },
        runningMode: "IMAGE", scoreThreshold: 0.4, maxResults: 8, categoryAllowlist: ["person", ...ANIMALS],
      },
    );
  })().catch((e) => { console.warn("场景识别加载失败，只用构图指导", e); return null; });
  return loading;
}

// canvas → [{ label, score, area }]
export async function detect(canvas) {
  const det = await loadDetector();
  if (!det) return null;
  const area = canvas.width * canvas.height;
  return det.detect(canvas).detections.map((d) => ({
    label: d.categories[0]?.categoryName, score: d.categories[0]?.score ?? 0,
    area: (d.boundingBox.width * d.boundingBox.height) / area,
  }));
}
