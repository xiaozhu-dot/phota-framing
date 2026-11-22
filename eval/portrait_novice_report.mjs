// First-look novice cases, kept separate from professional demonstrations.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),tag=process.argv[2]||'v11';
if(!/^[a-z0-9_-]+$/i.test(tag))throw Error('Invalid tag');
const read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const cases=await read('portrait-novice-cases.json');
const candidate=(await Promise.all(['dev','holdout'].map(s=>read(`results/portrait-novice-${tag}-candidate-${s}.json`)))).flat();
const baseline=(await Promise.all(['dev','holdout'].map(s=>read(`results/portrait-novice-baseline-intent-baseline-${s}.json`)))).flat();
const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mapping=[],cards=[];
const view=r=>({title:r.final?.plan?.title||r.raw?.subject||'',why:r.final?.plan?.why||r.raw?.why||'',hint:r.final?.hint||r.error||'未返回建议'});
// Later confirmation authors must not become missing pairs in the historical
// five-author review. Its cohort is the union of the selected run records.
const reviewCases=cases.filter(c=>candidate.some(r=>r.case===c.id)||baseline.some(r=>r.case===c.id));
for(const [i,c] of reviewCases.entries()){
 const n=candidate.find(r=>r.case===c.id&&r.intent==='first'),b=baseline.find(r=>r.case===c.id&&r.intent==='first');
 if(!n||!b||n.error||b.error)throw Error('Missing successful paired output: '+c.id);
 const flip=createHash('sha256').update(tag+c.id).digest()[0]%2;
 const pair=flip?[view(n),view(b)]:[view(b),view(n)];
 mapping.push({id:i+1,case:c.id,A:flip?'candidate':'baseline',B:flip?'baseline':'candidate'});
 cards.push(`<section><h2>第 ${i+1} 组</h2><p>作者拍摄意图：${esc(c.userIntent)}</p><a href="${esc(c.source)}" target="_blank" rel="noreferrer">新手公开原帖</a><img src="../${esc(c.file)}" alt="第${i+1}组原片"><div class="pair">${pair.map((p,j)=>`<article><b>建议 ${j?'B':'A'}</b><h3>${esc(p.title)}</h3><p>${esc(p.why)}</p><strong>${esc(p.hint)}</strong></article>`).join('')}</div><label>若回到拍摄现场，哪个选择更有帮助？<select data-id="${i+1}"><option value="">请选择</option><option>A 更能改善</option><option>B 更能改善</option><option>两组都有效</option><option>原片保留更好</option><option>都没解决问题</option></select></label><textarea data-note="${i+1}" placeholder="可选：你认为最先该改的具体问题，或建议哪里看错了？"></textarea></section>`);
}
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>新手原片 · 现场指导比较</title><style>body{max-width:1000px;margin:24px auto;padding:0 16px;background:#f6f2e9;color:#29251e;font:16px/1.65 system-ui}h1{font-size:28px}h2{font-size:21px}h3{font-size:17px}section{margin:26px 0;padding:20px;background:white;border-radius:16px}img{display:block;width:100%;height:auto;max-height:600px;object-fit:contain;background:#ede9e1;margin:18px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}article{border:1px solid #d4cbbb;border-radius:10px;padding:14px}select,textarea,button{font:inherit;border:1px solid #b7ac98;border-radius:8px;padding:10px}select{display:block;margin-top:10px}textarea{box-sizing:border-box;width:100%;min-height:72px;margin-top:12px}footer{position:sticky;bottom:0;background:#f6f2e9;padding:12px}button{background:#d95435;color:white;cursor:pointer}.note{color:#6d6254}@media(max-width:600px){.pair{grid-template-columns:1fr}section{padding:12px}}</style><h1>新手原片 · 现场指导比较</h1><p>这批来自作者明确自述的新手或首次人像拍摄原帖。比较的是：回到现场后，哪条指导更能解决原片的问题。不是选原片漂亮不漂亮。</p><p class="note">一共 ${cards.length} 位作者、${cards.length} 张原片，不拿同一张图的多次请求凑数量。新手也可能已经拍得很好，可以选「原片保留更好」。原片不是执行建议后的效果图；没有生成、修图或模拟改善后的照片。两组均为同图、同意图的真实模型输出。</p><p class="note">原图只在本地研究目录，版权归原作者。选择只在本机保存，不会自动发送；页面暂不显示版本身份。旧的专业作品盲选不计入新手改善能力。</p>${cards.join('')}<footer><button id="export">导出我的选择</button> <span id="progress"></span></footer><script>const key='portrait-novice-blind-${tag}';let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch{};const selects=[...document.querySelectorAll('[data-id]')];for(const e of selects){e.value=saved[e.dataset.id]?.choice||'';document.querySelector('[data-note="'+e.dataset.id+'"]').value=saved[e.dataset.id]?.note||''}function update(){for(const e of selects)saved[e.dataset.id]={choice:e.value,note:document.querySelector('[data-note="'+e.dataset.id+'"]').value};localStorage.setItem(key,JSON.stringify(saved));document.getElementById('progress').textContent=selects.filter(e=>e.value).length+' / ${cards.length} 已选'}document.querySelectorAll('select,textarea').forEach(e=>e.addEventListener('input',update));document.getElementById('export').onclick=()=>{update();const u=URL.createObjectURL(new Blob([JSON.stringify({review:'novice-${tag}',answers:saved},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='portrait-novice-choices.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};update()</script></html>`;
await writeFile(new URL('results/portrait-novice-review.html',root),html);
await writeFile(new URL('results/portrait-novice-blind-key.json',root),JSON.stringify(mapping,null,2));
const stats=rs=>({requests:rs.length,ready:rs.filter(r=>r.final?.status==='ready'||r.final?.move==='shoot').length,adjust:rs.filter(r=>r.final?.status==='adjust'||['left','right','raise','lower','closer','back'].includes(r.final?.move)).length,calls:rs.flatMap(r=>r.usage).length,estimatedCny:rs.flatMap(r=>r.usage).reduce((s,u)=>s+u.estimatedCny,0)});
console.log(JSON.stringify({pairs:cards.length,candidate:stats(candidate),baseline:stats(baseline),humanReview:'pending'}));
