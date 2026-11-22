// Run with: node eval/pro_layout_test.mjs [screenshot-directory]
// Exercises the built app in Chrome with a local camera fixture; no AI calls.
// Add --portrait for portrait coaching and 54 additional portrait layouts,
// --voice for settings/playback fixtures, or --audio-only to play the
// short-lived sample URLs created by eval/voice_smoke.mjs (no new synthesis).
// --protocol-only skips the layout sweep when only protocol screenshots change.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const profile = await mkdtemp(path.join(tmpdir(), "phota-layout-"));
const screenshots = process.argv.slice(2).find(arg => !arg.startsWith("--"));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.resolve(root, "." + pathname);
    if (!file.startsWith(path.join(root, "mobile", "www") + path.sep)) throw new Error("Not found");
    const types = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png" };
    res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
], { windowsHide: true, stdio: "ignore" });
let socket;
try {
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; }
    catch { await pause(100); }
  }
  assert.ok(port, "Chrome started");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(5000) })).json();
  socket = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const msg = JSON.parse(data), entry = pending.get(msg.id);
    if (entry) { pending.delete(msg.id); msg.error ? entry.reject(msg.error) : entry.resolve(msg.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const run = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ": " + r.exceptionDetails.exception?.description);
    return r.result.value;
  };
  const waitFor = async (expression) => {
    for (let i = 0; i < 100; i++) { if (await run(expression)) return; await pause(50); }
    const status = await run("document.getElementById('sVoiceStatus')?.textContent || ''");
    throw new Error(`Timed out: ${expression}; voice status: ${status}`);
  };
  const navigate = async url => {
    const marker=Date.now()+'-'+Math.random();
    await run(`window.__oldDocumentMarker=${JSON.stringify(marker)}`);
    await send('Page.navigate',{url});
    await waitFor(`window.__oldDocumentMarker!==${JSON.stringify(marker)} && location.href===${JSON.stringify(url)} && document.getElementById('video')?.videoWidth>0 && document.getElementById('proDials')?.children.length===6 && !document.getElementById('intro')`);
  };
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    navigator.mediaDevices.getUserMedia = async () => {
      window.__cameraOpens=(window.__cameraOpens || 0)+1;
      const canvas = document.createElement('canvas');
      const landscape = innerWidth > innerHeight;
      canvas.width = landscape ? 960 : 720; canvas.height = landscape ? 720 : 960;
      const g = canvas.getContext('2d');
      const paint = () => {
        g.fillStyle = '#738772'; g.fillRect(0, 0, canvas.width, canvas.height);
        g.fillStyle = '#bccfd9'; g.fillRect(0, 0, canvas.width, canvas.height * .4);
        g.fillStyle = '#e5d6b4'; g.fillRect(canvas.width * .32, canvas.height * .32, canvas.width * .28, canvas.height * .4);
        g.strokeStyle = '#364f42'; g.lineWidth = 3;
        for (let x = 0; x < canvas.width; x += 80) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, canvas.height); g.stroke(); }
      };
      paint(); setInterval(paint, 200);
      window.__cameraStream=canvas.captureStream(5);return window.__cameraStream;
    };
  ` });
  if (process.argv.includes('--portrait')) {
    await send('Page.addScriptToEvaluateOnNewDocument', {source: `
      localStorage.setItem('settings', JSON.stringify({preset:'qianwen',apiKey:'fixture-other-provider',baseUrl:'https://other.invalid',model:'other-model',voice:false,coachAuto:false,
        saved:location.search.includes('no-ds') ? {} : {deepseek:{baseUrl:'https://api.deepseek.com',apiKey:'fixture-deepseek-only',model:'old-model'}}}));
      window.__portraitRequests=[]; window.__observationRequests=[]; window.__allPortraitRequests=[]; window.__externalRequests=[]; window.__portraitDelay=0; window.__portraitStatus='adjust'; window.__portraitActor='model'; window.__portraitTitle='绿地里的自然神态'; window.__speechStops=0;
      window.__captureFailures=[];window.__takePhotoCalls=0;window.__captureFailure=false;
      addEventListener('unhandledrejection',event=>window.__captureFailures.push(String(event.reason)));
      const drawImage=CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage=function(source,...args){
        if(window.__failNextVideoDraw && source instanceof HTMLVideoElement){window.__failNextVideoDraw=false;throw new Error('Fixture capture unavailable');}
        return drawImage.call(this,source,...args);
      };
      window.ImageCapture=class {async takePhoto(){
        window.__takePhotoCalls++;
        if(window.__holdPhoto)await new Promise(resolve=>window.__releasePhoto=resolve);
        if(window.__captureFailure){window.__failNextVideoDraw=true;throw new Error('Fixture camera photo failed');}
        const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=1920;
        canvas.getContext('2d').fillRect(0,0,1440,1920);
        return new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
      }};
      window.speechSynthesis.cancel=()=>{window.__speechStops++;};
      const originalFetch=window.fetch.bind(window);
      window.fetch=async (url,options) => {
        if(String(url).startsWith('https:')) {
          window.__externalRequests.push(String(url));
          if(String(url)!=='https://api.deepseek.com/chat/completions') throw new Error('Unexpected external call');
          const body=JSON.parse(options.body), status=window.__portraitStatus, actor=window.__portraitActor, title=window.__portraitTitle, reframe=window.__portraitReframe, lift=window.__portraitLift, clearance=window.__portraitClearance;
          const entry={body,auth:options.headers.Authorization,signal:options.signal};
          window.__allPortraitRequests.push(entry);
          (body.messages[0].content.includes('仅观察当前图片')?window.__observationRequests:window.__portraitRequests).push(entry);
          await new Promise(r=>setTimeout(r,window.__portraitDelay));
          return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({observation:{people:1,layout:'single',visible:['face','eyes','shoulders','body',...(lift?['hands']:[])],scene:clearance?[{id:'flower',kind:'plant',detail:'头边粉色花枝'}]:lift?[{id:'bouquet',kind:'object',detail:'手中的黄色花束',withinReach:true,heldByModel:true,affordances:['hold']}]:[],...(reframe?{faceCenter:{x:.28,y:.35},headTop:.15,gazeScreen:'left'}:{}),...(clearance?{headBounds:{left:.4,top:.3,right:.6,bottom:.6},overlaps:[{reference:'flower',part:'hair',layer:'foreground',bounds:{left:.43,top:.12,right:.57,bottom:.34}}]}:{})},
            plan:{title,why:'让人物和绿色背景自然结合',uses:clearance?['flower']:lift?['bouquet']:[],...(reframe?{focus:'gaze_room'}:{})},status,action:status==='ready'?null:clearance?{actor:'photographer',kind:'camera_clearance',reference:'flower',direction:'right',evidence:'粉色花枝压到头发轮廓',check:'复看头部轮廓是否清楚'}:lift?{actor:'model',kind:'lift_object',direction:'chest',reference:'bouquet',evidence:'花束已在手中',check:'花束靠近人物且不挡脸'}:reframe?{actor:'photographer',kind:'camera_reframe',goal:'gaze_room',evidence:'人物朝画面左侧看，前方空间较少',check:'视线前方留空增加'}:{actor,kind:actor==='model'?'relax_expression':'camera_height',direction:actor==='model'?null:'down',evidence:'脸部表情与机位关系清楚可见',check:'观察脸部是否更自然'},
            readiness:{face:true,pose:true,composition:true},progress:{state:'uncertain',evidence:''},score:9})}}],usage:{total_tokens:1}}));
        }
        return originalFetch(url,options);
      };
    `});
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await navigate(`http://127.0.0.1:${server.address().port}/mobile/www/index.html`);
    await waitFor("document.getElementById('video')?.videoWidth > 0 && document.getElementById('proDials')?.children.length === 6");
    assert.equal(await run("Boolean(document.getElementById('sceneTag'))"),true,'Scene tag replaces the portrait mode switch');
    await run("document.querySelectorAll('dialog[open]').forEach(d=>d.close());window.__photaScene(document.getElementById('sceneTag').dataset.scene==='portrait'?'landscape':'portrait');document.getElementById('askBtn').click()");
    await waitFor("document.getElementById('coachText').textContent.startsWith('模特：')");
    assert.equal(await run("document.getElementById('portraitPlan').textContent"),'绿地里的自然神态');
    assert.equal(await run("document.getElementById('vf').contains(document.getElementById('coach'))"),false,'Portrait instruction stays outside preview');
    assert.equal(await run("window.__portraitRequests[0].auth"),'Bearer fixture-deepseek-only');
    assert.equal(await run("window.__portraitRequests[0].body.model"),'deepseek-flash');
    assert.equal(await run("window.__portraitRequests[0].body.messages[1].content.filter(c=>c.type==='image_url').length"),1);
    assert.ok(await run(`new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(Math.max(i.width,i.height)>=720);i.src=window.__portraitRequests[0].body.messages[1].content.find(c=>c.type==='image_url').image_url.url;})`),'Portrait sends face detail');
    await run("window.__portraitActor='photographer';document.getElementById('askBtn').click()");
    await waitFor("window.__portraitRequests.length===2 && !document.getElementById('askBtn').classList.contains('busy')");
    assert.ok(await run("document.getElementById('coachText').textContent.startsWith('摄影师：')"));
    assert.equal(await run("window.__portraitRequests[1].body.messages[1].content.filter(c=>c.type==='image_url').length"),2,'Second request compares previous then current');
    assert.equal(await run("window.__portraitRequests[1].body.messages[1].content.filter(c=>c.type==='image_url')[0].image_url.url===window.__portraitRequests[0].body.messages[1].content.find(c=>c.type==='image_url').image_url.url"),true);
    await run("window.__portraitStatus='ready';document.getElementById('askBtn').click()");
    await waitFor("document.getElementById('liveShutter').classList.contains('ready')");
    await run("document.getElementById('tAuto').click()"); await pause(3500);
    assert.equal(await run('window.__portraitRequests.length'),3,'Ready pauses auto');
    await run("while(document.getElementById('tQuality').textContent!=='原图')document.getElementById('tQuality').click();window.__captureFailure=true;document.getElementById('liveShutter').click()");
    await pause(150);
    assert.equal(await run("document.getElementById('portraitStatus').textContent.includes('已拍')"),false,'Failed capture must not claim a photograph was taken');
    assert.ok(await run("document.getElementById('toast').textContent.includes('拍照失败')"),'Failed capture offers a retry hint');
    assert.deepEqual(await run('window.__captureFailures'),[],'Failed capture has no unhandled rejection');
    await run('window.__captureFailure=false');
    await run("document.getElementById('liveShutter').click()");
    await waitFor("document.getElementById('portraitStatus').textContent.includes('已拍')");
    assert.ok(await run('window.__takePhotoCalls>=2'),'A failed original-quality capture can be retried');
    await waitFor('window.__cameraOpens>=2 && !document.getElementById("liveShutter").disabled');
    for (const trigger of ["document.getElementById('tRatio').click()", "document.querySelectorAll('#zoomRow button')[1].click()", "window.dispatchEvent(new Event('orientationchange'))", "document.getElementById('video').dispatchEvent(new Event('resize'))"]) {
      await run(trigger);
      assert.ok(await run("document.getElementById('portraitStatus').textContent.includes('已拍')"),'Geometry changes preserve the shot pause');
    }
    await run("document.getElementById('tAuto').click()"); await pause(3500);   // 自动指导开着时，拍完动了机位会接着指导；这里关掉，看手动时是否停在"已拍下"
    assert.equal(await run('window.__portraitRequests.length'),3,'With auto off, a shot waits for the user');
    await run("window.__portraitStatus='adjust';window.__portraitTitle='换机位看背景';document.getElementById('portraitNew').click()");
    await waitFor("window.__portraitRequests.length===4 && !document.getElementById('askBtn').classList.contains('busy')");
    assert.equal(await run("window.__portraitRequests[3].body.messages[1].content.filter(c=>c.type==='image_url').length"),1,'Explicit new idea clears previous');
    assert.ok(await run("JSON.stringify(window.__portraitRequests[3].body).includes('绿地里的自然神态')"),'New idea includes prior plan');
    await run("window.__portraitDelay=200;document.getElementById('askBtn').click()");
    await waitFor("document.getElementById('askBtn').classList.contains('busy')");
    await run("document.getElementById('tRatio').click();window.__portraitDelay=700;document.getElementById('askBtn').click()");
    await pause(350);
    assert.equal(await run("document.getElementById('askBtn').classList.contains('busy')"),true,'Old request finalizer cannot clear a newer busy state');
    await waitFor("!document.getElementById('askBtn').classList.contains('busy')");
    const directorsBeforeCancel=await run('window.__portraitRequests.length');
    await run("window.__portraitDelay=250;document.getElementById('askBtn').click()");
    await waitFor(`window.__portraitRequests.length>${directorsBeforeCancel}`);
    await run("document.getElementById('tRatio').click()");
    assert.equal(await run('window.__portraitRequests.at(-1).signal.aborted'),true,'Context changes also cancel the director stage');
    await pause(300);
    for(const trigger of ["document.getElementById('tRatio').click()","document.querySelector('#zoomRow button:not(.on)').click()","window.dispatchEvent(Object.assign(new Event('devicemotion'),{accelerationIncludingGravity:{x:-9,y:0,z:0}}))","window.__photaScene(document.getElementById('sceneTag').dataset.scene==='portrait'?'landscape':'portrait')"]){
      await run("window.__portraitDelay=600;document.getElementById('askBtn').click()");
      await waitFor("document.getElementById('askBtn').classList.contains('busy')");
      const stops=await run('window.__speechStops');
      await run(trigger);
      assert.equal(await run("window.__allPortraitRequests.at(-1).signal.aborted"),true,'Context changes cancel request: '+trigger);
      assert.ok(await run(`window.__speechStops > ${stops}`),'Context changes stop stale speech');
      await pause(700);
      assert.equal(await run("document.getElementById('liveShutter').classList.contains('ready')"),false,'Stale response cannot restore ready');
    }
    assert.equal(await run("JSON.parse(localStorage.getItem('settings')).preset"),'qianwen','Portrait preserves provider settings');
    assert.equal(await run("document.body.innerText.includes('fixture-deepseek-only') || document.body.innerText.includes('fixture-other-provider')"),false,'No credentials in UI');
    await navigate(`http://127.0.0.1:${server.address().port}/mobile/www/index.html?no-ds`);
    await waitFor("location.search.includes('no-ds') && document.getElementById('video')?.videoWidth > 0 && document.getElementById('proDials')?.children.length === 6 && document.getElementById('sPreset')?.options.length === 4");
    // Exercise the real settings draft path instead of assuming storage edits
    // also change the app's in-memory settings object.
    // 设置是整屏页面：AI 连接页里清空 DeepSeek 密钥 →「测试并保存」提示清除 →「仍然保存」；再切回千问保存
    await run("document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.getElementById('btnSettings').click();document.querySelector('[data-go=\"connection\"]').click();document.getElementById('sPreset').value='deepseek';document.getElementById('sPreset').dispatchEvent(new Event('change'));document.getElementById('sApiKey').value='';document.getElementById('sTest').click()");
    assert.equal(await run("document.getElementById('sSaveAnyway').hidden"),false,'Clearing a saved key asks before saving');
    await run("document.getElementById('sSaveAnyway').click();document.getElementById('sPreset').value='qianwen';document.getElementById('sPreset').dispatchEvent(new Event('change'));document.getElementById('sSaveAnyway').click()");
    assert.equal(await run("Boolean(JSON.parse(localStorage.getItem('settings')).saved?.deepseek?.apiKey)"),false,'Settings can clear the saved DeepSeek key');
    await run("document.querySelectorAll('dialog[open]').forEach(d=>d.close());window.__photaScene(document.getElementById('sceneTag').dataset.scene==='portrait'?'landscape':'portrait');document.getElementById('askBtn').click()");
    await pause(150);await run("document.getElementById('askBtn').click()");
    const missingState=await run("({open:document.getElementById('settings').open,message:document.getElementById('sMsg').textContent,portrait:document.getElementById('sceneTag').dataset.scene,camera:document.getElementById('video').videoWidth,calls:window.__portraitRequests.length,camOff:document.getElementById('camOff').hidden,paused:document.getElementById('video').paused,track:window.__cameraStream?.getVideoTracks()[0]?.readyState,hidden:document.hidden,busy:document.getElementById('askBtn').classList.contains('busy')})");
    assert.ok(missingState.open && missingState.message.includes('DeepSeek'),'Missing DeepSeek offers a clear saved-key setup hint: '+JSON.stringify(missingState));
    assert.equal(await run('window.__allPortraitRequests.length'),0,'Missing DeepSeek never calls another provider');
    assert.equal(await run('window.__externalRequests.length'),0,'Missing DeepSeek makes zero external model calls');
    assert.equal(await run("document.getElementById('sPreset').value"),'qianwen','Missing DeepSeek preserves provider selection');
    assert.equal(await run("JSON.parse(localStorage.getItem('settings')).apiKey"),'fixture-other-provider','Missing DeepSeek preserves the other provider key');
    await navigate(`http://127.0.0.1:${server.address().port}/mobile/www/index.html`);
    await run("document.querySelectorAll('dialog[open]').forEach(d=>d.close());while(document.getElementById('tQuality').textContent!=='原图')document.getElementById('tQuality').click();window.__holdPhoto=true;document.getElementById('liveShutter').click()");
    await waitFor('Boolean(window.__releasePhoto)');
    await run("window.__photaScene(document.getElementById('sceneTag').dataset.scene==='portrait'?'landscape':'portrait');window.__holdPhoto=false;window.__releasePhoto();window.__releasePhoto=null");
    await waitFor('!document.getElementById("liveShutter").disabled');
    assert.equal(await run("document.getElementById('portraitStatus').textContent.includes('已拍')"),false,'A normal photo cannot mark a newer portrait session shot');
    await run("window.__holdPhoto=true;document.getElementById('liveShutter').click()");
    await waitFor('Boolean(window.__releasePhoto)');
    await run("document.getElementById('portraitNew').click();window.__holdPhoto=false;window.__releasePhoto();window.__releasePhoto=null");
    await waitFor('!document.getElementById("liveShutter").disabled');
    assert.equal(await run("document.getElementById('portraitStatus').textContent.includes('已拍')"),false,'An old capture cannot overwrite an explicit new idea');
    await run("document.getElementById('askBtn').click()");
    await waitFor("document.getElementById('coachText').textContent.startsWith('模特：')");
    await navigate(`http://127.0.0.1:${server.address().port}/mobile/www/index.html`);
    await run("document.querySelectorAll('dialog[open]').forEach(d=>d.close());window.__portraitReframe=true;window.__photaScene(document.getElementById('sceneTag').dataset.scene==='portrait'?'landscape':'portrait');document.getElementById('askBtn').click()");
    await waitFor("document.getElementById('coachText').textContent.includes('手机位置不动')");
    assert.ok(await run("document.getElementById('coachText').textContent.includes('向左') && document.getElementById('coachText').textContent.includes('视线')"),'Screen-left gaze gets computed left camera turn');
    assert.equal(await run("document.getElementById('vf').contains(document.getElementById('coach'))"),false,'Reframe guidance stays outside preview');
    assert.equal(await run('window.__portraitRequests.length'),1,'Valid reframe requires no director repair');
    await navigate(`http://127.0.0.1:${server.address().port}/mobile/www/index.html`);
    await run("document.querySelectorAll('dialog[open]').forEach(d=>d.close());window.__portraitLift=true;window.__photaScene(document.getElementById('sceneTag').dataset.scene==='portrait'?'landscape':'portrait');document.getElementById('askBtn').click()");
    await waitFor("document.getElementById('coachText').textContent.includes('花束') && document.getElementById('coachText').textContent.includes('胸前')");
    assert.ok(await run("document.getElementById('coachText').textContent.startsWith('模特：') && document.getElementById('coachText').textContent.includes('别挡住脸')"),'Held prop lift renders one model action');
    assert.equal(await run('window.__portraitRequests.length'),1,'Verified held prop requires no repair');
    await navigate(`http://127.0.0.1:${server.address().port}/mobile/www/index.html`);
    await run("document.querySelectorAll('dialog[open]').forEach(d=>d.close());window.__portraitClearance=true;window.__photaScene(document.getElementById('sceneTag').dataset.scene==='portrait'?'landscape':'portrait');document.getElementById('askBtn').click()");
    await waitFor("document.getElementById('coachText').textContent.includes('手机位置稍微降低')");
    assert.ok(await run("document.getElementById('coachText').textContent.includes('粉色花枝') && !document.getElementById('coachText').textContent.includes('向你的右边')"),'Parallax uses observed foreground, ignoring director right');
    assert.equal(await run('window.__portraitRequests.length'),1,'Computed clearance needs no direction repair');
    await run("Promise.all(document.getElementById('coachText').getAnimations().map(a=>a.finished.catch(()=>{})))");
    await waitFor("getComputedStyle(document.getElementById('coachText')).filter==='none' && getComputedStyle(document.getElementById('coachText')).opacity==='1'");
    await run("document.getElementById('toast').classList.remove('show')");
    if(screenshots){await mkdir(screenshots,{recursive:true});const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(screenshots,'head-clearance.png'),Buffer.from(shot.data,'base64'));}
    // 自拍：切到前置，预览镜像、场景直接是人像、语音打开；再切回后置
    await run("document.querySelectorAll('dialog[open]').forEach(d=>d.close());window.__photaScene(null);window.__selfieOpens=window.__cameraOpens;document.getElementById('tFlip').click()");
    await waitFor("document.getElementById('tFlip').getAttribute('aria-pressed')==='true'");
    const selfie = await run("({t:document.getElementById('video').style.transform,scene:document.getElementById('sceneTag').dataset.scene,voice:JSON.parse(localStorage.getItem('settings')).voice,opens:window.__cameraOpens-window.__selfieOpens})");
    assert.ok(selfie.t.includes('scaleX(-1)') && selfie.scene==='portrait' && selfie.voice===true && selfie.opens===1, 'Selfie mirrors preview, uses portrait and turns voice on: '+JSON.stringify(selfie));
    await run("document.getElementById('tFlip').click()");
    await waitFor("document.getElementById('tFlip').getAttribute('aria-pressed')==='false' && !document.getElementById('video').style.transform.includes('scaleX')");
    console.log('PASS: portrait protocol, actors, saved DeepSeek routing, previous/current images, ready/shot pause, explicit alternate, stale cancellation, computed reframe, held prop lift and parallax clearance.');
  }
  if (process.argv.includes('--voice')) {
    await send('Page.addScriptToEvaluateOnNewDocument', {source: `
      window.__speechRequests = []; window.__audioStarts = 0; window.__speechFailure = false;
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (url, options) => {
        if (String(url).startsWith('https://maas.qianwenaiapi.com/api/v1/services/')) {
          window.__speechRequests.push(JSON.parse(options.body));
          await new Promise(r => setTimeout(r, 180));
          if (window.__speechFailure) return new Response('{}', {status:401});
          return new Response(JSON.stringify({output:{audio:{url:'https://audio.example/test.mp3',expires_at:Date.now()/1000+3600}}}), {status:200});
        }
        return originalFetch(url, options);
      };
      window.Audio = class {
        play() { setTimeout(() => { if(this.src) {window.__audioStarts++; this.onplaying?.();} }, 10); setTimeout(() => {if(this.src) this.onended?.();}, 70); return Promise.resolve(); }
        pause() {} removeAttribute() {this.src='';} load() {}
      };
    `});
    await send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
    await navigate(`http://127.0.0.1:${server.address().port}/mobile/www/index.html`);
    await waitFor("document.getElementById('sVoiceModel')?.options.length > 0 && document.getElementById('video')?.videoWidth > 0 && document.getElementById('proDials')?.children.length === 6");
    // 先在 AI 连接页存一个千问测试密钥（试听用的就是存下来的设置）
    await run("document.querySelectorAll('dialog[open]').forEach(d=>d.close()); document.getElementById('btnSettings').click(); document.querySelector('[data-go=\"connection\"]').click(); document.getElementById('sApiKey').value='browser-test-only'; document.getElementById('sSaveAnyway').click(); history.back()");
    await pause(400);
    await run("document.querySelector('[data-go=\"companion\"]').click()");
    assert.equal(await run("document.getElementById('sVoiceModel').value"), 'qwen-audio-3.0-tts-plus');
    assert.equal(await run("document.querySelectorAll('[data-companion]').length"),2,'Only Crabo and Piggo are selectable');
    assert.equal(await run("window.pet.species"),'crab','New installations start with Crabo');
    assert.equal(await run("document.getElementById('sVoiceAdvanced').open"),false,'Advanced voice settings start folded');
    await run("document.querySelector('[data-companion=pig]').click(); document.getElementById('sVoiceTest').click()");
    await waitFor("document.getElementById('sVoiceStatus').textContent.includes('试听完成')");
    assert.equal(await run("window.__speechRequests.at(-1).input.voice"), 'longanlufeng');
    await run("document.querySelector('[data-companion=crab]').click(); document.getElementById('sVoiceTest').click()");
    await waitFor("document.getElementById('sVoiceStatus').textContent.includes('试听完成')");
    assert.equal(await run("window.__speechRequests.at(-1).input.voice"), 'longanlingxin');
    await run("document.querySelector('[data-companion=pig]').click(); document.getElementById('sVoiceRate').value='1.05'; document.getElementById('sVoiceRate').dispatchEvent(new Event('input')); document.getElementById('sVoiceRate').dispatchEvent(new Event('change')); document.getElementById('sVoiceTest').click()");
    await waitFor('window.__speechRequests.length === 3');
    const starts = await run('window.__audioStarts');
    await run("document.getElementById('sVoiceStop').click()"); await pause(300);
    assert.equal(await run('window.__audioStarts'), starts, 'Stopping during synthesis prevents late playback');
    assert.equal(await run("document.getElementById('sVoiceTest').disabled"), false);
    await run("window.__speechFailure = true; document.getElementById('sVoiceRate').value='1.1'; document.getElementById('sVoiceRate').dispatchEvent(new Event('input')); document.getElementById('sVoiceRate').dispatchEvent(new Event('change')); document.getElementById('sVoiceTest').click()");
    await waitFor("document.getElementById('sVoiceStatus').classList.contains('bad')");
    assert.ok((await run("document.getElementById('sVoiceStatus').textContent")).includes('密钥无效'), 'Preview reports cloud errors explicitly');
    await run("document.getElementById('sVoiceEngine').value='system'; document.getElementById('sVoiceEngine').dispatchEvent(new Event('change')); window.speechSynthesis.speak = utterance => setTimeout(() => utterance.onerror?.({error:'synthesis-failed'}), 10); document.getElementById('sVoiceTest').click()");
    await waitFor("document.getElementById('sVoiceStatus').classList.contains('bad') && document.getElementById('sVoiceStatus').textContent.length > 0");
    assert.ok(!(await run("document.getElementById('sVoiceStatus').textContent")).includes('试听完成'), 'Failed system preview must not report success');
    // 改了立刻生效：选了 Piggo 就已经存好，关掉再打开还是 Piggo
    await run("document.getElementById('sVoiceEngine').value='cloud'; document.getElementById('sVoiceEngine').dispatchEvent(new Event('change')); document.querySelector('[data-companion=pig]').click(); document.getElementById('sClose').click()");
    await pause(400);
    await run("document.getElementById('btnSettings').click(); document.querySelector('[data-go=\"companion\"]').click()");
    assert.equal(await run("document.querySelector('[data-companion=pig]').getAttribute('aria-pressed')"), 'true', 'Choosing a companion is saved at once');
    assert.equal(await run("JSON.parse(localStorage.getItem('settings')).voiceGender"), 'male');
    assert.equal(await run("JSON.parse(localStorage.getItem('settings')).pet"), 'pig');
    assert.equal(await run("window.pet.species"), 'pig', 'Choosing switches the real companion to Piggo');
    assert.equal(await run("document.getElementById('sCompanionVoice').textContent"), 'Piggo · 年轻男声');
    await run("document.getElementById('sReadAloud').checked=false; document.getElementById('sReadAloud').dispatchEvent(new Event('change')); history.back()");
    await pause(400);
    await run("document.querySelector('[data-go=\"coach\"]').click(); document.getElementById('sCoachAuto').checked=true; document.getElementById('sCoachAuto').dispatchEvent(new Event('change')); document.getElementById('sInterval').value='6'; document.getElementById('sInterval').dispatchEvent(new Event('input'))");
    assert.equal(await run("document.getElementById('sGuidanceInterval').hidden"),false);
    assert.equal(await run("document.getElementById('tVoice').getAttribute('aria-pressed')"),'false','Settings speech switch updates the live control');
    assert.equal(await run("document.getElementById('tAuto').getAttribute('aria-pressed')"),'true','Settings auto guidance switch updates the live control');
    assert.equal(await run("JSON.parse(localStorage.getItem('settings')).interval"),6,'Guidance interval is persisted');
    await run("history.back()"); await pause(400);
    await run("document.querySelector('[data-go=\"connection\"]').click(); document.getElementById('sApiKey').value='unsaved-draft'");
    assert.equal(await run("document.getElementById('sConnectionAdvanced').open"),false,'Advanced connection settings start folded');
    await pause(1200);
    assert.equal(await run("document.getElementById('sApiKey').value"),'unsaved-draft','Background coaching must not overwrite the key being typed');
    assert.equal(await run("JSON.parse(localStorage.getItem('settings')).apiKey"),'browser-test-only','A key is only saved after 测试并保存');
    await run("history.back()"); await pause(400);
    for (const [width,height] of [[320,568],[390,844],[844,390]]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
      await pause(100);
      assert.equal(await run(`(() => {
        const dialog=document.getElementById('settings').getBoundingClientRect();
        const close=document.getElementById('sClose').getBoundingClientRect();
        return dialog.x >= -1 && dialog.y >= -1 && dialog.right <= innerWidth+1 && dialog.bottom <= innerHeight+1 &&
          close.x>=0 && close.y>=0 && close.right<=innerWidth && close.bottom<=innerHeight && document.documentElement.scrollWidth <= innerWidth;
      })()`),true,`${width}×${height}: settings fill the screen and the close button stays visible`);
      await run("document.querySelector('[data-page=home] .set-scroll').scrollTop=99999");
      assert.equal(await run("(() => { const r=document.getElementById('sGuide').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; })()"),true,'The last settings item can be scrolled into view');
    }
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    if (screenshots) {
      await run("document.querySelector('[data-page=home] .set-scroll').scrollTop=0");
      await mkdir(screenshots,{recursive:true});
      const shot = await send('Page.captureScreenshot',{format:'png'});
      await writeFile(path.join(screenshots,'voice-settings.png'),Buffer.from(shot.data,'base64'));
    }
    console.log('PASS: voice settings, correct male/female synthesis requests, preview playback, cancellation, error feedback and instant saving.');
  }
  if (process.argv.includes('--audio-only')) {
    const clips = JSON.parse(await readFile(new URL('./results/voice-clips.json',import.meta.url),'utf8'));
    await navigate(`http://127.0.0.1:${server.address().port}/mobile/www/index.html`);
    await waitFor("document.getElementById('video')?.videoWidth > 0");
    for (const clip of clips) {
      const metadata = await run(`new Promise((resolve,reject) => {
        const audio = new Audio(${JSON.stringify(clip.url)});
        const timer = setTimeout(() => {audio.pause();reject(new Error('Audio load timeout'));},15000);
        audio.onerror = () => {clearTimeout(timer);reject(new Error('Cloud audio decode failed'));};
        audio.onplaying = () => {clearTimeout(timer);const duration=audio.duration;audio.pause();audio.removeAttribute('src');audio.load();resolve({duration,decoded:true});};
        audio.play().catch(error => {clearTimeout(timer);reject(error);});
      })`);
      assert.equal(metadata.decoded,true);
      assert.ok(metadata.duration > 1);
      console.log(`PASS: real ${clip.gender} audio decoded and started, ${metadata.duration.toFixed(1)} seconds.`);
    }
  }
  const cases = process.argv.includes('--audio-only') || process.argv.includes('--protocol-only') ? [] : [[390, 844], [360, 640], [320, 568], [412, 915], [844, 390], [667, 375], [568, 320], [390, 844, 28, 24], [844, 390, 0, 24]];
  const report = [];
  for (const [width, height, top = 0, bottom = 0] of cases) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
    await navigate(`http://127.0.0.1:${server.address().port}/mobile/www/index.html`);
    await waitFor("document.getElementById('video')?.videoWidth > 0 && document.getElementById('zoomRow')?.children.length > 0");
    await run("document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.getElementById('toast').classList.remove('show')");
    await run(`document.documentElement.style.setProperty('--top', '${top}px'); document.documentElement.style.setProperty('--bottom', '${bottom}px')`);
    await run("document.getElementById('tPro').click()");
    await waitFor("!document.getElementById('pro').hidden");
    assert.equal(await run("document.getElementById('proAdjust').hidden && document.getElementById('proNote').hidden"), true, "PRO starts with adjustment and help collapsed");
    for (const ratio of ["4:3", "16:9", "1:1"]) {
      await run(`(() => { for (let i = 0; i < 3 && document.getElementById('tRatio').textContent !== '${ratio}'; i++) document.getElementById('tRatio').click(); })()`);
      await pause(450);
      const result = await run(`(() => {
        const vf = document.getElementById('vf').getBoundingClientRect();
        const rect = (el) => { const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom }; };
        const chrome = ['.vf-top', '#meterBox', '#coach', '.zoom'];
        const overlaps = chrome.filter((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.width > 0 && r.height > 0 && Math.min(r.right,vf.right)-Math.max(r.left,vf.left) > 1 && Math.min(r.bottom,vf.bottom)-Math.max(r.top,vf.top) > 1; });
        const outside = ['#pro', '#liveShutter', '#tPro', '#tRatio', '#proAsk'].filter((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.x < -1 || r.y < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1; });
        return { preview: rect(document.getElementById('vf')), overlaps, outside, pageWidth: document.documentElement.scrollWidth,
          regions: ['.bar','#proTop','#proPreviewTools','.modes','#pro','.live-ctl'].map(s=>[s,rect(document.querySelector(s))]) };
      })()`);
      if (screenshots && ratio !== "1:1" && !top && !bottom) {
        await mkdir(screenshots, { recursive: true });
        const shot = await send("Page.captureScreenshot", { format: "png" });
        await writeFile(path.join(screenshots, `pro-${width}-${height}-${ratio.replace(':','-')}.png`), Buffer.from(shot.data, "base64"));
      }
      assert.deepEqual(result.overlaps, [], `${width}×${height} ${ratio}: controls must stay outside the preview`);
      assert.deepEqual(result.outside, [], `${width}×${height} ${ratio}: controls must stay on screen`);
      assert.ok(result.pageWidth <= width, `${width}×${height}: no horizontal overflow`);
      assert.ok(result.preview.width >= 140 && result.preview.height >= 140, `${width}×${height} ${ratio}: preview remains usable, got ${JSON.stringify(result)}`);
      const expected = ratio === "1:1" ? 1 : ratio === "4:3" ? 4/3 : 16/9;
      assert.ok(Math.abs(Math.max(result.preview.width, result.preview.height) / Math.min(result.preview.width, result.preview.height) - expected) < .02, "Preview keeps the selected ratio");
      report.push(`${width}×${height}${top || bottom ? ' (safe area)' : ''} ${ratio}: ${Math.round(result.preview.width)}×${Math.round(result.preview.height)}`);
    }
    await run("document.querySelectorAll('#proDials button')[3].click()");
    await waitFor("!document.getElementById('proAdjust').hidden");
    await run("document.querySelectorAll('#proDials button')[3].click()");
    assert.equal(await run("document.getElementById('proAdjust').hidden"), true, "Tapping the selected dial collapses adjustment");
    await run("document.querySelectorAll('#proDials button')[3].click()");
    await run("document.getElementById('proRange').value = 20; document.getElementById('proRange').dispatchEvent(new Event('input'))");
    await waitFor("document.querySelectorAll('#proDials button')[3].classList.contains('manual')");
    await run("document.getElementById('proAuto').click()");
    await waitFor("!document.querySelectorAll('#proDials button')[3].classList.contains('manual')");
    await run("document.getElementById('proHelp').click()");
    await pause(450);
    assert.equal(await run("!document.getElementById('proNote').hidden && document.getElementById('proHelp').getAttribute('aria-expanded') === 'true'"), true, "Parameter help expands accessibly");
    assert.equal(await run(`(() => {
      const vf = document.getElementById('vf').getBoundingClientRect();
      const shutter = document.getElementById('liveShutter').getBoundingClientRect();
      return vf.width > 70 && vf.height > 70 && shutter.bottom <= innerHeight + 1 &&
        !document.getElementById('vf').contains(document.getElementById('proNote'));
    })()`), true, "Expanded help and adjustment keep preview and shutter available");
    await run("document.getElementById('proHelp').click(); document.querySelectorAll('#proDials button')[5].click()");
    assert.equal(await run("!document.getElementById('proNote').hidden && document.getElementById('proAdjust').hidden && document.getElementById('proNote').textContent.includes('固定')"), true, "Fixed aperture explains its limitation without a slider");
    await run("document.getElementById('tPro').click()");
    await waitFor("document.getElementById('pro').hidden");
    assert.equal(await run("document.getElementById('vf').contains(document.querySelector('.vf-top')) && document.getElementById('vf').contains(document.querySelector('.zoom'))"), true, "Normal mode restores preview controls");
    if (process.argv.includes('--portrait')) {
      await run("window.__photaScene(document.getElementById('sceneTag').dataset.scene==='portrait'?'landscape':'portrait');document.getElementById('tAuto').getAttribute('aria-pressed')==='true' && document.getElementById('tAuto').click();document.getElementById('portraitPlan').textContent='绿色背景里，留住人物自然的神态';document.getElementById('portraitWhy').textContent='利用可见的绿色背景衬托人物，让脸部神态成为这一张的重点';document.getElementById('coachText').textContent='摄影师：向你的左边横走半步，镜头继续对着模特';document.getElementById('portraitNew').hidden=false");
      const vfSizes = {};   // 出片 + PRO 的取景框必须和只开出片时一样大（面板高度固定）
      for (const pro of [false,true]) {
        if(pro) await run("document.getElementById('tPro').click()");
        for (const ratio of ['4:3','16:9','1:1']) {
          await run(`for(let i=0;i<3 && document.getElementById('tRatio').textContent!=='${ratio}';i++)document.getElementById('tRatio').click()`);
          await run("document.getElementById('portraitPlan').textContent='绿色背景里，留住人物自然的神态';document.getElementById('portraitWhy').textContent='利用可见的绿色背景衬托人物，让脸部神态成为这一张的重点';document.getElementById('coachText').textContent='摄影师：向你的左边横走半步，镜头继续对着模特';document.getElementById('portraitNew').hidden=false");
          await pause(550);
          const portraitLayout = await run(`(() => {
            const vf=document.getElementById('vf').getBoundingClientRect();
            const ids=['sceneTag','tRatio','tPro','liveShutter','portraitPanel','portraitNew','coach'];
            const outside=ids.filter(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.x < -1 || r.y < -1 || r.right > innerWidth+1 || r.bottom > innerHeight+1;});
            const overlap=ids.filter(id=>{const r=document.getElementById(id).getBoundingClientRect();return Math.min(r.right,vf.right)-Math.max(r.left,vf.left)>1 && Math.min(r.bottom,vf.bottom)-Math.max(r.top,vf.top)>1;});
            const panel=document.getElementById('portraitPanel').getBoundingClientRect();
            const wrap=document.getElementById('vf').parentElement, wr=wrap.getBoundingClientRect();
            return {outside,overlap,width:vf.width,height:vf.height,overflow:document.documentElement.scrollWidth>innerWidth,rects:{vf:{x:vf.x,y:vf.y,bottom:vf.bottom,right:vf.right},panel:{x:panel.x,y:panel.y,right:panel.right,bottom:panel.bottom},wrap:{x:wr.x,y:wr.y,width:wr.width,height:wr.height,clientHeight:wrap.clientHeight,css:getComputedStyle(wrap).cssText},grid:getComputedStyle(document.getElementById('live')).gridTemplateRows}};
          })()`);
          assert.deepEqual(portraitLayout.outside,[],`portrait ${width}×${height} ${ratio} PRO=${pro}: controls visible`);
          // 竖着拿手机时面板高度固定：出片、出片 + PRO 的"拍法"和"参数"标签，内容都要直接放得下，不用在面板里滑动
          // （横屏右栏只有 ~200px 宽，小横屏上参数标签允许滑动）
          for (const tab of height <= width ? [] : pro ? ['tabPro', 'tabPlan', 'tabPro'] : [null]) {
            if (tab) { await run(`document.getElementById('${tab}').click()`); await pause(80); }
            const fit = await run("(()=>{const b=document.querySelector('#deck .deck-body');return {need:b.scrollHeight,have:b.clientHeight}})()");
            assert.ok(fit.need <= fit.have + 1, `portrait ${width}×${height} ${ratio} PRO=${pro} ${tab || ''}: panel must not scroll (${fit.need} > ${fit.have})`);
          }
          if (!pro) vfSizes[ratio] = [portraitLayout.width, portraitLayout.height];
          else assert.ok(Math.abs(vfSizes[ratio][0] - portraitLayout.width) <= 1 && Math.abs(vfSizes[ratio][1] - portraitLayout.height) <= 1,
            `portrait ${width}×${height} ${ratio}: PRO must not shrink the viewfinder (${vfSizes[ratio]} → ${portraitLayout.width}×${portraitLayout.height})`);
          assert.deepEqual(portraitLayout.overlap,[],`portrait ${width}×${height} ${ratio} PRO=${pro}: guidance outside preview ${JSON.stringify(portraitLayout.rects)}`);
          assert.ok(!portraitLayout.overflow && portraitLayout.width>=90 && portraitLayout.height>=90,`portrait preview usable: ${JSON.stringify(portraitLayout)}`);
          if(screenshots && ratio==='4:3' && [390,568].includes(width) && !top && !bottom){
            await mkdir(screenshots,{recursive:true});
            const shot=await send('Page.captureScreenshot',{format:'png'});
            await writeFile(path.join(screenshots,`portrait-${width}-${height}-pro-${pro}.png`),Buffer.from(shot.data,'base64'));
          }
        }
      }
      await run("document.getElementById('tPro').click()");
      assert.equal(await run("document.getElementById('portraitInstruction').contains(document.getElementById('coach'))"),true,'PRO off retains portrait instruction outside preview');
      await run("window.__photaScene(document.getElementById('sceneTag').dataset.scene==='portrait'?'landscape':'portrait')");
      assert.equal(await run("document.getElementById('vf').contains(document.getElementById('coach'))"),true,'Normal guidance restores its original position');
    }
  }
  if (report.length) {
    console.log(report.join("\n"));
    console.log(`PASS: ${report.length} standard layouts${process.argv.includes('--portrait') ? ' and 54 portrait layouts' : ''}, parameter adjustment, auto reset, and normal-mode restoration.`);
  }
} finally {
  socket?.close();
  chrome.kill();
  server.close();
  await pause(500);
  // Only remove the isolated Chrome profile created in the temporary directory.
  if (path.dirname(profile) === path.resolve(tmpdir()) && path.basename(profile).startsWith("phota-layout-")) {
    await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }).catch(() => {});
  }
}
