// Continuation registered after user instruction on 2026-10-28; primary failures remain immutable. Frozen inference-only v16 baseline. --freeze registers; --run executes once per request.
import {readFile,writeFile,rename,open,unlink,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {portraitCoach} from '../../mobile/src/ai.js';
import {normalizePortrait} from '../../mobile/src/portrait-coach.js';
import {PORTRAIT_PROMPT,PORTRAIT_OBSERVE_PROMPT,PORTRAIT_PROMPT_VERSION} from '../../mobile/src/portrait-prompt.js';
import {inputIdentity,researchPhotoPath,imageMime} from '../portrait_eval_identity.mjs';
import {verifyFrozen,verifyRecords,makeContext,usablePlan} from './run_contract.mjs';

const root=new URL('../../',import.meta.url),url=p=>new URL(p,root),read=p=>readFile(url(p));
const json=async p=>JSON.parse(await read(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const tag='v16-stage0-20261028-r2';
const frozenPath='eval/stage0/baseline-v16-continuation-20261028.json';
const resultPath=`eval/results/stage0-${tag}.json`,journalPath=`eval/results/stage0-${tag}.jsonl`;
const trackedFiles=['docs/evaluations/phota-scoring-v2.md','eval/stage0/registry.json',
  'eval/stage0/consistency.mjs','eval/stage0/run_baseline.mjs','eval/stage0/run_contract.mjs',
  'eval/portrait_eval_identity.mjs','eval/portrait-novice-cases.json','eval/portrait-novice-sources.json',
  'eval/results/portrait-frame-manifest.json','mobile/src/portrait-prompt.js','mobile/src/camera.js','mobile/src/vision.js',
  ...['ai.js','portrait-coach.js','portrait-parallax.js','coach-logic.js'].map(f=>'mobile/src/'+f)];
trackedFiles.push('eval/stage0/run_remainder.mjs','eval/stage0/baseline-v16-frozen.json','eval/results/stage0-v16-stage0-20261027-r1.json');
const hashes=Object.fromEntries(await Promise.all(trackedFiles.map(async p=>[p,sha(await read(p))])));
const registry=await json('eval/stage0/registry.json'),cases=await json('eval/portrait-novice-cases.json');
if(registry.hashes.rules.sha256!==hashes['docs/evaluations/phota-scoring-v2.md']||registry.hashes.checker.sha256!==hashes['eval/stage0/consistency.mjs'])throw Error('Registry is stale: register rules/checker before freezing');
if(PORTRAIT_PROMPT_VERSION!=='portrait-v16')throw Error('Expected formal v16');
if(!Buffer.from(await read('mobile/src/portrait-prompt.js')).equals(await read('eval/prompts/portrait-v16-before-decision-experiment.mjs')))throw Error('Formal prompt differs from frozen v16');
const frames=await json('eval/results/portrait-frame-manifest.json');
if(frames.profile!=='app-camera-1024-jpeg086-v1'||frames.maxSide!==1024||frames.quality!==.86||frames.zoom!==1||frames.quarter!==0||frames.simFilter!==''||frames.cameraHash!==hashes['mobile/src/camera.js']||frames.visionHash!==hashes['mobile/src/vision.js'])throw Error('Invalid frame provenance');
const photos=new Map();let schedule=[];
for(const ratio of ['original','4:3','16:9'])for(const c of cases){
  const source=await readFile(researchPhotoPath(c.file));
  let bytes=source,inputFile=c.file,inputProfile={kind:'original',sourceHash:sha(source),file:c.file};
  if(ratio!=='original'){
    const f=frames.cases.find(f=>f.id===c.id&&f.ratio===ratio);
    if(!f||f.file!==`photos/portrait/frames-1024/${c.id}-${ratio.replace(':','x')}.jpg`||f.sourceHash!==sha(source))throw Error('Missing/stale frame '+c.id);
    bytes=await readFile(researchPhotoPath(f.file));if(sha(bytes)!==f.frameHash)throw Error('Frame bytes changed');
    inputFile=f.file;inputProfile={kind:frames.profile,maxSide:1024,quality:.86,zoom:1,quarter:0,simFilter:'',cameraHash:frames.cameraHash,visionHash:frames.visionHash,...f};
  }
  const inputHash=inputIdentity(bytes,{},inputProfile).inputHash;
  photos.set(`${c.id}/${ratio}`,{bytes,inputFile,inputProfile,mime:imageMime(bytes),inputHash});
  const tier=registry.cases.find(r=>r.corpus==='novice'&&r.id===c.id)?.tier;
  if(!['dev','regression'].includes(tier))throw Error('Unexpected data tier');
  for(const intent of ['first','alternate'])schedule.push({id:`${c.id}/${ratio}/${intent}`,case:c.id,group:c.group,split:c.split,userIntent:c.userIntent,ratio,intent,tier,inputFile,inputHash});
}
const priorBytes=await read('eval/results/stage0-v16-stage0-20261027-r1.json');
const priorRecords=JSON.parse(priorBytes),priorFrozenBytes=await read('eval/stage0/baseline-v16-frozen.json');
const priorManifest=JSON.parse(priorFrozenBytes);
verifyRecords(priorRecords,priorManifest,sha(priorFrozenBytes));
if(priorRecords.length!==11||priorRecords.at(-1).recordId!=='novice-night/original/first'||!priorRecords.at(-1).error)throw Error('Prior batch differs from registered continuation design');
const attempted=new Set(priorRecords.map(r=>r.recordId));
schedule=schedule.filter(s=>!attempted.has(s.id));
const order={'4:3':0,'16:9':1,original:2};schedule.sort((a,b)=>order[a.ratio]-order[b.ratio]);
const impl=createHash('sha256');for(const f of ['ai.js','portrait-coach.js','portrait-parallax.js','coach-logic.js'])impl.update(await read('mobile/src/'+f));
const draft={tag,priorBatch:{manifest:'eval/stage0/baseline-v16-frozen.json',results:'eval/results/stage0-v16-stage0-20261027-r1.json',attempted:11,unknownPriorCost:true,policy:'Continue only the 43 never-attempted scheduled entries; no failed request retry; primary unknown cost remains unknown'},identity:{hashes,promptHash:sha(PORTRAIT_OBSERVE_PROMPT+'\n'+PORTRAIT_PROMPT),implementationHash:impl.digest('hex'),model:'deepseek-flash'},
  policy:{logicalRequests:43,httpTimeoutMs:90000,logicalTimeoutMs:270000,budgetStopCny:1.5,
    retries:'No logical retry; production bounded format/parameter repair is retained and recorded',
    estimate:{inputPerMillionCny:2,outputPerMillionCny:8,cache:'all input conservatively cache-miss',version:'2026-10-27-peak-upper-estimate',source:'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/'},
    stopping:'After each logical request: stop on unknown usage or estimated total >= budget; preserve failures; no extra runs'},
  contextPolicy:'static first/alternate simulation; never evidence of actual execution; alternate only if first has a usable plan',schedule,resultPath};
if(schedule.length!==43)throw Error('Corpus schedule changed; new run design required');
if(process.argv.includes('--freeze')){
  await writeFile(url(frozenPath),JSON.stringify({...draft,status:'frozen',frozenAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({frozen:frozenPath,requests:schedule.length,photos:photos.size,budget:1.5}));
}else if(process.argv.includes('--verify')){
  const frozenBytes=await read(frozenPath),manifest=JSON.parse(frozenBytes);verifyFrozen(manifest,draft);
  let records=[];try{records=await json(resultPath);}catch(e){if(e.code!=='ENOENT')throw e;}
  verifyRecords(records,manifest,sha(frozenBytes));
  console.log(JSON.stringify({verified:true,recorded:records.length,planned:schedule.length,network:false}));
}else if(process.argv.includes('--run')){
  const frozenBytes=await read(frozenPath),manifest=JSON.parse(frozenBytes);verifyFrozen(manifest,draft);
  const freezeHash=sha(frozenBytes);
  const lock=url(resultPath+'.lock');await open(lock,'wx').then(h=>h.close());
  const realFetch=globalThis.fetch;
  let records=[];
  const persist=async()=>{await writeFile(url(resultPath+'.tmp'),JSON.stringify(records,null,2)+'\n');await rename(url(resultPath+'.tmp'),url(resultPath));};
  try{
    try{records=await json(resultPath);}catch(e){if(e.code!=='ENOENT')throw e;}
    verifyRecords(records,manifest,freezeHash);
    const env=(await read('.env')).toString('utf8');
    const apiKey=env.split(/\r?\n/).find(l=>l.trimStart().startsWith('DEEPSEEK_API_KEY='))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g,'');
    if(!apiKey)throw Error('Local DeepSeek key missing');
    const settings={preset:'deepseek',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey};
    const spent=()=>records.flatMap(r=>r.usage||[]).reduce((s,u)=>s+(u.estimatedCny||0),0);
    const unknown=()=>records.some(r=>r.submitted&&(!r.usage?.length||r.usage.some(u=>!Number.isFinite(u.estimatedCny))));
    for(const s of schedule){
      if(records.some(r=>r.recordId===s.id))continue;
      if(spent()>=draft.policy.budgetStopCny||unknown()){console.log('STOP budget or unknown cost; unfinished requests retained in frozen schedule');break;}
      const c=cases.find(c=>c.id===s.case),p=photos.get(`${s.case}/${s.ratio}`);
      const first=[...records,...priorRecords].find(r=>r.recordId===`${s.case}/${s.ratio}/first`);
      const firstPlan=usablePlan(first),context=makeContext(s,firstPlan);
      const identity=inputIdentity(p.bytes,context,p.inputProfile);
      let record={recordId:s.id,case:c.id,group:c.group,split:c.split,tier:s.tier,intent:s.intent,tag,variant:'candidate',model:settings.model,
        promptHash:draft.identity.promptHash,implementationHash:draft.identity.implementationHash,freezeHash,
        inputFile:p.inputFile,inputRatio:s.ratio,inputProfile:p.inputProfile,...identity,context,timeoutMs:90000,usage:[],submitted:true,error:'interrupted_or_inflight'};
      if(s.intent==='alternate'&&!firstPlan){record={...record,submitted:false,error:'dependency_unavailable',milliseconds:null};records.push(record);await persist();continue;}
      records.push(record);await persist(); // interrupted requests are never silently retried
      const usage=[];const started=Date.now();
      globalThis.fetch=async(endpoint,options)=>{
        if(endpoint!=='https://api.deepseek.com/chat/completions')throw Error('Only official DeepSeek chat is allowed');
        const at=Date.now();
        try{
          const response=await realFetch(endpoint,{...options,signal:AbortSignal.any([options.signal,AbortSignal.timeout(90000)])});
          let body;try{body=await response.clone().json();}catch{}
          const u=body?.usage,known=Number.isFinite(u?.prompt_tokens)&&Number.isFinite(u?.completion_tokens);
          usage.push({http:response.status,ms:Date.now()-at,input:u?.prompt_tokens,output:u?.completion_tokens,total:u?.total_tokens,cacheHit:u?.prompt_cache_hit_tokens,
            usageKnown:known,estimatedCny:known?(u.prompt_tokens*2+u.completion_tokens*8)/1e6:undefined,pricingVersion:draft.policy.estimate.version,servedModel:body?.model});
          return response;
        }catch(e){usage.push({http:null,ms:Date.now()-at,error:e.name,usageKnown:false,pricingVersion:draft.policy.estimate.version});throw e;}
      };
      let raw,final,error;
      try{raw=await portraitCoach(settings,`data:image/${p.mime};base64,`+p.bytes.toString('base64'),context,AbortSignal.timeout(270000));final=normalizePortrait(raw,context);}
      catch(e){error=String(e.message||e).replaceAll(apiKey,'[redacted]').slice(0,300);}
      finally{globalThis.fetch=realFetch;}
      record={...record,raw,final,error,usage,milliseconds:Date.now()-started};records[records.length-1]=record;
      await persist();await appendFile(url(journalPath),JSON.stringify(record)+'\n');
      console.log(JSON.stringify({request:s.id,status:final?.status,error,calls:usage.length,estimatedTotalCny:+spent().toFixed(6)}));
    }
    console.log(JSON.stringify({saved:resultPath,recorded:records.length,planned:schedule.length,estimatedCny:+spent().toFixed(6),costIncomplete:unknown()}));
  }finally{globalThis.fetch=realFetch;await unlink(lock);}
}else console.log(JSON.stringify({draftOnly:true,requests:schedule.length,photos:photos.size,resultPath}));
