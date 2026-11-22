// 构建：
//   1. 把网页版的宠物复制过来（两边共用一份）
//   2. 再把宠物源码存成一个字符串模块 —— 生成摄影集时要把宠物整个"装进"导出的 HTML 里
//   3. 把 src/ 里的模块打包成 www/app.js
//   4. 把场景识别程序（MediaPipe，Apache-2.0）复制到 www/mediapipe/；模型在 www/models/（随仓库提交）
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

// node scripts/build.mjs --collect → 收集版（多一个「标注」页）；不加参数 → 正式版
const collect = process.argv.includes("--collect");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const petUrl = new URL("../../static/pet.js", import.meta.url);
copyFileSync(petUrl, new URL("../www/pet.js", import.meta.url));
writeFileSync(
  new URL("../src/pet-source.js", import.meta.url),
  "// 自动生成，不要手改（来自 static/pet.js）\nexport default " + JSON.stringify(readFileSync(petUrl, "utf8")) + ";\n"
);

// 只带支持 SIMD 的那一份（安卓 WebView 91 以上都支持），省下 12 MB
mkdirSync(new URL("../www/mediapipe/", import.meta.url), { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) {
  copyFileSync(new URL(`../node_modules/@mediapipe/tasks-vision/wasm/${f}`, import.meta.url), new URL(`../www/mediapipe/${f}`, import.meta.url));
}

await build({
  entryPoints: ["src/app.js"],
  bundle: true,
  format: "esm",
  target: ["chrome90"],
  outfile: "www/app.js",
  define: {
    PHOTA_COLLECT: String(collect),
    PHOTA_VERSION: JSON.stringify(`${pkg.version}+${new Date().toISOString().slice(0, 10)}`),   // 版本号 + 打包日期
  },
  logLevel: "info",
});
