import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { createVisitorToken, createAccountToken, visitorIdentity } from '../lib/visitor-auth.ts';
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

console.log('PASS: stable, separate visitor identities; forged, expired, missing and incorrectly signed tokens rejected.');
