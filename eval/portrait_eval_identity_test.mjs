import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
const mod=await import('./portrait_eval_identity.mjs').catch(()=>({}));
const identity=(...args)=>{assert.equal(typeof mod.inputIdentity,'function');return mod.inputIdentity(...args);};
const same=(...args)=>{assert.equal(typeof mod.assertSameInput,'function');return mod.assertSameInput(...args);};
const bytes=Buffer.from('a real input fixture'),context={request:'先给稳妥拍法',userIntent:'保留阴云',usedPlans:[]};
test('identical input, profile and context can resume the same record',()=>{
  const a=identity(bytes,context,{ratio:'4:3',maxSide:1024});
  assert.doesNotThrow(()=>same(a,identity(bytes,{...context},{ratio:'4:3',maxSide:1024})));
});
test('a changed picture cannot reuse an old successful output',()=>{
  const a=identity(bytes,context,{ratio:'4:3'});
  assert.throws(()=>same(a,identity(Buffer.from('different pixels'),context,{ratio:'4:3'})),/input|Input/);
});
test('ratio or capture provenance changes invalidate a run even with identical encoded bytes',()=>{
  const a=identity(bytes,context,{ratio:'4:3',cameraHash:'one'});
  assert.throws(()=>same(a,identity(bytes,context,{ratio:'16:9',cameraHash:'one'})),/input|Input/);
  assert.throws(()=>same(a,identity(bytes,context,{ratio:'4:3',cameraHash:'two'})),/input|Input/);
});
test('author intent and first/alternate request changes invalidate the context',()=>{
  const a=identity(bytes,context,{});
  assert.throws(()=>same(a,identity(bytes,{...context,userIntent:'明亮肖像'},{})),/context|Context/);
  assert.throws(()=>same(a,identity(bytes,{...context,request:'换一个拍法',usedPlans:['上次拍法']},{})),/context|Context/);
});
test('legacy records lacking input identity cannot silently count as a matching run',()=>{
  assert.throws(()=>same({promptHash:'old'},identity(bytes,context,{})),/identity|Identity/);
});
test('evaluation only reads images within its research photo directory',()=>{
  assert.equal(typeof mod.researchPhotoPath,'function');const root=path.resolve('eval');
  assert.equal(mod.researchPhotoPath('photos/portrait/test.jpg',root),path.join(root,'photos','portrait','test.jpg'));
  for(const file of ['../.env','photos/portrait/../../../.env','photos/portrait-other/private.jpg',path.resolve('.env')])assert.throws(()=>mod.researchPhotoPath(file,root),/research/i);
});
test('non-image bytes cannot be sent as a supposed JPEG',()=>{
  assert.equal(typeof mod.imageMime,'function');
  assert.throws(()=>mod.imageMime(Buffer.from('DEEPSEEK_API_KEY=private')),/image/i);
  assert.equal(mod.imageMime(Buffer.from([255,216,255,224])),'jpeg');
  assert.equal(mod.imageMime(Buffer.from([137,80,78,71,13,10,26,10])),'png');
});
const capture={kind:'app-camera-1024-jpeg086-v1',ratio:'4:3',maxSide:1024,quality:.86,zoom:1,quarter:0,simFilter:'',cameraHash:'camera',visionHash:'vision'};
test('a tag locks capture configuration across different cases and failed records',()=>{
  assert.equal(typeof mod.assertCaptureProfile,'function');
  const records=[{case:'other-case',error:'failed',inputProfile:{...capture,file:'a.jpg'}}];
  assert.throws(()=>mod.assertCaptureProfile(records,{...capture,ratio:'16:9'}),/capture/i);
  assert.throws(()=>mod.assertCaptureProfile(records,{kind:'original'}),/capture/i);
  assert.doesNotThrow(()=>mod.assertCaptureProfile(records,{...capture,file:'b.jpg',sourceHash:'another',width:576}));
});
test('capture lock checks every record and rejects legacy provenance',()=>{
  assert.equal(typeof mod.assertCaptureProfile,'function');
  assert.throws(()=>mod.assertCaptureProfile([{inputProfile:capture},{inputProfile:{...capture,ratio:'16:9'}}],capture),/capture/i);
  assert.throws(()=>mod.assertCaptureProfile([{}],capture),/capture/i);
  assert.throws(()=>mod.assertCaptureProfile([{inputProfile:{kind:capture.kind}}],capture),/capture/i);
  assert.doesNotThrow(()=>mod.assertCaptureProfile([{inputProfile:{kind:'original',sourceHash:'a'}}],{kind:'original'}));
});
