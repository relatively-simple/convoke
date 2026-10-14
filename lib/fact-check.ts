import { z } from "zod";
import type { ChatMessage, Complete } from "./free-ai.ts";
import { parseJson } from "./free-ai.ts";
import { HttpError } from "./errors.ts";
import type { ProgressSink } from "./ai-progress.ts";

export const factClaimSchema = z.object({
  claim: z.string().min(1).max(500),
  status: z.enum(["supported", "contradicted", "unclear"]),
  explanation: z.string().min(1).max(1000),
  correction: z.string().max(1000).optional().nullable(),
  sources: z.array(z.object({
    title: z.string().min(1).max(200),
    url: z.string().max(500).optional().nullable(),
  })).max(5).optional(),
});

export const factCheckResponseSchema = z.object({
  verdict: z.enum(["verified", "disputed", "mixed", "unverified"]),
  summary: z.string().min(1).max(2000),
  claims: z.array(factClaimSchema).min(1).max(10),
  correctedAnswer: z.string().max(8000).optional().nullable(),
});

export const factCheckReportSchema = factCheckResponseSchema.extend({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
  createdAt: z.string(),
});

export type FactClaim = z.infer<typeof factClaimSchema>;
export type FactCheckReport = z.infer<typeof factCheckReportSchema>;

export async function verifyAnswer(
  prompt: string,
  answer: string,
  messageId: string,
  signal: AbortSignal,
  reserveCall: () => Promise<void>,
  complete: Complete,
  progress: ProgressSink = () => {}
): Promise<FactCheckReport> {
  if (signal.aborted) throw new HttpError(409, "Fact-check was cancelled.");
  progress({
    phase: "fact-check",
    provider: "Convoke Verifier",
    model: "Fact-Check",
    task: "fact-check",
    attempt: 1,
    message: "Extracting checkable claims and verifying accuracy…",
  });

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: 'You are an objective, rigorous AI Fact-Checker. Evaluate the factual assertions made in the provided answer against verified real-world knowledge, history, mathematics, science, and technical documentation. Extract between 1 and 8 testable, concrete claims (e.g. dates, statistics, scientific principles, API specifications, historical events, measurements). For each claim, determine status: "supported" (accurate and confirmed), "contradicted" (factually false or misleading; provide the exact correction), or "unclear" (unprovable, subjective, or ambiguous). Set overall verdict: "verified" if all claims are supported, "disputed" if any claim is contradicted, "mixed" if some are supported and others unclear, or "unverified". If any claim is contradicted, provide a complete "correctedAnswer" incorporating the fixes. Return ONLY valid JSON matching {"verdict":"verified"|"disputed"|"mixed"|"unverified","summary":string,"claims":[{"claim":string,"status":"supported"|"contradicted"|"unclear","explanation":string,"correction":string|null,"sources":[{"title":string,"url":string|null}]}], "correctedAnswer":string|null}.',
    },
    {
      role: "user",
      content: JSON.stringify({ question: prompt, answer }),
    },
  ];

  await reserveCall();
  const output = await complete(messages, "fact-check");
  let parsed = factCheckResponseSchema.safeParse(parseJson(output.content));
  if (!parsed.success) {
    // If output had minor format deviations, try relaxed extraction
    const raw = parseJson(output.content) as Record<string, unknown> | null;
    if (raw && typeof raw.summary === "string" && Array.isArray(raw.claims)) {
      const claims = (raw.claims as Record<string, unknown>[]).map(c => ({
        claim: String(c.claim || "Factual assertion").slice(0, 500),
        status: (c.status === "supported" || c.status === "contradicted" || c.status === "unclear" ? c.status : "unclear") as "supported" | "contradicted" | "unclear",
        explanation: String(c.explanation || "").slice(0, 1000),
        correction: typeof c.correction === "string" ? c.correction.slice(0, 1000) : null,
        sources: Array.isArray(c.sources) ? (c.sources as Record<string, unknown>[]).map(s => ({ title: String(s.title || "Reference").slice(0, 200), url: typeof s.url === "string" ? s.url.slice(0, 500) : null })) : undefined,
      }));
      const verdict = raw.verdict === "verified" || raw.verdict === "disputed" || raw.verdict === "mixed" || raw.verdict === "unverified" ? raw.verdict : claims.some(c => c.status === "contradicted") ? "disputed" : "verified";
      parsed = factCheckResponseSchema.safeParse({
        verdict,
        summary: String(raw.summary).slice(0, 2000),
        claims,
        correctedAnswer: typeof raw.correctedAnswer === "string" ? raw.correctedAnswer.slice(0, 8000) : null,
      });
    }
  }
  if (!parsed.success) {
    throw new HttpError(502, "The fact-checking model returned an invalid report. Please try again.");
  }

  return {
    id: crypto.randomUUID(),
    messageId,
    createdAt: new Date().toISOString(),
    ...parsed.data,
  };
}
