// Fixed-orientation pinhole translation: relative screen motion is
// C * (1/Z_head - 1/Z_obstacle). Only the sign is used; no metric depth or
// movement distance is inferred. Rectangles are approximate observed bounds.
export const validBounds = b => b && ['left','top','right','bottom'].every(k=>
  typeof b[k]==='number' && Number.isFinite(b[k]) && b[k]>=0 && b[k]<=1) &&
  b.left<b.right && b.top<b.bottom;

export function clearanceFor(head, obstacle, layer) {
  if(!validBounds(head)||!validBounds(obstacle))return {issue:'clearance_observation_missing'};
  if(Math.min(head.right,obstacle.right)<=Math.max(head.left,obstacle.left) ||
    Math.min(head.bottom,obstacle.bottom)<=Math.max(head.top,obstacle.top))
    return {issue:'clearance_already_met'};
  if(!['foreground','background'].includes(layer))return {issue:'clearance_depth_unknown'};
  const margin=.012;
  // A screen-space heuristic, not the shortest physical camera movement.
  // Prefer a vertical probe in exact ties; every candidate separates boxes.
  const shifts=[
    {x:0,y:head.top-obstacle.bottom-margin},
    {x:0,y:head.bottom-obstacle.top+margin},
    {x:head.left-obstacle.right-margin,y:0},
    {x:head.right-obstacle.left+margin,y:0},
  ].sort((a,b)=>(Math.abs(a.x)+Math.abs(a.y))-(Math.abs(b.x)+Math.abs(b.y)));
  const relativeShift=shifts[0],sign=layer==='foreground'?-1:1;
  const dx=relativeShift.x*sign,dy=relativeShift.y*sign;
  return {direction:dx?(dx<0?'left':'right'):(dy<0?'up':'down'),relativeShift,
    axis:dx?'horizontal':'vertical',layer};
}
