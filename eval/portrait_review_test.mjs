// Local-only browser check of the anonymous review and exported feedback.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const file=path.resolve(process.argv[2]),shots=process.argv[3];
const key=JSON.parse(await readFile(file.replace('-review.html','-blind-key.json'),'utf8'));
const pairCount=key.pairs.length,alternateCount=key.pairs.filter(p=>p.intent==='alternate').length;
const profile=await mkdtemp(path.join(tmpdir(),'phota-review-'));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank',
],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let socket;
try{
  let port;
  for(let i=0;i<100&&!port;i++){
    try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{await pause(100);}
  }
  assert.ok(port,'Chrome starts');
  const targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0;const pending=new Map();
  socket.onmessage=({data})=>{const m=JSON.parse(data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async expression=>{for(let i=0;i<150;i++){if(await run(expression))return;await pause(100);}throw Error('Timed out: '+expression);};
  await send('Page.enable');await send('Network.enable');
  await send('Network.setBlockedURLs',{urls:['https://*','http://*']});
  await send('Browser.setDownloadBehavior',{behavior:'deny'});
  await send('Page.navigate',{url:pathToFileURL(file).href});
  await wait(`document.querySelectorAll('section').length===${pairCount} && [...document.images].every(i=>i.complete&&i.naturalWidth>0)`);
  assert.equal(await run("document.querySelectorAll('section article').length"),pairCount*2);
  assert.equal(await run("document.querySelectorAll('details').length"),alternateCount);
  for(const [width,height]of [[390,844],[1000,850]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await pause(100);
    assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'),'No horizontal overflow');
    if(shots){await mkdir(shots,{recursive:true});const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(shots,`review-${width}.png`),Buffer.from(shot.data,'base64'));}
  }
  await run("const choice=document.querySelector('[data-id]');choice.value='保留原片更好';choice.dispatchEvent(new Event('input'));const note=document.querySelector('[data-note]');note.value='保留光影，别挡脸 <test>';note.dispatchEvent(new Event('input'));");
  await send('Page.reload');
  await wait("document.querySelector('[data-id]')?.value==='保留原片更好'");
  assert.equal(await run("document.querySelector('[data-note]').value"),'保留光影，别挡脸 <test>');
  await run("const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{window.__feedbackBlob=blob;return create(blob)};document.getElementById('export').click()");
  const exported=JSON.parse(await run('window.__feedbackBlob.text()'));
  assert.equal(exported.review,key.review);assert.equal(exported.answers['1'].choice,'保留原片更好');assert.equal(exported.answers['1'].note,'保留光影，别挡脸 <test>');
  assert.equal(Object.keys(exported.answers).length,pairCount);
  console.log(`PASS: ${pairCount} anonymous pairs, all local photos, phone/desktop layout, saved feedback and correct exported review identity.`);
}finally{
  socket?.close();chrome.kill();await pause(500);
  if(path.dirname(profile)===path.resolve(tmpdir())&&path.basename(profile).startsWith('phota-review-'))
    await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:250}).catch(()=>{});
}
