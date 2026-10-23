import assert from 'node:assert/strict';
import { verifyAnswer, factCheckReportSchema } from '../lib/fact-check.ts';

const prompt = "What is the speed of light in vacuum and what year was special relativity published?";
const answer = "The speed of light in vacuum is approximately 299,792,458 meters per second. Albert Einstein published his paper on special relativity in 1905.";

// Test valid fact-check verification
const validResponse = {
  verdict: "verified",
  summary: "Both the speed of light constant and the publication year of special relativity are factually accurate.",
  claims: [
    {
      claim: "The speed of light in vacuum is approximately 299,792,458 m/s.",
      status: "supported",
      explanation: "Defined exactly as 299,792,458 m/s by the SI standard since 1983.",
      sources: [{ title: "NIST Physical Measurement Laboratory", url: "https://physics.nist.gov/constants" }]
    },
    {
      claim: "Albert Einstein published special relativity in 1905.",
      status: "supported",
      explanation: "Einstein published 'Zur Elektrodynamik bewegter Körper' in Annalen der Physik in his Annus Mirabilis 1905.",
      sources: [{ title: "Annalen der Physik 1905 Archive" }]
    }
  ]
};

let reserved = 0;
const signal = new AbortController().signal;
const events = [];

const report = await verifyAnswer(
  prompt,
  answer,
  "msg-123",
  signal,
  async () => { reserved++; },
  async (messages, task) => {
    assert.equal(task, "fact-check");
    assert.ok(messages[1].content.includes(prompt));
    return {
      content: JSON.stringify(validResponse),
      model: "fixture-verifier",
      tokens: 45,
      route: { task: "fact-check", model: "fixture-verifier", reason: "testing" }
    };
  },
  e => events.push(e)
);

assert.equal(reserved, 1);
assert.equal(report.messageId, "msg-123");
assert.equal(factCheckReportSchema.safeParse(report).success, true);
assert.equal(report.verdict, "verified");
assert.equal(report.claims.length, 2);
assert.equal(report.claims[0].status, "supported");
assert.ok(events.some(e => e.phase === "fact-check"));

// Test disputed claims with correction
const disputedResponse = {
  verdict: "disputed",
  summary: "The speed of light was correctly stated, but the publication year was incorrect.",
  claims: [
    {
      claim: "Special relativity was published in 1915.",
      status: "contradicted",
      explanation: "Special relativity was published in 1905; General relativity was published in 1915.",
      correction: "Special relativity was published in 1905, not 1915."
    }
  ],
  correctedAnswer: "Special relativity was published in 1905."
};

const disputedReport = await verifyAnswer(
  prompt,
  "Special relativity was published in 1915.",
  "msg-456",
  signal,
  async () => {},
  async () => ({
    content: JSON.stringify(disputedResponse),
    model: "fixture-verifier",
    tokens: 30,
    route: { task: "fact-check", model: "fixture-verifier", reason: "testing" }
  })
);

assert.equal(disputedReport.verdict, "disputed");
assert.equal(disputedReport.claims[0].status, "contradicted");
assert.equal(disputedReport.correctedAnswer, "Special relativity was published in 1905.");

// Test cancellation rejection
const aborted = new AbortController();
aborted.abort();
await assert.rejects(
  verifyAnswer(prompt, answer, "msg-789", aborted.signal, async () => {}, async () => ({})),
  /cancelled/
);

console.log("PASS: fact-check claim extraction, verification verdict, corrections, source mapping, and cancellation.");
