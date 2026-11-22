import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('importing metrics has no command-line side effects', () => {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./eval/stage0/baseline.mjs')"], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});

const metrics = await import('./baseline.mjs');
const registry = { cases: [{id:'a',tier:'dev'}, {id:'b',tier:'regression'}] };
const record = (id, extra={}) => ({case:id,intent:'first',inputProfile:'original',inputHash:`hash-${id}`,milliseconds:1000,usage:[{estimatedCny:.01,input:10,output:2,total:12}],final:{status:'ready'},...extra});
const summary = records => {
  assert.equal(typeof metrics.summarizeRecords, 'function', 'metrics must be exported');
  return metrics.summarizeRecords(records, {name:'test',registry});
};

test('frozen schedule retains all planned requests after partial execution',()=>{
 const r=record('a',{recordId:'a/original/first',inputRatio:'original'});
 const manifest={schedule:[{id:r.recordId,case:'a',ratio:'original',intent:'first',inputHash:r.inputHash},{id:'b/original/first',case:'b',ratio:'original',intent:'first',inputHash:'hash-b'}]};
 const s=metrics.summarizeRecords([r],{registry,manifest});
 assert.equal(s.plannedLogicalRequests,2);assert.equal(s.logicalRequests,1);assert.equal(s.unsubmittedLogicalRequests,1);
 assert.equal(s.unsubmitted[0].error,'not_attempted');
 assert.deepEqual(s.efficiency.finalAvailability,{num:1,den:1,value:1});
 assert.throws(()=>metrics.summarizeRecords([{...r,inputHash:'tamper'}],{registry,manifest}),/schedule|identity/i);
});

test('availability retains errors and pauses; nearest-rank wait counts failures as infinity', () => {
  const s=summary([record('a'),record('b',{final:{status:'pause'}}),record('c',{error:'timeout',milliseconds:90000})]);
  assert.equal(s.logicalRequests,3);
  assert.deepEqual(s.efficiency.finalAvailability,{num:1,den:3,value:.333});
  assert.equal(s.efficiency.waitMedianMs,'∞');
  assert.equal(s.efficiency.waitP90Ms,'∞');
  assert.equal(s.failures.length,2);
  assert.equal(s.failures[1].milliseconds,90000);
  assert.equal(s.efficiency.latencyScope,'offline-http');
  assert.equal(s.efficiency.measuredUserWaitMs,'暂无数据');
});

test('unknown usage cannot become zero or a complete mean', () => {
  const s=summary([record('a'),record('b',{usage:[]}),record('c',{usage:[{estimatedCny:undefined}]})]);
  assert.equal(s.efficiency.observedEstimatedCnyTotal,.01);
  assert.equal(s.efficiency.estimatedCnyTotal,'未知');
  assert.equal(s.efficiency.estimatedCnyPerValidGuidance,'未知');
  assert.equal(s.efficiency.costComplete,false);
  assert.equal(s.efficiency.unknownCostLogicalRequests,2);
});

test('complete costs include failed calls and report per logical request distribution and tokens', () => {
  const s=summary([record('a'),record('b',{error:'failure',usage:[{estimatedCny:.03,input:30,output:6,total:36}]})]);
  assert.equal(s.efficiency.estimatedCnyTotal,.04);
  assert.equal(s.efficiency.estimatedCnyPerValidGuidance,.04);
  assert.equal(s.efficiency.costMedianCny,.01);
  assert.equal(s.efficiency.costP90Cny,.03);
  assert.equal(s.efficiency.tokens.observedTotal,48);
});

test('empty batch is unavailable, never a zero or successful measurement', () => {
  const s=summary([]);
  assert.equal(s.efficiency.finalAvailability.value,'不可得');
  assert.equal(s.efficiency.waitMedianMs,null);
  assert.equal(s.efficiency.estimatedCnyPerValidGuidance,'不可得');
  assert.equal(s.efficiency.costComplete,false);
  assert.equal(s.needsHuman.status,'待人工标注');
  assert.equal(s.noData.status,'暂无数据');
});

test('unsubmitted plans remain visible without inflating submitted availability denominator', () => {
  const s=summary([record('a'),record('b',{submitted:false,usage:[],final:null})]);
  assert.equal(s.plannedLogicalRequests,2);
  assert.equal(s.logicalRequests,1);
  assert.equal(s.unsubmittedLogicalRequests,1);
  assert.equal(s.efficiency.finalAvailability.den,1);
});

test('registry tier, profile and request grouping include failed rows without using legacy split', () => {
  const s=summary([record('a',{split:'holdout'}),record('b',{split:'confirmation',intent:'alternate',inputProfile:'4:3',error:'fail'})]);
  assert.equal(s.byTier.dev.logicalRequests,1);
  assert.equal(s.byTier.regression.logicalRequests,1);
  assert.equal(s.byInputRatio['4:3'].efficiency.finalAvailability.num,0);
  assert.equal(s.byRequest.alternate.logicalRequests,1);
  assert.equal(s.byTierInputRatioRequest.regression['4:3'].alternate.logicalRequests,1);
});

test('duplicate logical identities across files are rejected; different input hashes remain distinct', () => {
  assert.throws(()=>summary([record('a',{file:'one.json'}),record('a',{file:'two.json'})]),/duplicate/i);
  assert.equal(summary([record('a'),record('a',{inputHash:'other'})]).logicalRequests,2);
});

test('atomic summary output refuses different data and accepts an identical rerun', async () => {
  assert.equal(typeof metrics.writeSummary,'function');
  const {mkdtemp,readFile,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const dir=await mkdtemp(join(tmpdir(),'stage0-summary-'));
  try {
    const path=join(dir,'summary.json');
    await metrics.writeSummary(path,{count:1});
    await metrics.writeSummary(path,{count:1});
    await assert.rejects(metrics.writeSummary(path,{count:2}),/refus|exist|overwrite/i);
    assert.deepEqual(JSON.parse(await readFile(path,'utf8')),{count:1});
  } finally { await rm(dir,{recursive:true}); }
});

test('nearest-rank even batch uses the lower middle rank and p90 uses ceil', () => {
  assert.equal(metrics.quantile([9000,1000,3000,2000],.5),2000);
  assert.equal(metrics.quantile([9000,1000,3000,2000],.9),9000);
});

test('duplicate key retains ratio and request dimensions', () => {
  const s=summary([record('a'),record('a',{inputProfile:'4:3'}),record('a',{intent:'alternate'})]);
  assert.equal(s.logicalRequests,3);
});

test('explicitly missing provider usage overrides an apparent zero estimate', () => {
  const s=summary([record('a',{usage:[{estimatedCny:0,usageKnown:false}]})]);
  assert.equal(s.efficiency.costComplete,false);
  assert.equal(s.efficiency.estimatedCnyTotal,'未知');
  assert.equal(s.efficiency.unknownCostHttpCalls,1);
});

test('actual registry keeps all three development and six regression cases despite historical splits', async () => {
  const {readFile}=await import('node:fs/promises');
  const actual=JSON.parse(await readFile(new URL('./registry.json',import.meta.url),'utf8'));
  const cases=actual.cases.filter(c=>['dev','regression'].includes(c.tier));
  const s=metrics.summarizeRecords(cases.map(c=>record(c.id,{split:'holdout',tier:'sealed'})),{registry:actual});
  assert.equal(s.byTier.dev.logicalRequests,3);
  assert.equal(s.byTier.regression.logicalRequests,6);
  assert.equal(s.logicalRequests,9);
});

test('structured input profile groups by declared ratio, never object coercion', () => {
  const s=summary([record('a',{inputProfile:{kind:'original'}}),record('b',{inputProfile:{kind:'app',ratio:'4:3'}})]);
  assert.equal(s.byInputRatio.original.logicalRequests,1);
  assert.equal(s.byInputRatio['4:3'].logicalRequests,1);
});
