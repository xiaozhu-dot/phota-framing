// 返回键：大图、多选这些「一层」打开时记一笔浏览器历史，按手机返回键（或页面上的关闭）就退一层
//   设置页有自己的一套（历史记录里带 setId），这里不管它们
let seq = 0;
const stack = [];                      // [{ id, close }]，最上面的是最后打开的

export function pushBack(close) {
  const id = ++seq;
  stack.push({ id, close });
  history.pushState({ bs: id }, "");
  return id;
}
// 用页面上的按钮关掉：是最上面那层就走一次「返回」（关的动作在下面统一做），不是就直接关
export function popBack(id) {
  const i = stack.findIndex((x) => x.id === id);
  if (i < 0) return;
  if (i === stack.length - 1) history.back();
  else stack.splice(i, 1)[0].close();
}
export const isOpen = (id) => stack.some((x) => x.id === id);

addEventListener("popstate", (e) => {
  if (e.state?.setId) return;          // 设置页内部的前进后退
  const cur = e.state?.bs || 0;
  while (stack.length && stack.at(-1).id > cur) stack.pop().close();
});
