// Offline Stage 0 metrics only: no model calls, no UI-wait or human-score claims.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { checkRecord } from './consistency.mjs';

export const rate = (num, den) => ({ num, den, value: den ? +(num / den).toFixed(3) : '不可得' });
export function quantile(xs, q) {
  if (!(q > 0 && q <= 1)) throw Error('Quantile must be in (0,1]');
  const sorted = [...xs].sort((a,b) => a-b);
  return sorted.length ? sorted[Math.ceil(q * sorted.length)-1] : null;
}
const display = value => value === Infinity ? '∞' : value;
const finite = value => Number.isFinite(value) && value >= 0;
const round = value => +value.toFixed(6);
const ratioOf = r => r.inputRatio ?? r.inputProfile?.ratio ?? (typeof r.inputProfile === 'string' ? r.inputProfile : r.inputProfile?.kind === 'original' ? 'original' : null) ?? r.requestedRatio ?? r.frameRatio ?? 'unknown';
const requestOf = r => r.intent ?? r.request ?? 'unknown';
export const isUsable = r => r.submitted !== false && !r.error && ['ready','adjust'].includes(r.final?.status);
const usageOf = r => Array.isArray(r.usage) ? r.usage : [];
const knownUsage = u => finite(u.estimatedCny) && u.usageKnown !== false && u.usageMissing !== true;
const costOf = r => usageOf(r).length && usageOf(r).every(knownUsage) && r.costComplete !== false
  ? usageOf(r).reduce((sum,u) => sum+u.estimatedCny,0) : null;

export function assertUniqueRecords(records) {
  const identities = new Map();
  for (const r of records) {
    const identity = JSON.stringify([r.case,requestOf(r),ratioOf(r),r.inputHash ?? r.inputSha256 ?? r.inputIdentity ?? r.inputFile ?? 'unknown']);
    if (identities.has(identity)) throw Error(`Duplicate logical request ${identity}: ${identities.get(identity)} / ${r.file ?? 'record'}`);
    identities.set(identity,r.file ?? 'record');
  }
}

function metricsFor(records) {
  const submitted = records.filter(r => r.submitted !== false);
  const available = submitted.filter(isUsable);
  const waits = submitted.map(r => isUsable(r) && finite(r.milliseconds) ? r.milliseconds : Infinity);
  const costs = submitted.map(costOf);
  const complete = submitted.length > 0 && costs.every(c => c !== null);
  const usage = submitted.flatMap(usageOf);
  const observedCost = usage.filter(knownUsage).reduce((sum,u) => sum+u.estimatedCny,0);
  const observedToken = key => usage.reduce((sum,u) => sum+(finite(u[key]) ? u[key] : 0),0);
  const tokensComplete = usage.length > 0 && submitted.every(r => usageOf(r).length > 0)
    && usage.every(u => ['input','output','total'].every(key => finite(u[key])) && u.usageKnown !== false && u.usageMissing !== true);
  const dist = q => complete ? round(quantile(costs,q)) : '未知';
  return {
    plannedLogicalRequests: records.length,
    logicalRequests: submitted.length,
    unsubmittedLogicalRequests: records.length-submitted.length,
    efficiency: {
      finalAvailability: rate(available.length,submitted.length),
      finalUnavailable: submitted.length-available.length,
      waitMedianMs: display(quantile(waits,.5)), waitP90Ms: display(quantile(waits,.9)),
      successfulHttpMedianMs: quantile(available.filter(r => finite(r.milliseconds)).map(r => r.milliseconds),.5),
      successfulHttpP90Ms: quantile(available.filter(r => finite(r.milliseconds)).map(r => r.milliseconds),.9),
      unknownSuccessfulWaits: available.filter(r => !finite(r.milliseconds)).length,
      latencyScope: 'offline-http', measuredUserWaitMs: '暂无数据',
      latencyNote: 'milliseconds 是离线完整逻辑 HTTP 流程耗时；未测提交到界面文字可见，不能证明用户等待门槛。失败排序为∞，实际耗时保留。',
      httpCalls: usage.length,
      observedEstimatedCnyTotal: round(observedCost),
      estimatedCnyTotal: complete ? round(observedCost) : '未知',
      estimatedCnyPerValidGuidance: !available.length ? '不可得' : complete ? round(observedCost/available.length) : '未知',
      costMedianCny: dist(.5), costP90Cny: dist(.9),
      costComplete: complete,
      unknownCostLogicalRequests: costs.filter(c => c === null).length,
      unknownCostHttpCalls: usage.filter(u => !knownUsage(u)).length,
      requestsWithoutUsage: submitted.filter(r => !usageOf(r).length).length,
      costDistributionUnit: 'submitted logical request, including failures and all internal calls',
      tokens: { observedInput: observedToken('input'), observedOutput: observedToken('output'), observedTotal: observedToken('total'), complete: tokensComplete },
      pricingVersions: [...new Set(usage.map(u => u.pricingVersion).filter(Boolean))],
      pricingVersionUnknownCalls: usage.filter(u => !u.pricingVersion).length,
      timeouts: submitted.filter(r => r.timedOut === true || /timeout|timed out|超时/i.test(String(r.error ?? ''))).length,
      timeoutThresholdsMs: [...new Set(submitted.map(r => r.timeoutMs).filter(finite))],
      timeoutThresholdUnknownRequests: submitted.filter(r => !finite(r.timeoutMs)).length,
      note: '运行器估算，不是账单；观察到的费用小计不代表未知请求免费。',
    },
    decisions: {ready:available.filter(r => r.final.status === 'ready').length,adjust:available.filter(r => r.final.status === 'adjust').length,
      other:submitted.filter(r => !r.error && r.final && !['ready','adjust'].includes(r.final.status)).length,
      errors:submitted.filter(r => r.error).length,missingFinal:submitted.filter(r => !r.final).length},
  };
}
const grouped = (records,key) => Object.fromEntries([...new Set(records.map(key))].sort().map(value => [value,metricsFor(records.filter(r => key(r) === value))]));

export function summarizeRecords(records, {name='baseline',registry={cases:[]},manifest}={}) {
  assertUniqueRecords(records);
  if(manifest){
    const schedule=manifest.schedule;if(!Array.isArray(schedule)||new Set(schedule.map(s=>s.id)).size!==schedule.length)throw Error('Invalid frozen schedule');
    const seen=new Set();
    for(const r of records){
      const s=schedule.find(s=>s.id===r.recordId);
      if(!s||seen.has(r.recordId)||r.case!==s.case||r.intent!==s.intent||ratioOf(r)!==s.ratio||r.inputHash!==s.inputHash)throw Error('Record does not match frozen schedule identity');
      seen.add(r.recordId);
    }
    records=[...records,...schedule.filter(s=>!seen.has(s.id)).map(s=>({recordId:s.id,case:s.case,inputRatio:s.ratio,intent:s.intent,tier:s.tier,inputHash:s.inputHash,submitted:false,error:'not_attempted',usage:[]}))];
  }
  const tier = r => registry.cases?.find(c => c.id === r.case)?.tier ?? 'unregistered';
  const valid = records.filter(isUsable);
  const checks = valid.map(r => ({r,c:checkRecord(r)}));
  const withFinal = verdict => checks.filter(({c}) => c.final.some(a => a.verdict === verdict)).length;
  const nested = {};
  for (const r of records) {
    const t=tier(r), ratio=ratioOf(r), req=requestOf(r);
    ((nested[t] ??= {})[ratio] ??= {})[req] ??= [];
    nested[t][ratio][req].push(r);
  }
  for (const ratios of Object.values(nested)) for (const requests of Object.values(ratios)) for (const req of Object.keys(requests)) requests[req]=metricsFor(requests[req]);
  return {
    name, inputs:[...new Set(records.map(r => r.file).filter(Boolean))],
    recordsSha256:createHash('sha256').update(JSON.stringify(records)).digest('hex'),
    promptHashes:[...new Set(records.map(r => r.promptHash).filter(Boolean))],
    ...metricsFor(records), byIntent:Object.fromEntries([...new Set(records.map(requestOf))].map(i => [i,records.filter(r => requestOf(r) === i).length])),
    byTier:grouped(records,tier),byInputRatio:grouped(records,ratioOf),byRequest:grouped(records,requestOf),byTierInputRatioRequest:nested,
    consistency:{checker:checks[0]?.c.version ?? null,
      finalWithConflict:rate(withFinal('conflict'),valid.length),
      finalWithReviewOnly:rate(checks.filter(({c}) => c.final.length && !c.final.some(a => a.verdict === 'conflict')).length,valid.length),
      rawOnlyAlarms:checks.filter(({c}) => !c.final.length && c.raw.length).length,
      note:'报警只是疑点，须人工对图确认后才计硬错误；无效输出不进入可评输出分母。',
      alarms:checks.flatMap(({r,c}) => c.final.map(a => ({case:r.case,intent:r.intent,file:r.file,...a}))),
    },
    needsHuman:{status:'待人工标注',metrics:['硬错误率（H1–H6 确认）','不必要调整率','漏调率','无证据调整率','不适用建议率','建议适配四维分','创意分','现场关联率']},
    noData:{status:'暂无数据',metrics:['单步有效率','执行覆盖率','成功拍法步数','严格出片成功率','实拍成片四维分','真实成片盲评']},
    failures:records.filter(r => r.submitted !== false && !isUsable(r)).map(r => ({case:r.case,intent:r.intent,file:r.file,error:r.error,status:r.final?.status,hint:r.final?.hint,milliseconds:r.milliseconds,inputRatio:ratioOf(r)})),
    unsubmitted:records.filter(r => r.submitted === false).map(r => ({case:r.case,intent:r.intent,file:r.file,error:r.error,inputRatio:ratioOf(r)})),
  };
}

export async function writeSummary(path, summary) {
  const contents=JSON.stringify(summary,null,2)+'\n';
  try { await writeFile(path,contents,{flag:'wx'}); }
  catch(error) {
    if(error.code !== 'EEXIST') throw error;
    if(await readFile(path,'utf8') !== contents) throw Error('Refusing to overwrite an existing summary with different records or metrics');
  }
}

export async function main(args=process.argv.slice(2)) {
  let name,manifestFile;const inputs=[];
  for(let i=0;i<args.length;i++){
    if(args[i]==='--name')name=args[++i];else if(args[i]==='--manifest')manifestFile=args[++i];
    else inputs.push(args[i]);
  }
  if(!name || !/^[\w-]+$/.test(name) || !inputs.length || inputs.some(s => s.startsWith('--'))) throw Error('Usage: --name <name> <result files...>');
  const records=[];
  for(const file of inputs) {
    const rows=JSON.parse(await readFile(file,'utf8'));
    if(!Array.isArray(rows)) throw Error(`Expected result array: ${file}`);
    for(const r of rows) records.push({...r,file});
  }
  const registry=JSON.parse(await readFile(new URL('./registry.json',import.meta.url),'utf8'));
  const manifest=manifestFile?JSON.parse(await readFile(manifestFile,'utf8')):undefined;
  const summary=summarizeRecords(records,{name,registry,manifest});
  await writeSummary(new URL(`./${name}-summary.json`,import.meta.url),summary);
  console.log(JSON.stringify({...summary,consistency:{...summary.consistency,alarms:summary.consistency.alarms.length}},null,1));
  return summary;
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

