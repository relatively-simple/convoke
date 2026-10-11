import assert from 'node:assert/strict';
import {completeGemini as realCompleteGemini,geminiModels} from '../lib/gemini.ts';
const signal=new AbortController().signal;
const delays=[];
const completeGemini=(...args)=>{args[5] ??= async()=>{}; args[6] ??= async ms=>{delays.push(ms)};return realCompleteGemini(...args)};
const valid={reply:'Ready',artifact:null};
const success=()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'hidden reasoning'},{text:JSON.stringify(valid)}]}}],usageMetadata:{totalTokenCount:42}});
let calls=0,reserved=0;
const r=await completeGemini('test-key',[{role:'system',content:'System rules'},{role:'user',content:'Prompt'},{role:'assistant',content:'Previous reply'}],'coding',signal,async(url,options)=>{
 assert.ok(url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/'));
 assert.ok(!url.includes('test-key'));assert.equal(options.headers['x-goog-api-key'],'test-key');
 const b=JSON.parse(options.body);assert.equal(b.systemInstruction.parts[0].text,'System rules');assert.equal(b.contents[1].role,'model');assert.equal(b.generationConfig.responseMimeType,'application/json');
 if(++calls===1)return {json:async()=>{throw new DOMException('Timeout','TimeoutError')}};
 return success();
},async()=>{reserved++});
assert.equal(calls,2);assert.equal(reserved,2);assert.equal(r.model,geminiModels('coding')[0]);assert.equal(r.content,JSON.stringify(valid));assert.equal(r.tokens,42);
for(const status of [401,403]){calls=0;await assert.rejects(completeGemini('fixture',[],'explain',signal,async()=>{calls++;return Response.json({error:{message:'denied'}},{status})}),/access is unavailable/);assert.equal(calls,1);}
calls=0;await assert.rejects(completeGemini('fixture',[],'explain',signal,async()=>{calls++;return Response.json({error:{details:[{retryDelay:'12s'}]}},{status:429})}),/12 seconds/);assert.equal(calls,6);
await assert.rejects(completeGemini('fixture',[],'coding',signal,async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS'}]})),/output limit/);
await assert.rejects(completeGemini('fixture',[],'coding',signal,async()=>Response.json({promptFeedback:{blockReason:'SAFETY'}})),/rephrasing/);
await assert.rejects(completeGemini('fixture',[],'coding',signal,async()=>Response.json({candidates:[{content:{parts:[{text:'{}'}]}}]})),/incomplete response/);
await assert.rejects(completeGemini('fixture',[],'clarify',signal,async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({questions:['Choose?'],options:[]})}]}}]})),/incomplete response/);
let sent=false;await assert.rejects(completeGemini('fixture',[],'coding',AbortSignal.abort(),async()=>{sent=true;return success()}),/stopped/);assert.equal(sent,false);
console.log('PASS: Gemini role mapping, structured output, hidden thoughts, fallback, accounting, auth errors, quota delay, truncation, safety, schema validation and cancellation.');

const order=[];delays.length=0;reserved=0;
await assert.rejects(completeGemini('fixture',[],'coding',signal,async url=>{order.push(url.split('/').at(-1).split(':')[0]);return Response.json({error:{status:'UNAVAILABLE'}},{status:503});},async()=>{reserved++}),/both Gemini models three times/);
assert.deepEqual(order,[...Array(3).fill('gemini-3.8-flash'),...Array(3).fill('gemini-3.7-flash')]);
assert.equal(reserved,6);assert.deepEqual(delays,Array(5).fill(5000));
calls=0;await assert.rejects(completeGemini('fixture',[],'coding',signal,async()=>{calls++;return Response.json({error:{message:'daily quota exceeded'}},{status:429})}),/allowance/);assert.equal(calls,1);
const controller=new AbortController();calls=0;
await assert.rejects(realCompleteGemini('fixture',[],'coding',controller.signal,async()=>{calls++;return Response.json({error:{}},{status:503})},async()=>{},async()=>{controller.abort();throw new DOMException('Stopped','AbortError')}),/stopped/);assert.equal(calls,1);
console.log('PASS: three attempts per model, five-second waits, fallback order, final error only after six failures, daily quota handling, cancellation during backoff.');
