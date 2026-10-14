import assert from 'node:assert/strict';
import {exportDocument} from '../lib/export-document.ts';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
await import('./prepare-runtimes.mjs');
const root=resolve('.'),out=resolve('work/browser-tests');await mkdir(out,{recursive:true});
await build({entryPoints:['scripts/browser-fixture.tsx'],outdir:out,bundle:true,format:'esm',splitting:true,loader:{'.woff':'file','.woff2':'file','.ttf':'file'},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/browser-fixture.css"></head><body><div id="root"></div><script type="module" src="/browser-fixture.js"></script></body></html>');return;}
 const folder=path.startsWith('/runtime/')?resolve(root,'public'):out;
 const file=resolve(folder,'.'+path);if(!file.startsWith(folder))throw Error('path');
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.css':'text/css','.json':'application/json','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();const page=await browser.newPage();page.setDefaultTimeout(15000);
const run=artifact=>page.evaluate(a=>window.testArtifact(a,new AbortController().signal),artifact);
try{
 await page.goto(base);await page.waitForFunction(()=>!!window.testArtifact);
 assert.equal(await page.locator('.katex-error').count(),0);assert.equal(await page.locator('.katex').count(),5);
 await page.waitForFunction(()=>[...document.querySelectorAll('img.diagram-image')].length===2&&[...document.querySelectorAll('img.diagram-image')].every(i=>i.complete&&i.naturalWidth>0));
 assert.equal(await page.locator('body').getAttribute('data-unsafe'),null);
 const working={title:'Counter',html:'<button id="add">Add</button><output id="value">0</output><script>let n=0;document.querySelector("#add").addEventListener("click",()=>document.querySelector("#value").textContent=String(++n));</script>',tests:[{name:'Increment',steps:[{action:'click',selector:'#add'},{action:'text',selector:'#value',value:'1'}]}]};
 assert.deepEqual((await run(working)).issues,[]);
 assert.match((await run({title:'Broken',html:'<p>Hello</p><script>missingFunction()</script>'})).issues.join(),/missingFunction/);
 assert.match((await run({title:'Loop',html:'<p>Loop</p><script>while(true){}</script>'})).issues.join(),/budget/);
 assert.match((await run({...working,tests:[{name:'Wrong expectation',steps:[{action:'text',selector:'#value',value:'99'}]}]})).issues.join(),/Wrong expectation/);
 assert.match((await run({title:'Isolation',html:'<p>Test</p><script>parent.document.body.dataset.unsafe="yes"</script>'})).issues.join(),/Blocked|cross-origin|SecurityError/i);
 assert.deepEqual((await run({title:'Three',html:'<p id="v"></p><script>document.getElementById("v").textContent=new THREE.Vector3(1,2,3).length().toFixed(2)</script>',libraries:['three'],tests:[{name:'Library loaded',steps:[{action:'text',selector:'#v',value:'3.74'}]}]})).issues,[]);
 const mathFrame=await page.evaluate(async()=>{
 const frame=document.createElement('iframe');frame.sandbox.add('allow-scripts');frame.title='Math fixture';frame.srcdoc=await window.documentForArtifact({title:'Math',html:'<p>\\[\\frac{1}{2}\\]</p>'},crypto.randomUUID());document.body.appendChild(frame);return true;
 });
 await page.frameLocator('iframe[title="Math fixture"]').locator('.katex').waitFor();
 assert.equal(await page.frameLocator('iframe[title="Math fixture"]').locator('.katex-error').count(),0);
 await page.locator('iframe[title="Math fixture"]').evaluate(el=>el.remove());
 const python=await run({title:'Python',html:'',python:'assert 2+2 == 4\nprint("Python works")'});assert.deepEqual(python.issues,[],JSON.stringify(python));assert.match(python.output,/Python works/);
 assert.match((await run({title:'Python failure',html:'',python:'assert 2+2 == 5'})).issues.join(),/AssertionError/);
 assert.match((await run({title:'Python timeout',html:'',python:'while True: pass'})).issues.join(),/timed out/);
 assert.equal(await page.locator('iframe').count(),0,'Hidden frames must be cleaned up');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(out,'math-visuals-mobile.png'),fullPage:true});
 console.log('PASS: rendered math, diagrams, chart, SVG safety, HTML interaction checks, runtime errors, loop budget, frame isolation, Three.js, Python assertions and hard timeout.');
 // Exercise the actual workspace repair loop with deterministic API fixtures.
 let project={id:crypto.randomUUID(),title:'Browser repair test',revision:0,mode:'build',updatedAt:new Date().toISOString(),brief:'',messages:[],versions:[]};let repairs=0,reports=0,alwaysBroken=false;
 await page.route('**/api/workspace',async route=>{const body=route.request().postDataJSON();
  if(body?.action==='runtime'){reports++;const v=project.versions.at(-1);v.runtime={...v.runtime,status:body.issues.length?'failed':'passed',issues:body.issues,output:body.output};project.revision++;}
  if(body?.action==='adopt'){
   const result=project.comparison.results.find(r=>r.id===body.resultId);project.revision++;const id=crypto.randomUUID(),time=new Date().toISOString();
   project.messages.push({id:'adopted',role:'assistant',text:result.reply,artifactId:id,createdAt:time});project.versions.push({...result.artifact,id,number:project.versions.length+1,createdAt:time,source:result.model,runtime:{status:'pending',attempts:0,issues:[]}});
  }
  await route.fulfill({json:{project,projects:[project],capabilities:{live:true,model:'fixture',provider:'Fixture',dailyLimit:null}}});});
 await page.route('**/api/generate',async route=>{const body=route.request().postDataJSON();if(body.compare){project.comparison={id:crypto.randomUUID(),prompt:body.prompt,createdAt:new Date().toISOString(),results:['Model A','Model B'].map(model=>({id:crypto.randomUUID(),provider:model,model,reply:'Comparison response',artifact:working}))};project.revision++;await route.fulfill({json:{project}});return;}
 const repair=!!body.runtimeVersionId;if(repair)repairs++;
  const time=new Date().toISOString(),id=crypto.randomUUID();project.revision++;
  project.versions.push({...working,html:repair&&!alwaysBroken?working.html:'<p>Draft</p><script>missingFunction()</script>',id,number:project.versions.length+1,createdAt:time,source:'fixture',runtime:{status:'pending',attempts:repairs,issues:[]}});
  project.messages=[{id:'u',role:'user',text:body.prompt,createdAt:time},{id:'a',role:'assistant',text:'Your counter is ready.',artifactId:id,createdAt:time}];
  await route.fulfill({json:{project}});});
 await page.goto(base+'/?workspace&project='+project.id);await page.getByRole('textbox',{name:'Message Convoke'}).fill('Build a counter');await page.getByRole('button',{name:'Send message',exact:true}).click();
 await page.waitForFunction(()=>document.body.textContent.includes('Browser smoke checks passed'),{},{timeout:25000});
 assert.equal(repairs,1);assert.equal(reports,2);assert.equal(project.versions.length,2);assert.equal(project.versions[0].runtime.status,'failed');assert.equal(project.versions[1].runtime.status,'passed');
 console.log('PASS: actual workspace hides draft, tests, requests repair, records pass, and retains failed source.');
 await page.getByRole('button',{name:'Compare models · extra AI calls'}).click();await page.getByRole('heading',{name:'Compare model answers'}).waitFor();
 assert.equal(await page.locator('.comparison-card').count(),2);
 await page.getByRole('button',{name:'Use this answer',exact:true}).first().click();await page.waitForFunction(()=>document.body.textContent.includes('Comparison response')&&!document.querySelector('textarea[aria-label="Message Convoke"]').disabled&&!document.querySelector('[role="dialog"]'));
 assert.equal(project.messages.at(-1).text,'Comparison response');assert.equal(project.versions.at(-1).runtime.status,'passed');
 repairs=0;alwaysBroken=true;
 await page.getByRole('textbox',{name:'Message Convoke'}).fill('Build another counter');await page.getByRole('button',{name:'Send message',exact:true}).click();
 await page.getByRole('heading',{name:'This draft needs attention'}).waitFor({timeout:25000});assert.equal(repairs,3);assert.equal(project.versions.at(-1).runtime.status,'failed');
 assert.equal(await page.locator('iframe').count(),0);
 console.log('PASS: parallel comparison cards, adoption, and exactly three runtime repairs before a visible retained failure.');
 const exported=await exportDocument({title:'Offline export',html:String.raw`<p>\[\frac{1}{2}\]</p><output id="three"></output><script>document.querySelector('#three').textContent=String(new THREE.Vector3(1,0,0).length());</script>`,libraries:['three']},async path=>new Response(await readFile(resolve(root,'public/runtime',path))));
 const offline=await browser.newPage();await offline.route('**/*',route=>route.abort());await offline.setContent(exported);await offline.locator('.katex').waitFor();assert.equal(await offline.locator('#three').textContent(),'1');assert.equal(await offline.locator('.katex-error').count(),0);await offline.close();
 console.log('PASS: exported HTML includes offline math fonts and Three.js.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
