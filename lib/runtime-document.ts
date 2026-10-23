import { parse } from "acorn";
import { parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";
import type { Artifact } from "./project.ts";

// Bound generated loops and recursion before loading them in the opaque frame.
// Smoke checks are diagnostics, not a proof of correctness or a security verdict.
export function guardJavaScript(code:string, guard:string){
  const ast=parse(code,{ecmaVersion:"latest",sourceType:"script"}) as unknown as Record<string,unknown>;
  const edits:{at:number;text:string}[]=[];
  function visit(node:Record<string,unknown>){
    if(typeof node.type!=="string")return;
    const loop=["WhileStatement","DoWhileStatement","ForStatement","ForInStatement","ForOfStatement"].includes(node.type);
    const fn=["FunctionDeclaration","FunctionExpression","ArrowFunctionExpression"].includes(node.type);
    const body=node.body as Record<string,unknown>|undefined;
    if((loop||fn)&&body){
      if(body.type==="BlockStatement") edits.push({at:Number(body.start)+1,text:`${guard}();`});
      else if(loop) {edits.push({at:Number(body.start),text:`{${guard}();`},{at:Number(body.end),text:"}"});}
      else if(fn) {edits.push({at:Number(body.start),text:`(${guard}(),`},{at:Number(body.end),text:")"});}
    }
    for(const value of Object.values(node)){
      if(Array.isArray(value))for(const child of value)if(child&&typeof child==="object")visit(child as Record<string,unknown>);
      if(value && typeof value==="object" && !Array.isArray(value))visit(value as Record<string,unknown>);
    }
  }
  visit(ast);
  for(const edit of edits.sort((a,b)=>b.at-a.at))code=code.slice(0,edit.at)+edit.text+code.slice(edit.at);
  return code;
}
function instrument(html:string,guard:string){
  const root=parseFragment(html);
  function visit(node:DefaultTreeAdapterMap["node"]){
    if("tagName" in node && node.tagName==="script"){
      const type=node.attrs.find(a=>a.name==="type")?.value||"text/javascript";
      if(type==="application/json"||type==="application/ld+json")return;
      if(type==="module")throw Error("Use an ordinary inline script, not a module, for the browser harness.");
      for(const child of node.childNodes)if(child.nodeName==="#text"){
        const text=child as DefaultTreeAdapterMap["textNode"];
        text.value=guardJavaScript(text.value,guard);
      }
    }
    if("childNodes" in node)node.childNodes.forEach(visit);
  }
  visit(root);return serialize(root);
}
const json=(value:unknown)=>JSON.stringify(value).replace(/</g,"\\u003c");
export function runtimeDocument(artifact:Artifact,token:string,origin:string,threeSource="",mathSource="",mathCSS="",pyodideSource=""){
  const guard="__convokeGuard"+token.replace(/[^a-z0-9]/gi,"");
  const html=artifact.python?"<pre id=python-output></pre>":instrument(artifact.html,guard);
  const assets=new URL("/runtime/",origin).href;
  const policy=`default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' ${assets}; style-src 'unsafe-inline'; img-src data:; font-src ${assets}; connect-src ${assets}; worker-src blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  // Pyodide source is inlined directly into the worker blob — blob worker content
  // is parsed by the JS engine as a full program, not via eval, so no unsafe-eval needed.
  const workerCode=`const _assets=${json(assets)};\n${pyodideSource}\nonmessage=async e=>{let output='';try{const py=await loadPyodide({indexURL:_assets,stdout:s=>{if(output.length<12000)output+=s+'\\n';},stderr:s=>{if(output.length<12000)output+=s+'\\n';}});postMessage({phase:'loaded'});await py.runPythonAsync(e.data);postMessage({ok:true,output});}catch(err){postMessage({ok:false,error:String(err).slice(0,1600),output});}};`;
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${mathCSS.replace(/<\/style/gi,"<\\/style")}html,body{background-color:#0b0f17 !important;color:#f1f5f9 !important;color-scheme:dark;margin:0;padding:20px;font:16px/1.6 system-ui,-apple-system,sans-serif}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#111827;color:#f3f4f6;padding:12px;border-radius:8px}svg,canvas{max-width:100%}[style*="background: white"],[style*="background-color: white"],[style*="background: #fff"],[style*="background-color: #fff"],[style*="background: rgb(255"],[style*="background-color: rgb(255"]{color:#0f172a !important}</style><script>
const ${guard}=(()=>{let calls=0,start=performance.now();setInterval(()=>{calls=0;start=performance.now();},100);return()=>{if(++calls>100000||performance.now()-start>3000)throw Error('Execution budget exceeded');};})();
(()=>{const token=${json(token)},errors=[];let done=false;const send=parent.postMessage.bind(parent);const report=extra=>{if(done)return;done=true;send({type:'convoke-runtime',token,issues:errors.slice(0,8),...extra},'*');};
const record=e=>{if(errors.length<8)errors.push(String(e).slice(0,1600));};
addEventListener('error',e=>record(e.message));addEventListener('unhandledrejection',e=>record(e.reason));addEventListener('securitypolicyviolation',e=>record('Blocked resource: '+e.violatedDirective));
addEventListener('DOMContentLoaded',async()=>{
${artifact.python?`let timer;const blobUrl=URL.createObjectURL(new Blob([${json(workerCode)}],{type:'text/javascript'}));const worker=new Worker(blobUrl);URL.revokeObjectURL(blobUrl);const stop=()=>{worker.terminate();record('Python execution timed out');report({});};timer=setTimeout(stop,45000);worker.onmessage=e=>{if(e.data.phase==='loaded'){clearTimeout(timer);timer=setTimeout(stop,8000);return;}clearTimeout(timer);worker.terminate();if(!e.data.ok)record(e.data.error);document.getElementById('python-output').textContent=e.data.output||'(No printed output)';report({output:e.data.output||''});};worker.onerror=e=>{clearTimeout(timer);worker.terminate();record(e.message);report({});};worker.postMessage(${json(artifact.python)});`:
`await new Promise(r=>setTimeout(r,600));let testsPassed=0;for(const test of ${json(artifact.tests||[])}){try{for(const step of test.steps){const el=document.querySelector(step.selector);if(!el)throw Error('Missing element '+step.selector);if(step.action==='click')el.click();if(step.action==='input'){el.value=step.value||'';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}await new Promise(r=>setTimeout(r,40));if(step.action==='text'&&!el.textContent.includes(step.value||''))throw Error('Expected text '+step.value+' in '+step.selector);}testsPassed++;}catch(e){record(test.name+': '+e.message);}}await new Promise(r=>setTimeout(r,200));if(window.ConvokeMath)try{window.ConvokeMath.default(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'\\\\[',right:'\\\\]',display:true},{left:'\\\\(',right:'\\\\)',display:false},{left:'$',right:'$',display:false}],trust:false,throwOnError:false,errorCallback:msg=>record('Math: '+msg)});}catch(e){record('Math rendering failed: '+e.message);}if(!document.body.textContent.trim()&&!document.querySelector('canvas,svg,img'))record('The result has no visible content');report({testsPassed});`}
});})();</script>${mathSource?`<script>${mathSource.replace(/<\/script/gi,"<\\/script")}</script>`:""}${threeSource?`<script>${threeSource.replace(/<\/script/gi,"<\\/script")}</script>`:""}</head><body>${html}</body></html>`;
}
