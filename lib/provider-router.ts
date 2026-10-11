import { type ChatMessage, type Completion, parseJson, plannerSchema } from "./free-ai.ts";
import { resultSchema } from "./project.ts";
import type { Task } from "./routing.ts";
import { HttpError } from "./errors.ts";
import { waitForRetry } from "./retry.ts";
import type { ProgressSink } from "./ai-progress.ts";

export type Provider = "gemini" | "groq" | "nvidia";
export type ProviderKeys = Partial<Record<Provider, string>>;
const names: Record<Provider, string> = { gemini: "Google Gemini", groq: "Groq", nvidia: "NVIDIA" };
export function providerModels(provider: Provider, task: Task) {
  if (provider === "gemini") return ["gemini-3.7-flash", "gemini-3.8-flash"];
  if (provider === "nvidia") return task === "clarify" ? ["openai/gpt-oss-20b", "deepseek-ai/deepseek-v4.1-flash"] : ["deepseek-ai/deepseek-v4.1-flash", "openai/gpt-oss-20b"];
  return task === "clarify" ? ["openai/gpt-oss-20b", "qwen/qwen3.8-27b"] : task === "coding" || task === "repair" ? ["qwen/qwen3.8-27b", "openai/gpt-oss-120b"] : ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"];
}
export class ProviderError extends HttpError {
  kind: string; retryMs: number; disable: "provider" | "model" | null;
  constructor(status: number, kind: string, message: string, retryMs = 5000, disable: "provider" | "model" | null = null) {
    super(status, message); this.kind = kind; this.retryMs = retryMs; this.disable = disable;
  }
}
function normalizedMessages(messages: ChatMessage[]) {
  const result: ChatMessage[] = [];
  for (const message of messages) {
    const prev = result.at(-1);
    if (prev?.role === message.role) prev.content += "\n\n" + message.content;
    else result.push({ ...message });
  }
  return result;
}
export async function providerAttempt(provider: Provider, key: string, model: string, messages: ChatMessage[], task: Task, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<Completion> {
  const size = new TextEncoder().encode(JSON.stringify(messages)).length;
  if (size > (provider === "groq" ? 24000 : 90000)) throw new ProviderError(413, "context_limit", "This model cannot fit the project context.", 5000, "provider");
  const gemini = provider === "gemini";
  const url = gemini ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` : provider === "groq" ? "https://api.groq.com/openai/v1/chat/completions" : "https://integrate.api.nvidia.com/v1/chat/completions";
  const body = gemini ? {
    systemInstruction: { parts: messages.filter(m => m.role === "system").map(m => ({ text: m.content })) },
    contents: normalizedMessages(messages.filter(m => m.role !== "system")).map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: task === "clarify" ? 4096 : 16384 },
  } : {
    model, messages: normalizedMessages(messages), stream: false,
    ...(provider === "groq" ? { response_format: { type: "json_object" }, max_completion_tokens: 4000, reasoning_effort: model.startsWith("qwen/") ? "none" : "low" } : { max_tokens: 4096, ...(model.startsWith("openai/") ? { reasoning_effort: "low" } : {}) }),
  };
  let response: Response;
  let data: { error?: { message?: string; details?: { retryDelay?: string }[] }; promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[]; choices?: { finish_reason?: string; message?: { content?: string } }[]; usageMetadata?: { totalTokenCount?: number }; usage?: { total_tokens?: number } };
  try {
    response = await fetcher(url, { method: "POST", headers: gemini ? { "x-goog-api-key": key, "Content-Type": "application/json" } : { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]) });
    // Providers sometimes return an HTML error. Preserve its HTTP category.
    const raw = await response.text();
    try { data = JSON.parse(raw); } catch { data = {}; }
  } catch {
    if (signal.aborted) throw new HttpError(409, "This request was stopped.");
    throw new ProviderError(504, "timeout", "The model timed out or its network connection failed.");
  }
  if (!response.ok || data.error || response.status === 202) {
    if ([401, 403].includes(response.status) || (response.status === 400 && /api.key|API_KEY_INVALID/i.test(data.error?.message || ""))) throw new ProviderError(503, "authentication", "The provider rejected the site's connection.", 5000, "provider");
    if (response.status === 404) throw new ProviderError(503, "unavailable", "This model is not available on the account.", 5000, "model");
    if (response.status === 429 || response.status === 402) {
      const daily = response.status === 402 || /per.?day|daily|limit:\s*0\b|credits|insufficient.quota/i.test(JSON.stringify(data.error));
      const header = response.headers.get("retry-after");
      const seconds = header ? (Number.isFinite(Number(header)) ? Number(header) : (Date.parse(header) - Date.now()) / 1000) : Number(data.error?.details?.find(d => d.retryDelay)?.retryDelay?.replace(/s$/, ""));
      throw new ProviderError(429, daily ? "quota" : "rate_limit", daily ? "The provider's daily quota or credits are exhausted." : "The provider is rate-limiting requests.", Number.isFinite(seconds) && seconds > 0 ? Math.max(5000, seconds * 1000) : 5000, daily ? "provider" : null);
    }
    if (response.status === 413) throw new ProviderError(413, "context_limit", "This model cannot fit the project context.", 5000, "provider");
    if ([400, 422].includes(response.status)) throw new ProviderError(502, "request_rejected", "This model rejected the request format.", 5000, "model");
    throw new ProviderError(503, "busy", "The provider is busy or temporarily unavailable.");
  }
  const candidate = data.candidates?.[0], choice = data.choices?.[0];
  if (data.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY" || choice?.finish_reason === "content_filter") throw new HttpError(422, "The AI could not answer this request. Try rephrasing it.");
  if (candidate?.finishReason === "MAX_TOKENS" || choice?.finish_reason === "length") throw new ProviderError(502, "output_limit", "The response exceeded this model's output limit.");
  const content = gemini ? candidate?.content?.parts?.filter(p => !p.thought).map(p => p.text || "").join("") : choice?.message?.content;
  try { if (!content || !(task === "clarify" ? plannerSchema : resultSchema).safeParse(parseJson(content)).success) throw Error("Invalid response"); }
  catch { throw new ProviderError(502, "invalid_response", "The model returned an incomplete or invalid response."); }
  return { content: content!, model: `${names[provider]} · ${model}`, tokens: data.usageMetadata?.totalTokenCount || data.usage?.total_tokens || 0, route: { task, model, reason: `${names[provider]} returned a valid ${task} response.` } };
}

// Health is a short-lived hint within a Worker instance, not a guarantee of availability.
const cooldown = new Map<string, number>();
export function createProviderRouter(keys: ProviderKeys, signal: AbortSignal, reserve: () => Promise<void>, progress: ProgressSink = () => {}, options: { fetcher?: typeof fetch; wait?: typeof waitForRetry; health?: Map<string, number> } = {}) {
  const providers = (["gemini", "groq", "nvidia"] as Provider[]).filter(p => keys[p]);
  const disabledProviders = new Set<Provider>(), disabledModels = new Set<string>();
  const health = options.health || cooldown, wait = options.wait || waitForRetry;
  return async (messages: ChatMessage[], task: Task): Promise<Completion> => {
    if (!providers.length) throw new HttpError(503, "No AI provider is connected.");
    let attempt = 0, last: ProviderError | undefined;
    while (providers.some(p => !disabledProviders.has(p) && providerModels(p, task).some(m => !disabledModels.has(p + ":" + m)))) {
      if (signal.aborted) throw new HttpError(409, "This request was stopped or timed out. Your saved work is unchanged.");
      // Try a different provider next; do not block all providers on one's Retry-After.
      const ordered = [...providers].sort((a, b) => Math.min(...providerModels(a, task).map(m => health.get(a + ":" + m) || 0)) - Math.min(...providerModels(b, task).map(m => health.get(b + ":" + m) || 0)));
      for (const provider of ordered) {
        if (disabledProviders.has(provider)) continue;
        const models = providerModels(provider, task).filter(m => !disabledModels.has(provider + ":" + m));
        if (!models.length) continue;
        const model = [...models].sort((a, b) => (health.get(provider + ":" + a) || 0) - (health.get(provider + ":" + b) || 0))[0];
        const remaining = (health.get(provider + ":" + model) || 0) - Date.now();
        if (attempt || remaining > 0) {
          const delay = Math.max(attempt ? 5000 : 0, remaining);
          progress({ phase: "retry", provider: names[provider], model, task, attempt: attempt + 1, message: `Switching to ${names[provider]} · ${model}`, error: last?.message, waitSeconds: Math.ceil(delay / 1000) });
          try { await wait(delay, signal); } catch { throw new HttpError(409, "This request was stopped."); }
        }
        if (signal.aborted) throw new HttpError(409, "This request was stopped.");
        await reserve(); // Cancellation and project ownership checks must never be bypassed by fallback.
        attempt++;
        progress({ phase: "attempt", provider: names[provider], model, task, attempt, message: task === "clarify" ? "Checking your prompt for missing details" : task === "repair" ? "Repairing the generated code" : "Generating your result" });
        try {
          const result = await providerAttempt(provider, keys[provider]!, model, messages, task, signal, options.fetcher);
          health.delete(provider + ":" + model);
          progress({ phase: "success", provider: names[provider], model, task, attempt, message: "Response received; validating the result" });
          return result;
        } catch (error) {
          if (!(error instanceof ProviderError)) throw error;
          last = error;
          if (error.disable === "provider") disabledProviders.add(provider);
          if (error.disable === "model") disabledModels.add(provider + ":" + model);
          health.set(provider + ":" + model, Date.now() + Math.max(error.retryMs, error.kind === "timeout" ? 60000 : 5000));
          progress({ phase: "retry", provider: names[provider], model, task, attempt, message: "Trying another available model", error: `${error.kind}: ${error.message}` });
        }
      }
    }
    throw new HttpError(last?.status || 503, `The connected AI providers could not complete this request after ${attempt} attempts. ${last?.message || "Please try again shortly."} Your saved work is unchanged.`);
  };
}
