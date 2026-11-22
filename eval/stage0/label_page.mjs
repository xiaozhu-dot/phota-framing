// 本地标注：先逐个实际输入标图，再看同图建议。无接口调用。
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {checkRecord} from './consistency.mjs';
import {inputIdentity,imageMime,researchPhotoPath} from '../portrait_eval_identity.mjs';
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const scriptJSON=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const ratioOf=r=>r.inputRatio??r.inputProfile?.ratio??(typeof r.inputProfile==='string'?r.inputProfile:r.inputProfile?.kind==='original'?'original':'unknown');
export function researchImagePath(path){
 if(typeof path!=='string'||! /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:jpg|jpeg|png|webp)$/i.test(path)||path.split('/').some(p=>p==='.'||p==='..')) throw Error('Unsafe research image path');
 return '../'+path;
}
export async function validateImageEvidence(records,cases,{readBytes=file=>readFile(researchPhotoPath(file))}={}){
 const checked=[];
 for(const r of records){
  const c=cases.find(c=>c.id===r.case);if(!c)throw Error('Unknown image case');
  researchImagePath(r.inputFile);
  const bytes=await readBytes(r.inputFile),mime=imageMime(bytes);
  const digest=createHash('sha256').update(bytes).digest('hex');
  const identity=inputIdentity(bytes,r.context??{},r.inputProfile);
  if(identity.inputHash!==r.inputHash)throw Error('Image input hash changed');
  if(r.context&&r.contextHash!==identity.contextHash)throw Error('Image context hash changed');
  if(r.inputProfile?.frameHash&&r.inputProfile.frameHash!==digest)throw Error('Frame hash changed');
  const source=await readBytes(c.file);
  if(r.inputProfile?.sourceHash&&r.inputProfile.sourceHash!==createHash('sha256').update(source).digest('hex'))throw Error('Source hash changed');
  checked.push({recordId:r.recordId,mime,byteHash:digest});
 }
 return checked;
}
export function makeExport(identity,fields,saved,exportedAt,originalLocks={}){
 const labels={},missing=[];
 const locks={};
 for(const input of identity.inputs){
  const key=input.key,lock=originalLocks[key],field=fields.find(f=>f.key===key+'|orig');
  if(lock?.stage==='before_suggestions'&&lock.frozenAt&&field?.options.includes(lock.label))locks[key]={label:lock.label,evidence:typeof lock.evidence==='string'?lock.evidence:'',frozenAt:lock.frozenAt,stage:'before_suggestions'};
 }
 for(const field of fields){
  const inputKey=field.key.replace(/\|orig(?:-evidence)?$/,'');
  const lock=locks[inputKey];const value=lock?(field.key.endsWith('|orig')?lock.label:lock.evidence):saved?.[field.key];
  if(typeof value==='string'&&value.trim()&&(field.type==='text'||field.options.includes(value)))labels[field.key]=value;else missing.push(field.key);
 }
 return {schema:'phota-stage0-labels-v1',identity,exportedAt,labels,missing,originalLocks:locks};
}
export function freezeOriginal(identity,fields,saved,originalLocks,key,frozenAt){
 const state=makeExport(identity,fields,saved,'',originalLocks);
 if(!identity.inputs.some(i=>i.key===key)||!state.labels[key+'|orig'])throw Error('Choose original judgment before confirmation');
 if(!state.originalLocks[key])state.originalLocks[key]={label:state.labels[key+'|orig'],evidence:state.labels[key+'|orig-evidence']??'',frozenAt,stage:'before_suggestions'};
 return makeExport(identity,fields,state.labels,'',state.originalLocks);
}
export function buildLabelPage({name,records,cases,rulesSha256,imageEvidence=[]}){
 if(!rulesSha256)throw Error('Missing frozen rules hash');
 const titleMatch=name.match(/-(4x3|16x9|original)-batch(\d+)$/);
 const title=titleMatch?`看图评分 · 第${titleMatch[2]}组（${({ '4x3':'4:3','16x9':'16:9',original:'原图' })[titleMatch[1]]}）`:'Phota 看图评分';
 const groups=new Map(),ids=new Set(),fields=[];
 for(const r of records){
  for(const key of ['recordId','inputHash','contextHash','promptHash','implementationHash'])if(!r[key])throw Error(`Missing evidence identity: ${key}`);
  if(ids.has(r.recordId))throw Error('Duplicate recordId');ids.add(r.recordId);
  const c=cases.find(c=>c.id===r.case);if(!c)throw Error('Unknown case');
  const image=researchImagePath(r.inputFile),ratio=ratioOf(r);
  const key=sha([r.case,r.inputHash,ratio]);
  if(!groups.has(key))groups.set(key,{key,case:r.case,inputHash:r.inputHash,ratio,image,caseInfo:c,records:[]});
  if(groups.get(key).image!==image)throw Error('Same input identity has different image paths');
  groups.get(key).records.push(r);
 }
 const identity={name,rulesSha256,contentDigest:sha({records,cases:cases.filter(c=>records.some(r=>r.case===c.id))}),inputs:[...groups.values()].map(({key,case:caseId,inputHash,ratio,image})=>({key,case:caseId,inputHash,ratio,image})),records:records.map(r=>({recordId:r.recordId,case:r.case,inputHash:r.inputHash,inputRatio:ratioOf(r),contextHash:r.contextHash,promptHash:r.promptHash,implementationHash:r.implementationHash,contentDigest:sha(r)}))};
 identity.imageEvidence=imageEvidence;
 identity.pageHash=sha(identity);
 const radios=(key,title,options)=>{fields.push({key,type:'choice',options});return `<fieldset><legend>${esc(title)}</legend>${options.map(v=>`<label><input type="radio" name="${esc(key)}" value="${esc(v)}">${esc(v)}</label>`).join('')}</fieldset>`;};
 const text=(key,title)=>{fields.push({key,type:'text'});return `<label class="text">${esc(title)}<textarea data-key="${esc(key)}"></textarea></label>`;};
 const hard=[['H1','事实'],['H2','空间'],['H3','方向／动作'],['H4','前提／执行'],['H5','虚假完成'],['H6','指令矛盾']];
 const sections=[...groups.values()].map((g,i)=>{
  const original=radios(g.key+'|orig','先看当前输入：原片判断',['保留即可','有值得解决的问题','无法判断'])+text(g.key+'|orig-evidence','主要问题与图上证据；明确意图和推测分开写');
  const cards=g.records.map(r=>{
   const k='record:'+r.recordId,f=r.final,valid=r.submitted!==false&&!r.error&&['ready','adjust'].includes(f?.status);
   let body=`<p>没有可评的完整输出：${esc(r.error??f?.status??'空响应')}</p>`;
   if(valid){
    body=`<p class="hint">${esc(f.hint)}</p><p><b>${esc(f.plan?.title)}</b></p><p>${esc(f.plan?.why)}</p>
      ${f.action?.evidence?`<p>动作依据：${esc(f.action.evidence)}</p>`:''}${f.action?.check?`<p>调整后复看：${esc(f.action.check)}</p>`:''}
      <details><summary>查看画面观察（核对时可展开）</summary><p>脸中心：${esc(JSON.stringify(f.observation?.faceCenter??'未提供'))}；头顶留空：${esc(f.observation?.headTop??'未提供')}</p><ul>${(f.observation?.scene??[]).map(s=>`<li>${esc(s.detail)}</li>`).join('')}</ul></details>`;
    body+=checkRecord(r).final.map(a=>`<p class="alarm">自动疑点（须对图确认）：${esc(a.code)} ${esc(a.phrase)} ${esc(a.why)}</p>`).join('');
    body+=hard.map(([h,t])=>radios(k+'|'+h,h+' '+t,['未发现','可疑待核验','确认','无法判断'])).join('');
    body+=radios(k+'|need','需求判断',['必要修正','可选探索','多余或有害','保持原片','无法判断']);
    body+=radios(k+'|missedIssue','是否遗漏主要问题',['遗漏且未合理说明','已处理或说明合理顺序','原片无主要问题','无法判断']);
    body+=radios(k+'|unsuitable','建议是否不适用',['不适用','适用','无法判断']);
    body+=radios(k+'|grounded','现场关联',['真实依据已确认且用于拍法','有引用但无法核验','未建立现场关联','保持原片（单列）','无法判断']);
    body+=['光线','姿态神态','构图','环境利用'].map(d=>radios(k+'|fit-'+d,'建议适配·'+d,['1','2','3','4','5','N/A','无法判断'])).join('');
    if(r.intent==='alternate')body+=radios(k+'|creative','创意（实质新拍法）',['1','2','3','4','5','无实质新拍法','无法判断']);
    body+=text(k+'|evidence','判定证据：指令原话、图上位置、主要问题、未知原因；硬错确认须留证据');
   }
   return `<article data-record-id="${esc(r.recordId)}"><h3>${r.intent==='first'?'首次指导':'换个拍法'}</h3>${body}</article>`;
  }).join('');
  return `<section data-input-key="${g.key}"><h2>第 ${i+1} 张 · ${esc(g.ratio==='original'?'原图':g.ratio)}</h2><p>拍摄者的意图：${esc(g.caseInfo.userIntent??'未知')}</p><img src="${esc(g.image)}" alt="当前实际输入"><div class="before">${original}</div><button class="confirm" disabled>确认原片判断并看建议</button><p class="locked">确认后原片判断和证据将锁定，再显示建议。</p><div class="reveal" hidden>${cards}</div></section>`;
 }).join('');
 const bundle={identity,fields};
 const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
body{max-width:920px;margin:auto;padding:20px;font:16px/1.6 system-ui;background:#151412;color:#eee7dc}section{border:1px solid #595047;padding:18px;margin:20px 0}article{border-top:1px solid #595047;margin-top:20px;padding-top:12px}img{max-width:100%;max-height:560px}fieldset{border:0;padding:6px 0}legend{font-weight:600}label{display:inline-block;margin-right:14px}textarea{display:block;width:100%;min-height:65px;box-sizing:border-box}.text{display:block;margin-top:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}.hint{color:#efb95c}.alarm{color:#f4a391}footer{position:sticky;bottom:0;background:#151412;padding:12px}button{padding:10px 18px} [hidden]{display:none!important}</style>
<h1>${esc(title)}</h1><p>先看照片，确认原片判断后再看建议。拿不准就选“无法判断”，不用勉强打分。你评的是建议是否合理，还不是照做后的成片效果。选择只保存在本机，可以随时导出。</p><details><summary>评分与更正说明</summary><p>自动疑点只是提醒，不等于确认错误。这里只标最终用户可见输出，内部原始草稿的人工硬错标注仍待完成。原片判断确认后不能在本页改写，误选请在建议的备注里说明，保留首次判断以便核验。专业适配分：1分明显不合适，2分问题较多，3分成立可用，4分有明确帮助，5分与现场和意图高度一致。未填写项保留缺失。</p></details>
${sections}<footer><button id="export">导出本页标注</button> <span id="progress"></span></footer><script>
const BUNDLE=${scriptJSON(bundle)};
const KEY='phota-labels-${identity.pageHash}';
const makeExport=${makeExport.toString()};
const freezeOriginal=${freezeOriginal.toString()};
let saved={},originalLocks={};try{const stored=JSON.parse(localStorage.getItem(KEY)||'{}');const restored=makeExport(BUNDLE.identity,BUNDLE.fields,stored.labels||{},'',stored.originalLocks||{});saved=restored.labels;originalLocks=restored.originalLocks}catch{}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({labels:saved,originalLocks}))}catch{}};
function sync(){let done=0;const all=document.querySelectorAll('section[data-input-key]');all.forEach(s=>{const key=s.dataset.inputKey,ok=!!originalLocks[key];s.querySelector('.reveal').hidden=!ok;s.querySelector('.locked').hidden=ok;s.querySelectorAll('.before input,.before textarea').forEach(e=>e.disabled=ok);s.querySelector('.confirm').disabled=ok||!saved[key+'|orig'];done+=ok});document.getElementById('progress').textContent='输入已确认 '+done+' / '+all.length;}
document.querySelectorAll('section[data-input-key]').forEach(s=>{s.querySelector('.confirm').onclick=()=>{const state=freezeOriginal(BUNDLE.identity,BUNDLE.fields,saved,originalLocks,s.dataset.inputKey,new Date().toISOString());saved=state.labels;originalLocks=state.originalLocks;save();sync()}});
document.querySelectorAll('input[type=radio]').forEach(e=>{if(saved[e.name]===e.value)e.checked=true;e.onchange=()=>{saved[e.name]=e.value;save();sync()}});
document.querySelectorAll('textarea[data-key]').forEach(e=>{e.value=saved[e.dataset.key]||'';e.oninput=()=>{saved[e.dataset.key]=e.value;save()}});
document.getElementById('export').onclick=()=>{const data=makeExport(BUNDLE.identity,BUNDLE.fields,saved,new Date().toISOString(),originalLocks);const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='phota-labels-'+BUNDLE.identity.pageHash+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};sync();
</script></html>`;
 return {html,identity,fields};
}
export async function writeLabelPage(path,html){try{await writeFile(path,html,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;if(await readFile(path,'utf8')!==html)throw Error('Refusing to overwrite a page with different evidence');}}
export async function main(args=process.argv.slice(2)){
 let name,selected,ratios;const inputs=[];
 for(let i=0;i<args.length;i++){if(args[i]==='--name')name=args[++i];else if(args[i]==='--cases')selected=args[++i]?.split(',');else if(args[i]==='--ratios')ratios=args[++i]?.split(',');else if(args[i].startsWith('--'))throw Error('Unknown argument');else inputs.push(args[i]);}
 if(!name||! /^[\w-]+$/.test(name)||!inputs.length||selected?.some(x=>!x))throw Error('Usage: --name <name> [--cases id1,id2,id3] <result files...>');
 const cases=JSON.parse(await readFile(new URL('../portrait-novice-cases.json',import.meta.url),'utf8'));
 if(selected?.some(id=>!cases.some(c=>c.id===id)))throw Error('Unknown selected case');
 if(ratios?.some(r=>!['original','4:3','16:9'].includes(r)))throw Error('Unknown selected ratio');
 const records=[];for(const file of inputs){const rows=JSON.parse(await readFile(file,'utf8'));if(!Array.isArray(rows))throw Error('Expected result array');records.push(...rows.filter(r=>(!selected||selected.includes(r.case))&&(!ratios||ratios.includes(ratioOf(r)))));}
 if(!records.length)throw Error('No records for selected cases');
 const rulesSha256=sha(await readFile(new URL('../../docs/evaluations/phota-scoring-v2.md',import.meta.url),'utf8'));
 const imageEvidence=await validateImageEvidence(records,cases);
 const page=buildLabelPage({name,records,cases,rulesSha256,imageEvidence});
 const out=new URL('../results/stage0-label-'+name+'.html',import.meta.url);await writeLabelPage(out,page.html);
 console.log(JSON.stringify({page:out.pathname,pageHash:page.identity.pageHash,cases:new Set(records.map(r=>r.case)).size,inputs:page.identity.inputs.length,suggestions:records.length}));
 return page;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();

