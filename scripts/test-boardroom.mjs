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

console.log("PASS: 3-stage AI boardroom drafting, anonymous peer cross-examination, and chairman synthesis.");
