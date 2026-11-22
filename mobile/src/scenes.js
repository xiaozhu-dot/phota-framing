// 场景：App 按画面自动判断的拍摄类型（说法见 CONTEXT.md）
//   人像 = 能指挥的人；人文街拍 = 有人但不能指挥；动物 = 猫狗鸟等；风景 / 其他 = 没有人和动物
export const SCENES = [
  { id: "portrait", label: "人像" },
  { id: "street", label: "人文街拍" },
  { id: "animal", label: "动物" },
  { id: "landscape", label: "风景 / 其他" },
];
export const sceneLabel = (id) => SCENES.find((s) => s.id === id)?.label ?? "风景 / 其他";
export const sceneId = (label) => SCENES.find((s) => s.label === label)?.id ?? "landscape";
