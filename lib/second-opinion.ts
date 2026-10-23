import { z } from "zod";
import type { ChatMessage } from "./free-ai.ts";
import { parseJson } from "./free-ai.ts";
import { HttpError } from "./errors.ts";
import type { ProgressSink } from "./ai-progress.ts";
import { createProviderRouter, type Provider, type ProviderKeys } from "./provider-router.ts";
import { GENERATION_TIMEOUT_MS } from "./retry.ts";

export const secondOpinionResponseSchema = z.object({
  verdict: z.enum(["agrees", "critiques", "refines"]),
  summary: z.string().min(1).max(2000),
  strengths: z.array(z.string().min(1).max(400)).max(5).optional(),
  issues: z.array(z.string().min(1).max(500)).max(6),
  suggestedRevision: z.string().max(8000).optional().nullable(),
});

export const secondOpinionReportSchema = secondOpinionResponseSchema.extend({
  id: z.string().uuid(),
  messageId: z.string().min(1).max(128),
  reviewerProvider: z.string(),
  reviewerModel: z.string(),
  createdAt: z.string(),
  tokens: z.number().nonnegative(),
});

export type SecondOpinionResponse = z.infer<typeof secondOpinionResponseSchema>;
export type SecondOpinionReport = z.infer<typeof secondOpinionReportSchema>;

export async function getSecondOpinion(
  prompt: string,
  answer: string,
  messageId: string,
  originalModel: string,
  signal: AbortSignal,
  reserveCall: () => Promise<void>,
  progress: ProgressSink = () => {},
  keys: ProviderKeys = {},
  options: { fetcher?: typeof fetch } = {}
): Promise<SecondOpinionReport> {
  if (signal.aborted) throw new HttpError(409, "Second opinion was cancelled.");

  // Determine original provider from model name
  const originalLower = (originalModel || "").toLowerCase();
  let originalProvider: Provider = "gemini";
  if (originalLower.includes("groq") || originalLower.includes("gpt-oss") || originalLower.includes("qwen")) {
    originalProvider = "groq";
  } else if (originalLower.includes("nvidia") || originalLower.includes("deepseek")) {
    originalProvider = "nvidia";
  }

  // Cross-provider selection: pick a provider different from the author
  const allProviders: Provider[] = ["gemini", "groq", "nvidia"];
  const available = allProviders.filter(p => keys[p]);

  if (!available.length) {
    throw new HttpError(503, "No AI providers connected for second opinion.");
  }

  // Priority to other providers first
  let selectedProvider = available.find(p => p !== originalProvider);
  if (!selectedProvider) {
    selectedProvider = available[0];
  }

  progress({
    phase: "second-opinion",
    provider: selectedProvider.toUpperCase(),
    model: "Peer Reviewer",
    task: "second-opinion",
    attempt: 1,
    message: `Requesting independent second opinion from ${selectedProvider.toUpperCase()}…`,
  });

  const deadline = AbortSignal.any([signal, AbortSignal.timeout(GENERATION_TIMEOUT_MS)]);
  const prioritizedKeys: ProviderKeys = { [selectedProvider]: keys[selectedProvider]! };
  for (const p of available) {
    if (p !== selectedProvider) prioritizedKeys[p] = keys[p]!;
  }
  const router = createProviderRouter(prioritizedKeys, deadline, reserveCall, progress, { fetcher: options.fetcher });

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: 'You are an elite, independent AI Peer Reviewer. You are evaluating a proposed answer to a user\'s question. Conduct a rigorous, constructive second opinion. Evaluate technical accuracy, omissions, flawed assumptions, edge cases, and conciseness. Assign verdict: "agrees" (sound and accurate with minor notes), "critiques" (contains noticeable errors, edge case oversights, or risks), or "refines" (fundamentally valid but significantly improvable). Provide 1-5 concrete issues. If the answer should be corrected or refined, provide a complete, drop-in "suggestedRevision". Return ONLY valid JSON matching: {"verdict":"agrees"|"critiques"|"refines","summary":"1-3 sentence evaluation","strengths":["1-3 key accurate points"],"issues":["1-5 flaws or missing aspects"],"suggestedRevision":"Full rewritten or enhanced answer or null"}.',
    },
    {
      role: "user",
      content: JSON.stringify({ question: prompt, answer }),
    },
  ];

  const completion = await router(messages, "second-opinion");
  const parsed = secondOpinionResponseSchema.parse(parseJson(completion.content));

  return {
    id: crypto.randomUUID(),
    messageId,
    reviewerProvider: selectedProvider,
    reviewerModel: completion.model,
    createdAt: new Date().toISOString(),
    tokens: completion.tokens,
    verdict: parsed.verdict,
    summary: parsed.summary,
    strengths: parsed.strengths || [],
    issues: parsed.issues,
    suggestedRevision: parsed.suggestedRevision || null,
  };
}
