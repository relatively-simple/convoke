import { SignJWT, jwtVerify } from "jose";

export const VISITOR_COOKIE = "__Host-convoke-visitor";
const issuer = "convoke-visitor";

export async function sha256Hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export type ConvokeIdentity = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
  picture?: string;
  provider?: "google" | "email" | "visitor";
};

export async function createVisitorToken(secret: string) {
  if (secret.length < 32) throw new Error("Visitor signing key is unavailable");
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer).setAudience("convoke").setSubject(crypto.randomUUID())
    .setIssuedAt().setExpirationTime("30d").sign(new TextEncoder().encode(secret));
}

export async function createAccountToken(secret: string, account: { email: string; name?: string; picture?: string; provider?: "google" | "email" }) {
  if (secret.length < 32) throw new Error("Visitor signing key is unavailable");
  const normEmail = account.email.trim().toLowerCase();
  const emailHash = await sha256Hex(normEmail);
  const sub = `acct:${emailHash.slice(0, 32)}`;
  const displayName = account.name?.trim() || normEmail.split("@")[0];
  return new SignJWT({
    email: normEmail,
    name: displayName,
    picture: account.picture || "",
    provider: account.provider || "email",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer)
    .setAudience("convoke")
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("60d")
    .sign(new TextEncoder().encode(secret));
}

export async function visitorIdentity(token: string | undefined, secret: string | undefined): Promise<ConvokeIdentity | null> {
  if (!token || !secret || secret.length < 32) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"], issuer, audience: "convoke", requiredClaims: ["sub", "exp", "iat"],
    });
    if (!payload.sub || typeof payload.sub !== "string") return null;

    // Standard anonymous visitor UUID (preserves exact test compatibility)
    if (/^[0-9a-f-]{36}$/.test(payload.sub)) {
      return { userId: "visitor:" + payload.sub, displayName: "Your workspace", email: "", fullName: null, provider: "visitor" };
    }

    // Authenticated account (Google or Email)
    if (payload.sub.startsWith("acct:") || payload.sub.startsWith("google:")) {
      const email = typeof payload.email === "string" ? payload.email : "";
      const name = typeof payload.name === "string" ? payload.name : "";
      const picture = typeof payload.picture === "string" && payload.picture ? payload.picture : undefined;
      const provider = (payload.provider === "google" || payload.provider === "email") ? payload.provider : "email";
      return {
        userId: payload.sub,
        displayName: name || email || "Convoke Account",
        email,
        fullName: name || null,
        picture,
        provider,
      };
    }

    return null;
  } catch { return null; }
}
