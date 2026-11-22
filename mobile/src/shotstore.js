// 照片和摄影集的仓库：存在 App 自己的数据库（IndexedDB）里，关掉 App 再打开还在
//   IndexedDB 是浏览器自带的小数据库，能直接存图片（Blob），手机 App（WebView）和电脑浏览器都能用
//   shots：每张照片一条 { id, blob, name, sensor, at, source, scene, quality, analysis }
//   books：每本摄影集一条 { id, at, book（文字 + 照片副本）, theme, captions, skills, cover }
//          照片存的是副本：相册里删了原图，做好的摄影集不受影响；换风格也不用再问 AI
const DB = "qujing", SHOTS = "shots", BOOKS = "books";

let dbp = null;
function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);                       // 第 2 版：加了摄影集
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(SHOTS)) d.createObjectStore(SHOTS, { keyPath: "id" });
      if (!d.objectStoreNames.contains(BOOKS)) d.createObjectStore(BOOKS, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

// 把一次数据库操作包成 Promise
async function run(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const loadShots = () => run(SHOTS, "readonly", (s) => s.getAll()).then((list) => list.sort((a, b) => a.at - b.at));
export const saveShot = (shot) => run(SHOTS, "readwrite", (s) => s.put(shot));
export const deleteShot = (id) => run(SHOTS, "readwrite", (s) => s.delete(id));

export const loadBooks = () => run(BOOKS, "readonly", (s) => s.getAll()).then((list) => list.sort((a, b) => b.at - a.at));
export const saveBook = (book) => run(BOOKS, "readwrite", (s) => s.put(book));
export const deleteBook = (id) => run(BOOKS, "readwrite", (s) => s.delete(id));

// 请浏览器不要在空间紧张时自动清掉这些数据（支持就生效，不支持也没关系）
navigator.storage?.persist?.().catch(() => {});
