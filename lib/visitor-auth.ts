import { SignJWT, jwtVerify } from "jose";

export const VISITOR_COOKIE = "__Host-convoke-visitor";
const issuer = "convoke-visitor";
export async function createVisitorToken(secret: string) {
  if (secret.length < 32) throw new Error("Visitor signing key is unavailable");
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer).setAudience("convoke").setSubject(crypto.randomUUID())
    .setIssuedAt().setExpirationTime("30d").sign(new TextEncoder().encode(secret));
}
export async function visitorIdentity(token: string | undefined, secret: string | undefined) {
  if (!token || !secret || secret.length < 32) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"], issuer, audience: "convoke", requiredClaims: ["sub", "exp", "iat"],
    });
    if (!payload.sub || !/^[0-9a-f-]{36}$/.test(payload.sub)) return null;
    return { userId: "visitor:" + payload.sub, displayName: "Your workspace", email: "", fullName: null };
  } catch { return null; }
}
