import { type ChatMessage, type Completion, plannerSchema, parseJson } from "./free-ai.ts";
import { resultSchema } from "./project.ts";
import { HttpError } from "./errors.ts";
import type { Task } from "./routing.ts";
import { AI_RETRY, waitForRetry } from "./retry.ts";

// Explicit free-tier-eligible models; never discover or select paid-only alternatives.
export function geminiModels(task: Task) {
  return task === "clarify" ? ["gemini-3.7-flash", "gemini-3.8-flash"] : ["gemini-3.8-flash", "gemini-3.7-flash"];
}
const answerSchema = { type: "object", properties: {
  reply: { type: "string", minLength: 1, maxLength: 6000 },
  artifact: { anyOf: [{ type: "null" }, { type: "object", properties: {
    title: { type: "string", minLength: 1, maxLength: 100 }, html: { type: "string", minLength: 1, maxLength: 45000 },
  }, required: ["title", "html"] }] },
}, required: ["reply", "artifact"] };
const questionSchema = { type: "object", properties: {
  questions: { type: "array", maxItems: 3, items: { type: "string", minLength: 1, maxLength: 250 } },
  options: { type: "array", maxItems: 3, items: { type: "array", minItems: 2, maxItems: 4, items: { type: "string", minLength: 1, maxLength: 120 } } },
}, required: ["questions", "options"] };

export async function completeGemini(key: string, messages: ChatMessage[], task: Task, signal: AbortSignal, fetcher: typeof fetch = fetch, reserveCall: () => Promise<void> = async () => {}, wait: typeof waitForRetry = waitForRetry): Promise<Completion> {
  if (new TextEncoder().encode(JSON.stringify(messages)).length > 90000) throw new HttpError(413, "This project context is too large. Save a concise brief and start a new project.");
  let last = new HttpError(503, "Google AI is temporarily busy. Please try again shortly.");
  let retryDelay: number = AI_RETRY.delayMs;
  const attempts = geminiModels(task).flatMap(model => Array<string>(AI_RETRY.attemptsPerModel).fill(model));
  for (const [index, model] of attempts.entries()) {
    if (index) {
      try { await wait(retryDelay, signal); }
      catch { throw new HttpError(504, "The AI request timed out or was stopped. Your saved work is unchanged."); }
    }
    retryDelay = AI_RETRY.delayMs;
    if (signal.aborted) throw new HttpError(504, "The AI request timed out or was stopped. Your saved work is unchanged.");
    await reserveCall();
    let response: Response;
    let data: { error?: { status?: string; message?: string; details?: { retryDelay?: string }[] }; promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[]; usageMetadata?: { totalTokenCount?: number } };
    try {
      response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: messages.filter(m => m.role === "system").map(m => ({ text: m.content })) },
          contents: messages.filter(m => m.role !== "system").map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          generationConfig: { maxOutputTokens: task === "clarify" ? 4096 : 16384, responseMimeType: "application/json", responseJsonSchema: task === "clarify" ? questionSchema : answerSchema },
        }), signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
      });
      data = await response.json();
    } catch { last = new HttpError(504, "Google AI took too long to respond. Your saved work is unchanged. Please try again."); continue; }
    if (!response.ok || data.error) {
      if ([401, 403].includes(response.status) || (response.status === 400 && /api.key|API_KEY_INVALID/i.test(data.error?.message || ""))) throw new HttpError(503, "Google AI access is unavailable. The site owner needs to check its connection.");
      if (response.status === 429) {
        const delay = Number(response.headers.get("retry-after") || data.error?.details?.find(d => d.retryDelay)?.retryDelay?.replace(/s$/, ""));
        last = new HttpError(429, `Google AI's request or token allowance is temporarily exhausted.${Number.isFinite(delay) && delay > 0 ? ` Try again in ${Math.ceil(delay)} seconds.` : " Please try again after its quota resets."}`);
        if (/per.?day|daily|limit:\s*0\b/i.test(JSON.stringify(data.error))) throw last;
        if (Number.isFinite(delay) && delay > 0) retryDelay = Math.max(AI_RETRY.delayMs, delay * 1000);
        continue;
      }
      last = new HttpError(502, "Google AI could not complete this request. Please try again shortly.");
      if (response.status === 400) throw last;
      continue;
    }
    const candidate = data.candidates?.[0];
    if (data.promptFeedback?.blockReason || (candidate?.finishReason && !["STOP", "MAX_TOKENS"].includes(candidate.finishReason))) throw new HttpError(422, "Google AI could not answer this request. Try rephrasing it.");
    if (candidate?.finishReason === "MAX_TOKENS") { last = new HttpError(502, "The AI reached its output limit. Ask for a smaller tool or change. Your saved work is unchanged."); continue; }
    const content = candidate?.content?.parts?.filter(p => !p.thought).map(p => p.text || "").join("");
    try { if (!content || !(task === "clarify" ? plannerSchema : resultSchema).safeParse(parseJson(content)).success) throw Error("Invalid response"); }
    catch { last = new HttpError(502, "Google AI returned an incomplete response. Please try a smaller request."); continue; }
    return { content: content!, model, tokens: data.usageMetadata?.totalTokenCount || 0, route: { task, model, reason: `Gemini ${task} route.${index >= AI_RETRY.attemptsPerModel ? " Switched models after three unsuccessful attempts." : index ? ` Succeeded on attempt ${index + 1}.` : ""}` } };
  }
  throw new HttpError(last.status, `${last.message} Tried both Gemini models three times each. Your saved work is unchanged.`);
}
