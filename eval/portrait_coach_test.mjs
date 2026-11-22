import test from 'node:test';
import assert from 'node:assert/strict';
const mod = await import('../mobile/src/portrait-coach.js').catch(() => ({}));
const normalize = (...args) => { assert.equal(typeof mod.normalizePortrait, 'function'); return mod.normalizePortrait(...args); };
const make = () => { assert.equal(typeof mod.createPortraitSession, 'function'); return mod.createPortraitSession(); };
const answer = (action = {actor:'model',kind:'relax_shoulders'}) => ({
  observation:{people:1,visible:['face','eyes','shoulders','hands','body','feet'],scene:[{id:'wall',detail:'画面右侧的砖墙'}]},
  plan:{title:'沿砖墙拍自然半身',why:'砖墙线条带出纵深',uses:['wall']},
  status:'adjust',action:action ? {evidence:'画面中肩部和脸部都清楚可见',check:'调整后检查相关部位是否更自然',...action} : null,progress:{state:'uncertain',evidence:''},
  readiness:{face:true,pose:false,composition:true},score:8,
});

test('an excellent composition does not override a model pose adjustment',()=>{
  const r=normalize(answer()); assert.equal(r.status,'adjust'); assert.match(r.hint,/模特.*肩/); assert.equal(r.actor,'model');
});
test('camera pan direction is computed from coordinates instead of model prose',()=>{
  const r=normalize(answer({actor:'photographer',kind:'camera_pan',at:{x:.9,y:.5},target:{x:.5,y:.5},instruction:'向左'}));
  assert.match(r.hint,/摄影师.*向右/); assert.equal(r.move,'right');
});
test('camera height and camera tilt have different executable instructions',()=>{
  const a=normalize(answer({actor:'photographer',kind:'camera_height',direction:'down'}));
  const b=normalize(answer({actor:'photographer',kind:'camera_tilt',direction:'down'}));
  assert.match(a.hint,/位置.*降低/); assert.match(b.hint,/镜头.*下压/); assert.notEqual(a.hint,b.hint);
});

const clearanceAnswer=(layer='foreground',bounds={left:.43,top:.12,right:.57,bottom:.34})=>{
  const raw=answer({actor:'photographer',kind:'camera_clearance',reference:'flower',direction:'up'});
  raw.plan.uses=['flower'];raw.observation.headBounds={left:.4,top:.3,right:.6,bottom:.6};
  raw.observation.scene=[{id:'flower',kind:'plant',detail:'前景粉色花枝'}];
  raw.observation.overlaps=[{reference:'flower',part:'hair',layer,bounds}];return raw;
};
test('head clearance derives physical camera height from observed layers, ignoring director direction',()=>{
  const r=normalize(clearanceAnswer());assert.equal(r.status,'adjust');assert.equal(r.action.direction,'down');
  assert.equal(r.plan.focus,'head_clearance');assert.equal(r.plan.clearanceTarget,'flower');
  assert.match(r.hint,/位置.*降低/);assert.doesNotMatch(r.hint,/下压|花束.*抬/);
  assert.equal(normalize(clearanceAnswer('background')).action.direction,'up');
  const side=normalize(clearanceAnswer('foreground',{left:.52,top:.36,right:.78,bottom:.53}));
  assert.equal(side.action.direction,'left');assert.match(side.hint,/左边.*挪动机位/);
});
test('head clearance does not invent depth, bounds or an unknown obstacle',()=>{
  const raw=clearanceAnswer('unknown');assert.ok(normalize(raw).issues.includes('clearance_depth_unknown'));
  raw.observation.overlaps[0].layer='foreground';delete raw.observation.headBounds;
  assert.ok(normalize(raw).issues.includes('clearance_observation_missing'));
  const other=clearanceAnswer();other.action.reference='missing';assert.notEqual(normalize(other).status,'adjust');
});
test('a pending head clearance rejects unrelated model actions and premature ready',()=>{
  const raw=clearanceAnswer();raw.plan.focus='head_clearance';raw.plan.clearanceTarget='flower';
  raw.action={actor:'model',kind:'relax_expression',evidence:'脸可见',check:'神态更自然'};
  assert.ok(normalize(raw).issues.includes('clearance_action_mismatch'));
  raw.action=null;raw.status='ready';raw.readiness.pose=true;
  assert.ok(normalize(raw).issues.includes('clearance_not_reached'));
});
test('head clearance target and focus stay locked while the overlap remains',()=>{
  for(const change of ['focus','target']){
    const s=make(),raw=clearanceAnswer(),a=s.begin('a','same');const first=s.accept(raw,'a',a.token);
    assert.equal(first.status,'adjust');
    const next=clearanceAnswer();next.plan={...first.plan};
    if(change==='focus'){next.plan.focus='pose';delete next.plan.clearanceTarget;}else next.plan.clearanceTarget='other';
    next.action={actor:'model',kind:'relax_expression',evidence:'脸可见',check:'神态更自然'};
    const b=s.begin('b','same');assert.ok(s.accept(next,'b',b.token).issues.includes('unsolicited_plan_change'));
  }
});
test('verified separation permits the next model step even when the obstacle leaves the frame',()=>{
  const s=make(),raw=clearanceAnswer(),a=s.begin('a','same'),first=s.accept(raw,'a',a.token);
  const next=clearanceAnswer();next.plan={...first.plan};next.observation.overlaps=[];next.observation.scene=[];
  next.action={actor:'model',kind:'gaze',direction:'camera',evidence:'双眼可见',check:'目光看向镜头'};
  const b=s.begin('b','same'),r=s.accept(next,'b',b.token);assert.equal(r.status,'adjust');assert.equal(r.plan.focus,'pose');
  assert.deepEqual(r.plan.uses,[]);
  const done=structuredClone(next);done.plan={...r.plan};done.status='ready';done.action=null;done.readiness.pose=true;
  const c=s.begin('c','same');assert.equal(s.accept(done,'c',c.token).status,'ready');
});

test('contradictory claimed overlap and disjoint bounds cannot prove readiness',()=>{
  const raw=clearanceAnswer('foreground',{left:.7,top:.1,right:.9,bottom:.2});
  raw.plan.focus='head_clearance';raw.plan.clearanceTarget='flower';raw.status='ready';raw.action=null;raw.readiness.pose=true;
  assert.ok(normalize(raw).issues.includes('clearance_observation_conflict'));
});

test('the director may remove only a verified off-frame clearance reference from plan uses',()=>{
  for(const status of ['adjust','ready']){
    const s=make(),raw=clearanceAnswer(),a=s.begin('a','same'),first=s.accept(raw,'a',a.token);
    const next=clearanceAnswer();next.plan={...first.plan,focus:'pose',uses:[]};next.status=status;
    next.observation.overlaps=[];next.observation.scene=[];next.readiness.pose=true;
    next.action=status==='ready'?null:{actor:'model',kind:'relax_expression',evidence:'脸清楚',check:'神态自然'};
    const b=s.begin('b','same');assert.equal(s.accept(next,'b',b.token).status,status);
  }
});

test('unidentified overlap references cannot be mistaken for a cleared target',()=>{
  for(const reference of ['', 'missing', 'not valid', null]){
    const s=make(),raw=clearanceAnswer(),a=s.begin('a','same'),first=s.accept(raw,'a',a.token);
    const next=clearanceAnswer();next.plan={...first.plan};next.status='ready';next.action=null;next.readiness.pose=true;
    next.observation.scene=[];next.observation.overlaps[0].reference=reference;
    const b=s.begin('b','same'),r=s.accept(next,'b',b.token);assert.notEqual(r.status,'ready');
  }
});

test('gaze room uses observed screen direction, never a contradictory model target',()=>{
  for(const [gazeScreen,x,want,move] of [['left',.39,.62,'left'],['right',.61,.38,'right']]) {
    const raw=answer({actor:'photographer',kind:'camera_reframe',goal:'gaze_room',at:{x:.5,y:.5},target:{x:1-want,y:.8}});
    raw.observation.faceCenter={x,y:.4};raw.observation.gazeScreen=gazeScreen;
    const r=normalize(raw);assert.equal(r.status,'adjust');assert.equal(r.move,move);assert.equal(r.action.target.x,want);assert.equal(r.action.target.y,.4);
    assert.match(r.hint,/位置不动/);assert.match(r.hint,/视线/);
  }
});

test('gaze room never recenters an already well placed face in the wrong direction',()=>{
  const raw=answer({actor:'photographer',kind:'camera_reframe',goal:'gaze_room'});
  raw.observation.faceCenter={x:.8,y:.4};raw.observation.gazeScreen='left';
  const r=normalize(raw);assert.notEqual(r.status,'adjust');assert.ok(r.issues.includes('reframe_already_met'));
});

test('a reframe can use its selected plan focus without duplicating goal in the action',()=>{
  const raw=answer({actor:'photographer',kind:'camera_reframe'});raw.plan.focus='gaze_room';
  raw.observation.faceCenter={x:.3,y:.4};raw.observation.gazeScreen='left';
  const r=normalize(raw);assert.equal(r.status,'adjust');assert.equal(r.move,'left');assert.equal(r.action.goal,'gaze_room');
});

test('a reframe cannot hide its goal behind a pose focus or an omitted session stage',()=>{
  const raw=answer({actor:'photographer',kind:'camera_reframe',goal:'headroom'});
  raw.observation.faceCenter={x:.5,y:.55};raw.observation.headTop=.28;raw.plan.focus='pose';
  assert.ok(normalize(raw).issues.includes('reframe_action_mismatch'));
  delete raw.plan.focus;
  const r=normalize(raw);assert.equal(r.status,'adjust');assert.equal(r.plan.focus,'headroom');
});

test('unobserved gaze or face position cannot produce a reframe direction',()=>{
  const raw=answer({actor:'photographer',kind:'camera_reframe',goal:'gaze_room'});
  raw.observation.faceCenter={x:.4,y:.4};raw.observation.gazeScreen='unknown';
  assert.ok(normalize(raw).issues.includes('reframe_observation_missing'));raw.observation.gazeScreen='left';raw.observation.faceCenter={x:-.1,y:.4};
  assert.ok(normalize(raw).issues.includes('reframe_observation_missing'));
});

test('reducing headroom tilts down from observed anchors instead of lowering camera position',()=>{
  const raw=answer({actor:'photographer',kind:'camera_reframe',goal:'headroom'});
  raw.observation.faceCenter={x:.55,y:.5};raw.observation.headTop=.34;
  const r=normalize(raw);assert.equal(r.status,'adjust');assert.equal(r.move,'lower');assert.ok(r.action.target.y<.5);
  assert.equal(r.action.target.x,.55);assert.match(r.hint,/位置不动.*下压/);
});

test('a framing goal rejects walking or changing camera height as a substitute',()=>{
  for(const kind of ['camera_height','camera_orbit']) {
    const raw=answer({actor:'photographer',kind,direction:kind==='camera_height'?'down':'right'});raw.plan.focus='headroom';
    const r=normalize(raw);assert.equal(r.status,'need_view');assert.ok(r.issues.includes('reframe_action_mismatch'));
  }
});

test('headroom anchors must be valid and do not force a cut when little space remains',()=>{
  const raw=answer({actor:'photographer',kind:'camera_reframe',goal:'headroom'});raw.observation.faceCenter={x:.5,y:.4};
  for(const headTop of [undefined,-.1,.5]) {raw.observation.headTop=headTop;assert.equal(normalize(raw).status,'need_view');}
  raw.observation.headTop=.08;assert.ok(normalize(raw).issues.includes('reframe_already_met'));
});

test('ready cannot claim a selected framing goal is reached when observed anchors disagree',()=>{
  const raw=answer(null);raw.status='ready';raw.readiness.pose=true;raw.plan.focus='gaze_room';
  raw.observation.faceCenter={x:.3,y:.4};raw.observation.gazeScreen='left';
  assert.ok(normalize(raw).issues.includes('reframe_not_reached'));
  raw.observation.faceCenter.x=.7;assert.equal(normalize(raw).status,'ready');
});

test('the active framing focus cannot be changed or removed to bypass its goal',()=>{
  for(const focus of ['other',undefined]) {
    const s=make(),raw=answer({actor:'photographer',kind:'camera_reframe',goal:'gaze_room'});
    raw.plan.focus='gaze_room';raw.observation.faceCenter={x:.3,y:.4};raw.observation.gazeScreen='left';
    const a=s.begin('a','same');assert.equal(s.accept(raw,'a',a.token).status,'adjust');
    const next=structuredClone(raw);next.plan.focus=focus;next.status='ready';next.action=null;next.readiness.pose=true;
    const b=s.begin('b','same'),r=s.accept(next,'b',b.token);
    assert.equal(r.status,'pause');assert.ok(r.issues.includes('unsolicited_plan_change'));
  }
});

test('once framing is met the same plan can proceed to a model expression adjustment',()=>{
  const raw=answer({actor:'model',kind:'relax_expression'});raw.plan.focus='gaze_room';
  raw.observation.faceCenter={x:.7,y:.4};raw.observation.gazeScreen='left';
  assert.equal(normalize(raw).status,'adjust');raw.observation.faceCenter.x=.3;
  assert.ok(normalize(raw).issues.includes('reframe_action_mismatch'));
});

test('a met framing stage can advance its focus, then accept a new gaze without a false framing failure',()=>{
  const s=make(),first=answer({actor:'photographer',kind:'camera_reframe',goal:'gaze_room'});
  first.plan.focus='gaze_room';first.observation.faceCenter={x:.3,y:.4};first.observation.gazeScreen='left';
  const a=s.begin('a','same');s.accept(first,'a',a.token);
  const next=answer({actor:'model',kind:'relax_expression'});next.plan.focus='pose';next.observation.faceCenter={x:.7,y:.4};next.observation.gazeScreen='left';
  const b=s.begin('b','same');assert.equal(s.accept(next,'b',b.token).status,'adjust');
  const done=structuredClone(next);done.status='ready';done.action=null;done.readiness.pose=true;done.observation.gazeScreen='camera';
  const c=s.begin('c','same');assert.equal(s.accept(done,'c',c.token).status,'ready');
});

test('a model action after met framing automatically advances the stage even if the director retains the old focus',()=>{
  const s=make(),raw=answer({actor:'model',kind:'gaze',direction:'camera'});raw.plan.focus='gaze_room';
  raw.observation.faceCenter={x:.7,y:.4};raw.observation.gazeScreen='left';
  const a=s.begin('a','same'),r=s.accept(raw,'a',a.token);assert.equal(r.status,'adjust');assert.equal(r.plan.focus,'pose');
  const next=structuredClone(raw);next.plan.focus='pose';next.observation.gazeScreen='camera';next.status='ready';next.action=null;next.readiness.pose=true;
  const b=s.begin('b','same');assert.equal(s.accept(next,'b',b.token).status,'ready');
});
test('model left and right always state the model-own reference',()=>{
  const r=normalize(answer({actor:'model',kind:'turn_body',direction:'left'})); assert.match(r.hint,/模特.*自己的左/);
});
test('an action targeting an invisible body part requests a view instead',()=>{
  const raw=answer({actor:'model',kind:'shift_weight',direction:'left'});raw.observation.visible=['face','shoulders'];
  const r=normalize(raw);assert.equal(r.status,'need_view');assert.doesNotMatch(r.hint,/重心.*左/);
});
test('an unknown prop cannot be used by either action or plan',()=>{
  const raw=answer({actor:'model',kind:'hold_object',reference:'cup'}); raw.plan.uses=['cup'];
  const r=normalize(raw);assert.equal(r.status,'need_view');assert.equal(r.plan,null);
});
test('no person or multiple people do not silently receive single-person poses',()=>{
  for(const people of [0,2]) { const raw=answer();raw.observation.people=people;assert.equal(normalize(raw).status,'need_view'); }
});
test('ready requires explicit face, pose and composition readiness',()=>{
  const raw=answer(null);raw.status='ready';assert.notEqual(normalize(raw).status,'ready');
  raw.readiness.pose=true;assert.equal(normalize(raw).status,'ready');
});
test('a claimed improvement cannot survive without an actual earlier frame',()=>{
  const raw=answer();raw.progress={state:'improved',evidence:'肩膀放松了'};
  assert.equal(normalize(raw,{hasPrevious:false}).progress.state,'uncertain');
  assert.equal(normalize(raw,{hasPrevious:true}).progress.state,'improved');
});
test('unsupported action codes and wrong actors fail closed',()=>{
  assert.equal(normalize(answer({actor:'model',kind:'camera_height',direction:'up'})).status,'need_view');
  assert.equal(normalize(answer({actor:'photographer',kind:'invented'})).status,'need_view');
  for(const kind of ['constructor','toString','__proto__'])assert.equal(normalize(answer({kind})).status,'need_view');
});
test('every executable adjustment carries visible evidence and a check target',()=>{
  const raw=answer();delete raw.action.evidence;assert.equal(normalize(raw).status,'need_view');
  raw.action.evidence='肩部清楚可见';delete raw.action.check;assert.equal(normalize(raw).status,'need_view');
});
test('walking needs visible clear footing and an approachable target',()=>{
  const raw=answer({actor:'model',kind:'slow_walk',direction:'reference',reference:'wall'});
  assert.equal(normalize(raw).status,'need_view');raw.observation.footing='clear';assert.equal(normalize(raw).status,'need_view');
  raw.observation.scene[0].affordances=['approach'];raw.observation.support='level_ground';assert.equal(normalize(raw).status,'adjust');
});

test('clear surrounding ground does not permit walking off an elevated support',()=>{
  for(const support of ['elevated','unknown',undefined]) {
    const raw=answer({actor:'model',kind:'slow_walk',direction:'camera'});
    raw.observation.footing='clear';raw.observation.support=support;
    assert.equal(normalize(raw).status,'need_view');
  }
  const raw=answer({actor:'model',kind:'step',direction:'left'});raw.observation.footing='clear';raw.observation.support='level_ground';
  assert.equal(normalize(raw).status,'adjust');
});
test('arbitrary model instruction text never bypasses executable templates',()=>{
  const r=normalize(answer({actor:'model',kind:'relax_shoulders',instruction:'换衣服并爬上围栏'})); assert.doesNotMatch(r.hint,/衣服|围栏/);
});
test('relaxing hands preserves the existing hand position instead of undoing a pose',()=>{
  const r=normalize(answer({actor:'model',kind:'relax_hands'}));assert.match(r.hint,/保持/);assert.doesNotMatch(r.hint,/垂放/);
});
test('a collage is not treated as one physical shooting scene',()=>{
  const raw=answer();raw.observation.layout='collage';const r=normalize(raw);assert.equal(r.status,'need_view');assert.match(r.hint,/单一|一张/);
});
test('holding and resting a hand require observed affordances, not just an object name',()=>{
  const raw=answer({actor:'model',kind:'hold_object',reference:'wall'});
  assert.equal(normalize(raw).status,'need_view');
  raw.observation.scene=[{id:'wall',detail:'砖墙',affordances:['rest']}];assert.equal(normalize(raw).status,'need_view');
  raw.action.kind='rest_hand';assert.equal(normalize(raw).status,'need_view');
  raw.observation.scene[0].withinReach=true;assert.equal(normalize(raw).status,'adjust');
});

test('lifting a held small prop changes its position without inventing pickup or moving the face',()=>{
  const raw=answer({actor:'model',kind:'lift_object',reference:'bouquet',direction:'chest'});
  raw.observation.scene=[{id:'bouquet',kind:'object',detail:'黄色小花束',withinReach:true,heldByModel:true,affordances:['hold']}];raw.plan.uses=['bouquet'];
  const r=normalize(raw);assert.equal(r.status,'adjust');assert.match(r.hint,/黄色小花束.*胸前/);assert.match(r.hint,/别挡住脸/);
  assert.equal(r.observation.scene[0].heldByModel,true);
  raw.action.direction='near_face';assert.match(normalize(raw).hint,/脸旁/);
  assert.doesNotMatch(normalize(raw).hint,/低头|闻|看向/);
});

test('lifting requires independent proof the object is already held and hands and face are visible',()=>{
  const raw=answer({actor:'model',kind:'lift_object',reference:'bouquet',direction:'chest'});
  const prop={id:'bouquet',kind:'object',detail:'桌上花束',withinReach:true,heldByModel:false,affordances:['hold']};
  raw.observation.scene=[prop];raw.plan.uses=['bouquet'];
  assert.ok(normalize(raw).issues.includes('object_not_held'));
  prop.heldByModel=true;prop.affordances=[];assert.equal(normalize(raw).status,'need_view');
  prop.affordances=['hold'];prop.kind='surface';assert.equal(normalize(raw).status,'need_view');
  prop.kind='object';raw.observation.visible=['face','body'];assert.ok(normalize(raw).issues.includes('body_part_not_visible'));
  raw.observation.visible=['hands','body'];assert.ok(normalize(raw).issues.includes('body_part_not_visible'));
  raw.observation.visible=['face','hands'];raw.action.direction='overhead';assert.ok(normalize(raw).issues.includes('invalid_direction'));
});
test('a visible reference wins over ambiguous model-own left/right',()=>{
  const r=normalize(answer({actor:'model',kind:'turn_face',direction:'left',reference:'wall'}));
  assert.match(r.hint,/转向.*砖墙/);assert.doesNotMatch(r.hint,/自己的左/);
});

test('a backdrop behind the model is not an executable gaze target',()=>{
  const raw=answer({actor:'model',kind:'gaze',direction:'reference',reference:'wall'});
  raw.observation.scene[0].kind='backdrop';raw.observation.scene[0].affordances=['look'];
  assert.equal(normalize(raw).status,'need_view');
});
test('standing on grass does not make the ground reachable by hand',()=>{
  const raw=answer({actor:'model',kind:'rest_hand',reference:'ground'});raw.observation.posture='standing';
  raw.observation.scene=[{id:'ground',detail:'脚下草坡',kind:'ground',withinReach:true,affordances:['rest']}];raw.plan.uses=['ground'];
  assert.equal(normalize(raw).status,'need_view');
});
test('ready requires the planned framing and a readable face',()=>{
  const raw=answer(null);raw.status='ready';raw.readiness.pose=true;raw.plan.framing='half';raw.observation.framing='environmental';
  assert.equal(normalize(raw).status,'need_view');raw.observation.framing='half';raw.observation.faceDetail='small';
  assert.equal(normalize(raw).status,'need_view');raw.observation.faceDetail='clear';assert.equal(normalize(raw).status,'ready');
});
test('sitting needs a nearby seat, clear footing and visible body and feet',()=>{
  const raw=answer({actor:'model',kind:'sit',reference:'chair'});raw.observation.scene=[{id:'chair',detail:'旁边长椅',kind:'seat',withinReach:true,affordances:['sit']}];raw.plan.uses=['chair'];
  assert.equal(normalize(raw).status,'need_view');raw.observation.footing='clear';assert.equal(normalize(raw).status,'adjust');
  raw.observation.scene[0].kind='ground';assert.equal(normalize(raw).status,'need_view');
});
test('a portrait session supplies bounded prior image and rejects stale results',()=>{
  const s=make(), a=s.begin('frame-a','rear/4:3');assert.equal(a.previous,null);assert.ok(s.accept(answer(),'frame-a',a.token));
  const b=s.begin('frame-b','rear/4:3');assert.equal(b.previous,'frame-a');
  s.reset();assert.equal(s.accept(answer(),'frame-b',b.token),null);assert.equal(s.begin('frame-c','rear/4:3').previous,null);
});
test('new ideas retain used plans while clearing prior-frame comparisons',()=>{
  const s=make(),a=s.begin('a','same');s.accept(answer(),'a',a.token);s.newIdea();const b=s.begin('b','same');
  assert.equal(b.previous,null);assert.ok(b.context.usedPlans.includes('沿砖墙拍自然半身'));assert.equal(b.context.idea,1);
});
test('active plan cannot silently change between guidance steps',()=>{
  const s=make(),a=s.begin('a','same');s.accept(answer(),'a',a.token);const b=s.begin('b','same');
  const raw=answer();raw.plan.title='换一种完全不同的主题';const r=s.accept(raw,'b',b.token);
  assert.equal(r.plan.title,'沿砖墙拍自然半身');assert.equal(r.status,'pause');assert.ok(r.issues.includes('unsolicited_plan_change'));
});
test('keeping the title does not permit changing an active plans scene references',()=>{
  const s=make(),a=s.begin('a','same');s.accept(answer(),'a',a.token);const b=s.begin('b','same');const raw=answer();
  raw.observation.scene.push({id:'tree',detail:'树干'});raw.plan.uses=['tree'];
  const r=s.accept(raw,'b',b.token);assert.equal(r.status,'pause');assert.deepEqual(r.plan.uses,['wall']);
});
test('different pans are distinct actions rather than three identical unresolved steps',()=>{
  const s=make();for(const [i,target] of [{x:.1,y:.5},{x:.9,y:.5},{x:.5,y:.1}].entries()){
    const b=s.begin(String(i),'same');const r=s.accept(answer({actor:'photographer',kind:'camera_pan',at:{x:.5,y:.5},target}),String(i),b.token);
    assert.equal(r.status,'adjust');assert.deepEqual(r.action.target,target);
  }
});
test('camera geometry changes clear comparisons and stale requests',()=>{
  const s=make(),a=s.begin('a','4:3');s.accept(answer(),'a',a.token);const b=s.begin('b','16:9');
  assert.equal(b.previous,null);assert.equal(s.accept(answer(),'late',a.token),null);
});
test('shooting pauses automatic coaching until an explicit new idea',()=>{
  const s=make(),a=s.begin('a','same');s.accept(answer(),'a',a.token);s.markShot();assert.equal(s.canAuto(),false);assert.equal(s.snapshot().phase,'shot');
  s.newIdea();assert.equal(s.canAuto(),true);
});
test('errors pause the session without falsely recording a photo',()=>{
  const s=make(),a=s.begin('a','same');assert.equal(typeof s.pause,'function');s.pause();
  assert.equal(s.snapshot().phase,'pause');assert.equal(s.canAuto(),false);assert.equal(s.accept(answer(),'a',a.token),null);
});
test('repeating the same unresolved action yields a pause rather than a false success',()=>{
  const s=make();for(let i=0;i<3;i++){const a=s.begin(String(i),'same');s.accept(answer(),String(i),a.token);}
  assert.equal(s.snapshot().result.status,'pause');assert.equal(s.canAuto(),false);assert.doesNotMatch(s.snapshot().result.hint,/已经改善|很好.*完成/);
});
test('paraphrasing evidence cannot evade repeated-action pause',()=>{
  const s=make();for(let i=0;i<3;i++){const a=s.begin(String(i),'same');const raw=answer();raw.action.evidence+=' '+i;raw.action.check+=' '+i;s.accept(raw,String(i),a.token);}
  assert.equal(s.snapshot().result.status,'pause');
});
