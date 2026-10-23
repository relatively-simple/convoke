import type { Artifact, Project } from "./project.ts";
import { runtimeDocument } from "./runtime-document.ts";
export type RuntimeReport={issues:string[];output?:string;testsPassed?:number};
let three:Promise<string>|undefined;
let math:Promise<[string,string]>|undefined;
let pyodideSrc:Promise<string>|undefined;
export async function documentForArtifact(artifact:Artifact,token:string){
  let library="";
  if(artifact.libraries?.includes("three")){
    three??=fetch('/runtime/three.js').then(r=>{if(!r.ok)throw Error('Could not load the 3D runtime');return r.text();}).catch(e=>{three=undefined;throw e;});
    library=await three;
  }
  let mathSource="",mathCSS="";
  if(!artifact.python){
    math??=Promise.all(['/runtime/math.js','/runtime/katex.css'].map(url=>fetch(url).then(r=>{if(!r.ok)throw Error('Could not load math support');return r.text();}))).then(items=>items as [string,string]).catch(e=>{math=undefined;throw e;});
    [mathSource,mathCSS]=await math;
    mathCSS=mathCSS.replace(/url\(fonts\//g,`url(${location.origin}/runtime/fonts/`);
  }
  // For Python artifacts, fetch pyodide.js source once and inline it into the
  // worker blob. Blob worker content is parsed as a native JS program — no eval
  // is needed — so this approach works within the existing CSP without unsafe-eval.
  let pyodideSource="";
  if(artifact.python){
    pyodideSrc??=fetch('/runtime/pyodide.js').then(r=>{if(!r.ok)throw Error('Could not load Python runtime');return r.text();}).catch(e=>{pyodideSrc=undefined;throw e;});
    pyodideSource=await pyodideSrc;
  }
  return runtimeDocument(artifact,token,location.origin,library,mathSource,mathCSS,pyodideSource);
}
export async function testArtifact(artifact:Artifact,signal:AbortSignal):Promise<RuntimeReport>{
  const token=crypto.randomUUID();
  const doc=await documentForArtifact(artifact,token);
  if(signal.aborted)throw new DOMException('Stopped','AbortError');
  return new Promise((resolve,reject)=>{
    const frame=document.createElement('iframe');frame.sandbox.add('allow-scripts');frame.title='Checking generated result';frame.setAttribute('aria-hidden','true');
    frame.style.cssText='position:fixed;left:-10000px;top:0;width:1000px;height:700px;border:0;pointer-events:none';
    let timer: ReturnType<typeof setTimeout> | undefined = undefined;
    const cleanup=()=>{if(timer)clearTimeout(timer);window.removeEventListener('message',receive);signal.removeEventListener('abort',abort);frame.remove();};
    const abort=()=>{cleanup();reject(new DOMException('Stopped','AbortError'));};
    const receive=(event:MessageEvent)=>{
      const data=event.data;
      if(event.source!==frame.contentWindow||(event.origin!=='null'&&event.origin!==''&&event.origin!==location.origin)||data?.type!=='convoke-runtime'||data.token!==token||!Array.isArray(data.issues))return;
      cleanup();resolve({issues:data.issues.slice(0,8).map((x:unknown)=>String(x).slice(0,1600)),output:typeof data.output==='string'?data.output.slice(0,12000):undefined,testsPassed:Number(data.testsPassed)||0});
    };
    timer=setTimeout(()=>{cleanup();resolve({issues:['The browser check did not finish within its time limit.']});},artifact.python?55000:7000);
    window.addEventListener('message',receive);signal.addEventListener('abort',abort,{once:true});frame.srcdoc=doc;document.body.appendChild(frame);
  });
}
export async function recordRuntime(project:Project,report:RuntimeReport,signal:AbortSignal){
  const version = project.versions.at(-1);
  if (!version) return project;
  const response=await fetch('/api/workspace',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'runtime',projectId:project.id,revision:project.revision,versionId:version.id,...report})});
  const data=await response.json() as {project:Project;error?:string};if(!response.ok)throw Error(data.error||'Could not save browser checks');return data.project as Project;
}
