// Download a small, explicitly listed set of public research images for local
// inference evaluation. Originals remain in ignored eval/photos; never in app assets.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const novice=process.argv.includes('--novice');
const cases=JSON.parse(await readFile(new URL(novice?'./portrait-novice-cases.json':'./portrait-cases.json',import.meta.url),'utf8'));
const split=process.argv[2] || 'dev';
for(const c of cases.filter(c=>c.split===split)) {
  if(c.crop){console.log(`DERIVED ${c.id}: use eval/portrait_crop.ps1 after downloading originals`);continue;}
  const out=new URL('./'+c.file,import.meta.url);
  try {await readFile(out);console.log(`CACHED ${c.id}`);continue;}catch{}
  const res=await fetch(c.image,{signal:AbortSignal.timeout(45000)});
  if(!res.ok || !/image\//.test(res.headers.get('content-type') || '')) throw new Error(`Image unavailable: ${c.id} HTTP ${res.status}`);
  const bytes=Buffer.from(await res.arrayBuffer());
  if(bytes.length>16*1024*1024)throw new Error(`Image too large: ${c.id}`);
  await mkdir(new URL('./photos/portrait/',import.meta.url),{recursive:true});
  await writeFile(out,bytes);console.log(`SAVED ${c.id} ${bytes.length} bytes`);
}
