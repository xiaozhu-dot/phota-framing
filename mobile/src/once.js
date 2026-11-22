// 同一个玩笑每天最多一次：onceToday("jealous") 今天第一次调用返回 true，之后返回 false
export function onceToday(key) {
  const today = new Date().toDateString(), k = "phota-once-" + key;
  try {
    if (localStorage.getItem(k) === today) return false;
    localStorage.setItem(k, today);
  } catch {}
  return true;
}
