// 存进手机相册：放在相册里一个叫"Phota"的相簿（不需要额外的存储权限）
import { Capacitor } from "@capacitor/core";
import { Media } from "@capacitor-community/media";

const ALBUM = "Phota";
let albumPath = null;

async function ensureAlbum() {
  if (albumPath) return albumPath;
  const { path } = await Media.getAlbumsPath();
  try {
    await Media.createAlbum({ name: ALBUM });
  } catch (e) {
    if (!/exists/i.test(e.message || "")) throw e;         // 已经建过了，没关系
  }
  albumPath = `${path}/${ALBUM}`;
  return albumPath;
}

const blobToDataURL = (blob) =>
  new Promise((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => bad(r.error);
    r.readAsDataURL(blob);
  });

// 返回 true 表示已保存；在电脑浏览器里调试时没有相册，直接跳过
export async function saveToGallery(blob, name) {
  if (!Capacitor.isNativePlatform()) return false;
  const albumIdentifier = await ensureAlbum();
  await Media.savePhoto({ path: await blobToDataURL(blob), albumIdentifier, fileName: name.replace(/\.jpe?g$/i, "") });
  return true;
}
