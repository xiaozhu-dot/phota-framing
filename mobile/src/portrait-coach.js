// 出片的动作协议和会话。只执行受支持动作，不把模型自由文案当作方向指令。
import { panFor } from './coach-logic.js';
import {clearanceFor,validBounds} from './portrait-parallax.js';

const text = (v, n = 80) => typeof v === 'string' ? v.replace(/[\x00-\x1f]/g, ' ').trim().slice(0, n) : '';
const point = p => p && typeof p.x === 'number' && typeof p.y === 'number' &&
  Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
const ownDirection = d => d === 'left' ? '自己的左边' : d === 'right' ? '自己的右边' : null;
const framingGoals = new Set(['gaze_room','headroom']);
function observedClearance(o,reference) {
  const validReference=r=>typeof r==='string'&&/^[a-z][a-z0-9_]{0,23}$/i.test(r);
  const sceneIds=new Set((Array.isArray(o.scene)?o.scene:[]).filter(r=>r&&validReference(r.id)&&text(r.detail,36)).map(r=>r.id));
  if(!validReference(reference)||!validBounds(o.headBounds)||!Array.isArray(o.overlaps) ||
    o.overlaps.some(r=>!r||!validReference(r.reference)||!sceneIds.has(r.reference)))return {issue:'clearance_observation_missing'};
  const matches=o.overlaps.filter(r=>r.reference===reference);
  if(!matches.length)return {issue:'clearance_already_met'};
  if(matches.length!==1||!['hair','face'].includes(matches[0].part))return {issue:'clearance_observation_missing'};
  const r=matches[0],result=clearanceFor(o.headBounds,r.bounds,r.layer);
  if(result.issue==='clearance_already_met')return {issue:'clearance_observation_conflict'};
  return {...result,part:r.part};
}
// Framing intent -> target geometry. The director cannot supply the direction
// or invert the target; anchors come from the independent current-frame observer.
function reframeFor(o, goal, visible) {
  if (!framingGoals.has(goal)) return {issue:'invalid_reframe_goal'};
  if (!point(o.faceCenter)) return {issue:'reframe_observation_missing'};
  const at={...o.faceCenter}, target={...at};
  if (goal === 'gaze_room') {
    if (!visible.has('eyes') || !['left','right'].includes(o.gazeScreen)) return {issue:'reframe_observation_missing'};
    target.x=o.gazeScreen==='left'?Math.max(at.x,.62):Math.min(at.x,.38);
  } else {
    if (typeof o.headTop!=='number' || !Number.isFinite(o.headTop) || o.headTop<0 || o.headTop>=at.y) return {issue:'reframe_observation_missing'};
    if (o.headTop<=.18) return {issue:'reframe_already_met'};
    target.y=Math.max(.12,at.y-(o.headTop-.12));
  }
  const move=panFor(at,target);
  if (!move) return {issue:'reframe_already_met'};
  return {at,target,move,goal,
    evidence:goal==='gaze_room'?`视线朝画面${o.gazeScreen==='left'?'左':'右'}侧，先调整视线前的空间`:'当前头顶留空较多，先调整取景边界',
    check:goal==='gaze_room'?'检查视线前方是否增加留白，脸部仍完整清楚':'检查头顶留空是否减少，头发与脸仍完整'};
}
export const PORTRAIT_ACTIONS = {
  camera_pan: { actor:'photographer', visible:[] },
  camera_reframe: { actor:'photographer', visible:['face'] },
  camera_clearance: { actor:'photographer', visible:['face'], reference:true },
  camera_height: { actor:'photographer', visible:[] },
  camera_tilt: { actor:'photographer', visible:[] },
  camera_distance: { actor:'photographer', visible:[] },
  camera_orbit: { actor:'photographer', visible:['face'] },
  turn_body: { actor:'model', visible:['body'] },
  turn_face: { actor:'model', visible:['face'] },
  gaze: { actor:'model', visible:['eyes'] },
  relax_shoulders: { actor:'model', visible:['shoulders'] },
  relax_expression: { actor:'model', visible:['face'] },
  relax_hands: { actor:'model', visible:['hands'] },
  shift_weight: { actor:'model', visible:['feet','body'] },
  hold_object: { actor:'model', visible:['hands'], reference:true },
  lift_object: { actor:'model', visible:['face','hands'], reference:true },
  rest_hand: { actor:'model', visible:['hands'], reference:true },
  step: { actor:'model', visible:['feet','body'] },
  slow_walk: { actor:'model', visible:['feet','body'] },
  sit: { actor:'model', visible:['feet','body'], reference:true },
};

export function normalizePortrait(raw, context = {}) {
  const o = raw?.observation || {};
  const visible = new Set(Array.isArray(o.visible) ? o.visible : []);
  const scene = (Array.isArray(o.scene) ? o.scene : []).slice(0, 10)
    .filter(r => r && /^[a-z][a-z0-9_]{0,23}$/i.test(r.id) && text(r.detail, 36))
    .map(r => ({id:r.id,detail:text(r.detail,36),kind:text(r.kind,20),withinReach:r.withinReach===true,heldByModel:r.heldByModel===true,affordances:Array.isArray(r.affordances)?r.affordances.filter(a=>['hold','rest','look','approach','sit'].includes(a)):[]}));
  const refs = new Map(scene.map(r => [r.id,r.detail]));
  const uses = Array.isArray(raw?.plan?.uses) ? raw.plan.uses : [];
  const plan = text(raw?.plan?.title,30) ? {title:text(raw.plan.title,30),why:text(raw.plan.why,60),uses,...(raw.plan.framing?{framing:text(raw.plan.framing,20)}:{}),...(raw.plan.focus?{focus:text(raw.plan.focus,24)}:{}),...(raw.plan.clearanceTarget?{clearanceTarget:text(raw.plan.clearanceTarget,24)}:{})} : null;
  const base = {
    status:'need_view', actor:'photographer', move:'wait', hint:'摄影师：先把一位模特放进画面，再点指导',
    plan, observation:{people:o.people,layout:o.layout || 'single',visible:[...visible],scene,
      ...(validBounds(o.headBounds)?{headBounds:{...o.headBounds}}:{}),
      ...(Array.isArray(o.overlaps)?{overlaps:o.overlaps.slice(0,10).map(r=>({reference:text(r?.reference,24),part:text(r?.part,12),layer:text(r?.layer,12),...(validBounds(r?.bounds)?{bounds:{...r.bounds}}:{})}))}:{}),
      ...(point(o.faceCenter)?{faceCenter:{...o.faceCenter}}:{}),...(o.gazeScreen?{gazeScreen:text(o.gazeScreen,12)}:{}),
      ...(Number.isFinite(o.headTop)?{headTop:o.headTop}:{})}, action:null,
    score:Number.isFinite(raw?.score) ? Math.max(0,Math.min(10,Math.round(raw.score))) : null,
    progress:context.hasPrevious && ['improved','unchanged'].includes(raw?.progress?.state) && text(raw?.progress?.evidence)
      ? {state:raw.progress.state,evidence:text(raw.progress.evidence)} : {state:'uncertain',evidence:''},
    issues:[],
  };
  const need = (issue,hint) => ({...base,status:'need_view',hint,issues:[issue]});
  if (o.layout === 'collage') return {...need('collage_input','摄影师：请给我一张单一视角的当前取景'),plan:null};
  if (o.people !== 1) return need('single_person_required',o.people > 1
    ? '摄影师：先只框进一位要拍的人，再点指导' : base.hint);
  if (!plan) return need('missing_plan','摄影师：稳住画面，再点一次指导');
  const clearedTarget=context.activePlan?.focus==='head_clearance' &&
    observedClearance(o,context.activePlan.clearanceTarget).issue==='clearance_already_met'
    ?context.activePlan.clearanceTarget:null;
  if (uses.some(id => !refs.has(id)&&id!==clearedTarget)) return {...need('unknown_plan_reference','摄影师：让我再看清周围环境，先别换姿势'),plan:null};
  if(raw.status==='adjust'&&raw.action?.kind==='camera_clearance'){
    if((plan.focus&&plan.focus!=='head_clearance') || (plan.clearanceTarget&&plan.clearanceTarget!==raw.action.reference))
      return need('clearance_action_mismatch','摄影师：先确认要避开的头部干扰物，再点指导');
    plan.focus='head_clearance';plan.clearanceTarget=raw.action.reference;
  }
  if(plan.focus==='head_clearance'&&!plan.clearanceTarget&&context.activePlan?.focus==='head_clearance')
    plan.clearanceTarget=context.activePlan.clearanceTarget;
  if (raw.status==='adjust' && raw.action?.kind==='camera_reframe' && framingGoals.has(raw.action.goal)) {
    if (plan.focus && plan.focus!==raw.action.goal)
      return need('reframe_action_mismatch','摄影师：先确认当前取景目标，再点指导');
    plan.focus=raw.action.goal;
  }
  const activeFramingPending=context.activePlan && framingGoals.has(context.activePlan.focus) &&
    reframeFor(o,context.activePlan.focus,visible).issue!=='reframe_already_met';
  const activeClearancePending=context.activePlan?.focus==='head_clearance' &&
    observedClearance(o,context.activePlan.clearanceTarget).issue!=='clearance_already_met';
  const continuousUses=list=>list.filter(id=>!(clearedTarget&&!refs.has(clearedTarget)&&id===clearedTarget)).sort();
  if (context.activePlan && (context.activePlan.title !== plan.title ||
    (activeFramingPending && context.activePlan.focus!==plan.focus) ||
    (activeClearancePending && (plan.focus!=='head_clearance'||plan.clearanceTarget!==context.activePlan.clearanceTarget)) ||
    JSON.stringify(continuousUses(context.activePlan.uses)) !== JSON.stringify(continuousUses(uses)))) return {
    ...base,plan:context.activePlan,status:'pause',hint:'先沿用当前拍法，再点指导确认下一步；想换主题请点「换个拍法」',issues:['unsolicited_plan_change'],
  };
  if (context.idea > 0 && context.usedPlans?.includes(plan.title)) return {
    ...base,status:'pause',hint:'这次拍法和上一张太接近，点「换个拍法」重新想一张',issues:['repeated_plan'],
  };
  if (raw.status === 'need_view') return need('insufficient_view',visible.has('face')
    ? '摄影师：稍微拍宽一点，让我看清模特与周围环境' : '摄影师：先让模特的脸看得清楚，再点指导');
  if (raw.status === 'ready') {
    if (!visible.has('face') || !['face','pose','composition'].every(k => raw.readiness?.[k] === true))
      return need('readiness_not_supported','摄影师：让我看清模特的脸和姿势，再确认这一张');
    if (o.faceDetail && o.faceDetail !== 'clear') return need('face_detail_not_clear','摄影师：先让模特的脸在取景里更清楚，再确认这一张');
    if (plan.framing && o.framing && plan.framing !== o.framing) return need('framing_not_reached','摄影师：当前还没到计划的景别，再点指导确认机位');
    if (framingGoals.has(plan.focus)) {
      const framing=reframeFor(o,plan.focus,visible);
      if (framing.issue!=='reframe_already_met') return need(framing.issue||'reframe_not_reached','摄影师：当前还没达到这项取景目标，先调整再确认');
    }
    if(plan.focus==='head_clearance'){
      const c=observedClearance(o,plan.clearanceTarget);
      if(c.issue!=='clearance_already_met')return need(c.issue||'clearance_not_reached','摄影师：先确认干扰物与头部是否错开，再拍');
    }
    if(clearedTarget&&!refs.has(clearedTarget))plan.uses=uses.filter(id=>id!==clearedTarget);
    return {...base,status:'ready',actor:'photographer',move:'shoot',hint:'摄影师：保持现在的机位，拍下这一张'};
  }
  if (raw.status !== 'adjust') return need('invalid_status','摄影师：稳住画面，再点一次指导');
  const a = raw.action || {}, rule = Object.hasOwn(PORTRAIT_ACTIONS,a.kind) ? PORTRAIT_ACTIONS[a.kind] : null;
  if (!rule || rule.actor !== a.actor) return need('invalid_action','摄影师：稳住画面，再点一次指导');
  if(plan.focus==='head_clearance'){
    const met=observedClearance(o,plan.clearanceTarget).issue==='clearance_already_met';
    if(a.kind==='camera_clearance'?a.reference!==plan.clearanceTarget:!(met&&a.actor==='model'))
      return need('clearance_action_mismatch','摄影师：先处理当前头部干扰，再继续姿态或道具动作');
  }
  const reframeGoal=a.goal || (framingGoals.has(plan.focus)?plan.focus:null);
  if (framingGoals.has(plan.focus)) {
    const framingMet=reframeFor(o,plan.focus,visible).issue==='reframe_already_met';
    if (a.kind==='camera_reframe' ? reframeGoal!==plan.focus : !(framingMet && a.actor==='model'))
      return need('reframe_action_mismatch','摄影师：先保持手机位置，用取景调整这一步');
  }
  if (!text(a.evidence) || !text(a.check)) return need('missing_action_evidence','摄影师：让我确认这一步的画面依据，再点指导');
  const missing = rule.visible.filter(v => !visible.has(v));
  if (missing.length) return need('body_part_not_visible','摄影师：稍微拍宽一点，让我看清要调整的部位');
  const ref = refs.get(a.reference);
  if ((rule.reference || a.reference) && !ref) return need('unknown_action_reference','摄影师：让我再看清现场可用的物件');
  const target=scene.find(r=>r.id===a.reference);
  if (a.kind === 'gaze' && a.direction === 'reference' && target?.kind === 'backdrop')
    return need('gaze_target_not_supported','摄影师：让我确认模特眼前能看向的具体位置');
  const affordance=['hold_object','lift_object'].includes(a.kind) ? 'hold' : a.kind === 'rest_hand' ? 'rest' : a.kind==='sit'?'sit':null;
  if (affordance && (!scene.find(r=>r.id===a.reference)?.affordances.includes(affordance) || !scene.find(r=>r.id===a.reference)?.withinReach))
    return need('unsupported_object_use','摄影师：先让我确认这个物件适不适合这样用');
  if (a.kind==='lift_object' && (target.kind!=='object' || !target.heldByModel))
    return need('object_not_held','摄影师：先让我确认这个小物件已经拿在模特手里');
  if (a.kind === 'rest_hand' && target?.kind === 'ground' && !['seated','lying'].includes(o.posture))
    return need('ground_not_reachable','摄影师：模特还站着，先别让手去碰脚下的地面');
  if (a.kind === 'sit' && (target?.kind !== 'seat' || o.footing !== 'clear'))
    return need('seat_not_supported','摄影师：先让我看清座位和模特脚下的位置');
  if (['step','slow_walk'].includes(a.kind) && (o.footing !== 'clear' || o.support !== 'level_ground' ||
    (a.direction === 'reference' && !scene.find(r=>r.id===a.reference)?.affordances.includes('approach'))))
    return need('footing_not_supported','摄影师：先让我看清模特脚下能走的空间');
  let instruction = '', move = 'wait', reframe=null,clearance=null;
  const own = ownDirection(a.direction);
  switch (a.kind) {
    case 'camera_clearance': {
      clearance=observedClearance(o,a.reference);
      if(clearance.issue)return need(clearance.issue,'摄影师：让我看清头部和干扰物的前后位置，再确认机位');
      instruction={down:'把手机位置稍微降低，先保持朝向',up:'把手机位置稍微升高，先保持朝向',left:'向你的左边小幅挪动机位，先保持朝向',right:'向你的右边小幅挪动机位，先保持朝向'}[clearance.direction];
      instruction+=`，再看${ref}是否与头部错开`;
      break;
    }
    case 'camera_reframe': {
      reframe=reframeFor(o,reframeGoal,visible);
      if (reframe.issue) return need(reframe.issue,reframe.issue==='reframe_already_met'
        ?'摄影师：当前这项留白已足够，再确认是否需要调整':'摄影师：让我看清脸的位置和视线方向，再确认取景');
      move=reframe.move;
      instruction={left:'手机位置不动，把镜头向左转一点',right:'手机位置不动，把镜头向右转一点',lower:'手机位置不动，把镜头稍微下压',raise:'手机位置不动，把镜头稍微上抬'}[move];
      instruction+=reframeGoal==='gaze_room'?'，给视线前方留空':'，减少头顶留空';
      break;
    }
    case 'camera_pan': {
      if (!point(a.at) || !point(a.target)) break;
      move = panFor(a.at,a.target) || 'wait';
      instruction = {left:'把画面向左转一点',right:'把画面向右转一点',raise:'把镜头向上抬一点',lower:'把镜头向下压一点',wait:'保持现在的取景位置'}[move];
      break;
    }
    case 'camera_height': instruction = {up:'把手机的位置升高一点，先保持朝向',down:'把手机的位置降低一点，先保持朝向'}[a.direction]; break;
    case 'camera_tilt': instruction = {up:'位置不动，把镜头稍微上抬',down:'位置不动，把镜头稍微下压'}[a.direction]; break;
    case 'camera_distance': instruction = {closer:'向模特走近半步',back:'离模特后退半步'}[a.direction]; break;
    case 'camera_orbit': instruction = {left:'向你的左边横走半步，镜头继续对着模特',right:'向你的右边横走半步，镜头继续对着模特'}[a.direction]; break;
    case 'turn_body': if (ref) instruction = `身体稍微侧向${ref}，脸先保持`; else if (own) instruction = `身体稍微转向${own}，脸先保持`; break;
    case 'turn_face': instruction = ref && a.direction !== 'camera' ? `脸慢慢转向${ref}` : a.direction === 'camera' ? '脸慢慢转向镜头' : own ? `脸稍微转向${own}` : ''; break;
    case 'gaze': instruction = a.direction === 'camera' ? '眼睛看向镜头' : a.direction === 'down' ? '视线轻轻放低' : a.direction === 'reference' && ref ? `视线看向${ref}` : ''; break;
    case 'relax_shoulders': instruction = '呼一口气，让肩膀自然落下来'; break;
    case 'relax_expression': instruction = '轻轻呼气，放松嘴角，先不用用力笑'; break;
    case 'relax_hands': instruction = '手指放松一点，保持现在手的位置'; break;
    case 'shift_weight': if (own) instruction = `把重心轻轻放到${own}那条腿`; break;
    case 'hold_object': instruction = `轻轻拿住${ref}，手指别攥紧`; break;
    case 'lift_object': instruction = {chest:`把${ref}轻轻抬到胸前，别挡住脸`,near_face:`把${ref}轻轻抬到脸旁，别挡住脸`}[a.direction]; break;
    case 'rest_hand': instruction = `把一只手轻放在${ref}上`; break;
    case 'step': if (own) instruction = `向${own}挪半步`; break;
    case 'slow_walk': instruction = a.direction === 'camera' ? '朝镜头慢慢走一步' : a.direction === 'reference' && ref ? `朝${ref}慢慢走一步` : ''; break;
    case 'sit': instruction = `在${ref}坐下，先保持舒服的坐姿`; break;
  }
  if (!instruction) return need('invalid_direction','摄影师：让我再看清方向，先保持现在的位置');
  // A verified framing stage is complete before an accepted model action.
  // Advance it now, since the action can legitimately change gaze next frame.
  if (a.actor==='model' && (framingGoals.has(plan.focus)||plan.focus==='head_clearance')){
    plan.focus=['hold_object','lift_object','rest_hand'].includes(a.kind)?'interaction':'pose';
    delete plan.clearanceTarget;
  }
  if(clearedTarget&&!refs.has(clearedTarget))plan.uses=uses.filter(id=>id!==clearedTarget);
  return {...base,status:'adjust',actor:a.actor,move,action:{actor:a.actor,kind:a.kind,direction:clearance?clearance.direction:['camera_pan','camera_reframe'].includes(a.kind)?move:a.direction || null,reference:reframe?null:a.reference || null,
    ...(reframe?{goal:reframe.goal,at:reframe.at,target:reframe.target,evidence:reframe.evidence,check:reframe.check}:
      clearance?{relativeShift:clearance.relativeShift,layer:clearance.layer,evidence:`${ref}与${clearance.part==='hair'?'头发轮廓':'面部'}重叠`,check:'小幅试探后复看重叠是否减轻，头发和脸是否完整'}:
      {...(a.kind==='camera_pan'?{at:{...a.at},target:{...a.target}}:{}),evidence:text(a.evidence),check:text(a.check)})},
    hint:`${a.actor === 'model' ? '模特' : '摄影师'}：${instruction}`};
}

export function createPortraitSession() {
  let revision=0, geometry=null, previous=null, result=null, activePlan=null, phase='start', idea=0, usedPlans=[], steps=[];
  const snapshot = () => ({phase,idea,usedPlans:[...usedPlans],steps:steps.slice(-6),result});
  function reset() { revision++;geometry=null;previous=null;result=null;activePlan=null;phase='start';idea=0;usedPlans=[];steps=[]; }
  function newIdea() {
    if (result?.plan && !usedPlans.includes(result.plan.title)) usedPlans.push(result.plan.title);
    usedPlans=usedPlans.slice(-8);revision++;previous=null;result=null;activePlan=null;phase='start';idea++;steps=[];
  }
  function begin(frame, key) {
    if (geometry !== key) { revision++;previous=null;result=null;activePlan=null;steps=[];phase='start';geometry=key; }
    return {token:++revision,previous,context:{...snapshot(),activePlan,hasPrevious:Boolean(previous)}};
  }
  function accept(raw,frame,token) {
    if (token !== revision) return null;
    result=normalizePortrait(raw,{hasPrevious:Boolean(previous),idea,usedPlans,activePlan});
    if (['adjust','ready'].includes(result.status)) activePlan=result.plan;
    const a=result.action;
    const key=JSON.stringify(a?{actor:a.actor,kind:a.kind,direction:a.direction,reference:a.reference,
      ...(a.kind==='camera_reframe'?{goal:a.goal}:{}),
      ...(a.kind==='camera_pan'?{at:a.at,target:a.target}:{})}:null);
    if (result.status === 'adjust' && steps.slice(-2).length === 2 && steps.slice(-2).every(s => s.key === key) && result.progress.state !== 'improved') {
      result={...result,status:'pause',hint:'这一步先停一下，可以先拍一张看看，或点「换个拍法」',issues:[...result.issues,'repeated_action']};
    }
    steps.push({key,hint:result.hint,progress:result.progress.state});steps=steps.slice(-6);
    previous=frame;phase=result.status;
    return result;
  }
  function markShot() { revision++;previous=null;phase='shot'; }
  function pause() { revision++;previous=null;phase='pause'; }
  return {begin,accept,reset,newIdea,markShot,pause,snapshot,canAuto:()=>!['ready','shot','pause','need_view'].includes(phase)};
}
