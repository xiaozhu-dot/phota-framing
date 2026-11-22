// 「用了哪个技能」的小标签：📖 人像姿势 · 动物。点它跳到设置里的那条技能；出现时宠物拿一下书
//   list = AI 实际用到的技能 [{ id, name }]（来自回答里的 _skills）；没用到就不显示
export function skillChip(list, { pet = window.pet, flash = true } = {}) {
  if (!list?.length) return null;
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "skill-chip";
  chip.textContent = "📖 " + list.map((s) => s.name).join(" · ");
  chip.setAttribute("aria-label", "用到的摄影技能：" + list.map((s) => s.name).join("、") + "，点一下查看");
  chip.onclick = (e) => {
    e.stopPropagation();
    dispatchEvent(new CustomEvent("phota-open-skill", { detail: { id: list[0].id } }));
  };
  if (flash && pet?.hold) {
    pet.hold("book");
    clearTimeout(skillChip.t);
    skillChip.t = setTimeout(() => pet.hold(null), 1600);
  }
  return chip;
}

// 放进一个固定的位置：先清掉旧的标签，再放新的（没有就只清掉）
export function placeSkillChip(host, list, opts) {
  host?.querySelectorAll(":scope > .skill-chip").forEach((c) => c.remove());
  const chip = skillChip(list, opts);
  if (chip && host) host.append(chip);
  return chip;
}
