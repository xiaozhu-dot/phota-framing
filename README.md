# Phota

Phota 是一个 Android 摄影教练。拍人像时，点一下取景框里的 Crabo 或 Piggo，它会结合当前画面给摄影师或模特一句现场指导。

## 宣传视频

[观看或下载 Phota 宣传片（MP4，约 20 MB）](promo/phota-promo-v2.mp4)

## 项目目录

- mobile 包含拍摄界面、语音、构图和人像指导，以及 Android 工程。
- static 和根目录的 Python 文件提供网页及服务端实现。
- eval 包含测试、摄影指导评测工具和评分规则。部分评测需要自行准备图片。
- promo 包含宣传片工程。音轨需自行准备。

## 开始使用

进入 mobile，执行 npm ci，再执行 npm run build。要同步到 Android 工程，执行 npm run sync，然后用 Android Studio 打开 mobile/android。

在项目根目录运行 node eval/coach_logic_test.mjs，可以离线验证取景方向的换算。

项目原创源码采用 MIT 许可证。随项目分发的字体和模型遵循各自许可证，详见 mobile/www/fonts 和 mobile/www/licenses。
