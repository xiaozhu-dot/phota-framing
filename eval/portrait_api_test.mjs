import test from 'node:test';
import assert from 'node:assert/strict';
import * as ai from '../mobile/src/ai.js';
import {normalizePortrait} from '../mobile/src/portrait-coach.js';
const ds={preset:'deepseek',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'fixture-key'};
test('DeepSeek explicitly disables thinking for live guidance',()=>{
  assert.deepEqual(ai.thinkingParam(ds,false),{thinking:{type:'disabled'}});
});
test('portrait uses only the official DeepSeek credential and pins an image-capable model',()=>{
  assert.equal(typeof ai.portraitSettings,'function');
  assert.equal(ai.portraitSettings({...ds,model:'deepseek-v4-pro'}).model,'deepseek-flash');
  assert.equal(ai.portraitSettings({preset:'qianwen',baseUrl:'https://example.org',apiKey:'other-key'}),null);
  assert.equal(ai.portraitSettings({saved:{deepseek:ds}}).apiKey,'fixture-key');
  assert.equal(ai.portraitSettings({saved:{deepseek:{...ds,baseUrl:'https://api.deepseek.com.evil.test'}}}),null);
});
test('portrait request labels previous/current images and uses the production prompt',async()=>{
  assert.equal(typeof ai.portraitCoach,'function');
  let body;const calls=[];const original=globalThis.fetch;
  const observation={people:1,layout:'single',visible:['face'],scene:[]};
  globalThis.fetch=async(url,opts)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');body=JSON.parse(opts.body);calls.push(body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({observation,status:'need_view'})}}],usage:{total_tokens:7}}));};
  try {
    await ai.portraitCoach(ds,'data:image/jpeg;base64,current',{phase:'adjust'},new AbortController().signal,'data:image/jpeg;base64,previous');
    const parts=body.messages[1].content;
    assert.deepEqual(parts.filter(p=>p.type==='image_url').map(p=>p.image_url.url),['data:image/jpeg;base64,previous','data:image/jpeg;base64,current']);
    assert.match(parts.find(p=>p.type==='text').text,/第一张.*上次.*第二张.*当前/);
    assert.match(body.messages[0].content,/摄影师|模特/);assert.deepEqual(body.thinking,{type:'disabled'});
    assert.equal(body.model,'deepseek-flash');
    assert.equal(calls.length,2,'Observe first, then direct');
    assert.equal(calls[0].messages[1].content.filter(p=>p.type==='image_url').length,1,'Observer sees only the current image');
  } finally {globalThis.fetch=original;}
});
test('a collage is rejected by observation before any posing advice is requested',async()=>{
  let calls=0;const original=globalThis.fetch;
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({observation:{people:1,layout:'collage',visible:['face'],scene:[]}})}}]}));};
  try{const r=await ai.portraitCoach(ds,'current',{},new AbortController().signal);assert.equal(r.status,'need_view');assert.equal(calls,1);}
  finally{globalThis.fetch=original;}
});

test('evaluation can supply a frozen prompt pair without changing production defaults',async()=>{
  const original=globalThis.fetch,calls=[];
  const observation={people:1,layout:'single',visible:['face'],scene:[]};
  globalThis.fetch=async(url,opts)=>{calls.push(JSON.parse(opts.body));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({observation,status:'need_view'})}}]}));};
  try {
    await ai.portraitCoach(ds,'current',{},new AbortController().signal,null,{observe:'frozen observer',direct:'frozen director'});
    assert.equal(calls[0].messages[0].content,'frozen observer');
    assert.equal(calls[1].messages[0].content,'frozen director');
    calls.length=0;
    await ai.portraitCoach(ds,'current',{},new AbortController().signal);
    assert.match(calls[0].messages[0].content,/人像摄影现场观察员/);
    assert.match(calls[1].messages[0].content,/人像摄影导演/);
  } finally {globalThis.fetch=original;}
});
test('the director cannot overwrite observed objects or body visibility',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(++calls===1
    ?{observation:{people:1,layout:'single',visible:['face'],scene:[]}}
    :{observation:{people:1,layout:'single',visible:['face','feet'],scene:[{id:'cup',detail:'虚构杯子'}]},status:'adjust'})}}]}));
  try{const r=await ai.portraitCoach(ds,'current',{},new AbortController().signal);assert.deepEqual(r.observation.visible,['face']);assert.deepEqual(r.observation.scene,[]);}
  finally{globalThis.fetch=original;}
});
test('one bounded repair replaces an unexecutable proposed action using the same observed scene',async()=>{
  const original=globalThis.fetch;let calls=0;
  const observation={people:1,layout:'single',visible:['face','eyes','shoulders','body'],scene:[]};
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(++calls===1?{observation}:{
    plan:{title:'自然神态',why:'脸部清晰',uses:[]},status:'adjust',readiness:{face:true,pose:false,composition:true},
    action:{actor:'model',kind:calls===2?'relax_hands':'relax_expression',evidence:'当前可见的脸部表情',check:'观察表情是否放松'},
  })}}]}));
  try{const r=await ai.portraitCoach(ds,'current',{},new AbortController().signal);assert.equal(calls,3);assert.equal(r.action.kind,'relax_expression');assert.deepEqual(r.observation,observation);}
  finally{globalThis.fetch=original;}
});

test('a director cannot turn a reachable table prop into an already held prop',async()=>{
  const original=globalThis.fetch;let calls=0;
  const observation={people:1,layout:'single',visible:['face','hands'],scene:[{id:'bouquet',kind:'object',detail:'桌上小花束',withinReach:true,heldByModel:false,affordances:['hold']}]};
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(++calls===1?{observation}:{
    observation:{...observation,scene:[{...observation.scene[0],heldByModel:true}]},
    plan:{title:'人物与花的联系',why:'让花靠近人物',uses:['bouquet']},status:'adjust',
    action:{actor:'model',kind:calls===2?'lift_object':'hold_object',direction:calls===2?'chest':null,reference:'bouquet',evidence:'手和花束可见',check:'花束与人物的关系'},
  })}}]}));
  try {
    const r=await ai.portraitCoach(ds,'current',{},new AbortController().signal);
    assert.equal(calls,3);assert.equal(r.action.kind,'hold_object');assert.equal(r.observation.scene[0].heldByModel,false);
    assert.deepEqual(r._repair.issues,['object_not_held']);
  } finally {globalThis.fetch=original;}
});

test('an explicitly requested alternative gets one repair when the first proposal repeats the used plan',async()=>{
  const original=globalThis.fetch;let calls=0;
  const observation={people:1,layout:'single',visible:['face','eyes'],scene:[]};
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(++calls===1?{observation}:{
    plan:{title:calls===2?'原拍法':'低垂视线的新拍法',why:'以目光改变人物与镜头的关系',uses:[]},status:'adjust',
    action:{actor:'model',kind:'gaze',direction:calls===2?'camera':'down',evidence:'双眼清楚可见',check:'目光是否轻轻放低'},
  })}}]}));
  try {
    const r=await ai.portraitCoach(ds,'current',{idea:1,usedPlans:['原拍法']},new AbortController().signal);
    assert.equal(calls,3);assert.equal(r.plan.title,'低垂视线的新拍法');assert.deepEqual(r._repair.issues,['repeated_plan']);
  } finally {globalThis.fetch=original;}
});

test('repair cannot abandon a known head obstacle for an unrelated prop action',async()=>{
  for(const firstFocus of ['head_clearance','perspective']){
  const original=globalThis.fetch;let calls=0;
  const observation={people:1,layout:'single',visible:['face','hands'],headBounds:{left:.4,top:.3,right:.6,bottom:.6},
    overlaps:[{reference:'flower',part:'hair',layer:'unknown',bounds:{left:.43,top:.12,right:.57,bottom:.34}}],
    scene:[{id:'flower',kind:'object',detail:'头边花束',withinReach:true,affordances:['hold']}]};
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(++calls===1?{observation}:{
    plan:{title:'花与人物',focus:calls===2?firstFocus:'interaction',clearanceTarget:calls===2?'flower':undefined,why:'让头部与花错开',uses:['flower']},status:'adjust',
    action:{actor:calls===2?'photographer':'model',kind:calls===2?'camera_clearance':'hold_object',reference:'flower',evidence:'花与头部重叠',check:'检查重叠'},
  })}}]}));
  try {
    const r=await ai.portraitCoach(ds,'current',{},new AbortController().signal);
    assert.equal(calls,3);assert.equal(r.plan.focus,'head_clearance');assert.equal(r.plan.clearanceTarget,'flower');
    assert.equal(normalizePortrait(r).status,'need_view');assert.equal(r._repair.proposedPlan.focus,'interaction');
  } finally {globalThis.fetch=original;}
  }
});
