# Phota 宣传片（Remotion）

竖屏 9:16、约 60 秒：Crabo 和 Piggo 介绍 Phota 的取景指导、深度分析、PRO 模式和摄影集。
画面风格照搬 App：墨色底、奶油色光圈、珊瑚红强调色，两个伙伴的外形和动作来自 `static/pet.js`。

## 准备素材（第一次，或改了台词之后）

```bash
cd promo
npm i
node scripts/make-voice.mjs   # 千问语音配音：读 ../.env 的 QIANWEN_API_KEY；没改的台词会跳过
node scripts/make-music.mjs   # 合成配乐和音效（不用外部素材）
```

示例照片（需要先有 `eval/photos`，可以用 `eval/fetch_photos.py` 下载）：

```bash
cd ..
.venv/Scripts/python.exe -c "from PIL import Image; [ (lambda im: (im.thumbnail((1400,1400)), im.save(f'promo/public/photos/{k}.jpg', quality=86)))(Image.open(f'eval/photos/{n}.jpg').convert('RGB')) for k,n in {'bird':'animal_1','food':'food_1','lake':'landscape_1','sea':'seascape_1','market':'street_2','room':'interior_1'}.items() ]"
```

## 预览和导出

```bash
npm run dev                                              # Remotion Studio 里预览
npx remotion render PhotaPromo out/phota-promo.mp4       # 导出视频
```

## 改台词

台词在 `src/lines.json`（`text` 是字幕，`say` 是念出来的字，不写就和字幕一样）。
改完重新运行 `node scripts/make-voice.mjs`：每个场景的长度会按新的配音自动调整（`src/timeline.ts`）。

照片来自 Wikimedia Commons，署名在片尾（见 `eval/photos/CREDITS.md`）。
