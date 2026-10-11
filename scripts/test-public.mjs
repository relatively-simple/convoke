import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL;
if(!base) throw Error('Set TEST_BASE_URL to the deployment to verify.');
async function session(){
 const r=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(r.status,200,await r.text());
 const setCookie=r.headers.get('set-cookie');
 assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/Secure/);assert.match(setCookie,/SameSite=Lax/);
 return setCookie.split(';')[0];
}
async function req(cookie,path,body,expected=200){
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const d=await r.json(); assert.equal(r.status,expected,JSON.stringify({status:r.status,error:d.error}));return d;
}
assert.equal((await fetch(base+'/api/workspace')).status,401);
assert.equal((await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body:'{}'})).status,403);
const a=await session(),b=await session();
assert.notEqual(a,b);
const capabilities=(await req(a,'/api/workspace')).capabilities;assert.equal(capabilities.live,true);if(process.env.EXPECT_PROVIDER)assert.equal(capabilities.provider,process.env.EXPECT_PROVIDER);
let {project:p}=await req(a,'/api/workspace',{action:'create',title:'Deployment verification',mode:'explain'});
assert.ok(!(await req(b,'/api/workspace')).projects.some(x=>x.id===p.id));
await req(b,'/api/workspace',{action:'save',projectId:p.id,revision:0,title:'Must not be allowed'},404);
await req(a+'x','/api/workspace',undefined,401);
try {
 for(const [mode,prompt] of [['explain','Explain what an API is in one brief sentence. Do not create an artifact.'],['build','Create a tiny working counter with increment and reset buttons. Self-contained HTML under 1500 characters.']]){
  ({project:p}=await req(a,'/api/generate',{projectId:p.id,revision:p.revision,runId:crypto.randomUUID(),prompt,mode,thorough:false}));
  assert.ok(p.messages.at(-1).text);console.log('PASS: live '+mode+' using '+p.messages.at(-1).model);
 }
 assert.equal(p.versions.length,1);
 assert.equal((await req(a,'/api/workspace')).projects.find(x=>x.id===p.id).revision,2);
 console.log('PASS: live generation persisted and reloads; isolated browsers; forged cookies and cross-site sessions rejected.');
} finally {
 // Print only the disposable verification project identifier for targeted cleanup.
 console.log('VERIFICATION_PROJECT_ID='+p.id);
}
