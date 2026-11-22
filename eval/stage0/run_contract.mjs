import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
export const usablePlan=r=>r&&!r.error&&['ready','adjust'].includes(r.final?.status)?r.final.plan:null;
export function makeContext(s,firstPlan){
  return {phase:'start',idea:s.intent==='alternate'?1:0,hasPrevious:false,
    usedPlans:s.intent==='alternate'&&firstPlan?[firstPlan.title]:[],userIntent:s.userIntent,steps:[],
    request:s.intent==='alternate'?'这一张已拍好，请换一个有实质差异、能在这里实现的拍法':'第一次指导，请先提出稳妥的现场拍法'};
}
export function verifyFrozen(frozen,draft){
  if(frozen.status!=='frozen'||!frozen.frozenAt)throw Error('Manifest is not frozen');
  const {status,frozenAt,...content}=frozen;
  if(!isDeepStrictEqual(content,draft))throw Error('Frozen schedule, rules or implementation changed');
}
export function verifyRecords(records,manifest,freezeHash){
  const seen=new Set();
  for(const r of records){
    if(seen.has(r.recordId))throw Error('Duplicate logical request');seen.add(r.recordId);
    const scheduled=manifest.schedule.find(s=>s.id===r.recordId);
    if(!scheduled||r.freezeHash!==freezeHash||r.inputHash!==scheduled.inputHash)throw Error('Record identity changed');
    for(const key of ['case','intent','group','split','tier','inputFile'])if(r[key]!==scheduled[key])throw Error('Record identity metadata changed: '+key);
    if(r.inputRatio!==scheduled.ratio)throw Error('Record identity ratio changed');
    for(const key of ['model','promptHash','implementationHash'])if(r[key]!==manifest.identity[key])throw Error('Record identity version changed: '+key);
    const first=records.find(f=>f.case===scheduled.case&&f.inputRatio===scheduled.ratio&&f.intent==='first');
    const context=makeContext(scheduled,usablePlan(first));
    if(!isDeepStrictEqual(context,r.context)||createHash('sha256').update(JSON.stringify(context)).digest('hex')!==r.contextHash)throw Error('Record context identity changed');
  }
}
