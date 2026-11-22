// Summarize inference evidence and prepare a local, anonymous preference review.
// Neither automated checks nor this report claim real-world shooting outcomes.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const tag=process.argv[2]||'v10';
if(!/^[a-zA-Z0-9_-]+$/.test(tag))throw new Error('Invalid tag');
const root=new URL('./',import.meta.url),read=async name=>JSON.parse(await readFile(new URL(name,root),'utf8'));
const cases=await read('portrait-cases.json');
const candidate=await read(`results/portrait-${tag}-candidate-holdout.json`);
const baseline=await read('results/portrait-baseline-baseline-holdout.json');
const invalid=new Set(['osborne-window-a','osborne-window-b']);
const describe=rows=>({
  requests:rows.length,errors:rows.filter(r=>r.error).length,calls:rows.reduce((s,r)=>s+r.usage.length,0),
  explicitActor:rows.filter(r=>/^(摄影师|模特)[：:]/.test(r.final?.hint||'')).length,
  collageHandled:rows.filter(r=>invalid.has(r.case)&&r.final?.status==='need_view').length,
  collageTotal:rows.filter(r=>invalid.has(r.case)).length,
  usableSingle:rows.filter(r=>!invalid.has(r.case)&&(['adjust','ready'].includes(r.final?.status)||['left','right','raise','lower','closer','back','shoot'].includes(r.final?.move))).length,
  singleTotal:rows.filter(r=>!invalid.has(r.case)).length,
  alternateAdjustments:rows.filter(r=>r.intent==='alternate'&&!invalid.has(r.case)&&(r.final?.status==='adjust'||['left','right','raise','lower','closer','back'].includes(r.final?.move))).length,
  statuses:rows.reduce((s,r)=>{const k=r.error?'error':r.final?.status||r.final?.move||'unknown';s[k]=(s[k]||0)+1;return s;},{}),
  estimatedCny:rows.reduce((s,r)=>s+r.usage.reduce((n,u)=>n+(u.estimatedCny||0),0),0),
  medianSeconds:rows.map(r=>r.milliseconds/1000).sort((a,b)=>a-b)[Math.floor(rows.length/2)],
});
const summary={tag,evaluationStatus:tag==='v7'?'First grouped holdout run; visual audit found failures.':'Previously exposed holdout images: regression only, not an independent accuracy estimate.',candidate:describe(candidate),baseline:describe(baseline),
  limitations:['Protocol/coverage statistics are not photographic accuracy or aesthetic win rates.','No before/after real model shooting trial has been performed.','Human preference evaluation is pending.','Author/person grouped holdout is small and contains professional finished photographs, not a population sample.'],
  promptHashes:[...new Set(candidate.map(r=>r.promptHash))],implementationHashes:[...new Set(candidate.map(r=>r.implementationHash))]};
await writeFile(new URL(`results/portrait-${tag}-summary.json`,root),JSON.stringify(summary,null,2));
const chosen=candidate.filter(r=>!invalid.has(r.case)&&r.intent==='alternate').slice(0,8);
for(const r of candidate.filter(r=>!invalid.has(r.case)&&r.intent==='first')){if(chosen.length>=10)break;chosen.push(r);}
const pairs=[],key=[];
for(const r of chosen){
  const old=baseline.find(b=>b.case===r.case&&b.intent===r.intent);if(!old||r.error||old.error)continue;
  const c=cases.find(c=>c.id===r.case),candidateFirst=createHash('sha256').update(c.id+r.intent+tag).digest()[0]%2===0;
  const view=row=>({plan:row.final?.plan?.title||row.raw?.subject||'',why:row.final?.plan?.why||row.raw?.why||'',hint:row.final?.hint||row.error||'没有可执行建议'});
  const a=candidateFirst?r:old,b=candidateFirst?old:r;
  pairs.push({id:pairs.length+1,case:c.id,intent:r.intent,image:'../'+c.file,source:c.source,A:view(a),B:view(b)});
  key.push({id:pairs.length,case:c.id,intent:r.intent,A:candidateFirst?'candidate':'baseline',B:candidateFirst?'baseline':'candidate'});
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cards=pairs.map(p=>`<section><h2>第 ${p.id} 组 · ${p.intent==='alternate'?'这一张已拍好，想换一个拍法':'第一次请伙伴指导'}</h2><a href="${escape(p.source)}" target="_blank" rel="noreferrer">查看摄影师原帖</a><img src="${escape(p.image)}" alt="第${p.id}组现场参考"><div class="pair">${['A','B'].map(k=>`<article><b>方案 ${k}</b><h3>${escape(p[k].plan)}</h3><p>${escape(p[k].why)}</p><strong>${escape(p[k].hint)}</strong></article>`).join('')}</div><label>你更愿意照做哪组？<select data-pair="${p.id}"><option value="">请选择</option><option>A</option><option>B</option><option>都可以</option><option>都不合适</option></select></label><textarea data-note="${p.id}" placeholder="可选：哪里看错了，或哪组更有新意？"></textarea></section>`).join('');
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>出片指导 · 10 组盲选</title><style>body{max-width:980px;margin:24px auto;padding:0 16px;background:#f6f2e9;color:#25221c;font:16px/1.6 system-ui}section{margin:30px 0;padding:20px;background:white;border-radius:18px}h1{font-size:28px}h2{font-size:20px}h3{font-size:17px}img{display:block;width:100%;max-height:540px;object-fit:contain;margin:18px 0;background:#edeae4}.pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}article{border:1px solid #ddd6ca;border-radius:12px;padding:14px}select,textarea,button{font:inherit;padding:10px;border-radius:8px;border:1px solid #b8ac97}select{margin-left:12px}textarea{box-sizing:border-box;width:100%;margin-top:12px;min-height:72px}button{background:#dc593c;color:white;cursor:pointer}footer{position:sticky;bottom:0;padding:12px;background:#f6f2e9}small{color:#6c6253}@media(max-width:600px){.pair{grid-template-columns:1fr}section{padding:12px}select{display:block;margin:8px 0}}</style><h1>出片指导 · 10 组盲选</h1><p><strong>此页为专业作品示范组，仅用于识图与换拍法回归，不作为新手指导改善的验收。新手原片请打开 <a href="portrait-novice-review.html">新的现场指导比较</a>。</strong></p><p>看同一张参考图，比较两组真实输出。选择你更愿意在现场照做的一组，尤其留意人物角度、姿势、环境配合和可执行性。先不显示版本身份。</p><p><small>这些是公开摄影案例及其裁切参考，不是执行建议后的效果图。照片归原作者；原图只在本地研究目录。你的选择只保存在本机，可以导出，不会自动上传。</small></p>${cards}<footer><button id="export">导出我的选择</button> <span id="progress"></span></footer><script>const key='portrait-blind-${tag}';let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch{};function update(){document.querySelectorAll('[data-pair]').forEach(e=>{saved[e.dataset.pair]={choice:e.value,note:document.querySelector('[data-note="'+e.dataset.pair+'"]').value}});localStorage.setItem(key,JSON.stringify(saved));document.getElementById('progress').textContent=Object.values(saved).filter(v=>v.choice).length+' / ${pairs.length} 已选'}document.querySelectorAll('[data-pair]').forEach(e=>{e.value=saved[e.dataset.pair]?.choice||'';e.onchange=update});document.querySelectorAll('[data-note]').forEach(e=>{e.value=saved[e.dataset.note]?.note||'';e.oninput=update});document.getElementById('export').onclick=()=>{update();const u=URL.createObjectURL(new Blob([JSON.stringify({review:'${tag}',answers:saved},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='portrait-my-choices.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};update();</script></html>`;
await writeFile(new URL('results/portrait-blind-review.html',root),html);
await writeFile(new URL('results/portrait-blind-key.json',root),JSON.stringify(key,null,2));
console.log(JSON.stringify({...summary,blindPairs:pairs.length}));
