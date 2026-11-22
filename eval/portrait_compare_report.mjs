// Anonymous, versioned comparison of real inference outputs. Does not replace
// the user's earlier review page or transmit choices anywhere.
import {readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const option=(key,fallback)=>{const i=process.argv.indexOf('--'+key);return i<0?fallback:process.argv[i+1];};
const left=option('left','v16-fresh'),right=option('right','v17-fresh'),tag=option('tag','v17-fresh');
if(![left,right,tag].every(s=>/^[a-z0-9_-]+$/i.test(s)))throw Error('Invalid comparison tag');
const root=new URL('./',import.meta.url);
const read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const cases=await read('portrait-novice-cases.json');
const selected=option('cases','novice-duality,novice-blossom,novice-lighthouse').split(',');
if(new Set(selected).size!==selected.length || selected.some(id=>!cases.some(c=>c.id===id)))throw Error('Invalid case selection');
const intents=option('intents','first,alternate').split(',');
if(new Set(intents).size!==intents.length || intents.some(i=>!['first','alternate'].includes(i)))throw Error('Invalid intents');
const a=await read(`results/portrait-novice-${left}-candidate-confirmation.json`);
const b=await read(`results/portrait-novice-${right}-candidate-confirmation.json`);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mapping=[],cards=[];
for(const id of selected){
  const c=cases.find(c=>c.id===id);
  await access(new URL(c.file,root));
  for(const intent of intents){
    const x=a.find(r=>r.case===id&&r.intent===intent),y=b.find(r=>r.case===id&&r.intent===intent);
    if(!x||!y||x.error||y.error||!x.final||!y.final)throw Error('Missing real paired output: '+id+'/'+intent);
    const flip=createHash('sha256').update(tag+'/'+id+'/'+intent).digest()[0]%2;
    const pair=flip?[y,x]:[x,y],index=mapping.length+1;
    mapping.push({id:index,case:id,intent,A:flip?right:left,B:flip?left:right,
      promptHashes:pair.map(r=>r.promptHash),implementationHashes:pair.map(r=>r.implementationHash),
      outputHashes:pair.map(r=>createHash('sha256').update(JSON.stringify(r.final)).digest('hex'))});
    const previous=intent==='alternate'?`<details><summary>两组各自上一拍法（用于核对变化是否实质）</summary>${pair.map((r,j)=>{
      const first=(r===x?a:b).find(p=>p.case===id&&p.intent==='first');
      return `<p><b>${j?'B':'A'} 上一拍法：</b>${esc(first.final.plan?.title)}；${esc(first.final.hint)}</p>`;
    }).join('')}</details>`:'';
    cards.push(`<section><h2>第 ${index} 组 · ${intent==='first'?'首次指导':'主动要求另一拍法'}</h2><p>${esc(c.userIntent)}</p><a href="${esc(c.source)}" target="_blank" rel="noreferrer">作者公开原帖</a><img src="../${esc(c.file)}" alt="第${index}组原片">${previous}<div class="pair">${pair.map((r,j)=>`<article><b>建议 ${j?'B':'A'}</b><h3>${esc(r.final.plan?.title)}</h3><p>${esc(r.final.plan?.why)}</p><strong>${esc(r.final.hint)}</strong>${r.final.action?`<p class="small">依据：${esc(r.final.action.evidence)}<br>照做后检查：${esc(r.final.action.check)}</p>`:''}</article>`).join('')}</div><label>哪条在现场更值得做？<select data-id="${index}"><option value="">请选择</option><option>A 更有帮助</option><option>B 更有帮助</option><option>两组都有效</option><option>保留原片更好</option><option>都没解决问题</option></select></label><textarea data-note="${index}" placeholder="可选：先该改什么？是否看错、难执行，或只是换了说法？"></textarea></section>`);
  }
}
const review='novice-'+tag+'-compare';
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>现场指导 · 新一轮比较</title><style>body{max-width:1000px;margin:24px auto;padding:0 16px;background:#f6f2e9;color:#29251e;font:16px/1.65 system-ui}h1{font-size:27px}h2{font-size:21px}h3{font-size:18px}section{background:white;border-radius:16px;padding:20px;margin:24px 0}img{display:block;max-height:580px;width:100%;object-fit:contain;margin:18px 0;background:#eee9e0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}article{border:1px solid #d4cbbb;border-radius:10px;padding:14px}.small,details{font-size:14px;color:#625a4b}select,textarea,button{font:inherit;border:1px solid #b7ac98;border-radius:8px;padding:10px}select{display:block;margin-top:10px}textarea{box-sizing:border-box;width:100%;min-height:72px;margin-top:12px}footer{position:sticky;bottom:0;background:#f6f2e9;padding:12px}button{background:#d95435;color:white;cursor:pointer}@media(max-width:600px){.pair{grid-template-columns:1fr}section{padding:12px}}</style><h1>现场指导 · 新一轮比较</h1><p>${selected.length} 位新手作者，${intents.length===2?'每张比较“首次指导”和“主动要求另一拍法”':intents[0]==='first'?'本页仅比较首次指导':'本页仅比较另一拍法'}，共 ${cards.length} 组。判断的是指导是否有帮助，不是原片美不美。</p><p class="small">两种版本使用同一原片与相同作者意图。另一拍法是假设用户主动请求变化的推理测试，没有执行后的照片，不能证明指导已奏效。新手也可能已经拍得很好，可以选择保留原片。</p><p class="small">A/B 随每组变化，暂不展示版本。照片仅作本地研究，版权归作者。反馈只存本机，需你主动导出，不会自动上传。本页与上一轮反馈分开保存。</p>${cards.join('')}<footer><button id="export">导出这轮选择</button> <span id="progress"></span></footer><script>const review=${JSON.stringify(review)},key='portrait-review-'+review;let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch{}const inputs=[...document.querySelectorAll('[data-id]')];for(const e of inputs){e.value=saved[e.dataset.id]?.choice||'';document.querySelector('[data-note="'+e.dataset.id+'"]').value=saved[e.dataset.id]?.note||''}function update(){for(const e of inputs)saved[e.dataset.id]={choice:e.value,note:document.querySelector('[data-note="'+e.dataset.id+'"]').value};localStorage.setItem(key,JSON.stringify(saved));document.getElementById('progress').textContent=inputs.filter(e=>e.value).length+' / '+inputs.length+' 已选'}document.querySelectorAll('select,textarea').forEach(e=>e.addEventListener('input',update));document.getElementById('export').onclick=()=>{update();const u=URL.createObjectURL(new Blob([JSON.stringify({review,answers:saved},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=review+'-choices.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};update()</script></html>`;
const out=new URL(`results/portrait-${tag}-review.html`,root);
const keyFile=new URL(`results/portrait-${tag}-blind-key.json`,root);
const keyData={review,left,right,pairs:mapping};
let existing;
try{existing=JSON.parse(await readFile(keyFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(existing && JSON.stringify(existing)!==JSON.stringify(keyData))
  throw Error('Comparison tag already belongs to different outputs or pairings; choose a new --tag to preserve existing feedback.');
if(!existing){
  let pageExists=false;try{await access(out);pageExists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(pageExists)throw Error('Existing review page has no mapping; choose a new --tag.');
}
// Bind a new tag once, including concurrent generators. Existing mappings are
// never rewritten; identical regeneration may only refresh the same page.
if(!existing)await writeFile(keyFile,JSON.stringify(keyData,null,2)+'\n',{flag:'wx'});
await writeFile(out,html);
console.log(JSON.stringify({page:out.pathname,pairs:cards.length,humanReview:'pending'}));
