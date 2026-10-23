import { env } from "cloudflare:workers";
import { type Project, type Mode } from "./project";
import { HttpError } from "./errors";
import { runTask } from "./free-ai";
import { createProviderRouter } from "./provider-router";
import type { ProgressSink } from "./ai-progress";
import { GENERATION_TIMEOUT_MS } from "./retry";
import type { Comparison } from "./project";
export async function compareModels(project:Project,prompt:string,mode:Mode,signal:AbortSignal,reserve:()=>Promise<void>,progress:ProgressSink):Promise<Comparison>{
  const keys={gemini:env.GEMINI_API_KEY,groq:env.GROQ_API_KEY,nvidia:env.NVIDIA_API_KEY};
  const deadline=AbortSignal.any([signal,AbortSignal.timeout(GENERATION_TIMEOUT_MS)]);
  const entries=Object.entries(keys).filter(([,key])=>key);
  if(entries.length<2)throw new HttpError(503,"Connect at least two providers to compare answers.");
  const results=await Promise.all(entries.map(async([provider,key])=>{
    try{
      const output=await runTask(structuredClone(project),prompt,mode,false,createProviderRouter({[provider]:key},deadline,reserve,progress));
      return {id:crypto.randomUUID(),provider,model:output.model,reply:output.result.reply,visuals:"visuals" in output.result?output.result.visuals:undefined,artifact:output.result.artifact,tokens:output.tokens};
    }catch(e){return {id:crypto.randomUUID(),provider,error:e instanceof HttpError?e.message:"This provider could not complete the comparison."};}
  }));
  if(signal.aborted)throw new HttpError(409,"This comparison was stopped.");
  return {id:crypto.randomUUID(),prompt,results,createdAt:new Date().toISOString()};
}
export async function generate(project: Project, prompt: string, mode: Mode, signal: AbortSignal, thorough: boolean, reserveCall: () => Promise<void>, progress: ProgressSink = () => {}, smartRouting: boolean = true) {
  const keys = { groq: env.GROQ_API_KEY, gemini: env.GEMINI_API_KEY, nvidia: env.NVIDIA_API_KEY };
  if (!Object.values(keys).some(Boolean)) throw new HttpError(503,"AI is temporarily unavailable. Please try again shortly.");
  const deadline = AbortSignal.any([signal,AbortSignal.timeout(GENERATION_TIMEOUT_MS)]);
  return runTask(project,prompt,mode,thorough,createProviderRouter(keys,deadline,reserveCall,progress,{ smartRouting }),smartRouting,progress);
}
