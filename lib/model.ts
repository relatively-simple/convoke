import { env } from "cloudflare:workers";
import { type Project, type Mode } from "./project";
import { HttpError } from "./errors";
import { runTask } from "./free-ai";
import { createProviderRouter } from "./provider-router";
import type { ProgressSink } from "./ai-progress";
import { GENERATION_TIMEOUT_MS } from "./retry";
export async function generate(project: Project, prompt: string, mode: Mode, signal: AbortSignal, thorough: boolean, reserveCall: () => Promise<void>, progress: ProgressSink = () => {}) {
  const keys = { gemini: env.GEMINI_API_KEY, groq: env.GROQ_API_KEY, nvidia: env.NVIDIA_API_KEY };
  if (!Object.values(keys).some(Boolean)) throw new HttpError(503,"AI is temporarily unavailable. Please try again shortly.");
  const deadline = AbortSignal.any([signal,AbortSignal.timeout(GENERATION_TIMEOUT_MS)]);
  return runTask(project,prompt,mode,thorough,createProviderRouter(keys,deadline,reserveCall,progress));
}
