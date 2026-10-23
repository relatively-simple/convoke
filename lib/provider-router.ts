import { type ChatMessage, type Completion, parseJson, plannerSchema } from "./free-ai.ts";
import { summarySchema } from "./shared-state.ts";
import { resultSchema } from "./project.ts";
import { factCheckResponseSchema } from "./fact-check.ts";
import { secondOpinionResponseSchema } from "./second-opinion.ts";
import { boardroomDraftResponseSchema, boardroomCritiqueResponseSchema, boardroomSynthesisResponseSchema } from "./boardroom.ts";
import type { Task } from "./routing.ts";
import { HttpError } from "./errors.ts";
import { waitForRetry } from "./retry.ts";
import type { ProgressSink } from "./ai-progress.ts";

export type Provider = "gemini" | "groq" | "nvidia";
export type ProviderKeys = Partial<Record<Provider, string>>;
const names: Record<Provider, string> = { gemini: "Google Gemini", groq: "Groq", nvidia: "NVIDIA" };
export function providerModels(provider: Provider, task: Task, smartRouting = true) {
  if (!smartRouting) {
    if (provider === "gemini") return ["gemini-3.8-flash", "gemini-3.7-flash"];
    if (provider === "nvidia") return ["deepseek-ai/deepseek-v4.1-flash", "openai/gpt-oss-20b"];
    return ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"];
  }
  if (provider === "gemini") return ["gemini-3.8-flash", "gemini-3.7-flash"];
  if (provider === "nvidia") return (task === "clarify" || task === "summary") ? ["openai/gpt-oss-20b", "deepseek-ai/deepseek-v4.1-flash"] : ["deepseek-ai/deepseek-v4.1-flash", "openai/gpt-oss-20b"];
  return (task === "clarify" || task === "summary") ? ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"] : task === "coding" || task === "repair" ? ["qwen/qwen3.8-27b", "openai/gpt-oss-120b"] : ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"];
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
const utf8Encoder = new TextEncoder();

export async function providerAttempt(provider: Provider, key: string, model: string, messages: ChatMessage[], task: Task, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<Completion> {
  const size = utf8Encoder.encode(JSON.stringify(messages)).length;
  if (size > 90000) throw new ProviderError(413, "context_limit", "This model cannot fit the project context.", 5000, "model");
  const gemini = provider === "gemini";
  const url = gemini ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` : provider === "groq" ? "https://api.groq.com/openai/v1/chat/completions" : "https://integrate.api.nvidia.com/v1/chat/completions";
  const body = gemini ? {
    systemInstruction: { parts: messages.filter(m => m.role === "system").map(m => ({ text: m.content })) },
    contents: normalizedMessages(messages.filter(m => m.role !== "system")).map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: (task === "clarify" || task === "summary") ? 4096 : 16384 },
  } : {
    model, messages: normalizedMessages(messages), stream: false,
    ...(provider === "groq"
      ? { response_format: { type: "json_object" }, max_completion_tokens: (task === "clarify" || task === "summary") ? 1000 : 4000, ...(model.startsWith("openai/") ? { reasoning_effort: "low" } : {}) }
      : { max_tokens: 4096, ...(model.startsWith("openai/") ? { reasoning_effort: "low" } : {}) }),
  };
  let response: Response;
  let data: { error?: { message?: string; details?: { retryDelay?: string }[] }; promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[]; choices?: { finish_reason?: string; message?: { content?: string } }[]; usageMetadata?: { totalTokenCount?: number }; usage?: { total_tokens?: number } };
  try {
    const timeoutMs = (task === "coding" || task === "repair") ? 45000 : 25000;
    response = await fetcher(url, { method: "POST", headers: gemini ? { "x-goog-api-key": key, "Content-Type": "application/json" } : { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) });
    const raw = await response.text();
    try { data = JSON.parse(raw); } catch { data = {}; }
  } catch {
    if (signal.aborted) throw new HttpError(409, "This request was stopped.");
    throw new ProviderError(504, "timeout", "The model timed out or its network connection failed.", 5000, null);
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
    if (response.status === 413) throw new ProviderError(413, "context_limit", "This model cannot fit the project context.", 5000, "model");
    if ([400, 422].includes(response.status)) throw new ProviderError(502, "request_rejected", "This model rejected the request format.", 5000, null);
    throw new ProviderError(503, "busy", "The provider is busy or temporarily unavailable.", 5000, null);
  }
  const candidate = data.candidates?.[0], choice = data.choices?.[0];
  if (data.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY" || choice?.finish_reason === "content_filter") throw new HttpError(422, "The AI could not answer this request. Try rephrasing it.");
  if (candidate?.finishReason === "MAX_TOKENS" || choice?.finish_reason === "length") throw new ProviderError(502, "output_limit", "The response exceeded this model's output limit.", 5000, null);
  const content = gemini ? candidate?.content?.parts?.filter(p => !p.thought).map(p => p.text || "").join("") : choice?.message?.content;
  const validator =
    task === "summary" ? summarySchema :
    task === "clarify" ? plannerSchema :
    task === "fact-check" ? factCheckResponseSchema :
    task === "second-opinion" ? secondOpinionResponseSchema :
    task === "boardroom-draft" ? boardroomDraftResponseSchema :
    task === "boardroom-review" ? boardroomCritiqueResponseSchema :
    task === "boardroom-synthesis" ? boardroomSynthesisResponseSchema :
    resultSchema;
  let rawParsed: Record<string, unknown> | null = null;
  try {
    const parsedObj = parseJson(content || "");
    if (parsedObj && typeof parsedObj === "object") {
      rawParsed = parsedObj as Record<string, unknown>;
      if (rawParsed.artifact && typeof rawParsed.artifact === "object") {
        const art = rawParsed.artifact as { html?: string; python?: string; tests?: unknown };
        if (!art.html?.trim() && !art.python?.trim()) {
          rawParsed.artifact = null;
        } else if (Array.isArray(art.tests)) {
          art.tests = art.tests
            .filter((t: unknown): t is { name: string; steps: { action: string; selector: string; value?: string }[] } =>
              !!t && typeof t === "object" && typeof (t as { name?: unknown }).name === "string" && Array.isArray((t as { steps?: unknown }).steps)
            )
            .slice(0, 3);
        } else {
          art.tests = undefined;
        }
      }
      if (task === "clarify" && Array.isArray(rawParsed.questions)) {
        const qs: string[] = [];
        const opts: string[][] = [];
        const rawOpts = Array.isArray(rawParsed.options) ? rawParsed.options : [];
        for (let i = 0; i < Math.min(rawParsed.questions.length, 12); i++) {
          const q = String(rawParsed.questions[i] || "").trim().slice(0, 250);
          if (!q) continue;
          const candidateOptions = Array.isArray(rawOpts[i]) ? rawOpts[i] : [];
          let o = candidateOptions.map((x: unknown) => String(x || "").trim().slice(0, 120)).filter(Boolean);
          if (o.length < 2) o = ["Standard / Recommended", "Alternative approach"];
          if (o.length > 4) o = o.slice(0, 4);
          qs.push(q);
          opts.push(o);
        }
        rawParsed.questions = qs;
        rawParsed.options = opts;
      }
    }
    if (!validator.safeParse(rawParsed).success) throw Error("Invalid response");
  } catch {
    throw new ProviderError(502, "invalid_response", "The model returned an incomplete or invalid response.", 5000, null);
  }
  return { content: JSON.stringify(rawParsed), model: `${names[provider]} · ${model}`, tokens: data.usageMetadata?.totalTokenCount || data.usage?.total_tokens || 0, route: { task, model, reason: `${names[provider]} returned a valid ${task} response.` } };
}

// Health is a short-lived hint within a Worker instance, not a guarantee of availability.
const cooldown = new Map<string, number>();
export function createProviderRouter(keys: ProviderKeys, signal: AbortSignal, reserve: () => Promise<void>, progress: ProgressSink = () => {}, options: { fetcher?: typeof fetch; wait?: typeof waitForRetry; health?: Map<string, number>; smartRouting?: boolean } = {}) {
  const smartRouting = options.smartRouting !== false;
  const providers = (Object.keys(keys) as Provider[]).filter(p => keys[p] && (["gemini", "groq", "nvidia"] as Provider[]).includes(p));
  const disabledProviders = new Set<Provider>(), disabledModels = new Set<string>();
  const modelAttempts = new Map<string, number>();
  const health = options.health || cooldown, wait = options.wait || waitForRetry;
  const modelsFor = (p: Provider, t: Task) => providerModels(p, t, smartRouting);
  return async (messages: ChatMessage[], task: Task): Promise<Completion> => {
    if (!providers.length) throw new HttpError(503, "No AI provider is connected.");
    if (signal.aborted) throw new HttpError(409, "This request was stopped.");
    let attempt = 0, last: ProviderError | undefined;
    while (!signal.aborted) {
      const activeProviders = providers.filter(p => !disabledProviders.has(p));
      if (!activeProviders.length) {
        throw new HttpError(last?.status || 503, attempt ? `The connected AI providers could not complete this request after ${attempt} attempts. ${last?.message || "Please check your connection."} Your saved work is unchanged.` : `All connected AI providers are unavailable. ${last?.message || "Please check your connection."} Your saved work is unchanged.`);
      }

      const hasUntriedModels = activeProviders.some(p =>
        modelsFor(p, task).some(m => !disabledModels.has(p + ":" + m) && (modelAttempts.get(p + ":" + m) || 0) < 2)
      );

      // If all candidate models have had 2 attempts, reset attempts for the next round so Convoke keeps trying until an output is obtained!
      if (!hasUntriedModels) {
        const canRetry = activeProviders.some(p => modelsFor(p, task).some(m => !disabledModels.has(p + ":" + m)));
        if (canRetry && attempt < 20) {
          for (const p of activeProviders) {
            for (const m of modelsFor(p, task)) {
              if (!disabledModels.has(p + ":" + m)) modelAttempts.set(p + ":" + m, 0);
            }
          }
          progress({ phase: "retry", provider: "Convoke", model: "Rotating providers", task, attempt: attempt + 1, message: "Retrying across models to obtain your result…", waitSeconds: 5 });
          try { await wait(5000, signal); } catch { throw new HttpError(409, "This request was stopped."); }
        } else {
          break;
        }
      }

      const isCandidate = (p: Provider, m: string) => {
        if (disabledModels.has(p + ":" + m)) return false;
        const tries = modelAttempts.get(p + ":" + m) || 0;
        return tries < 2;
      };

      const modelScore = (p: Provider, m: string) => {
        const tries = modelAttempts.get(p + ":" + m) || 0;
        const cool = health.get(p + ":" + m) || 0;
        return tries * 1000000000000 + cool;
      };

      const providerScore = (p: Provider) => {
        const candidates = modelsFor(p, task).filter(m => isCandidate(p, m));
        if (!candidates.length) return Infinity;
        return Math.min(...candidates.map(m => modelScore(p, m)));
      };

      const ordered = [...activeProviders].sort((a, b) => providerScore(a) - providerScore(b));
      for (const provider of ordered) {
        if (disabledProviders.has(provider)) continue;
        const candidateModels = modelsFor(provider, task).filter(m => isCandidate(provider, m));
        if (!candidateModels.length) continue;
        const model = [...candidateModels].sort((a, b) => modelScore(provider, a) - modelScore(provider, b))[0];
        const remaining = (health.get(provider + ":" + model) || 0) - Date.now();
        if (attempt || remaining > 0) {
          const delay = Math.max(attempt ? 5000 : 0, remaining);
          progress({ phase: "retry", provider: names[provider], model, task, attempt: attempt + 1, message: `Switching to ${names[provider]} · ${model}`, error: last?.message, waitSeconds: Math.ceil(delay / 1000) });
          try { await wait(delay, signal); } catch { throw new HttpError(409, "This request was stopped."); }
        }
        if (signal.aborted) throw new HttpError(409, "This request was stopped.");
        await reserve();
        attempt++;
        const taskMsg =
          task === "clarify" ? `Analyzing prompt for missing details using ${names[provider]} (${model})` :
          task === "reasoning" ? `Selecting ${names[provider]} for reasoning · Sending prompt to ${model}` :
          task === "coding" ? `Sending complete prompt to ${names[provider]} (${model}) for code generation` :
          task === "repair" ? `Refining code output (${attempt}/3) using ${names[provider]} (${model})` :
          task === "summary" ? `Updating project memory with ${names[provider]}` :
          `Sending prompt to ${names[provider]} (${model})`;
        const taskPercent = task === "clarify" || task === "summary" ? 20 : task === "repair" ? 90 : 65;
        progress({ phase: "attempt", provider: names[provider], model, task, attempt, message: taskMsg, progressPercent: taskPercent });
        try {
          const result = await providerAttempt(provider, keys[provider]!, model, messages, task, signal, options.fetcher);
          health.delete(provider + ":" + model);
          progress({ phase: "success", provider: names[provider], model, task, attempt, message: `Response received from ${names[provider]} · Validating structure`, progressPercent: 82 });
          return result;
        } catch (error) {
          if (!(error instanceof ProviderError)) throw error;
          last = error;
          const key = provider + ":" + model;
          const currentTries = (modelAttempts.get(key) || 0) + 1;
          modelAttempts.set(key, currentTries);

          // Permanent disables for unrecoverable errors (auth failures, missing models, context limit)
          if (error.disable === "provider") disabledProviders.add(provider);
          if (error.disable === "model") disabledModels.add(key);

          health.set(key, Date.now() + Math.max(error.retryMs, error.kind === "timeout" ? 15000 : 5000));
          const errReason = error.kind === "timeout" ? "Server timed out at" : error.kind === "quota" ? "Daily quota reached at" : error.kind === "rate_limit" ? "Rate limit reached at" : "Server not available at";
          progress({ phase: "retry", provider: names[provider], model, task, attempt, message: `${errReason} ${names[provider]}. Switching to next available model…`, error: `${error.kind}: ${error.message}` });
        }
      }
    }
    if (signal.aborted) throw new HttpError(409, "This request was stopped.");
    throw new HttpError(last?.status || 503, `The connected AI providers could not complete this request after ${attempt} attempts. ${last?.message || "Please try again shortly."} Your saved work is unchanged.`);
  };
}
