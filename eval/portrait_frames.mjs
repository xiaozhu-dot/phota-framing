// Render evaluation inputs through the actual app's camera and JPEG helpers.
// Only registered public research photos are served, on loopback, temporarily.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const option=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i<0?fallback:process.argv[i+1];};
const ids=option('cases','novice-duality,novice-blossom,novice-lighthouse').split(',');
const all=JSON.parse(await readFile(new URL('./portrait-novice-cases.json',import.meta.url),'utf8'));
if(ids.some(id=>!all.some(c=>c.id===id)))throw Error('Unknown research photo');
const cases=all.filter(c=>ids.includes(c.id));
const camera=await readFile(new URL('../mobile/src/camera.js',import.meta.url));
const vision=await readFile(new URL('../mobile/src/vision.js',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const server=createServer(async(req,res)=>{try{
  const route=new URL(req.url,'http://localhost').pathname;
  if(route==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><body></body>');return;}
  if(route==='/camera.js'||route==='/vision.js'){res.setHeader('Content-Type','text/javascript');res.end(route==='/camera.js'?camera:vision);return;}
  const c=cases.find(c=>route==='/photo/'+c.id);if(!c)throw Error('Not found');
  const file=path.resolve(root,'eval',c.file);
  if(!file.startsWith(path.join(root,'eval','photos','portrait')+path.sep))throw Error('Outside research photos');
  res.setHeader('Content-Type','image/jpeg');res.end(await readFile(file));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=await mkdtemp(path.join(tmpdir(),'phota-frames-'));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let socket;
try{
  let port;for(let i=0;i<100&&!port;i++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{await pause(100);}}
  assert.ok(port,'Chrome starts');
  const targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});let id=0;const pending=new Map();
  socket.onmessage=({data})=>{const m=JSON.parse(data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  await send('Page.enable');await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  for(let i=0;i<100;i++){if(await run('document.readyState==="complete" && location.pathname==="/"'))break;await pause(50);}
  await run(`(async()=>{
    const {createCamera}=await import('/camera.js'),{loadImage,toDataURL}=await import('/vision.js');
    window.renderResearchFrame=async(src)=>{
      const image=await loadImage(src);Object.defineProperties(image,{videoWidth:{value:image.naturalWidth},videoHeight:{value:image.naturalHeight}});
      const wrap=document.createElement('div'),box=document.createElement('div');wrap.style.cssText='width:400px;height:800px';wrap.append(box);document.body.append(wrap);
      const camera=createCamera({video:image,box,wrap});const frames=[];
      for(const ratio of ['4:3','16:9']){camera.setRatio(ratio);const canvas=camera.frame(1024,0);const g=canvas.getContext('2d');frames.push({ratio,width:canvas.width,height:canvas.height,data:toDataURL(canvas,.86),top:[...g.getImageData(0,0,1,1).data],bottom:[...g.getImageData(0,canvas.height-1,1,1).data]});}
      camera.close();wrap.remove();return {sourceWidth:image.naturalWidth,sourceHeight:image.naturalHeight,frames};
    };
  })()`);
  const oracle=await run(`(async()=>{const c=document.createElement('canvas');c.width=800;c.height=1600;const g=c.getContext('2d');g.fillStyle='#00c800';g.fillRect(0,0,800,1600);g.fillStyle='#ff0000';g.fillRect(0,0,800,200);g.fillStyle='#0000ff';g.fillRect(0,1400,800,200);return renderResearchFrame(c.toDataURL('image/png'));})()`);
  assert.deepEqual(oracle.frames.map(f=>[f.width,f.height]),[[768,1024],[576,1024]]);
  assert.deepEqual(oracle.frames[0].top.slice(0,3),[0,200,0]);assert.deepEqual(oracle.frames[0].bottom.slice(0,3),[0,200,0]);
  assert.deepEqual(oracle.frames[1].top.slice(0,3),[255,0,0]);assert.deepEqual(oracle.frames[1].bottom.slice(0,3),[0,0,255]);
  const manifest={profile:'app-camera-1024-jpeg086-v1',maxSide:1024,quality:.86,zoom:1,quarter:0,simFilter:'',cameraHash:hash(camera),visionHash:hash(vision),cases:[]};
  await mkdir(new URL('./photos/portrait/frames-1024/',import.meta.url),{recursive:true});
  for(const c of cases){
    const result=await run(`renderResearchFrame(${JSON.stringify('/photo/'+c.id)})`);
    for(const f of result.frames){
      assert.match(f.data,/^data:image\/jpeg;base64,/);assert.ok(Math.max(f.width,f.height)<=1024&&Math.min(f.width,f.height)>0);
      const bytes=Buffer.from(f.data.split(',')[1],'base64'),file=`photos/portrait/frames-1024/${c.id}-${f.ratio.replace(':','x')}.jpg`;
      await writeFile(new URL(file,import.meta.url),bytes);
      manifest.cases.push({id:c.id,ratio:f.ratio,file,width:f.width,height:f.height,sourceWidth:result.sourceWidth,sourceHeight:result.sourceHeight,sourceHash:hash(await readFile(new URL(c.file,import.meta.url))),frameHash:hash(bytes)});
      console.log(JSON.stringify({case:c.id,ratio:f.ratio,width:f.width,height:f.height,bytes:bytes.length}));
    }
  }
  await writeFile(new URL('./results/portrait-frame-manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
  console.log('PASS: actual app camera crop/scale/JPEG pipeline; independent colored-band crop oracle; input manifest saved.');
}finally{
  socket?.close();chrome.kill();server.close();await pause(500);
  if(path.dirname(profile)===path.resolve(tmpdir())&&path.basename(profile).startsWith('phota-frames-'))await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:250}).catch(()=>{});
}
