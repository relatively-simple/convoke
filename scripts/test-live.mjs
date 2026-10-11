import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173';
const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
async function req(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify({status:r.status,error:d.error}));return d;}
let {project:p}=await req('/api/workspace',{action:'create',title:'Groq end-to-end verification',mode:'build'});
for(const [mode,prompt] of [['explain','Explain why the sky is blue in two sentences. No visual.'],['build','Build a minimal counter with a displayed number starting at zero, an Increment button and a Reset button. Keep the HTML under 2000 characters.'],['build','Change the counter to start at 5 and reset to 5. Keep both buttons.']]){
 ({project:p}=await req('/api/generate',{projectId:p.id,revision:p.revision,runId:crypto.randomUUID(),prompt,mode,thorough:false}));
 console.log(JSON.stringify({mode,id:p.id,revision:p.revision,versions:p.versions.length,model:p.messages.at(-1).model}));
}
const loaded=(await req('/api/workspace')).projects.find(x=>x.id===p.id);
assert.equal(loaded.revision,3);assert.equal(loaded.versions.length,2);
console.log('PASS: live explain, build, revise and reload.');
