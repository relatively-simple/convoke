import { type ChatMessage, type Completion, plannerSchema, parseJson, sanitizeEmptyArtifact } from "./free-ai.ts";
import { resultSchema } from "./project.ts";
import { HttpError } from "./errors.ts";
import type { Task } from "./routing.ts";
export function groqModels(task: Task) {
  return task === "clarify" ? ["openai/gpt-oss-20b","qwen/qwen3.8-27b"] : task === "coding" || task === "repair" ? ["qwen/qwen3.8-27b","openai/gpt-oss-120b"] : ["openai/gpt-oss-120b","qwen/qwen3.8-27b"];
}
const utf8Encoder = new TextEncoder();

export async function completeGroq(key: string, messages: ChatMessage[], task: Task, signal: AbortSignal, fetcher: typeof fetch = fetch, reserveCall: () => Promise<void> = async()=>{}): Promise<Completion> {
  if (utf8Encoder.encode(JSON.stringify(messages)).length > 24000) throw new HttpError(413,"This project is too large for the current Groq Free plan request budget. Start a new project with a shorter brief or ask for smaller tools.");
  let last = new HttpError(503,"Groq is temporarily unavailable. Please retry shortly.");
  for (const [index,model] of groqModels(task).entries()) {
    if (signal.aborted) throw new HttpError(504,"The AI request timed out or was stopped. Your saved work is unchanged.");
    await reserveCall();
    let response: Response;
    let data: {error?:{code?:string;message?:string};choices?:{finish_reason?:string;message?:{content?:string}}[];usage?:{total_tokens?:number}};
    try {
      response = await fetcher("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,messages,response_format:{type:"json_object"},reasoning_effort:model.startsWith("qwen/")?"none":"low",max_completion_tokens:task==="clarify"?1000:4000,stream:false}),signal:AbortSignal.any([signal,AbortSignal.timeout(35000)])});
      data = await response.json();
    } catch { last = new HttpError(504,"Groq took too long to return an answer. Your saved work is unchanged. Please retry shortly."); continue; }
    if (!response.ok || data.error) {
      if (response.status===401) throw new HttpError(503,"Groq rejected the API key. Check the server key configuration.");
      if (response.status===429) {
        const seconds=Number(response.headers.get("retry-after"));
        const wait=Number.isFinite(seconds)&&seconds>0?` Try again in ${Math.ceil(seconds)} seconds.`:" Try again after the account limit resets.";
        last=new HttpError(429,`Groq's request or token rate limit was reached.${wait} This can happen before the daily request allowance is used.`);
        continue;
      }
      if (response.status===413) {last=new HttpError(413,"Groq cannot fit this request within the account's token limit. Start a smaller project or shorten your prompt.");continue;}
      console.warn("Groq request failed",response.status,model,data.error?.code || "provider_error");
      last=new HttpError(502,"Groq could not complete this request. Try a smaller request or retry shortly.");continue;
    }
    const choice=data.choices?.[0];
    if(choice?.finish_reason==="length") {last=new HttpError(502,"The AI reached its output limit. Ask for a smaller tool or change. Your saved work is unchanged.");continue;}
    if(!choice?.message?.content){last=new HttpError(502,"Groq returned an empty answer. Please try again.");continue;}
    try {
      const parsed = sanitizeEmptyArtifact(parseJson(choice.message.content));
      if (!(task === "clarify" ? plannerSchema : resultSchema).safeParse(parsed).success) throw new Error("Invalid response");
    }
    catch {last=new HttpError(502,"The AI returned an incomplete response. Please try again with a smaller request.");continue;}
    return {content:choice.message.content,model,tokens:data.usage?.total_tokens||0,route:{task,model,reason:`Groq ${task} route.${index?" Used the alternative model after the first attempt failed.":""} Task-based selection; not a claim of universal model superiority.`}};
  }
  throw last;
}
