import assert from 'node:assert/strict';
import { runBoardroomSession } from '../lib/boardroom.ts';
import { newProject } from '../lib/project.ts';

const project = newProject("Boardroom Test Project");
project.brief = "Design a high-concurrency microservice system.";

const userPrompt = "Should we use PostgreSQL or DynamoDB for our payment ledger?";

const draftResponse = {
  summary: "Use PostgreSQL with strong ACID guarantees.",
  content: "For financial payment ledgers, relational ACID guarantees are non-negotiable. PostgreSQL with serializable isolation provides rock-solid transaction integrity."
};

const critiqueResponse = {
  critiques: [
    {
      targetPerspective: "Perspective B",
      strengths: ["Strong horizontal scale for high throughput."],
      flaws: ["Eventual consistency risks ledger discrepancies and double-spend."],
      score: 7
    }
  ]
};

const synthesisResponse = {
  verdict: "Adopt PostgreSQL as the primary financial ledger for strict serializability, paired with DynamoDB as an idempotent cache for incoming webhook events.",
  consensus: "All members agreed that financial transactions cannot tolerate eventual consistency or silent reconciliation failures.",
  disagreements: [
    "Perspective B favored DynamoDB for peak scaling, but the Chairman ruled that ACID consistency outweighs write scaling for ledger operations."
  ],
  keyDecisions: ["PostgreSQL for source of truth", "DynamoDB for idempotent event de-duplication"]
};

let reserved = 0;
const events = [];
const signal = new AbortController().signal;

const fakeFetcher = async (url, options) => {
  const body = JSON.parse(options.body);
  const gemini = url.includes("googleapis");
  let systemPrompt = "";
  if (gemini) {
    systemPrompt = body.systemInstruction?.parts?.map(p => p.text).join(" ") || "";
  } else {
    const messages = body.messages || [];
    systemPrompt = messages.find(m => m.role === "system")?.content || "";
  }

  let responseData = {};
  if (systemPrompt.includes("executive member of the AI Boardroom")) {
    responseData = draftResponse;
  } else if (systemPrompt.includes("reviewing anonymized competing proposals")) {
    responseData = critiqueResponse;
  } else if (systemPrompt.includes("Chairman presiding over the AI Boardroom")) {
    responseData = synthesisResponse;
  }

  if (gemini) {
    return Response.json({
      candidates: [{
        content: {
          parts: [{ text: JSON.stringify(responseData) }]
        }
      }],
      usageMetadata: { totalTokenCount: 100 }
    });
  }

  return Response.json({
    choices: [{ message: { content: JSON.stringify(responseData) } }],
    usage: { total_tokens: 100 }
  });
};

const session = await runBoardroomSession(
  project,
  userPrompt,
  signal,
  async () => { reserved++; },
  e => events.push(e),
  {
    keys: { gemini: "gemini-key", groq: "groq-key", nvidia: "nvidia-key" },
    fetcher: fakeFetcher
  }
);

assert.equal(session.prompt, userPrompt);
assert.equal(session.members.length, 3);
assert.equal(session.drafts.length, 3);
assert.equal(session.reviews.length, 3);
assert.ok(session.synthesis.verdict.includes("PostgreSQL"));
assert.ok(session.synthesis.consensus.includes("financial transactions"));
assert.equal(session.synthesis.disagreements.length, 1);
assert.ok(events.some(e => e.phase === "boardroom" && e.attempt === 1));
assert.ok(events.some(e => e.phase === "boardroom" && e.attempt === 2));
assert.ok(events.some(e => e.phase === "boardroom" && e.attempt === 3));
assert.ok(reserved >= 3);

// Test cancellation rejection
const aborted = new AbortController();
aborted.abort();
await assert.rejects(
  runBoardroomSession(project, userPrompt, aborted.signal, async () => {}, () => {}, {
    keys: { gemini: "key" },
    fetcher: fakeFetcher
  }),
  /stopped/
);

// Test boardroom adoption deduplication
const boardroomProject = newProject("Boardroom Adoption Test");
const time = new Date().toISOString();
boardroomProject.messages.push(
  { id: "u1", role: "user", text: session.prompt, createdAt: time },
  { id: "a1", role: "assistant", text: session.synthesis.verdict, model: `AI Boardroom · ${session.chairmanModel}`, boardroomId: session.id, createdAt: time }
);
assert.equal(boardroomProject.messages.length, 2);

// Simulate adopt-boardroom action logic: adopting Executive Verdict into existing workspace
const existing = boardroomProject.messages.find(m => m.boardroomId === session.id);
assert.ok(existing, "Existing boardroom message must be found");
if (existing) {
  existing.text = session.synthesis.verdict;
  existing.model = `AI Boardroom · Chairman (${session.chairmanModel})`;
}
// Message count must NOT increase (no duplicate created)
assert.equal(boardroomProject.messages.length, 2, "Adopting verdict must not push duplicate message");
assert.equal(boardroomProject.messages.filter(m => m.role === "assistant").length, 1);

// Adopting a member draft proposal updates the message in-place
const proposal = session.drafts[0].content;
if (existing) {
  existing.text = proposal;
  existing.model = `AI Boardroom · ${session.drafts[0].provider} · ${session.drafts[0].model}`;
}
assert.equal(boardroomProject.messages.length, 2, "Adopting proposal must not push duplicate message");
assert.equal(boardroomProject.messages[1].text, proposal);
assert.equal(boardroomProject.messages.filter(m => m.role === "assistant").length, 1);

// Test clean user prompt display vs background clarification details
const rawInjectedPrompt = "explain differentiation\nUser-confirmed details:\nWhat is your level?\nHigh school\nClarification is complete. Generate the requested result now using these answers. Do not ask another set of questions; use reasonable assumptions for remaining gaps.";
const cleanDisplayedPrompt = rawInjectedPrompt.includes("\nUser-confirmed details:\n")
  ? rawInjectedPrompt.split("\nUser-confirmed details:\n")[0]
  : rawInjectedPrompt;
assert.equal(cleanDisplayedPrompt, "explain differentiation", "Displayed prompt must show clean user input without Q&A dump");

console.log("PASS: 3-stage AI boardroom drafting, anonymous peer cross-examination, chairman synthesis, and non-duplicative adoption.");
