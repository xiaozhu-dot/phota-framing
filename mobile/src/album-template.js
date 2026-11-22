// 摄影集 HTML 模板：生成一个"单文件"网页 —— 照片、文字、宠物、配乐、特效全都装在里面，发给谁都能直接打开
//
// 页面结构：封面 → 每张照片一页 → 结尾页，左右滑动翻页
// 宠物会跳到每一页的照片上沿站着，在上面走来走去、蹦跳、东张西望，偶尔嘀咕一句
// 每本摄影集有一种"风格"：配色、翻页动画、飘落的粒子、配乐是一整套（见 THEMES）
import { albumMusic } from "./album-music.js";
import { albumFx } from "./album-fx.js";

// AI 编摄影集时会挑一个最合适的风格，用户也可以换
// nav：怎么翻页 —— x 左右滑，y 上下滑，book 像书一样一页页翻过去
export const THEMES = {
  dawn:   { name: "晨光", music: "钢琴琶音", look: "暖光推近", nav: "book" },
  sea:    { name: "海风", music: "钟片与海浪", look: "视差漂移", nav: "x" },
  rain:   { name: "雨夜", music: "Lo-fi 电钢琴与雨声", look: "失焦到对焦", nav: "y" },
  summer: { name: "夏日", music: "马林巴", look: "拍立得甩落", nav: "x" },
  snow:   { name: "初雪", music: "八音盒圆舞曲", look: "落雪般下沉", nav: "y" },
  film:   { name: "胶片", music: "磁带钢琴", look: "放映机快门", nav: "x" },
};
export const NAV_NAMES = { x: "左右滑", y: "上下滑", book: "翻书" };

const CSS = `
:root { --bg: #100f0e; --bg2: #1c1a17; --ink: #efe9de; --ink2: #e2dbcf; --muted: #9a9286; --accent: #e3583c; --paper: #f6f2ea;
        --shadow: 0 30px 60px -30px rgba(0,0,0,.9); --title: 400 clamp(36px, 10vw, 72px)/1.12 var(--serif);
        --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Songti SC", "Noto Serif CJK SC", serif;
        --sans: -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; }
/* ===== 六种风格的配色（胶片用上面的默认值）===== */
.t-dawn   { --bg: #f6ecdc; --bg2: #f0d7b6; --ink: #3b2e22; --ink2: #5a4a3a; --muted: #a08b72; --accent: #d9774a; --paper: #fffaf2;
            --shadow: 0 26px 50px -28px rgba(120,70,30,.55); }
.t-sea    { --bg: #0b2230; --bg2: #165266; --ink: #e8f5f5; --ink2: #cfe6e8; --muted: #7fa7ae; --accent: #6fd3d0; --paper: #f4f8f8; }
.t-rain   { --bg: #12121c; --bg2: #26263e; --ink: #e2e2f4; --ink2: #c9c9e4; --muted: #8585a8; --accent: #8fa5ff; --paper: #ececf4; }
.t-summer { --bg: #ffb48a; --bg2: #ffe07a; --ink: #3b1d12; --ink2: #5a2d1c; --muted: #9a5a3c; --accent: #e2432f; --paper: #fff;
            --shadow: 0 26px 40px -24px rgba(150,60,20,.6); --title: 800 clamp(38px, 11vw, 76px)/1.05 var(--sans); }
.t-snow   { --bg: #e9eff6; --bg2: #cfdcea; --ink: #26354a; --ink2: #3c4d64; --muted: #7d8ea5; --accent: #5d86b8; --paper: #fff;
            --shadow: 0 26px 50px -28px rgba(40,70,110,.45); --title: 300 clamp(36px, 10vw, 70px)/1.15 var(--serif); }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; color: var(--ink); font-family: var(--sans); overflow: hidden; }
body { background: radial-gradient(120% 90% at 50% 0%, var(--bg2), var(--bg) 70%) fixed, var(--bg); }
#fx { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }
.grain { position: fixed; inset: 0; pointer-events: none; z-index: 9; opacity: .06;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .6 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>"); }
.t-film .grain { opacity: .1; }
.track { position: relative; z-index: 2; display: flex; height: 100%; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory;
         scrollbar-width: none; overscroll-behavior: contain; }
.track::-webkit-scrollbar { display: none; }
.page { flex: 0 0 100%; height: 100%; scroll-snap-align: center; scroll-snap-stop: always; position: relative; isolation: isolate;
        display: flex; flex-direction: column; align-items: center; justify-content: center; justify-content: safe center; gap: 26px;
        min-width: 0; min-height: 0; overflow: hidden;
        padding: calc(env(safe-area-inset-top, 0px) + 70px) 24px calc(env(safe-area-inset-bottom, 0px) + 64px); }
.kicker { font: 11px/1 var(--mono); letter-spacing: .3em; text-transform: uppercase; color: var(--accent); }
.cover .kicker, .end .kicker { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 40px); left: 0; right: 0; text-align: center; }
.cover h1 { margin: 0; font: var(--title); letter-spacing: .08em; text-align: center; }
.cover h1 .ch { display: inline-block; opacity: 0; }
.page.on h1 .ch { animation: chIn 1.1s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--i) * 70ms + .15s); }
@keyframes chIn { from { opacity: 0; transform: translateY(.5em) rotate(6deg); filter: blur(8px); } to { opacity: 1; transform: none; filter: none; } }
.cover .sub { margin: 0; font-size: 16px; letter-spacing: .12em; color: var(--muted); text-align: center; }
.open, .close { max-width: 30em; margin: 0; font: italic 18px/1.95 var(--serif); text-align: center; color: var(--ink2); }
.meta { font: 11px/1.8 var(--mono); letter-spacing: .2em; color: var(--muted); text-align: center; text-transform: uppercase; }
figure { flex: none; margin: 0; max-width: min(100%, 760px); will-change: transform; }
.ph { background: var(--paper); padding: 10px 10px 12px; box-shadow: var(--shadow); transform: rotate(var(--r, 0deg)); }
.t-summer .ph { padding: 10px 10px 42px; }
.t-film .ph { background: #0c0b0a; padding: 6px; }
figure img { display: block; max-width: 100%; max-height: 56vh; max-height: var(--img-h, 56dvh); object-fit: contain; }
.t-film figure img { filter: contrast(1.05) saturate(.9) sepia(.12); }
.words { flex: none; max-width: min(100%, 32em); text-align: center; }
.words p { margin: 0; font: 17px/1.95 var(--serif); color: var(--ink2); }
.words .num { display: block; margin-bottom: 10px; font: 11px/1 var(--mono); letter-spacing: .24em; color: var(--muted); }
.reveal { opacity: 0; transform: translateY(10px); transition: opacity 1s, transform 1s; }
.page.on .reveal { opacity: 1; transform: none; }
.page.on .reveal.d1 { transition-delay: .3s; } .page.on .reveal.d2 { transition-delay: .7s; } .page.on .reveal.d3 { transition-delay: 1.1s; }

/* 横屏（手机横过来）：照片在左、文字在右，不然竖着放不下 */
@media (orientation: landscape) and (max-height: 520px) {
  .page:not(.cover):not(.end) { flex-direction: row; gap: 32px; padding: calc(env(safe-area-inset-top, 0px) + 40px) calc(env(safe-area-inset-right, 0px) + 56px) calc(env(safe-area-inset-bottom, 0px) + 40px) calc(env(safe-area-inset-left, 0px) + 56px); }
  .page:not(.cover):not(.end) figure { max-width: 58%; }
  .page:not(.cover):not(.end) figure img { max-height: var(--img-h, 72dvh); }
  .page:not(.cover):not(.end) .words { flex: 1 1 0; min-width: 0; text-align: left; }
  .lay-quote .quote { padding-right: 0; }
  .cover, .end { gap: 14px; padding-top: calc(env(safe-area-inset-top, 0px) + 44px); padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 40px); }
}
/* 文字特别长、照片缩到最小也放不下时：字小一号 */
.dense .words p, .dense .flow, .dense .ovl p { font-size: 13.5px; line-height: 1.7; }
.dense .headline, .dense .quote { font-size: 20px; }

/* ===== 上下滑 ===== */
.track.y { flex-direction: column; overflow-x: hidden; overflow-y: auto; scroll-snap-type: y mandatory; }
/* ===== 翻书：每一页是一张纸，绕着左边的"书脊"翻过去；翻的时候纸面有阴影 ===== */
.track.book { display: block; overflow: hidden; perspective: 2000px; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
.track.book .page { position: absolute; inset: 0; transform-origin: 0 50%; backface-visibility: hidden; will-change: transform;
  background: radial-gradient(120% 90% at 50% 0%, var(--bg2), var(--bg) 70%); box-shadow: 0 0 40px -10px rgba(0,0,0,.35); }
.track.book .page::after { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: var(--shade, 0);
  background: linear-gradient(90deg, rgba(0,0,0,.05), rgba(0,0,0,.35)); }
.track.book .page::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 18px; pointer-events: none;
  background: linear-gradient(90deg, rgba(0,0,0,.18), transparent); }          /* 书脊的阴影 */
.book-mode #fx { z-index: 3; }

/* ===== 文字排版：每一页轮换，不只是一段话 ===== */
.c { display: inline-block; white-space: pre; opacity: 0; }
.page.on .c { animation: cIn .9s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--i) * 70ms + .45s); }
.page.on .flow .c { animation-duration: .6s; animation-delay: calc(var(--i) * 32ms + .6s); }
@keyframes cIn { from { opacity: 0; transform: translateY(.45em); filter: blur(5px); } to { opacity: 1; transform: none; filter: none; } }
/* 大标题：一句短诗，大字一个个浮出来；正文变小 */
.headline { display: block; margin: 2px 0 10px; font: 500 clamp(26px, 7.5vw, 40px)/1.25 var(--serif); letter-spacing: .08em; color: var(--ink); }
.t-summer .headline { font: 800 clamp(26px, 8vw, 42px)/1.15 var(--sans); }
.lay-headline .words p { font-size: 14.5px; color: var(--muted); }
/* 叠在照片上：照片下半部压暗，字写在照片里 */
.lay-overlay .ph { position: relative; }
.ovl { position: absolute; left: 10px; right: 10px; bottom: 12px; padding: 42px 16px 14px; text-align: left; color: #fff;
       background: linear-gradient(transparent, rgba(0,0,0,.72)); }
.t-summer .lay-overlay .ovl { bottom: 42px; }
.ovl .num { color: rgba(255,255,255,.75); }
.ovl p { margin: 0; font: 15.5px/1.85 var(--serif); color: #fff; }
/* 竖排：一句诗竖着写在照片旁边 */
.lay-vertical figure { display: flex; align-items: flex-start; gap: 14px; }
.lay-vertical .ph { min-width: 0; flex: 0 1 auto; }
.vline { flex: none; writing-mode: vertical-rl; font: 400 clamp(20px, 5.6vw, 28px)/1.4 var(--serif); letter-spacing: .32em; color: var(--ink); padding-top: 6px; }
/* 逐字：整段话一个字一个字浮现，像在耳边说 */
.flow { display: block; font: 17px/1.95 var(--serif); color: var(--ink2); }
/* 引言：大引号框住一句话 */
.quote { position: relative; margin: 0 0 10px; padding: 0 28px; font: italic 500 clamp(21px, 5.8vw, 30px)/1.45 var(--serif); color: var(--ink); }
.quote::before, .quote::after { position: absolute; font: 400 64px/1 var(--serif); color: var(--accent); opacity: .5; }
.quote::before { content: "“"; left: -6px; top: -14px; } .quote::after { content: "”"; right: -6px; bottom: -40px; }
.lay-quote .words p { font-size: 14.5px; color: var(--muted); }

/* ===== 每种风格的"照片出场" ===== */
.page.on .ph { animation: var(--enter) both; }
.t-dawn   { --enter: inDawn 1.6s cubic-bezier(.2,.8,.2,1); }
.t-sea    { --enter: inSea 1.4s cubic-bezier(.2,.8,.2,1); }
.t-rain   { --enter: inRain 1.5s ease-out; }
.t-summer { --enter: inSummer .9s cubic-bezier(.3,1.5,.5,1); }
.t-snow   { --enter: inSnow 1.3s cubic-bezier(.2,.9,.25,1.1); }
.t-film   { --enter: inFilm .7s linear; }
@keyframes inDawn   { from { opacity: 0; transform: rotate(var(--r)) scale(1.12); filter: brightness(1.5) saturate(.6); } }
@keyframes inSea    { from { opacity: 0; transform: rotate(calc(var(--r) - 4deg)) translateY(30px); filter: blur(6px); } }
@keyframes inRain   { from { filter: blur(14px) brightness(.7); transform: rotate(var(--r)) scale(1.04); } 60% { filter: blur(2px); } }
@keyframes inSummer { from { opacity: 0; transform: translateY(-60vh) rotate(-24deg); } 60% { opacity: 1; } }
@keyframes inSnow   { from { opacity: 0; transform: perspective(900px) rotateX(55deg) translateY(40px); } }
@keyframes inFilm   { 0% { filter: brightness(4); } 12% { filter: brightness(.2); } 24% { filter: brightness(2.2); } 40% { filter: none; } }

/* ===== 封面装饰 ===== */
.deco { position: absolute; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; }
.t-dawn .deco { background: radial-gradient(circle at 50% 78%, rgba(255,176,102,.6), rgba(255,200,140,.18) 30%, transparent 52%);
                animation: sunrise 5s cubic-bezier(.2,.8,.2,1) both; }
@keyframes sunrise { from { transform: translateY(25%); opacity: 0; } }
.t-sea .deco { background: linear-gradient(to bottom, transparent 64%, rgba(111,211,208,.35) 64.15%, rgba(111,211,208,.08) 64.6%, rgba(10,40,55,.5)); }
.t-sea .deco::after { content: ""; position: absolute; left: -50%; right: -50%; top: 64%; height: 36%;
  background: repeating-linear-gradient(90deg, transparent 0 40px, rgba(255,255,255,.07) 40px 90px, transparent 90px 160px);
  -webkit-mask: linear-gradient(transparent, #000 10%, transparent); mask: linear-gradient(transparent, #000 10%, transparent);
  animation: shimmer 9s linear infinite; }
@keyframes shimmer { to { transform: translateX(160px); } }
.t-rain .deco { background:
  radial-gradient(circle at 18% 76%, rgba(255,170,90,.32), transparent 9%), radial-gradient(circle at 74% 70%, rgba(120,150,255,.3), transparent 11%),
  radial-gradient(circle at 46% 86%, rgba(255,110,140,.22), transparent 8%), radial-gradient(circle at 88% 88%, rgba(255,200,120,.24), transparent 7%);
  filter: blur(6px); animation: bokeh 7s ease-in-out infinite alternate; }
@keyframes bokeh { to { opacity: .55; transform: scale(1.05); } }
.t-summer .deco::before { content: ""; position: absolute; inset: -40%;
  background: repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,.3) 0 7deg, transparent 7deg 20deg);
  -webkit-mask: radial-gradient(circle at 50% 50%, #000 0, transparent 45%); mask: radial-gradient(circle at 50% 50%, #000 0, transparent 45%);
  animation: spin 70s linear infinite; }
@keyframes spin { to { transform: rotate(1turn); } }
.t-snow .deco { background: radial-gradient(circle at 78% 20%, rgba(255,255,255,.95), rgba(255,255,255,.4) 6%, transparent 18%); }
.t-film::before, .t-film::after { content: ""; position: fixed; left: 0; right: 0; height: 18px; z-index: 8; pointer-events: none;
  background: repeating-linear-gradient(90deg, transparent 0 10px, rgba(239,233,222,.18) 10px 22px, transparent 22px 34px) 0 50% / 34px 8px repeat-x, rgba(0,0,0,.6);
  animation: sprocket 2.4s linear infinite; }
.t-film::before { top: 0; } .t-film::after { bottom: 0; }
@keyframes sprocket { to { background-position: 34px 50%, 0 0; } }
.leak { display: none; }
.t-film .leak { display: block; position: fixed; inset: -20%; z-index: 3; pointer-events: none; mix-blend-mode: screen;
  background: radial-gradient(circle at 0% 30%, rgba(255,120,40,.35), transparent 40%); animation: leak 11s ease-in-out infinite alternate; }
@keyframes leak { 0%, 40% { opacity: 0; } 70% { opacity: .9; } 100% { opacity: .2; transform: translateX(8%); } }

/* ===== 界面 ===== */
.progress { position: fixed; left: 0; right: 0; top: 0; height: 2px; background: rgba(128,128,128,.15); z-index: 8; }
.progress i { display: block; height: 100%; width: 0; background: var(--accent); transition: width .5s; }
.t-film .progress { top: 18px; }
.hint { position: fixed; left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 22px); translate: -50% 0; z-index: 8;
        font: 11px/1 var(--mono); letter-spacing: .24em; color: var(--muted); transition: opacity .6s; pointer-events: none; }
.t-film .hint { bottom: calc(env(safe-area-inset-bottom, 0px) + 30px); }
.nav { position: fixed; top: 50%; translate: 0 -50%; z-index: 8; width: 44px; height: 64px; border: 0; background: none;
       color: var(--muted); font: 300 28px/1 var(--sans); cursor: pointer; opacity: .5; }
.nav:hover { opacity: 1; } .nav.prev { left: 6px; } .nav.next { right: 6px; }
@media (hover: none) { .nav { display: none; } }
.end .brand { font: 11px/1 var(--mono); letter-spacing: .3em; color: var(--muted); }
.end .credit { max-width: 28em; font: 10px/1.7 var(--mono); letter-spacing: .12em; color: var(--muted); opacity: .75; text-align: center; }
/* 配乐开关：三根会跳的小竖条 */
.sound { position: fixed; top: calc(env(safe-area-inset-top, 0px) + 22px); right: 18px; z-index: 10; width: 40px; height: 40px; padding: 0;
         border-radius: 50%; border: 1px solid rgba(128,128,128,.35); background: rgba(128,128,128,.12);
         display: flex; gap: 3px; align-items: center; justify-content: center; cursor: pointer;
         -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.t-film .sound { top: calc(env(safe-area-inset-top, 0px) + 30px); }
.sound i { width: 3px; height: 9px; border-radius: 2px; background: var(--ink); opacity: .75; }
.sound i:nth-child(2) { height: 15px; } .sound i:nth-child(3) { height: 6px; }
.sound.on i { opacity: 1; }
.sound.on i { animation: eq 1s ease-in-out infinite; }
.sound.on i:nth-child(2) { animation-delay: -.4s; } .sound.on i:nth-child(3) { animation-delay: -.7s; }
@keyframes eq { 0%, 100% { height: 4px; } 50% { height: 16px; } }
.tap { position: fixed; left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 58px); translate: -50% 0; z-index: 10;
       padding: 10px 18px; border-radius: 999px; background: var(--accent); color: #fff; font-size: 13px; letter-spacing: .1em; white-space: nowrap;
       box-shadow: 0 10px 30px -10px var(--accent); animation: breathe 2.4s ease-in-out infinite; transition: opacity .5s; pointer-events: none; }
.tap.gone { opacity: 0; animation: none; }
@keyframes breathe { 50% { transform: scale(1.06); } }
#perch { position: fixed; left: 0; top: 0; width: 90px; height: 90px; z-index: 7; will-change: transform; }
#perch .pet { transform: scale(.45); transform-origin: 0 0; width: 200px; }
#perch .pet .cap { display: none; }
.bubble { position: fixed; left: 0; top: 0; z-index: 10; max-width: 220px; padding: 7px 14px; border-radius: 18px;
          font-size: 13.5px; line-height: 1.4; color: #1d1b18; background: radial-gradient(120% 140% at 30% 15%, #fff 40%, #f1ede4);
          box-shadow: 0 8px 20px -10px rgba(0,0,0,.6); pointer-events: none; }
@media (prefers-reduced-motion: reduce) {
  .reveal, .page.on .ph, .page.on h1 .ch, .deco, .deco::before, .deco::after, .leak { transition: none; animation: none !important; }
  .cover h1 .ch { opacity: 1; }
}`;

// 翻页时照片跟着手指动：d 是这一页离屏幕正中有多远（0 = 正中，±1 = 完全滑出屏幕）
// 返回 [照片的变换, 照片的滤镜, 透明度]
function albumMotion() {
  const a = Math.abs;
  // 上下滑时用的版本（没写的风格用 default）
  const y = {
    rain:    (d) => [`translateY(${-d * 22}%) scale(${1 + a(d) * 0.08})`, `blur(${a(d) * 10}px)`, 1 - a(d) * 0.5],
    snow:    (d) => [`perspective(900px) rotateX(${d * 36}deg) scale(${1 - a(d) * 0.1})`, "", 1 - a(d) * 0.5],
    default: (d) => [`translateY(${-d * 16}%) scale(${1 - a(d) * 0.1})`, "", 1 - a(d) * 0.6],
  };
  return { y,
    dawn:   (d) => [`translateX(${-d * 18}%) scale(${1 - a(d) * 0.14})`, "", 1 - a(d) * 0.7],
    sea:    (d) => [`translate(${-d * 38}%, ${a(d) * 34}px) rotate(${-d * 4}deg)`, "", 1 - a(d) * 0.4],
    rain:   (d) => [`scale(${1 + a(d) * 0.1})`, `blur(${a(d) * 12}px)`, 1 - a(d) * 0.5],
    summer: (d) => [`translate(${-d * 12}%, ${a(d) * 90}px) rotate(${d * 22}deg)`, "", 1],
    snow:   (d) => [`perspective(900px) rotateY(${-d * 48}deg) scale(${1 - a(d) * 0.12})`, "", 1 - a(d) * 0.5],
    film:   (d) => [`translateX(${-d * 6}%)`, `brightness(${1 + a(d) * 0.9}) sepia(${a(d) * 0.6})`, 1],
  };
}

// 摄影集页面里运行的脚本（会被原样放进生成的 HTML）
function albumMain() {
  const data = JSON.parse(document.getElementById("album-data").textContent);
  const pet = window.pet;
  const track = document.getElementById("track");
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;          // 文字一律当纯文本
    return e;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MOVE = window.albumMotion();
  const theme = data.theme in MOVE && data.theme !== "y" ? data.theme : "film";
  const nav = ["x", "y", "book"].includes(data.nav) ? data.nav : "x";
  track.classList.add(nav);
  document.body.classList.toggle("book-mode", nav === "book");
  document.querySelector(".hint").textContent = { x: "左右滑动翻页", y: "上下滑动翻页", book: "点右边或往左拖，翻到下一页" }[nav];
  document.body.classList.add("t-" + theme);
  const fx = window.AlbumFx.start(document.getElementById("fx"), theme);
  const music = window.AlbumMusic.create(theme, data.seed);

  // 把一句话拆成一个个字（每个字单独浮现）
  const chars = (text, cls) => {
    const w = el("span", cls);
    [...text].forEach((ch, k) => { const c = el("span", "c", ch); c.style.setProperty("--i", k); w.append(c); });
    return w;
  };
  const LAYOUTS = ["caption", "headline", "overlay", "vertical", "words", "quote"];

  // ===== 搭页面 =====
  const pages = [];
  const cover = el("section", "page cover");
  const h1 = el("h1");
  [...data.title].forEach((c, i) => {                // 标题一个字一个字地飘进来
    const ch = el("span", "ch", c);
    ch.style.setProperty("--i", i);
    h1.append(ch);
  });
  h1.dataset.perch = "";
  cover.append(el("div", "deco"), el("div", "kicker reveal", "A Photo Album"), h1, el("p", "sub reveal d1", data.subtitle || ""),
               el("p", "open reveal d2", data.opening || ""), el("div", "meta reveal d3", `${data.date} · ${data.pages.length} 张`));
  pages.push({ node: cover, mood: "warm" });

  data.pages.forEach((p, i) => {
    const page = el("section", "page");
    const fig = el("figure");
    const ph = el("div", "ph");
    const tilt = theme === "summer" ? 2 + ((i * 37) % 30) / 10 : 0.6 + ((i * 37) % 10) / 10;   // 夏日的拍立得歪得多一点
    ph.style.setProperty("--r", ((i % 2 ? 1 : -1) * tilt).toFixed(2) + "deg");
    fig.dataset.perch = "";
    const img = el("img");
    img.src = p.img;
    img.alt = p.text || "";
    img.decoding = "async";
    ph.append(img);
    fig.append(ph);
    // 文字排版：六种轮换（起点由随机种子决定，所以每本的顺序也不一样）
    const lay = LAYOUTS[(i + data.seed) % LAYOUTS.length];
    page.classList.add("lay-" + lay);
    const numText = `${String(i + 1).padStart(2, "0")} / ${String(data.pages.length).padStart(2, "0")}`;
    const line = String(p.line || String(p.text || "").split(/[，。！？；,.!?;]/)[0]).slice(0, 12);
    const words = el("div", "words");
    if (lay === "overlay") {
      const ov = el("div", "ovl reveal d2");
      ov.append(el("span", "num", numText), el("p", null, p.text || ""));
      ph.append(ov);
    } else if (lay === "vertical") {
      fig.append(chars(line, "vline"));
      words.append(el("span", "num reveal d1", numText), el("p", "reveal d3", p.text || ""));
    } else if (lay === "headline") {
      words.append(el("span", "num reveal d1", numText), chars(line, "headline"), el("p", "reveal d3", p.text || ""));
    } else if (lay === "words") {
      words.append(el("span", "num reveal d1", numText), chars(p.text || "", "flow"));
    } else if (lay === "quote") {
      words.append(el("blockquote", "quote reveal d1", line), el("p", "reveal d2", p.text || ""), el("span", "num reveal d3", numText));
    } else {
      words.append(el("span", "num reveal d1", numText), el("p", "reveal d2", p.text || ""));
    }
    page.append(fig);
    if (words.childNodes.length) page.append(words);
    pages.push({ node: page, mood: p.mood, whisper: p.whisper });
  });

  const end = el("section", "page end");
  const closing = el("p", "close reveal", data.closing || "");
  closing.dataset.perch = "";
  const tune = music.describe();
  end.append(el("div", "kicker reveal", "Fin"), closing, el("div", "brand reveal d2", `Phota · 和 ${data.petName} 一起拍的`),
             el("div", "credit reveal d3", `配乐：${data.musicName} · ${tune.key} 调 · ${tune.bpm} BPM · 每本摄影集即兴演奏，独一无二`));
  pages.push({ node: end, mood: "lively", final: true });
  pages.forEach((p) => track.append(p.node));

  // ===== 宠物 =====
  const perch = document.getElementById("perch");
  pet.mount(perch, data.species);
  pet.onPoke = () => { const w = pages[current]?.whisper; if (w) pet.ambient(w); };
  let pos = { x: innerWidth / 2 - 45, y: innerHeight - 120 };
  const place = (p) => (perch.style.transform = `translate(${p.x}px, ${p.y}px)`);
  place(pos);
  let current = -1, busy = 0;

  // 当前页上可以站的位置：照片（或标题）的上沿
  function spot(index, prefer) {
    const target = pages[index].node.querySelector("[data-perch]");
    const r = target.getBoundingClientRect();
    const minX = r.left - 10, maxX = Math.max(minX, r.right - 80);
    const x = prefer != null ? Math.min(maxX, Math.max(minX, prefer)) : minX + Math.random() * (maxX - minX);
    return { x, y: r.top - 84 };
  }

  function tween(to, ms, arc) {
    const from = { ...pos };
    pet.lookAt({ x: to.x + 45 + (to.x - from.x) * 2, y: to.y + 40 }, ms + 300);
    if (reduce) { pos = to; place(pos); return Promise.resolve(); }
    return new Promise((done) => {
      const t0 = performance.now();
      (function step(now) {
        const p = Math.min(1, (now - t0) / ms);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        pos = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e - Math.sin(p * Math.PI) * arc };
        place(pos);
        if (p < 1) requestAnimationFrame(step); else done();
      })(t0);
    });
  }

  const MOODS = {
    warm: { smile: 0.7, ear: 0.5, blush: 0.6 }, calm: { smile: 0.35, ear: 0, eye: 0.8, blush: 0.3 },
    lively: { smile: 1, ear: 1, blush: 0.7 }, wistful: { smile: -0.1, ear: -0.4, blush: 0.2 },
  };

  async function goTo(index) {
    if (index === current) return;
    current = index;
    const my = ++busy;
    pages.forEach((p, i) => p.node.classList.toggle("on", i === index));
    music.turn(pages[index].mood);                                   // 翻页时一串轻轻的风铃声；心情决定音乐的疏密
    document.querySelector(".progress i").style.width = ((index + 1) / pages.length) * 100 + "%";
    await sleep(theme === "summer" ? 650 : nav === "book" ? 480 : 120);                     // 夏日：等拍立得落稳了再跳上去
    if (my !== busy) return;
    pet.hop(0.6);
    const to = spot(index);
    const dist = Math.hypot(to.x - pos.x, to.y - pos.y);
    await tween(to, Math.min(900, 420 + dist * 0.6), 60 + dist * 0.25);   // 一个大跳，跳上这一页的照片
    if (my !== busy) return;
    pet.mood(MOODS[pages[index].mood] || MOODS.warm);
    if (pages[index].final) pet.celebrate();
    await sleep(900);
    if (my === busy && pages[index].whisper) pet.ambient(pages[index].whisper);
    play(my);
  }

  // 在照片上玩：走一走、蹦一下、看看文字、发会儿呆
  async function play(my) {
    while (my === busy) {
      await sleep(2200 + Math.random() * 2600);
      if (my !== busy || document.hidden) continue;
      const r = Math.random();
      if (r < 0.45) {                                              // 沿着照片上沿走几步
        const to = spot(current, pos.x + (Math.random() < 0.5 ? -1 : 1) * (50 + Math.random() * 90));
        const steps = 3;
        for (let s = 1; s <= steps && my === busy; s++) {
          pet.hop(0.25);
          await tween({ x: pos.x + (to.x - pos.x) / (steps - s + 1), y: to.y }, 260, 8);
        }
      } else if (r < 0.65) {
        pet.hop(0.9);                                              // 原地蹦一下
      } else if (r < 0.85) {
        const words = pages[current].node.querySelector(".words, .open, .close, .sub");
        if (words) pet.lookAt(words, 1800);                        // 低头看看文字
      } else {
        pet.lookAt({ x: Math.random() * innerWidth, y: Math.random() * innerHeight * 0.4 }, 1500);   // 东张西望
      }
    }
  }

  // ===== 跟手的翻页动画 + 起风 =====
  const movers = pages.map((p) => p.node.querySelector("figure, h1, .close"));
  const Y = nav === "y";
  const at = () => (Y ? track.scrollTop : track.scrollLeft), size = () => (Y ? track.clientHeight : track.clientWidth);
  const offset = (i) => (Y ? pages[i].node.offsetTop : pages[i].node.offsetLeft);     // 第 i 页在滚动条上的位置
  const indexNow = () => {                                                              // 离屏幕最近的那一页
    let best = 0;
    pages.forEach((_, i) => { if (Math.abs(offset(i) - at()) < Math.abs(offset(best) - at())) best = i; });
    return best;
  };
  const motion = Y ? MOVE.y[theme] || MOVE.y.default : MOVE[theme];
  let lastLeft = at(), pending = false;
  function follow() {
    pending = false;
    if (nav === "book") return;
    const W = size(), left = at();
    fx.gust((lastLeft - left) / (Y ? 30 : 12));                      // 滑得越快，风越大
    lastLeft = left;
    if (reduce) return;
    movers.forEach((m, i) => {
      const d = Math.max(-1.2, Math.min(1.2, (offset(i) - left) / W));
      const still = Math.abs(d) < 0.002;
      const [tf, filter, op] = motion(d);
      const edge = Math.max(0, Math.min(1, (1 - Math.abs(d)) * 3));    // 快滑出屏幕时淡出：旁边那页的照片不会在屏幕边上露一条边
      m.style.transform = still ? "" : tf;
      m.style.filter = still ? "" : filter;
      m.style.opacity = still ? "" : String(Math.max(0, op) * edge);
    });
  }

  // ===== 配乐：浏览器规定要先点一下才能出声 =====
  const sound = document.getElementById("sound"), tap = document.getElementById("tap");
  const syncSound = () => sound.classList.toggle("on", music.playing);
  sound.onclick = async (e) => {
    e.stopPropagation();
    tap.classList.add("gone");
    if (music.playing) music.stop(); else await music.start();
    syncSound();
  };
  async function firstTouch(e) {
    removeEventListener("pointerdown", firstTouch);
    removeEventListener("keydown", firstTouch);
    if (e.target === sound || tap.classList.contains("gone")) return;
    tap.classList.add("gone");
    await music.start();
    syncSound();
  }
  addEventListener("pointerdown", firstTouch);
  addEventListener("keydown", firstTouch);
  document.addEventListener("visibilitychange", () => (document.hidden ? music.pause() : music.resume()));

  // ===== 翻页 =====
  const hideHint = () => (document.querySelector(".hint").style.opacity = 0);
  let turn;
  if (nav === "book") turn = setupBook();
  else {
    track.addEventListener("scroll", () => {
      if (!pending) { pending = true; requestAnimationFrame(follow); }
      clearTimeout(track._t);
      track._t = setTimeout(() => {
        goTo(indexNow());
        if (indexNow() > 0) hideHint();
      }, 90);
    }, { passive: true });
    turn = (d) => {
      const to = Math.max(0, Math.min(pages.length - 1, (current < 0 ? indexNow() : current) + d));
      track.scrollTo({ [Y ? "top" : "left"]: offset(to), behavior: reduce ? "auto" : "smooth" });
    };
  }
  document.querySelector(".prev").onclick = () => turn(-1);
  document.querySelector(".next").onclick = () => turn(1);
  addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") turn(1);
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") turn(-1);
  });

  // 翻书：所有页叠在一起，最上面是当前页。往左拖（或点右边）—— 当前页绕着书脊翻过去；往右拖（或点左边）—— 上一页翻回来
  function setupBook() {
    const sheets = pages.map((p) => p.node), n = sheets.length;
    sheets.forEach((s, i) => (s.style.zIndex = String(n - i)));
    let idx = 0, drag = null;
    const W = () => track.clientWidth;
    const set = (s, deg) => {
      s.style.transform = deg ? `rotateY(${deg}deg)` : "";
      s.style.setProperty("--shade", Math.min(1, Math.abs(deg) / 100).toFixed(3));
      s.style.visibility = deg <= -179.5 ? "hidden" : "";
    };
    const angle = (s) => parseFloat((s.style.transform.match(/-?[\d.]+/) || [0])[0]);
    function animate(s, from, to) {
      const t0 = performance.now(), ms = reduce ? 0 : 520 + Math.abs(to - from) * 2;
      (function step(now) {
        const p = ms ? Math.min(1, (now - t0) / ms) : 1, e = 1 - Math.pow(1 - p, 3);
        set(s, from + (to - from) * e);
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    }
    function flip(dir) {
      if (dir > 0 && idx < n - 1) { animate(sheets[idx], angle(sheets[idx]), -180); idx++; fx.gust(-5); hideHint(); goTo(idx); }
      else if (dir < 0 && idx > 0) { idx--; animate(sheets[idx], sheets[idx].style.visibility ? -180 : angle(sheets[idx]), 0); fx.gust(5); goTo(idx); }
    }
    track.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, t: performance.now(), dx: 0 }; });
    addEventListener("pointermove", (e) => {
      if (!drag) return;
      drag.dx = e.clientX - drag.x;
      const k = Math.max(-1, Math.min(1, drag.dx / (W() * 0.8)));
      if (k < 0 && idx < n - 1) set(sheets[idx], k * 180);                      // 拖着当前页往左翻
      else if (k > 0 && idx > 0) { sheets[idx - 1].style.visibility = ""; set(sheets[idx - 1], -180 + k * 180); }   // 把上一页拖回来
    });
    addEventListener("pointerup", (e) => {
      if (!drag) return;
      const { dx, t } = drag;
      drag = null;
      if (Math.abs(dx) < 8 && performance.now() - t < 400) {                     // 轻点：右边下一页，左边上一页
        if (e.target.closest("button, #perch")) return;
        if (e.clientX > W() * 0.6) flip(1); else if (e.clientX < W() * 0.4) flip(-1);
        return;
      }
      if (dx < -W() * 0.15 && idx < n - 1) flip(1);
      else if (dx > W() * 0.15 && idx > 0) flip(-1);
      else {                                                                     // 拖得不够远：弹回去
        if (idx < n - 1) animate(sheets[idx], angle(sheets[idx]), 0);
        if (idx > 0 && dx > 0) animate(sheets[idx - 1], angle(sheets[idx - 1]), -180);
      }
    });
    return flip;
  }
  function fit() {
    pages.forEach(({ node }) => {
      const img = node.querySelector("figure img");
      if (!img) return;
      const fig = img.closest("figure"), moved = fig.style.transform;
      fig.style.transform = "none";                                     // 翻页动画的位移不算（否则会误以为放不下）
      const wide = matchMedia("(orientation: landscape) and (max-height: 520px)").matches;
      let h = wide ? 72 : 56;
      node.classList.remove("dense");
      img.style.setProperty("--img-h", h + "dvh");
      const tooBig = () => node.scrollHeight > node.clientHeight + 1;
      while (tooBig() && h > 26) img.style.setProperty("--img-h", (h -= 4) + "dvh");
      if (tooBig()) node.classList.add("dense");                         // 照片已经最小了还放不下：字小一号
      fig.style.transform = moved;
    });
  }
  fit();
  Promise.all([...track.querySelectorAll("img")].map((img) => img.decode().catch(() => {}))).then(fit);   // 照片解码完才知道真实高度
  addEventListener("resize", () => { fit(); const s = spot(current, pos.x); pos = s; place(pos); follow(); });

  goTo(0);
}

const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const safeScript = (s) => String(s).replace(/<\/script/gi, "<\\/script");

// data.theme：风格（THEMES 里的一个）；data.seed：随机种子，决定配乐的调、和弦、旋律
export function buildAlbumHTML(data, petSource) {
  const theme = THEMES[data.theme] ? data.theme : "film";
  const json = JSON.stringify({ ...data, theme, nav: THEMES[theme].nav, musicName: THEMES[theme].music }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHTML(data.title)} · 摄影集</title>
<style>${CSS}</style>
</head>
<body>
<canvas id="fx"></canvas>
<div class="leak"></div>
<div class="grain"></div>
<div class="progress"><i></i></div>
<main class="track" id="track"></main>
<div id="perch"></div>
<button class="nav prev" aria-label="上一页">‹</button>
<button class="nav next" aria-label="下一页">›</button>
<div class="hint">左右滑动翻页</div>
<button class="sound" id="sound" aria-label="配乐开关"><i></i><i></i><i></i></button>
<div class="tap" id="tap">♪ 轻触开始 · 有配乐</div>
<script type="application/json" id="album-data">${json}</script>
<script>${safeScript(petSource)}</script>
<script>
(${albumMusic.toString()})();
(${albumFx.toString()})();
window.albumMotion = ${albumMotion.toString()};
(${albumMain.toString()})();
</script>
</body>
</html>`;
}
