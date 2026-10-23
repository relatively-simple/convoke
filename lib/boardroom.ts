import { z } from "zod";
import type { Project } from "./project.ts";
import type { ChatMessage } from "./free-ai.ts";
import { parseJson } from "./free-ai.ts";
import { HttpError } from "./errors.ts";
import type { ProgressSink } from "./ai-progress.ts";
import { createProviderRouter, type Provider, type ProviderKeys } from "./provider-router.ts";
import { GENERATION_TIMEOUT_MS } from "./retry.ts";

export const boardroomMemberSchema = z.object({
  id: z.string(),
  provider: z.string(),
  model: z.string(),
  title: z.string(),
  role: z.string().optional(),
});

export const boardroomDraftResponseSchema = z.object({
  summary: z.string().min(1).max(1000).optional(),
  content: z.string().min(1).max(8000),
});

export const boardroomCritiqueItemSchema = z.object({
  targetPerspective: z.string().min(1).max(100),
  strengths: z.array(z.string().min(1).max(400)).min(1).max(5),
  flaws: z.array(z.string().min(1).max(400)).min(1).max(5),
  score: z.number().min(1).max(10).optional(),
});

export const boardroomCritiqueResponseSchema = z.object({
  critiques: z.array(boardroomCritiqueItemSchema).min(1).max(5),
});

export const boardroomSynthesisResponseSchema = z.object({
  verdict: z.string().min(1).max(8000),
  consensus: z.string().min(1).max(2500),
  disagreements: z.array(z.string().min(1).max(800)).min(1).max(10),
  keyDecisions: z.array(z.string().min(1).max(400)).optional(),
});

export const boardroomDraftSchema = z.object({
  memberId: z.string(),
  provider: z.string(),
  model: z.string(),
  summary: z.string().optional(),
  content: z.string(),
});

export const boardroomReviewSchema = z.object({
  reviewerId: z.string(),
  reviewerModel: z.string(),
  critiques: z.array(boardroomCritiqueItemSchema),
});

export const boardroomSessionSchema = z.object({
  id: z.string().uuid(),
  prompt: z.string(),
  createdAt: z.string(),
  members: z.array(boardroomMemberSchema),
  drafts: z.array(boardroomDraftSchema),
  reviews: z.array(boardroomReviewSchema),
  synthesis: boardroomSynthesisResponseSchema,
  chairmanModel: z.string(),
  tokens: z.number(),
});

export type BoardroomMember = z.infer<typeof boardroomMemberSchema>;
export type BoardroomDraft = z.infer<typeof boardroomDraftSchema>;
export type BoardroomReview = z.infer<typeof boardroomReviewSchema>;
export type BoardroomSynthesis = z.infer<typeof boardroomSynthesisResponseSchema>;
export type BoardroomSession = z.infer<typeof boardroomSessionSchema>;

export async function runBoardroomSession(
  project: Project,
  prompt: string,
  signal: AbortSignal,
  reserveCall: () => Promise<void>,
  progress: ProgressSink = () => {},
  options: { keys?: ProviderKeys; fetcher?: typeof fetch } = {}
): Promise<BoardroomSession> {
  const keys: ProviderKeys = options.keys || (typeof process !== "undefined" && process?.env ? {
    gemini: process.env.GEMINI_API_KEY,
    groq: process.env.GROQ_API_KEY,
    nvidia: process.env.NVIDIA_API_KEY,
  } : {});
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(GENERATION_TIMEOUT_MS)]);
  const availableProviders = (["gemini", "groq", "nvidia"] as Provider[]).filter(p => keys[p]);

  if (!availableProviders.length) {
    throw new HttpError(503, "No AI providers are connected for the Boardroom session.");
  }

  // Define the members. If multiple providers exist, pick one from each (up to 3).
  // If only 1 provider exists, pick up to 3 distinct models from that provider.
  const members: BoardroomMember[] = [];
  if (availableProviders.length >= 3) {
    members.push(
      { id: "member-1", provider: "gemini", model: "gemini-3.7-flash", title: "Google Gemini 3.7", role: "Analytical Lead" },
      { id: "member-2", provider: "groq", model: "openai/gpt-oss-120b", title: "Groq GPT-OSS 120B", role: "Systems Architect" },
      { id: "member-3", provider: "nvidia", model: "deepseek-ai/deepseek-v4.1-flash", title: "NVIDIA DeepSeek V4", role: "Critical Strategist" }
    );
  } else if (availableProviders.length === 2) {
    const p1 = availableProviders[0], p2 = availableProviders[1];
    members.push(
      { id: "member-1", provider: p1, model: p1 === "gemini" ? "gemini-3.7-flash" : "openai/gpt-oss-120b", title: `${p1.toUpperCase()} Lead`, role: "Lead Counsel" },
      { id: "member-2", provider: p2, model: p2 === "nvidia" ? "deepseek-ai/deepseek-v4.1-flash" : "qwen/qwen3.8-27b", title: `${p2.toUpperCase()} Analyst`, role: "Domain Specialist" },
      { id: "member-3", provider: p1, model: p1 === "gemini" ? "gemini-3.8-flash" : "qwen/qwen3.8-27b", title: `${p1.toUpperCase()} Critic`, role: "Risk Reviewer" }
    );
  } else {
    const p = availableProviders[0];
    const models = p === "gemini" ? ["gemini-3.7-flash", "gemini-3.8-flash"] : p === "groq" ? ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"] : ["deepseek-ai/deepseek-v4.1-flash", "openai/gpt-oss-20b"];
    models.slice(0, 3).forEach((m, idx) => {
      members.push({ id: `member-${idx + 1}`, provider: p, model: m, title: `${p.toUpperCase()} Perspective ${idx + 1}`, role: `Council Member ${idx + 1}` });
    });
  }

  let totalTokens = 0;
  const routerFor = (p: Provider) => {
    const pKeys: ProviderKeys = { [p]: keys[p]! };
    for (const other of availableProviders) {
      if (other !== p) pKeys[other] = keys[other];
    }
    return createProviderRouter(pKeys, deadline, reserveCall, progress, { fetcher: options.fetcher });
  };

  // -------------------------------------------------------------
  // STAGE 1: Parallel Drafting
  // -------------------------------------------------------------
  progress({
    phase: "boardroom",
    provider: "AI Boardroom",
    model: "Multi-Model",
    task: "boardroom-draft",
    attempt: 1,
    message: "Stage 1/3: 3 distinct models drafting independent proposals in parallel…",
  });

  const drafts: BoardroomDraft[] = [];
  const draftResults = await Promise.all(
    members.map(async (member) => {
      const router = routerFor(member.provider as Provider);
      const draftMessages: ChatMessage[] = [
        {
          role: "system",
          content: 'You are an executive member of the AI Boardroom. Provide an independent, thorough, and highly reasoned proposal addressing the user\'s inquiry. Focus on architectural soundness, correctness, nuances, and concrete guidance. Return ONLY JSON matching: {"summary":"1-2 sentence core thesis","content":"Your comprehensive proposal and solution."}.',
        },
        {
          role: "user",
          content: JSON.stringify({
            prompt,
            projectBrief: project.brief || undefined,
            projectMemory: project.memory?.text || undefined,
            confirmedTask: project.confirmedTask || undefined,
          }),
        },
      ];
      const output = await router(draftMessages, "boardroom-draft");
      totalTokens += output.tokens;
      const parsed = boardroomDraftResponseSchema.parse(parseJson(output.content));
      return {
        memberId: member.id,
        provider: member.provider,
        model: member.model,
        summary: parsed.summary,
        content: parsed.content,
      };
    })
  );
  drafts.push(...draftResults);

  if (signal.aborted) throw new HttpError(409, "Boardroom session was stopped.");

  // -------------------------------------------------------------
  // STAGE 2: Anonymous Cross-Review & Peer Critique
  // -------------------------------------------------------------
  progress({
    phase: "boardroom",
    provider: "AI Boardroom",
    model: "Multi-Model",
    task: "boardroom-review",
    attempt: 2,
    message: "Stage 2/3: Anonymous peer review & cross-examination across models…",
  });

  // Anonymize perspectives: Perspective A, Perspective B, Perspective C
  const labelMap = new Map<string, string>();
  members.forEach((m, idx) => {
    labelMap.set(m.id, `Perspective ${String.fromCharCode(65 + idx)}`);
  });

  const reviews: BoardroomReview[] = [];
  const reviewResults = await Promise.all(
    members.map(async (reviewer) => {
      const router = routerFor(reviewer.provider as Provider);
      // Other perspectives to review
      const peerDrafts = drafts
        .filter(d => d.memberId !== reviewer.id)
        .map(d => ({
          label: labelMap.get(d.memberId)!,
          summary: d.summary,
          proposal: d.content,
        }));

      const reviewMessages: ChatMessage[] = [
        {
          role: "system",
          content: 'You are reviewing anonymized competing proposals in an executive AI Boardroom. Critically examine each proposal for concrete flaws, omissions, assumptions, risks, and distinct strengths. Be objective, rigorous, and constructive. Return ONLY JSON matching: {"critiques":[{"targetPerspective":"Perspective A|B|C","strengths":["strength 1","strength 2"],"flaws":["flaw 1","flaw 2"],"score":1-10}]}.',
        },
        {
          role: "user",
          content: JSON.stringify({
            userPrompt: prompt,
            competingPerspectives: peerDrafts,
          }),
        },
      ];
      const output = await router(reviewMessages, "boardroom-review");
      totalTokens += output.tokens;
      const parsed = boardroomCritiqueResponseSchema.parse(parseJson(output.content));
      return {
        reviewerId: reviewer.id,
        reviewerModel: reviewer.model,
        critiques: parsed.critiques,
      };
    })
  );
  reviews.push(...reviewResults);

  if (signal.aborted) throw new HttpError(409, "Boardroom session was stopped.");

  // -------------------------------------------------------------
  // STAGE 3: Chairman Synthesis
  // -------------------------------------------------------------
  progress({
    phase: "boardroom",
    provider: "AI Boardroom",
    model: members[0].model,
    task: "boardroom-synthesis",
    attempt: 3,
    message: "Stage 3/3: Chairman synthesizing consensus, resolving debates, and finalizing verdict…",
  });

  const chairmanMember = members[0];
  const chairmanRouter = routerFor(chairmanMember.provider as Provider);

  const synthesisMessages: ChatMessage[] = [
    {
      role: "system",
      content: 'You are the Chairman presiding over the AI Boardroom. You have received the independent proposals from all members and their anonymous peer reviews. Deliver the definitive executive resolution: (1) Verdict: the definitive, comprehensive final answer that merges the best insights and eliminates flaws; (2) Consensus: core areas where all perspectives aligned; (3) Disagreements: points where members clashed and the rationale behind your final decision. Return ONLY JSON matching: {"verdict":string,"consensus":string,"disagreements":[string],"keyDecisions":[string]}.',
    },
    {
      role: "user",
      content: JSON.stringify({
        userPrompt: prompt,
        confirmedTask: project.confirmedTask || undefined,
        allProposals: drafts.map(d => ({ perspective: labelMap.get(d.memberId), proposal: d.content })),
        peerReviews: reviews.map(r => ({ reviewer: r.reviewerModel, critiques: r.critiques })),
      }),
    },
  ];

  const synthesisOutput = await chairmanRouter(synthesisMessages, "boardroom-synthesis");
  totalTokens += synthesisOutput.tokens;
  const synthesisParsed = boardroomSynthesisResponseSchema.parse(parseJson(synthesisOutput.content));

  return {
    id: crypto.randomUUID(),
    prompt,
    createdAt: new Date().toISOString(),
    members,
    drafts,
    reviews,
    synthesis: synthesisParsed,
    chairmanModel: chairmanMember.title,
    tokens: totalTokens,
  };
}
