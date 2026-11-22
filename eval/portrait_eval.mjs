// Inference-only comparison of the actual production prompts. No fitting,
// fine-tuning, distillation or generated-answer training data is performed.
import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {COACH_PROMPT,parseJSON,portraitCoach,coach} from '../mobile/src/ai.js';
import {PORTRAIT_PROMPT,PORTRAIT_OBSERVE_PROMPT,PORTRAIT_PROMPT_VERSION} from '../mobile/src/portrait-prompt.js';
import {normalizePortrait} from '../mobile/src/portrait-coach.js';
import {decide} from '../mobile/src/coach-logic.js';
import {inputIdentity,assertSameInput,researchPhotoPath,imageMime,assertCaptureProfile} from './portrait_eval_identity.mjs';

const args=process.argv.slice(2);
const novice=args.includes('--novice');
const corpusPrefix=novice?'portrait-novice':'portrait';
const option=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1];};
const promptFile=option('prompt-file',null);
const promptModule=promptFile ? await import(pathToFileURL(resolve(promptFile)).href)
  : {PORTRAIT_PROMPT,PORTRAIT_OBSERVE_PROMPT,PORTRAIT_PROMPT_VERSION};
const selectedPrompts={observe:promptModule.PORTRAIT_OBSERVE_PROMPT,direct:promptModule.PORTRAIT_PROMPT};
if(!Object.values(selectedPrompts).every(p=>typeof p==='string' && p.trim()))throw Error('Invalid prompt module');
const split=option('split','dev'),variant=option('variant','candidate'),tag=option('tag',promptModule.PORTRAIT_PROMPT_VERSION);
const frameRatio=option('frame-ratio','original');
if(!['original','4:3','16:9'].includes(frameRatio))throw Error('Invalid frame ratio');
if(!['dev','holdout','confirmation'].includes(split)||!['baseline','candidate'].includes(variant)||!/^[a-zA-Z0-9_-]+$/.test(tag))throw new Error('Invalid run options');
const env=await readFile(new URL('../.env',import.meta.url),'utf8');
const envValue=name=>env.split(/\r?\n/).find(l=>l.trimStart().startsWith(name+'='))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g,'');
const apiKey=envValue('DEEPSEEK_API_KEY');
if(!apiKey || /在这里|your[_-]?key/i.test(apiKey))throw new Error('Local DeepSeek credential is not configured');
const settings={preset:'deepseek',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey};
const prompt=variant==='candidate'?selectedPrompts.observe+'\n'+selectedPrompts.direct:COACH_PROMPT;
const promptHash=createHash('sha256').update(prompt).digest('hex');
const implementation=createHash('sha256');
for(const file of variant==='candidate'?['ai.js','portrait-coach.js','portrait-parallax.js','coach-logic.js']:['ai.js','coach-logic.js'])
  implementation.update(await readFile(new URL('../mobile/src/'+file,import.meta.url)));
const implementationHash=implementation.digest('hex');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let frameManifest;
if(frameRatio!=='original'){
  frameManifest=JSON.parse(await readFile(new URL('./results/portrait-frame-manifest.json',import.meta.url),'utf8'));
  if(frameManifest.profile!=='app-camera-1024-jpeg086-v1'||frameManifest.maxSide!==1024||frameManifest.quality!==.86||frameManifest.zoom!==1||frameManifest.quarter!==0||frameManifest.simFilter!=='')throw Error('Unsupported capture profile');
  if(frameManifest.cameraHash!==sha(await readFile(new URL('../mobile/src/camera.js',import.meta.url)))||
    frameManifest.visionHash!==sha(await readFile(new URL('../mobile/src/vision.js',import.meta.url))))throw Error('Camera implementation changed: prepare fresh inputs');
}
const all=JSON.parse(await readFile(new URL(`./${corpusPrefix}-cases.json`,import.meta.url),'utf8'));
const sources=JSON.parse(await readFile(new URL(`./${corpusPrefix}-sources.json`,import.meta.url),'utf8')).sources;
const groups=new Map();
for(const c of all) {
  const source=sources.find(s=>s.url===c.source);
  if(!source || source.split!==c.split)throw new Error('Unregistered source or wrong split: '+c.id);
  for(const key of [source.group,c.group,c.person].filter(Boolean)){const old=groups.get(key);if(old&&old!==c.split)throw new Error('Cross-split identity leakage: '+key);groups.set(key,c.split);}
}
const caseFilter=option('cases',option('case',null))?.split(',');
const cases=all.filter(c=>c.split===split&&(!caseFilter||caseFilter.includes(c.id)));
if(!cases.length)throw new Error('No matching cases');
const out=new URL(`./results/${corpusPrefix}-${tag}-${variant}-${split}.json`,import.meta.url);
await mkdir(new URL('./results/',import.meta.url),{recursive:true});
let records=[];try{records=JSON.parse(await readFile(out,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(records.some(r=>r.promptHash!==promptHash))throw new Error('Prompt changed: choose a new tag to preserve earlier evidence');
if(records.some(r=>r.implementationHash!==implementationHash))throw new Error('Implementation changed: choose a new tag to preserve earlier evidence');
assertCaptureProfile(records,frameManifest?{kind:frameManifest.profile,ratio:frameRatio,
  maxSide:frameManifest.maxSide,quality:frameManifest.quality,zoom:frameManifest.zoom,quarter:frameManifest.quarter,
  simFilter:frameManifest.simFilter,cameraHash:frameManifest.cameraHash,visionHash:frameManifest.visionHash}:{kind:'original'});
const realFetch=globalThis.fetch;
let attemptUsage=[];
globalThis.fetch=async(url,options)=>{
  if(new URL(url).origin!=='https://api.deepseek.com')throw new Error('Evaluation only allows the official DeepSeek API');
  const started=Date.now();
  try {
    const response=await realFetch(url,{...options,signal:AbortSignal.any([options.signal||new AbortController().signal,AbortSignal.timeout(90000)])});
    let u={};try{u=(await response.clone().json()).usage||{};}catch{}
    const input=u.prompt_tokens||0,output=u.completion_tokens||0;
    // Conservative peak rate checked 2026-10-21: cache-miss input 2, output 8 CNY/M.
    attemptUsage.push({http:response.status,ms:Date.now()-started,input,output,total:u.total_tokens||input+output,
      cacheHit:u.prompt_cache_hit_tokens||0,estimatedCny:(input*2+output*8)/1e6});
    return response;
  } catch(e){attemptUsage.push({http:null,ms:Date.now()-started,error:e.name});throw e;}
};
function rubric(raw,final) {
  const hint=String(final.hint||'');
  return {
    explicitActor:/^(摄影师|模特)[：:]/.test(hint),
    executable:variant==='candidate'?['adjust','ready'].includes(final.status):['left','right','raise','lower','closer','back','shoot'].includes(final.move),
    groundablePlan:variant==='candidate'?Boolean(final.plan?.why&&final.plan.uses.length):false,
    issues:variant==='candidate'?final.issues:[],
    // These are protocol checks only. A person must inspect observations versus
    // the actual image; they do not establish visual truth or aesthetic quality.
    visualReview:'pending',creativityReview:'pending',
  };
}
try {
  for(const c of cases) {
    const intents=option('intent','both')==='first'?['first']:['first','alternate'];
    let firstPlan=records.find(r=>r.case===c.id&&r.intent==='first'&&!r.error)?.final?.plan || null;
    for(const intent of intents) {
      const source=await readFile(researchPhotoPath(c.file));
      let inputFile=c.file,inputProfile={kind:'original',file:c.file,sourceHash:sha(source)},bytes=source;
      if(frameManifest){
        const f=frameManifest.cases.find(f=>f.id===c.id&&f.ratio===frameRatio);
        const expected=`photos/portrait/frames-1024/${c.id}-${frameRatio.replace(':','x')}.jpg`;
        if(!f||f.file!==expected||f.sourceHash!==sha(source))throw Error('Missing or stale camera input: '+c.id);
        inputFile=f.file;bytes=await readFile(researchPhotoPath(inputFile));
        if(sha(bytes)!==f.frameHash)throw Error('Camera input changed: prepare fresh inputs');
        inputProfile={kind:frameManifest.profile,ratio:frameRatio,maxSide:1024,quality:.86,zoom:1,quarter:0,simFilter:'',
          cameraHash:frameManifest.cameraHash,visionHash:frameManifest.visionHash,...f};
      }
      const mime=imageMime(bytes);
      const image=`data:image/${mime};base64,`+bytes.toString('base64');
      // Exclude subject identity, scene labels, critique comments and audit
      // targets. Novice runs supply only the author's explicit shooting intent
      // to both variants; visual facts still have to come from the image.
      const context={phase:'start',idea:intent==='alternate'?1:0,hasPrevious:false,usedPlans:intent==='alternate'&&firstPlan?[firstPlan.title]:[],
        ...(novice?{userIntent:c.userIntent}:{}),
        steps:[],request:intent==='alternate'?'这一张已拍好，请换一个有实质差异、能在这里实现的拍法':'第一次指导，请先提出稳妥的现场拍法'};
      const identity=inputIdentity(bytes,context,inputProfile);
      const existing=records.find(r=>r.case===c.id&&r.intent===intent);
      if(existing){assertSameInput(existing,identity);if(!existing.error)continue;}
      attemptUsage=[];const start=Date.now();let raw,final,error;
      try {
        raw=variant==='candidate'?await portraitCoach(settings,image,context,new AbortController().signal,null,selectedPrompts)
          :await coach(settings,image,{用户请求:context.request,...(novice?{拍摄意图:c.userIntent}:{})},new AbortController().signal);
        final=variant==='candidate'?normalizePortrait(raw,context):decide(raw);
        if(intent==='first')firstPlan=final.plan;
      } catch(e){error=String(e.message||e).replaceAll(apiKey,'[redacted]').slice(0,300);}
      const record={case:c.id,group:c.group,split,intent,variant,tag,promptHash,implementationHash,model:settings.model,
        inputFile,inputProfile,...identity,
        milliseconds:Date.now()-start,usage:attemptUsage,raw,final,error,checks:!error?rubric(raw,final):null};
      records=records.filter(r=>!(r.case===c.id&&r.intent===intent));records.push(record);
      await writeFile(out,JSON.stringify(records,null,2));
      await appendFile(new URL('./results/portrait-usage.jsonl',import.meta.url),JSON.stringify({at:new Date().toISOString(),run:`${novice?'novice/':''}${tag}/${variant}/${split}`,case:c.id,intent,usage:attemptUsage,error})+'\n');
      console.log(JSON.stringify({case:c.id,intent,status:final?.status||final?.move,error,ms:record.milliseconds,calls:attemptUsage.length,cny:attemptUsage.reduce((s,u)=>s+(u.estimatedCny||0),0)}));
    }
  }
} finally {globalThis.fetch=realFetch;}
console.log(JSON.stringify({saved:out.pathname,cases:records.length,errors:records.filter(r=>r.error).length,
  calls:records.reduce((s,r)=>s+r.usage.length,0),estimatedCny:records.reduce((s,r)=>s+r.usage.reduce((n,u)=>n+(u.estimatedCny||0),0),0)}));
