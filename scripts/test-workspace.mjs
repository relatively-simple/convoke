import assert from 'node:assert/strict';
const base=process.env.CONVOKE_TEST_URL || 'http://127.0.0.1:5173';
if (!['127.0.0.1','localhost'].includes(new URL(base).hostname)) throw new Error('Local preview only');
const login=await fetch(`${base}/signin-with-chatgpt?return_to=/`,{redirect:'manual'});
const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');assert.ok(cookie);
let checks=0;
async function request(path,body,expected=200,extra={}){
 const r=await fetch(`${base}${path}`,{method:body?'POST':'GET',headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});
 const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data={error:raw}};assert.ok((Array.isArray(expected)?expected:[expected]).includes(r.status),`${r.status}: ${JSON.stringify(data)}`);checks++;return {...data,status:r.status};
}
assert.equal((await fetch(`${base}/api/workspace`)).status,401);checks++;
await request('/api/workspace',{action:'create',title:'',mode:'auto'},400);
await request('/api/workspace',{action:'create',title:'bad origin',mode:'auto'},403,{Origin:'https://other.example'});
let {project:p}=await request('/api/workspace',{action:'create',title:'Live-only API verification',mode:'build'});
const state=await request('/api/workspace');
const task={projectId:p.id,revision:p.revision,runId:crypto.randomUUID(),prompt:'Build a focus timer',mode:'build'};
await request('/api/generate',{...task,live:false},400);
if(!state.capabilities.live){
 await request('/api/generate',task,503);
 await request('/api/generate',{...task,runId:crypto.randomUUID(),thorough:true},503);
 const after=(await request('/api/workspace')).projects.find(x=>x.id===p.id);
 assert.equal(after.revision,0);assert.equal(after.messages.length,0);assert.equal(after.versions.length,0);assert.equal(after.clarification,undefined);checks++;
}
({project:p}=await request('/api/workspace',{action:'save',projectId:p.id,revision:p.revision,brief:'Persistence test',html:'<h1>Manually saved fixture</h1>',artifactTitle:'Fixture'}));
const original=p.versions[0];
({project:p}=await request('/api/workspace',{action:'save',projectId:p.id,revision:p.revision,html:'<h1>Revised fixture</h1>',artifactTitle:'Revision'}));
({project:p}=await request('/api/workspace',{action:'save',projectId:p.id,revision:p.revision,restoreId:original.id}));
assert.equal(p.versions.length,3);assert.equal(p.versions.at(-1).html,original.html);checks++;
await request('/api/workspace',{action:'save',projectId:p.id,revision:0,title:'stale'},409);
const concurrent=await Promise.all(['A','B'].map(title=>request('/api/workspace',{action:'save',projectId:p.id,revision:p.revision,title},[200,409])));
assert.deepEqual(concurrent.map(x=>x.status).sort(),[200,409]);checks++;
const exported=await fetch(`${base}/api/export?project=${p.id}&version=${original.id}`,{headers:{Cookie:cookie}});assert.equal(exported.status,200);assert.match(await exported.text(),/Content-Security-Policy/);checks++;
assert.equal((await fetch(`${base}/api/export?project=${p.id}&version=${original.id}`)).status,401);checks++;
const current=(await request('/api/workspace')).projects.find(x=>x.id===p.id);
const runId=crypto.randomUUID();await request('/api/workspace',{action:'cancel',projectId:p.id,runId});
await request('/api/generate',{...task,revision:current.revision,runId},409);
console.log(`PASS: ${checks} API checks. No live inference requested. Demo flag rejected; persistence, revisions, export and cancellation verified.`);
