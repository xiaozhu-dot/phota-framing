import test from 'node:test';
import assert from 'node:assert/strict';
const mod=await import('../mobile/src/portrait-parallax.js').catch(()=>({}));
const solve=(...args)=>{assert.equal(typeof mod.clearanceFor,'function');return mod.clearanceFor(...args);};
const head={left:.4,top:.3,right:.6,bottom:.6};
const cases=[
  [{left:.52,top:.36,right:.78,bottom:.53},'left','right'],
  [{left:.21,top:.36,right:.46,bottom:.53},'right','left'],
  [{left:.43,top:.12,right:.57,bottom:.34},'down','up'],
  [{left:.43,top:.56,right:.57,bottom:.83},'up','down'],
];
test('foreground and background require opposite camera directions on all four sides',()=>{
  for(const [bounds,foreground,background]of cases){
    assert.equal(solve(head,bounds,'foreground').direction,foreground);
    assert.equal(solve(head,bounds,'background').direction,background);
  }
});
test('computed direction separates projected rectangles at varied real depths',()=>{
  // Independent oracle: build 3D corners, move a pinhole camera, and project
  // again. Distances are synthetic test facts, never inferred from a photo.
  for(const [box]of cases)for(const layer of ['foreground','background'])for(const zHead of [3,5,9])for(const factor of [1.4,2,4]){
    const zOther=layer==='foreground'?zHead/factor:zHead*factor;
    const r=solve(head,box,layer);assert.equal(r.issue,undefined);
    const horizontal=['left','right'].includes(r.direction);
    const sign=['right','down'].includes(r.direction)?1:-1;
    const cameraDelta=sign*(Math.abs(r.relativeShift.x||r.relativeShift.y)+.001)/Math.abs(1/zHead-1/zOther);
    const project=(b,z)=>{
      const corners=[[b.left*z,b.top*z],[b.right*z,b.bottom*z]].map(([x,y])=>[(x-(horizontal?cameraDelta:0))/z,(y-(horizontal?0:cameraDelta))/z]);
      return {left:corners[0][0],top:corners[0][1],right:corners[1][0],bottom:corners[1][1]};
    };
    const a=project(head,zHead),b=project(box,zOther);
    assert.ok(Math.min(a.right,b.right)<=Math.max(a.left,b.left)||Math.min(a.bottom,b.bottom)<=Math.max(a.top,b.top));
    const wrong=(b,z)=>({left:b.left+(horizontal?cameraDelta/z:0),right:b.right+(horizontal?cameraDelta/z:0),top:b.top+(horizontal?0:cameraDelta/z),bottom:b.bottom+(horizontal?0:cameraDelta/z)});
    const wa=wrong(head,zHead),wb=wrong(box,zOther);
    const before=Math.max(0,Math.min(head.right,box.right)-Math.max(head.left,box.left))*Math.max(0,Math.min(head.bottom,box.bottom)-Math.max(head.top,box.top));
    const after=Math.max(0,Math.min(wa.right,wb.right)-Math.max(wa.left,wb.left))*Math.max(0,Math.min(wa.bottom,wb.bottom)-Math.max(wa.top,wb.top));
    assert.ok(after>before,'Opposite small displacement increases the tested overlap');
  }
});
test('unknown depth never produces a camera direction',()=>{
  for(const layer of ['unknown',undefined,'same_plane','Foreground'])assert.equal(solve(head,cases[0][0],layer).issue,'clearance_depth_unknown');
});
test('nonoverlapping and just touching boxes do not generate an adjustment',()=>{
  for(const box of [{left:.61,top:.3,right:.8,bottom:.5},{left:.6,top:.3,right:.8,bottom:.5}])assert.equal(solve(head,box,'foreground').issue,'clearance_already_met');
});
test('missing, inverted, degenerate or nonfinite normalized boxes fail closed',()=>{
  for(const box of [null,{}, {...head,left:-.1},{...head,right:Infinity},{...head,top:.7},{...head,left:.6},{...head,top:'0.3'}]){
    assert.equal(solve(box,head,'foreground').issue,'clearance_observation_missing');
    assert.equal(solve(head,box,'foreground').issue,'clearance_observation_missing');
  }
});
