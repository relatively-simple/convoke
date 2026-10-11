import assert from 'node:assert/strict';
import {readGeneration} from '../lib/generation-stream.ts';
const base=process.env.TEST_BASE_URL;
if(!base)throw Error('Set TEST_BASE_URL');
const session=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
assert.equal(session.status,200);const cookie=session.headers.get('set-cookie').split(';')[0];
const headers={Cookie:cookie,'Content-Type':'application/json'};
const caps=await (await fetch(base+'/api/workspace',{headers})).json();
assert.match(caps.capabilities.provider,/Gemini/);assert.match(caps.capabilities.provider,/Groq/);
let response=await fetch(base+'/api/workspace',{method:'POST',headers,body:JSON.stringify({action:'create',title:'Thorough deployment verification',mode:'build'})});
assert.equal(response.status,200);let {project:p}=await response.json();
const events=[];
async function generate(extra){
 const r=await fetch(base+'/api/generate',{method:'POST',headers:{...headers,Accept:'application/x-ndjson'},body:JSON.stringify({projectId:p.id,revision:p.revision,runId:crypto.randomUUID(),mode:'build',thorough:true,...extra})});
 assert.match(r.headers.get('content-type'),/x-ndjson/);
 p=await readGeneration(r,e=>{events.push(e);console.log(JSON.stringify({phase:e.phase,provider:e.provider,model:e.model,task:e.task,error:e.error,wait:e.waitSeconds}))});
}
try{
 await generate({prompt:'Build a tracker for me. I have not decided what it should track or how progress should be measured. Ask me to choose those first.'});
 assert.ok(events.some(e=>e.task==='clarify'));assert.ok(p.clarification?.questions.length);assert.equal(p.versions.length,0);
 assert.equal(p.clarification.options.length,p.clarification.questions.length);
 const pending=p.clarification;events.length=0;
 await generate({prompt:pending.prompt,clarificationId:pending.id,answers:pending.questions.map((q,i)=>pending.options[i][0])});
 assert.ok(!events.some(e=>e.task==='clarify'),'Quiz answers must go directly to generation');
 assert.equal(p.confirmedTask.answers.length,pending.questions.length);
 assert.ok(!p.clarification);assert.ok(p.versions.length);
 events.length=0;
 await generate({prompt:'In one sentence explain what this tracker does. Do not change or create an artifact.',mode:'explain'});
 assert.ok(!events.some(e=>e.task==='clarify'),'Follow-ups must not restart planning');
 assert.ok(!p.clarification);
 const saved=await (await fetch(base+'/api/workspace',{headers})).json();
 assert.equal(saved.projects.find(x=>x.id===p.id).revision,p.revision);
 console.log('PASS: live streamed progress, Thorough quiz, choices, confirmed answers, artifact generation and reload.');
}finally{console.log('VERIFICATION_PROJECT_ID='+p.id)}
