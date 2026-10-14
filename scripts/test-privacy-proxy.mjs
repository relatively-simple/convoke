import assert from "node:assert/strict";
import {
  detectSensitiveEntities,
  maskText,
  unmaskText,
  isValidLuhn
} from "../lib/privacy-proxy.ts";

// 1. Test Luhn Algorithm for Credit Cards
assert.equal(isValidLuhn("4532015112830366"), true); // Valid Visa test number
assert.equal(isValidLuhn("4532015112830367"), false); // Invalid checksum
assert.equal(isValidLuhn("12345"), false); // Too short

// 2. Test Detection of Sensitive Entities
const sampleText = `
Here is my OpenAI key sk-abcdef1234567890abcdef1234567890 and my email john.doe@example.com.
Call me at +1 (555) 234-5678 or 555-234-5678.
My US SSN is 123-45-6789 and Sri Lankan NIC is 921234567V.
Also card 4532015112830366.
`;

const entities = detectSensitiveEntities(sampleText);
assert.ok(entities.length >= 5);

const types = entities.map(e => e.type);
assert.ok(types.includes("api_key"));
assert.ok(types.includes("email"));
assert.ok(types.includes("phone"));
assert.ok(types.includes("national_id"));
assert.ok(types.includes("credit_card"));

// 3. Test Masking & Replacements
const { maskedText, replacements } = maskText(sampleText, entities);

// The masked text must NOT contain any raw sensitive data
assert.ok(!maskedText.includes("sk-abcdef1234567890abcdef1234567890"));
assert.ok(!maskedText.includes("john.doe@example.com"));
assert.ok(!maskedText.includes("123-45-6789"));
assert.ok(!maskedText.includes("921234567V"));
assert.ok(!maskedText.includes("4532015112830366"));

// The masked text MUST contain typed placeholders
assert.ok(maskedText.includes("[API_KEY_1]"));
assert.ok(maskedText.includes("[EMAIL_1]"));

// 4. Test Unmasking
const restored = unmaskText(maskedText, replacements);
assert.equal(restored, sampleText);

// 5. Test entity co-reference (same entity shares same placeholder)
const dup = detectSensitiveEntities("Email me at test@example.com or ping test@example.com");
assert.equal(dup.length, 2);
assert.equal(dup[0].placeholder, dup[1].placeholder);

// 6. Test case-insensitive and whitespace-variant unmasking
const variantText = "Sent to [email_1] and [EMAIL 1]";
assert.equal(unmaskText(variantText, { "[EMAIL_1]": "test@example.com" }), "Sent to test@example.com and test@example.com");

// 7. Test empty and clean texts
assert.deepEqual(detectSensitiveEntities(""), []);
assert.equal(maskText("Hello world!").maskedText, "Hello world!");
assert.equal(unmaskText("Hello world!", {}), "Hello world!");

// 8. Test 12-digit Sri Lankan NIC is detected (starts with valid birth year)
const nicText12 = "My new NIC is 199823401245.";
const nicEntities = detectSensitiveEntities(nicText12);
assert.ok(nicEntities.some(e => e.type === "national_id" && e.raw === "199823401245"), "12-digit NIC starting with 19xx must be detected");

// 9. Test non-NIC 12-digit number is NOT flagged (e.g. a Unix ms timestamp)
const timestampText = "Event at 1728892800000.";
const tsEntities = detectSensitiveEntities(timestampText);
assert.ok(!tsEntities.some(e => e.type === "national_id"), "12-digit number not starting with 19/20 must not be detected as NIC");

console.log("PASS: privacy proxy entity detection, Luhn validation, typed masking, and round-trip unmasking.");
