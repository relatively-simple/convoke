import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { createVisitorToken, createAccountToken, visitorIdentity } from '../lib/visitor-auth.ts';
import { hashPassword, verifyPassword } from '../lib/password-auth.ts';
const secret='test-only-secret-'.repeat(4);
const token=await createVisitorToken(secret);
const first=await visitorIdentity(token,secret);
assert.ok(first?.userId.startsWith('visitor:'));
assert.equal((await visitorIdentity(token,secret)).userId,first.userId);
assert.notEqual((await visitorIdentity(await createVisitorToken(secret),secret)).userId,first.userId);
assert.equal(await visitorIdentity(token+'x',secret),null);
assert.equal(await visitorIdentity(token,'different-secret-'.repeat(4)),null);
assert.equal(await visitorIdentity(undefined,secret),null);
const expired=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setSubject(crypto.randomUUID()).setIssuer('convoke-visitor').setAudience('convoke').setIssuedAt().setExpirationTime(1).sign(new TextEncoder().encode(secret));
assert.equal(await visitorIdentity(expired,secret),null);

// Account token verification (Email & Google cross-device accounts)
const emailToken = await createAccountToken(secret, { email: "User@example.com", name: "Test User", provider: "email" });
const emailIdentity = await visitorIdentity(emailToken, secret);
assert.ok(emailIdentity?.userId.startsWith("acct:"));
assert.equal(emailIdentity?.email, "user@example.com");
assert.equal(emailIdentity?.displayName, "Test User");
assert.equal(emailIdentity?.provider, "email");

const googleToken = await createAccountToken(secret, { email: "user.g@gmail.com", name: "Google User", provider: "google" });
const googleIdentity = await visitorIdentity(googleToken, secret);
assert.ok(googleIdentity?.userId.startsWith("acct:"));
assert.equal(googleIdentity?.email, "user.g@gmail.com");
assert.equal(googleIdentity?.displayName, "Google User");
assert.equal(googleIdentity?.provider, "google");

// Password security and cryptographic verification (PBKDF2)
const passA = "my-secure-password-2026";
const passB = "incorrect-password";
const { hash, salt } = await hashPassword(passA);
assert.ok(hash && hash.length === 64, "PBKDF2 SHA-256 hash must be 64 hex characters");
assert.ok(salt && salt.length === 32, "Salt must be 32 hex characters");
assert.equal(await verifyPassword(passA, hash, salt), true, "Correct password must verify successfully");
assert.equal(await verifyPassword(passB, hash, salt), false, "Incorrect password must be rejected");
assert.equal(await verifyPassword("", hash, salt), false, "Empty password must be rejected");
assert.equal(await verifyPassword(passA, "", salt), false, "Empty hash must be rejected");

// Distinct salts for same password
const { salt: salt2 } = await hashPassword(passA);
assert.notEqual(salt, salt2, "Each hash must generate a cryptographically random salt");

// Email OTP Verification Logic
const { generateNumericCode, verifyEmailVerificationCode } = await import('../lib/email-auth.ts');
const code = generateNumericCode();
assert.equal(code.length, 6, 'OTP code must be 6 digits');
assert.ok(/^\d{6}$/.test(code), 'OTP code must be numeric');

const validOtp = await verifyEmailVerificationCode(undefined, 'test@example.com', '123456');
assert.equal(validOtp.valid, true);
const invalidOtp = await verifyEmailVerificationCode(undefined, 'test@example.com', '12');
assert.equal(invalidOtp.valid, false);

console.log('PASS: stable, separate visitor identities; forged, expired, missing and incorrectly signed tokens rejected; PBKDF2 password security and email OTP verified.');
