// Local-only browser QA with a disposable profile. Test selections never become human labels.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const file=path.resolve(process.argv[2]||'eval/results/stage0-label-v16-stage0-20261028-4x3-batch1.html');
const profile=await mkdtemp(path.join(tmpdir(),'phota-stage0-qa-'));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let socket;
try{
 let port;for(let i=0;i<100&&!port;i++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{await pause(100);}}
 assert.ok(port,'Chrome starts');
 const targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 let id=0;const pending=new Map(),errors=[];
 socket.onmessage=({data})=>{const m=JSON.parse(data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 await send('Page.enable');await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:420,height:860,deviceScaleFactor:1,mobile:true});
 await send('Page.navigate',{url:pathToFileURL(file).href});
 for(let i=0;i<100;i++){if(await run("document.readyState==='complete'&&!!document.querySelector('section[data-input-key]')&&[...document.images].every(i=>i.complete&&i.naturalWidth>0)"))break;await pause(100);}
 assert.equal(await run('[...document.images].every(i=>i.complete&&i.naturalWidth>0)'),true,'actual crop images load');
 assert.equal(await run("document.querySelector('.reveal').hidden"),true,'suggestions hidden initially');
 await run("(()=>{const e=document.querySelector('.before input');e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
 assert.equal(await run("document.querySelector('.reveal').hidden"),true,'selecting is not confirmation');
 await run("document.querySelector('.confirm').click()");
 assert.equal(await run("document.querySelector('.reveal').hidden"),false,'explicit confirmation reveals');
 assert.equal(await run("[...document.querySelectorAll('section:first-of-type .before input,section:first-of-type .before textarea')].every(e=>e.disabled)"),true,'initial assessment locked');
 const frozen=await run("Object.values(originalLocks)[0].frozenAt");assert.ok(frozen);
 await run("(()=>{const original=URL.createObjectURL;URL.createObjectURL=b=>{window.__testBlob=b;return original(b)};HTMLAnchorElement.prototype.click=()=>{};document.getElementById('export').click();})()");
 const exported=await run('window.__testBlob.text().then(JSON.parse)');
 assert.equal(exported.schema,'phota-stage0-labels-v1');assert.equal(Object.values(exported.originalLocks)[0].frozenAt,frozen);assert.ok(exported.missing.length);
 assert.equal(exported.identity.imageEvidence.length,6,'six actual output image bindings');
 await send('Page.reload');
 for(let i=0;i<100;i++){if(await run("document.readyState==='complete'&&!!document.querySelector('.confirm')&&document.querySelector('.confirm').disabled"))break;await pause(100);}
 assert.equal(await run("document.querySelector('.reveal').hidden"),false,'restored confirmation reveals');
 assert.equal(await run('Object.values(originalLocks)[0].frozenAt'),frozen,'original lock time survives reload');
 assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,'no horizontal overflow at phone width');
 assert.deepEqual(errors,[],'no runtime exceptions');
 const shots=path.resolve('eval/results/portrait-browser-stage0');await mkdir(shots,{recursive:true});
 const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(shots,'label-qa.png'),Buffer.from(shot.data,'base64'));
 console.log('PASS local browser: crop loading, explicit confirmation, locked labels, partial export identity, reload persistence, mobile width; test choices isolated/discarded.');
}finally{
 socket?.close();chrome.kill();await pause(500);
 if(path.dirname(profile)===path.resolve(tmpdir())&&path.basename(profile).startsWith('phota-stage0-qa-'))await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:250}).catch(()=>{});
}
