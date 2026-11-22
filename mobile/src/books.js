// 摄影集页：做好的摄影集都存在这里（说法见 CONTEXT.md「摄影集页」）
//   生成完自动保存：文字、照片副本、配文、风格。相册里删了原图，摄影集不受影响
//   列表：封面、标题、日期、张数。点进去：预览、换风格（不用再问 AI）、分享、保存到手机、复制配文、改标题、删除
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { captionCopy } from "./album-info.js";
import { buildAlbumHTML, THEMES, NAV_NAMES } from "./album-template.js";
import { loadImage, toCanvas, toDataURL } from "./vision.js";
import petSource from "./pet-source.js";
import { loadBooks, saveBook, deleteBook } from "./shotstore.js";
import { placeSkillChip } from "./skill-ui.js";
import { pushBack, popBack } from "./backstack.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fileNameOf = (b) => `Phota-${b.book.title.replace(/[\/:*?"<>|\s]+/g, "_")}-${b.book.date.replace(/\./g, "")}.html`;

export function setupBooks({ pet }) {
  let books = [], opened = null, html = "", detailBack = 0, previewBack = 0;
  const msg = (text, cls = "") => { $("bookMsg").textContent = text; $("bookMsg").className = "album-msg " + cls; };

  loadBooks().then((list) => { books = list; render(); }).catch(() => {});

  // ===== 列表 =====
  function render() {
    $("booksCount").textContent = books.length ? `${books.length} 本` : "";
    $("booksEmpty").hidden = books.length > 0;
    $("booksList").replaceChildren(...books.map((b) => {
      const card = el("button", "book-card");
      card.type = "button";
      card.dataset.theme = b.theme;
      const img = el("img"); img.src = b.cover; img.alt = "";
      const meta = el("span", "book-meta");
      meta.append(el("strong", null, b.book.title), el("small", null, `${b.book.date} · ${b.book.pages.length} 张`));
      card.append(img, meta);
      card.onclick = () => open(b.id);
      return card;
    }));
  }

  // ===== 新做好一本：存下来，打开它 =====
  async function add({ book, theme, captions, skills }) {
    const record = { id: `book-${Date.now()}`, at: Date.now(), book, theme, captions, skills, cover: await cover(book.pages[0]?.img) };
    await saveBook(record);
    books.unshift(record);
    render();
    open(record.id, { fresh: true });
    return record;
  }
  async function cover(src) {
    if (!src) return "";
    try { return toDataURL(toCanvas(await loadImage(src), 480), 0.8); } catch { return src; }
  }

  // ===== 一本的详情 =====
  function open(id, { fresh = false } = {}) {
    const b = books.find((x) => x.id === id);
    if (!b) return;
    opened = b;
    compose();
    showCaptions(b.captions || [], b.skills || []);
    $("booksHome").hidden = true;
    $("bookDetail").hidden = false;
    msg(fresh ? "已自动保存在「摄影集」里，随时回来看。" : "", fresh ? "good" : "");
    window.scrollTo({ top: 0 });
    if (!detailBack) detailBack = pushBack(closeDetail);
    if (fresh) { const card = $("albumResult"); card.classList.remove("swap"); void card.offsetWidth; card.classList.add("swap"); }
  }
  function closeDetail() {
    detailBack = 0; opened = null; html = "";
    $("bookDetail").hidden = true;
    $("booksHome").hidden = false;
    render();
  }
  $("bookBack").onclick = () => popBack(detailBack);
  const leave = () => { if (detailBack) popBack(detailBack); if (previewBack) popBack(previewBack); };

  // 按记下的风格排版。每次都换一个新的随机种子：同一种风格，配乐的调、和弦、旋律每次也不一样
  function compose() {
    const b = opened;
    html = buildAlbumHTML({ ...b.book, theme: b.theme, seed: Math.floor(Math.random() * 2 ** 31) }, petSource);
    const t = THEMES[b.theme];
    $("resTitle").textContent = b.book.title;
    $("resSub").textContent = `${b.book.subtitle ? b.book.subtitle + "  ·  " : ""}${b.book.date} · ${b.book.pages.length} 张 · ${(html.length / 1024 / 1024).toFixed(1)} MB`;
    $("resTheme").textContent = t ? `${t.name} · ${NAV_NAMES[t.nav]} · ${t.look} · 配乐：${t.music}` : "";
    $("albumResult").dataset.theme = b.theme;
  }
  $("resRestyle").onclick = () => {
    if (!opened) return;
    const ids = Object.keys(THEMES);                                   // 按顺序轮换，点几下就能把每种风格都看一遍
    opened.theme = ids[(ids.indexOf(opened.theme) + 1) % ids.length];
    saveBook(opened).catch(() => {});
    compose();
    const card = $("albumResult"); card.classList.remove("swap"); void card.offsetWidth; card.classList.add("swap");
    pet.hop(0.7);
    if (!$("viewer").hidden) $("viewerFrame").srcdoc = html;           // 正在预览就直接换
  };
  $("resRename").onclick = () => {
    if (!opened) return;
    const name = prompt("给这本摄影集起个名字", opened.book.title);
    if (name == null || !name.trim()) return;
    opened.book.title = name.trim().slice(0, 20);
    saveBook(opened).catch(() => {});
    compose();
  };
  $("resDelete").onclick = async () => {
    if (!opened || !confirm(`删除摄影集「${opened.book.title}」？删除后不能恢复（相册里的照片不受影响）。`)) return;
    const id = opened.id;
    await deleteBook(id).catch(() => {});
    books = books.filter((b) => b.id !== id);
    popBack(detailBack);
  };

  // 3 条配文：每条一键复制（正文 + 话题标签）
  function showCaptions(list, skills = []) {
    const box = $("resCaps");
    box.hidden = !list.length;
    box.replaceChildren(el("div", "kicker mono", "配文 · 点复制，贴到朋友圈或 Instagram"), ...list.map((c) => {
      const item = el("div", "cap-item");
      const copy = el("button", null, "复制");
      copy.type = "button";
      copy.onclick = async () => {
        const ok = await copyText(captionCopy(c));
        copy.textContent = ok ? "已复制" : "复制失败，请长按文字复制";
        if (ok) { pet.lookAt(copy, 900); pet.nod(); pet.cheer(900); }
        setTimeout(() => (copy.textContent = "复制"), 1600);
      };
      item.append(el("p", null, c.text), el("p", "tags", c.tags.join(" ")), copy);
      return item;
    }));
    placeSkillChip(box, skills, { flash: false });          // 📖 写配文用到的摄影技能
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const t = Object.assign(document.createElement("textarea"), { value: text });
    t.style.cssText = "position:fixed;opacity:0";
    document.body.append(t);
    t.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    t.remove();
    return ok;
  }

  // ===== 预览 / 分享 / 保存 =====
  $("resPreview").onclick = () => {
    if (!opened) return;
    $("viewerFrame").srcdoc = html;
    $("viewer").hidden = false;
    previewBack = pushBack(() => { previewBack = 0; $("viewer").hidden = true; $("viewerFrame").srcdoc = ""; });
    pet.hold("book"); pet.propFill(1);                          // 翻开书的样子，过一会儿放下
    setTimeout(() => pet.hold(null), 1600);
  };
  $("viewerClose").onclick = () => popBack(previewBack);

  $("resShare").onclick = async () => {
    if (!opened) return;
    if (!Capacitor.isNativePlatform()) return download();
    try {
      const { uri } = await Filesystem.writeFile({ path: fileNameOf(opened), data: html, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title: opened.book.title, text: `${opened.book.title} · 用浏览器打开`, files: [uri], dialogTitle: "分享摄影集" });
    } catch (e) {
      if (!/cancel/i.test(e.message || "")) msg("分享失败：" + e.message, "bad");
    }
  };
  $("resSave").onclick = async () => {
    if (!opened) return;
    if (!Capacitor.isNativePlatform()) return download();
    try {
      await Filesystem.writeFile({ path: fileNameOf(opened), data: html, directory: Directory.Documents, encoding: Encoding.UTF8 });
      msg(`已保存到手机的「文档 Documents」文件夹：${fileNameOf(opened)}`, "good");
    } catch (e) {
      msg("保存失败（" + e.message + "），可以用「分享」→「保存到文件」", "bad");
    }
  };
  function download() {                                      // 在电脑浏览器里调试时：直接下载
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = fileNameOf(opened);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return { add, render, leave, count: () => books.length };
}
