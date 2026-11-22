// 角色和声音绑定，界面不再维护一份独立的性别设置。
export const COMPANIONS = [
  { id: 'crab', name: 'Crabo', gender: 'female', voiceLabel: '年轻女声', description: '戴着蝴蝶结，陪你留住好看的光' },
  { id: 'pig', name: 'Piggo', gender: 'male', voiceLabel: '年轻男声', description: '扶一扶眼镜，一起发现好构图' },
];
export const companionFor = id => COMPANIONS.find(p => p.id === id) || COMPANIONS[0];
