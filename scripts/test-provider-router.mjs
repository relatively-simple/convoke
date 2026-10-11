import assert from 'node:assert/strict';
import {createProviderRouter, providerAttempt} from '../lib/provider-router.ts';
import {runTask} from '../lib/free-ai.ts';
import {newProject} from '../lib/project.ts';
import {HttpError} from '../lib/errors.ts';
const signal=new AbortController().signal;
const messages=[{role:'system',content:'Return JSON'},{role:'user',content:'State'},{role:'user',content:'Prompt'}];
const answer={reply:'Ready',artifact:null};
const ok=(value=answer)=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
let calls=[],events=[],waits=[],reserved=0;
const router=createProviderRouter({gemini:'google-test',groq:'groq-test',nvidia:'nvidia-test'},signal,async()=>{reserved++},e=>events.push(e),{health:new Map(),wait:async ms=>{waits.push(ms)},fetcher:async(url,options)=>{
 calls.push(url);if(url.includes('googleapis'))return Response.json({error:{}},{status:503});
 const b=JSON.parse(options.body);assert.equal(b.messages.length,2);return ok();
}});
const result=await router(messages,'coding');
assert.equal(calls.length,2);assert.ok(calls[1].includes('groq'));assert.equal(reserved,2);assert.deepEqual(waits,[5000]);assert.match(result.model,/Groq/);assert.ok(events.some(e=>e.error?.includes('busy')));
assert.ok(!JSON.stringify(events).includes('google-test'));
calls=[];events=[];waits=[];reserved=0;
const persistent=createProviderRouter({groq:'y'},signal,async()=>reserved++,()=>{},{health:new Map(),wait:async()=>{},fetcher:async()=>{calls.push('groq');return calls.length <= 12 ? Response.json({error:{}},{status:503}) : ok()}});
assert.equal((await persistent(messages,'explain')).content,JSON.stringify(answer));assert.equal(reserved,13);
const terminal=createProviderRouter({groq:'y'},signal,async()=>{},()=>{},{health:new Map(),wait:async()=>{},fetcher:async()=>Response.json({error:{}},{status:401})});
await assert.rejects(terminal(messages,'explain'),/after 1 attempts/);
// Quota or invalid credentials disable only the affected provider, not all AI.
for(const status of [401,429]){
 let google=0;
 const route=createProviderRouter({gemini:'x',groq:'y'},signal,async()=>{},()=>{},{health:new Map(),wait:async()=>{},fetcher:async url=>{
  if(url.includes('googleapis')){google++;return Response.json({error:{message:'daily quota exhausted'}},{status})}return ok();
 }});
 assert.match((await route(messages,'explain')).model,/Groq/);assert.equal(google,1);
}
let fetched=false;const budget=createProviderRouter({groq:'x'},signal,async()=>{throw new HttpError(409,'Request cancelled')},()=>{},{fetcher:async()=>{fetched=true;return ok()}});
await assert.rejects(budget(messages,'coding'),/Request cancelled/);assert.equal(fetched,false);
const abort=new AbortController();let count=0;
const cancel=createProviderRouter({groq:'x',gemini:'y'},abort.signal,async()=>{},()=>{},{health:new Map(),wait:async()=>{abort.abort();throw Error('stopped')},fetcher:async()=>{count++;return Response.json({error:{}},{status:503})}});
await assert.rejects(cancel(messages,'coding'),/stopped/);assert.equal(count,1);
await providerAttempt('nvidia','fixture','openai/gpt-oss-20b',messages,'clarify',signal,async(url,options)=>{
 assert.equal(url,'https://integrate.api.nvidia.com/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer fixture');assert.equal(JSON.parse(options.body).reasoning_effort,'low');return ok({questions:['Who is it for?'],options:[['Students','Professionals']]});
});
// Thorough mode itself uses cross-provider fallback; it does not silently skip planning.
const tasks=[];const p=newProject('Thorough test');p.brief='For beginners';
const clarified=await runTask(p,'Build a tracker','build',true,async(msgs,task)=>{
 tasks.push(task);assert.ok(msgs[1].content.includes('For beginners'));
 return {content:JSON.stringify({questions:['What do you want to track?'],options:[['Habits','Expenses']]}),model:'fixture',tokens:1,route:{task,model:'fixture',reason:'test'}};
});assert.deepEqual(tasks,['clarify']);assert.equal(clarified.questions.length,1);assert.equal(clarified.result.artifact,null);
tasks.length=0;await runTask(newProject(),'Explain 2 + 2 in one sentence','explain',true,async(msgs,task)=>{tasks.push(task);return {content:JSON.stringify(task==='clarify'?{questions:[],options:[]}:answer),model:'fixture',tokens:1,route:{task,model:'fixture',reason:'test'}}});assert.deepEqual(tasks,['clarify','clarify','explain']);
console.log('PASS: provider rotation, persistent retries, cooldown waits, sanitized live errors, credentials/quota fallback, request guards, cancellation, NVIDIA contract, and Thorough planning.');

// A complete first pass still receives a gap audit; newly discovered gaps block generation.
const auditTasks=[];
const audited=await runTask(newProject(),'Build a tracker','build',true,async(msgs,task)=>{auditTasks.push(task);return {content:JSON.stringify(auditTasks.length===1?{questions:[],options:[]}:{questions:['Which timezone?'],options:[['UTC','Local time']]}),model:'fixture',tokens:1,route:{task,model:'fixture',reason:'test'}}});
assert.equal(audited.questions.length,1);assert.deepEqual(auditTasks,['clarify','clarify']);
const many=await runTask(newProject(),'Design a complex tool','build',true,async(msgs,task)=>({content:JSON.stringify({questions:Array.from({length:12},(_,i)=>'Decision '+i+'?'),options:Array.from({length:12},()=>['A','B'])}),model:'fixture',tokens:1,route:{task,model:'fixture',reason:'test'}}));
assert.equal(many.questions.length,12);
console.log('PASS: twelve-question batches and final gap audit.');

// Existing projects and submitted quiz answers must never restart clarification.
for (const state of ['answered','followup','legacy-pending']) {
 const project=newProject();project.messages.push({id:'u',role:'user',text:'Build a tracker',createdAt:'now'});
 if(state==='answered') project.confirmedTask={prompt:'Build a tracker',answers:[{question:'Track what?',answer:'Habits'}]};
 if(state==='legacy-pending') project.clarification={id:'pending',prompt:'Build a tracker',mode:'build',questions:['Track what?']};
 const calls=[];
 const output=await runTask(project,'Use these details','build',true,async(messages,task)=>{calls.push(task);return {content:JSON.stringify(answer),model:'fixture',tokens:1,route:{task,model:'fixture',reason:'test'}}});
 assert.deepEqual(calls,['coding']);assert.deepEqual(output.questions,[]);
}
console.log('PASS: quiz answers, follow-ups, and existing pending projects bypass clarification.');
