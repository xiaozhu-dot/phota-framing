import {createHash} from 'node:crypto';
import {resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
export function researchPhotoPath(file,root=fileURLToPath(new URL('./',import.meta.url))) {
  if(typeof file!=='string'||!file||file.includes('\0'))throw Error('Invalid research photo path');
  const target=resolve(root,file);
  if(!target.startsWith(join(root,'photos','portrait')+sep))throw Error('Input is outside the research photo directory');
  return target;
}
export function imageMime(bytes) {
  if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpeg';
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'webp';
  throw Error('Evaluation input is not a supported image');
}
export function inputIdentity(bytes,context,profile) {
  return {
    inputHash:createHash('sha256').update(bytes).update('\0').update(JSON.stringify(profile)).digest('hex'),
    contextHash:createHash('sha256').update(JSON.stringify(context)).digest('hex'),
  };
}
export function assertSameInput(record,identity) {
  if(!record.inputHash||!record.contextHash)throw Error('Input identity unavailable: choose a new tag to preserve legacy evidence');
  if(record.inputHash!==identity.inputHash)throw Error('Input changed: choose a new tag to preserve earlier evidence');
  if(record.contextHash!==identity.contextHash)throw Error('Context changed: choose a new tag to preserve earlier evidence');
}
export function captureProfile(profile) {
  if(profile?.kind==='original')return {kind:'original'};
  const fields=['kind','ratio','maxSide','quality','zoom','quarter','simFilter','cameraHash','visionHash'];
  if(profile?.kind!=='app-camera-1024-jpeg086-v1'||fields.some(k=>profile[k]===undefined))
    throw Error('Capture identity unavailable: choose a new tag to preserve legacy evidence');
  return Object.fromEntries(fields.map(k=>[k,profile[k]]));
}
export function assertCaptureProfile(records,requested) {
  const expected=JSON.stringify(captureProfile(requested));
  for(const record of records)if(JSON.stringify(captureProfile(record.inputProfile))!==expected)
    throw Error('Capture profile changed: choose a new tag to preserve earlier evidence');
}
