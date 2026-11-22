# Phota 收集版

日期：2026-10-28。说法见 [CONTEXT.md](../CONTEXT.md)，对应[路线图](superpowers/plans/2026-10-24-phota-training-roadmap.md)第 1 阶段"本地记录、手动导出"。

## 打包

| 命令（在 `mobile/` 里） | 结果 |
|---|---|
| `npm run build` / `npm run apk` | 正式版，和以前一样 |
| `npm run build:collect` | 收集版网页（多一个「标注」页） |
| `npm run apk:collect` | 收集版 APK：程序编号 `com.photographer.viewfinder.collect`，名字「Phota 收集版」，能和正式版同时安装 |

正式版和收集版用同一套代码。打包时由 `PHOTA_COLLECT` 决定要不要带上 `collect*.js`。正式版里不含任何标注代码，`eval/collect_test.mjs` 会检查这一点。

## 代码

- `mobile/src/collect-round.js`：出片回合什么时候开始、什么时候结束。
- `mobile/src/collect-questions.js`：标注题目；提交或跳过时决定保留哪些图。
- `mobile/src/collect-export.js`：生成单个 html 导出文件，读回数据，合并去重。
- `mobile/src/collect-store.js`：手机上的底稿（IndexedDB）和标注人信息。
- `mobile/src/collect.js`：「标注」页面、第一次打开时的说明页，并把导出文件写到「文档/Phota数据」。
- `live.js` 只加了几个 `collect?.` 钩子。正式版传的是 null，这些钩子不会执行任何操作。

## 合并朋友发回来的文件

```
node eval/collect_merge.mjs --name 20261105 phota-数据-小王-7b69.html phota-数据-小李-ff00.html
```

运行后输出 `eval/results/collect-20261105.json`（含图片，已被 git 忽略），并打印统计：标注人、回合数、跳过数、指导失败次数、等待时间中位数、各题的分布。

## 已验证

- 回合判定、题目校验、附图取舍、导出读回、合并去重、正式版不含标注代码：12 项单元测试。全部单元测试 146 项通过。
- 取景布局测试（标准和出片两种）通过。
- 在浏览器里用手机尺寸走了一遍：说明页 → 填昵称 → 标注（做不到时追问原因、漏题提示、选最满意的一张）→ 跳过 → 清空要再确认两次 → 导出文件能打开，图和回答都显示正常。

## 还没做或没验证

- **没有在真机上跑过。** 以下几项都要装到手机上才能确认：浏览器预览里不能用相机，所以"拍完自动跳到标注页"这条完整链路只有单元测试覆盖；写入「文档」文件夹和系统分享也要在真机上看。
- 图标还和正式版一样，只有名字不同。
- 用户自己给出的"更好 / 更差"是自评，不是盲评，不能直接当作路线图第 4 阶段的盲评胜率。
