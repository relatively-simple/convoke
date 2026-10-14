import assert from "node:assert/strict";
import { estimateCost } from "../lib/pricing.ts";

// 1. Zero or negative tokens
assert.equal(estimateCost("gemini-3.7-flash", 0).usd, 0);
assert.equal(estimateCost("gemini-3.7-flash", 0).label, "Free tier · $0.00");

// 2. Free model
assert.equal(estimateCost("test/model:free", 1000).usd, 0);
assert.ok(estimateCost("test/model:free", 1000).label.includes("$0.00"));

// 3. Paid Gemini model
const geminiCost = estimateCost("Google Gemini · gemini-3.7-flash", 100_000);
assert.ok(geminiCost.usd > 0.1 && geminiCost.usd < 0.3);
assert.ok(geminiCost.label.includes("100,000 tokens"));

// 4. Groq OSS model
const groqCost = estimateCost("Groq · openai/gpt-oss-120b", 50_000);
assert.ok(groqCost.usd > 0);
assert.ok(groqCost.label.includes("50,000 tokens"));

console.log("PASS: token cost estimation and ledger formatting.");
