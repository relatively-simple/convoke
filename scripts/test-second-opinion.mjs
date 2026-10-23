import assert from "node:assert/strict";
import { getSecondOpinion, secondOpinionReportSchema } from "../lib/second-opinion.ts";

const prompt = "How do I securely store user passwords in a database?";
const answer = "You should hash passwords using bcrypt or Argon2 with a unique salt per user, and set a sufficiently high work factor to resist brute-force attacks.";
const messageId = "11111111-1111-4111-8111-111111111111";

const opinionResponse = {
  verdict: "agrees",
  summary: "The guidance correctly recommends modern salted hashing algorithms like Argon2 and bcrypt.",
  strengths: ["Properly identifies Argon2 and bcrypt as standard choices", "Highlights unique per-user salting"],
  issues: ["Could mention rate-limiting login attempts to prevent online dictionary attacks"],
  suggestedRevision: "Use Argon2id or bcrypt with per-user salting, and enforce account lockout or rate limiting on authentication endpoints."
};

let reservedCount = 0;
const signal = new AbortController().signal;

const fakeFetcher = async (url) => {
  const gemini = url.includes("googleapis");
  if (gemini) {
    return Response.json({
      candidates: [{
        content: {
          parts: [{ text: JSON.stringify(opinionResponse) }]
        }
      }],
      usageMetadata: { totalTokenCount: 120 }
    });
  }
  return Response.json({
    choices: [{ message: { content: JSON.stringify(opinionResponse) } }],
    usage: { total_tokens: 120 }
  });
};

// 1. Cross-provider selection when original is Gemini
const reportFromGroq = await getSecondOpinion(
  prompt,
  answer,
  messageId,
  "Google Gemini · gemini-3.7-flash",
  signal,
  async () => { reservedCount++; },
  () => {},
  { gemini: "gemini-key", groq: "groq-key", nvidia: "nvidia-key" },
  { fetcher: fakeFetcher }
);

assert.equal(reportFromGroq.messageId, messageId);
assert.equal(secondOpinionReportSchema.safeParse(reportFromGroq).success, true);
assert.equal(reportFromGroq.reviewerProvider, "groq");
assert.equal(reportFromGroq.verdict, "agrees");
assert.equal(reportFromGroq.strengths?.length, 2);
assert.equal(reportFromGroq.issues.length, 1);
assert.ok(reportFromGroq.suggestedRevision?.includes("Argon2id"));
assert.ok(reservedCount >= 1);

// 2. Cross-provider selection when original is Groq
const reportFromNvidia = await getSecondOpinion(
  prompt,
  answer,
  messageId,
  "Groq · openai/gpt-oss-120b",
  signal,
  async () => {},
  () => {},
  { groq: "groq-key", nvidia: "nvidia-key" },
  { fetcher: fakeFetcher }
);
assert.equal(reportFromNvidia.reviewerProvider, "nvidia");

// 3. Test cancellation rejection
const aborted = new AbortController();
aborted.abort();
await assert.rejects(
  getSecondOpinion(
    prompt,
    answer,
    messageId,
    "gemini",
    aborted.signal,
    async () => {},
    () => {},
    { gemini: "key" },
    { fetcher: fakeFetcher }
  ),
  /cancelled/
);

console.log("PASS: second opinion cross-provider selection, critique parsing, strengths/issues extraction, and cancellation.");
