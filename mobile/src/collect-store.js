// 收集版的"底稿"：每个出片回合一条记录，存在 App 自己的数据库（IndexedDB）里
//   和摄影集分开放（数据库名不同），正式版不会碰到
const DB = "phota-collect", STORE = "rounds", PROFILE = "phota-collect-profile";

let dbp = null;
function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
async function run(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const loadRounds = () => run("readonly", (s) => s.getAll()).then((list) => list.sort((a, b) => a.startedAt - b.startedAt));
export const saveRound = (round) => run("readwrite", (s) => s.put(round));
export const clearRounds = () => run("readwrite", (s) => s.clear());

// 标注人：昵称 + 随机编号，第一次打开时填
export function loadProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE)) || null; } catch { return null; }
}
export function saveProfile(nickname) {
  const id = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const profile = { nickname, id, consentAt: Date.now() };
  localStorage.setItem(PROFILE, JSON.stringify(profile));
  return profile;
}
// 设置 → 个人资料里改了昵称：标注人的昵称跟着改（编号不变）
export function renameProfile(nickname) {
  const p = loadProfile();
  if (!p || !nickname) return p;
  const next = { ...p, nickname };
  localStorage.setItem(PROFILE, JSON.stringify(next));
  return next;
}
