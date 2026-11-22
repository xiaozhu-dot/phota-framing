import test from 'node:test';
import assert from 'node:assert/strict';
const mod=await import('./run_contract.mjs').catch(()=>({}));
test('frozen schedule rejects changed cases, rules, timing or budget before requests',()=>{
  assert.equal(typeof mod.verifyFrozen,'function');
  const draft={identity:{rules:'one'},schedule:[{id:'a'}],policy:{budget:1.5}};
  const frozen={...draft,status:'frozen',frozenAt:'date'};
  assert.doesNotThrow(()=>mod.verifyFrozen(frozen,draft));
  for(const delta of [{schedule:[{id:'b'}]},{identity:{rules:'two'}},{policy:{budget:2}}])assert.throws(()=>mod.verifyFrozen(frozen,{...draft,...delta}),/changed/i);
  assert.throws(()=>mod.verifyFrozen({...frozen,status:'draft'},draft),/frozen/i);
});
test('any recorded attempt including error remains immutable on resume',async()=>{
  assert.equal(typeof mod.verifyRecords,'function');
  const frozen={identity:{model:'m',promptHash:'p',implementationHash:'i'},schedule:[{id:'a/original/first',case:'a',ratio:'original',intent:'first',group:'g',split:'dev',tier:'dev',userIntent:'意图',inputHash:'pixels',inputFile:'photo.jpg'}]};
  const context={phase:'start',idea:0,hasPrevious:false,usedPlans:[],userIntent:'意图',steps:[],request:'第一次指导，请先提出稳妥的现场拍法'};
  const {createHash}=await import('node:crypto');
  const contextHash=createHash('sha256').update(JSON.stringify(context)).digest('hex');
  const records=[{recordId:'a/original/first',case:'a',inputRatio:'original',intent:'first',group:'g',split:'dev',tier:'dev',inputFile:'photo.jpg',model:'m',promptHash:'p',implementationHash:'i',context,contextHash,inputHash:'pixels',error:'timeout',freezeHash:'frozen'}];
  assert.doesNotThrow(()=>mod.verifyRecords(records,frozen,'frozen'));
  assert.throws(()=>mod.verifyRecords([...records,...records],frozen,'frozen'),/duplicate/i);
  assert.throws(()=>mod.verifyRecords([{...records[0],inputHash:'changed'}],frozen,'frozen'),/identity/i);
  assert.throws(()=>mod.verifyRecords([{...records[0],freezeHash:'other'}],frozen,'frozen'),/identity/i);
  for(const field of ['case','inputRatio','intent','group','tier','model','promptHash','implementationHash','contextHash'])
    assert.throws(()=>mod.verifyRecords([{...records[0],[field]:'tampered'}],frozen,'frozen'),/identity|context/i,field);
  assert.throws(()=>mod.verifyRecords([{...records[0],context:{...context,userIntent:'changed'}}],frozen,'frozen'),/context/i);
});
