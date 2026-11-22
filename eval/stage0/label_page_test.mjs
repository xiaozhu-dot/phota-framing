import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('label module import has no CLI side effects',()=>{
 const p=spawnSync(process.execPath,['--input-type=module','-e',"await import('./eval/stage0/label_page.mjs')"],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
});
const m=await import('./label_page.mjs');
const cases=[{id:'a',file:'photos/a.jpg',userIntent:'保留暗调'}];
const rec=(id,extra={})=>({recordId:id,case:'a',intent:'first',inputHash:'abc',inputProfile:{kind:'original'},inputFile:'photos/a.jpg',contextHash:'ctx',promptHash:'prompt',implementationHash:'impl',final:{status:'ready',hint:'可以拍'},...extra});
const page=(records,extra={})=>{assert.equal(typeof m.buildLabelPage,'function');return m.buildLabelPage({name:'test',records,cases,rulesSha256:'rules',...extra});};

test('locks are per actual input and shared only by first/alternate of identical frame',()=>{
 const p=page([rec('1'),rec('2',{intent:'alternate'}),rec('3',{inputHash:'crop',inputFile:'photos/crop.jpg',inputProfile:{ratio:'4:3'}})]);
 assert.equal(p.identity.inputs.length,2);
 assert.equal(p.identity.records.length,3);
 assert.equal((p.html.match(/data-input-key=/g)||[]).length,2);
 assert.match(p.html,/\.\.\/photos\/crop.jpg/);
 assert.match(p.html,/最终用户可见输出/);
 assert.doesNotMatch(p.html,/<input[^>]*checked|phota-labels-v2/);
});

test('page and storage identities bind rules, context and every raw output',()=>{
 const p=page([rec('1')]);
 assert.equal(p.identity.rulesSha256,'rules');
 assert.equal(p.identity.records[0].contextHash,'ctx');
 for(const extra of [{contextHash:'new'},{inputHash:'new'},{promptHash:'new'},{implementationHash:'new'},{final:{status:'ready',hint:'不同文字'}}]){
  assert.notEqual(page([rec('1',extra)]).identity.pageHash,p.identity.pageHash);
 }
 assert.notEqual(page([rec('1')],{rulesSha256:'changed'}).identity.pageHash,p.identity.pageHash);
 assert.match(p.html,new RegExp('phota-labels-'+p.identity.pageHash));
});

test('export filters foreign keys, preserves missing, and validates choices',()=>{
 const p=page([rec('1')]);
 const field=p.fields.find(f=>f.key.endsWith('|H1'));
 const out=m.makeExport(p.identity,p.fields,{[field.key]:'确认',foreign:'pollution'},'now');
 assert.equal(out.schema,'phota-stage0-labels-v1');
 assert.equal(out.identity.pageHash,p.identity.pageHash);
 assert.equal(out.labels[field.key],'确认');
 assert.equal(out.labels.foreign,undefined);
 assert.ok(out.missing.length>0);
 assert.equal(m.makeExport(p.identity,p.fields,{[field.key]:'bogus'},'now').labels[field.key],undefined);
});

test('all required evaluation fields include explicit uncertainty and independent evidence',()=>{
 const p=page([rec('1')]);
 for(const key of ['missedIssue','unsuitable','grounded','evidence','need']) assert.ok(p.fields.some(f=>f.key.endsWith('|'+key)),key);
 assert.ok(p.fields.find(f=>f.key.endsWith('|grounded')).options.includes('无法判断'));
 assert.ok(p.fields.find(f=>f.key.endsWith('|H1')).options.includes('无法判断'));
});

test('unsafe remote and escaping image paths are rejected and text is escaped',()=>{
 for(const inputFile of ['https://example.com/a.jpg','../secret.jpg','C:/secret.jpg','photos/a.svg','photos/a.jpg?x=1']) assert.throws(()=>page([rec('1',{inputFile})]),/image|path/i);
 const p=page([rec('1',{final:{status:'ready',hint:'</script><img onerror="x">'}})]);
 assert.match(p.html,/&lt;\/script&gt;/);
 assert.doesNotMatch(p.html,/<img onerror=/);
 assert.throws(()=>page([rec('1'),rec('1')]),/duplicate/i);
});

test('same output name cannot overwrite different evidence',async()=>{
 assert.equal(typeof m.writeLabelPage,'function');
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'stage0-label-'));try{const path=join(dir,'page.html');await m.writeLabelPage(path,'one');await m.writeLabelPage(path,'one');await assert.rejects(m.writeLabelPage(path,'two'),/overwrite/i);}finally{await rm(dir,{recursive:true});}
});


test('case intent evidence is also bound to page identity',()=>{
 const p=page([rec('1')]);
 assert.notEqual(page([rec('1')],{cases:[{...cases[0],userIntent:'不同意图'}]}).identity.pageHash,p.identity.pageHash);
});

test('image evidence validator detects replaced bytes, wrong mime and stale source provenance',async()=>{
 assert.equal(typeof m.validateImageEvidence,'function');
 const {inputIdentity}=await import('../portrait_eval_identity.mjs');
 const {createHash}=await import('node:crypto');
 const bytes=Buffer.from([255,216,255,0,1]);const digest=createHash('sha256').update(bytes).digest('hex');
 const profile={kind:'original',sourceHash:digest};const context={x:1};
 const r=rec('1',{inputFile:'photos/portrait/a.jpg',inputProfile:profile,context,...inputIdentity(bytes,context,profile)});
 const readBytes=async()=>bytes;
 const checked=await m.validateImageEvidence([r],[{id:'a',file:r.inputFile}],{readBytes});
 assert.equal(checked[0].mime,'jpeg');
 await assert.rejects(m.validateImageEvidence([r],cases,{readBytes:async()=>Buffer.from([255,216,255,0,2])}),/changed|hash/i);
 await assert.rejects(m.validateImageEvidence([r],cases,{readBytes:async()=>Buffer.from('notimage')}),/image/i);
 const stale={...r,inputProfile:{...profile,sourceHash:'stale'}};stale.inputHash=inputIdentity(bytes,context,stale.inputProfile).inputHash;
 await assert.rejects(m.validateImageEvidence([stale],[{id:'a',file:r.inputFile}],{readBytes}),/source/i);
});

test('explicit original confirmation freezes labels and evidence across export and restore',()=>{
 assert.equal(typeof m.freezeOriginal,'function');
 const p=page([rec('1')]),key=p.identity.inputs[0].key;
 assert.throws(()=>m.freezeOriginal(p.identity,p.fields,{}, {},key,'first'),/original|原片/i);
 const labels={[key+'|orig']:'保留即可',[key+'|orig-evidence']:'图上没有主要问题'};
 const state=m.freezeOriginal(p.identity,p.fields,labels,{},key,'first');
 const edited={...state.labels,[key+'|orig']:'有值得解决的问题',[key+'|orig-evidence']:'changed'};
 const restored=m.makeExport(p.identity,p.fields,edited,'later',state.originalLocks);
 assert.equal(restored.labels[key+'|orig'],'保留即可');
 assert.equal(restored.labels[key+'|orig-evidence'],'图上没有主要问题');
 assert.equal(restored.originalLocks[key].frozenAt,'first');
 assert.equal(restored.originalLocks[key].stage,'before_suggestions');
 assert.equal(m.freezeOriginal(p.identity,p.fields,edited,state.originalLocks,key,'second').originalLocks[key].frozenAt,'first');
 assert.match(p.html,/确认原片判断并看建议/);
 assert.match(p.html,/disabled/);
});
