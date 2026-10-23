import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { createVisitorToken, createAccountToken, visitorIdentity, VISITOR_COOKIE, sha256Hex } from "@/lib/visitor-auth";
import { hashPassword, verifyPassword } from "@/lib/password-auth";
import { createEmailVerification, verifyEmailVerificationCode, sendEmailOtp } from "@/lib/email-auth";
import { errorResponse, HttpError, json, readBody } from "@/lib/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

export const dynamic = "force-dynamic";

const GOOGLE_CERTS_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export async function GET() {
  try {
    if (!env.SESSION_SECRET) throw new HttpError(503, "Your workspace is temporarily unavailable. Please try again shortly.");
    const jar = await cookies();
    const user = await visitorIdentity(jar.get(VISITOR_COOKIE)?.value, env.SESSION_SECRET);
    return json({
      ready: true,
      user,
      googleClientId: env.GOOGLE_CLIENT_ID || null,
      emailAuthAvailable: true,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await readBody(request)) as {
      action?: string;
      email?: string;
      code?: string;
      password?: string;
      name?: string;
      credential?: string;
      clientId?: string;
      provider?: "google" | "email";
    };

    if (env.AUTH_MODE !== "public") throw new HttpError(404, "Not found.");
    if (!env.SESSION_SECRET) throw new HttpError(503, "Your workspace is temporarily unavailable. Please try again shortly.");
    const jar = await cookies();
    const currentToken = jar.get(VISITOR_COOKIE)?.value;
    const currentIdentity = await visitorIdentity(currentToken, env.SESSION_SECRET);

    // 1. Log out action: clear to new guest token
    if (body.action === "logout") {
      const token = await createVisitorToken(env.SESSION_SECRET);
      const response = json({ ready: true, user: null });
      response.headers.set("Set-Cookie", `${VISITOR_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
      return response;
    }

    // 2. Google OAuth verification via JWKS (Phase 1.1 / A1: Strict Signature & Audience verification)
    if (body.action === "google-login" && body.credential) {
      const expectedAud = env.GOOGLE_CLIENT_ID || body.clientId;
      let email: string;
      let displayName: string;
      let picture: string | undefined;

      try {
        const { payload } = await jwtVerify(body.credential, GOOGLE_CERTS_JWKS, {
          issuer: ["https://accounts.google.com", "accounts.google.com"],
          audience: expectedAud || undefined,
        });

        if (!payload.email || typeof payload.email !== "string") {
          throw new HttpError(400, "Google token does not contain an email address.");
        }
        if (payload.email_verified !== true && payload.email_verified !== "true") {
          throw new HttpError(401, "Google email address has not been verified by Google.");
        }

        email = payload.email.trim().toLowerCase();
        displayName = (typeof payload.name === "string" ? payload.name : "") || email.split("@")[0];
        picture = typeof payload.picture === "string" ? payload.picture : undefined;
      } catch (err) {
        // Fallback to Google tokeninfo endpoint if in a non-standard runtime or offline
        try {
          const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(body.credential)}`);
          if (!verifyRes.ok) throw new Error("Verification endpoint rejected token");
          const info = (await verifyRes.json()) as { email?: string; email_verified?: string | boolean; name?: string; picture?: string; aud?: string };
          if (!info.email || (info.email_verified !== "true" && info.email_verified !== true)) {
            throw new Error("Unverified email in tokeninfo");
          }
          if (expectedAud && info.aud && info.aud !== expectedAud) {
            throw new HttpError(401, "Google token audience mismatch.");
          }
          email = info.email.trim().toLowerCase();
          displayName = info.name || email.split("@")[0];
          picture = info.picture;
        } catch {
          throw new HttpError(401, "Invalid Google credential: " + ((err as Error).message || "verification failed."));
        }
      }

      const token = await createAccountToken(env.SESSION_SECRET, {
        email,
        name: displayName,
        picture,
        provider: "google",
      });
      const newIdentity = await visitorIdentity(token, env.SESSION_SECRET);

      if (env.DB && newIdentity?.userId) {
        try {
          await env.DB.prepare(
            "CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, password_hash TEXT, salt TEXT, provider TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
          ).run();
          const now = new Date().toISOString();
          await env.DB.prepare(
            "INSERT INTO accounts (id, email, name, provider, created_at, updated_at) VALUES (?, ?, ?, 'google', ?, ?) ON CONFLICT(email) DO UPDATE SET updated_at = ?"
          )
            .bind(newIdentity.userId, email, displayName, now, now, now)
            .run();
        } catch {
          /* proceed */
        }
      }

      // Migrate previous visitor projects to the new Google user
      if (env.DB && currentIdentity?.userId.startsWith("visitor:") && newIdentity?.userId) {
        try {
          await env.DB.batch([
            env.DB.prepare("UPDATE projects SET owner = ? WHERE owner = ?").bind(newIdentity.userId, currentIdentity.userId),
            env.DB.prepare("UPDATE runs SET owner = ? WHERE owner = ?").bind(newIdentity.userId, currentIdentity.userId),
            env.DB.prepare("UPDATE daily_usage SET owner = ? WHERE owner = ?").bind(newIdentity.userId, currentIdentity.userId),
          ]);
        } catch {
          /* proceed */
        }
      }

      const response = json({ ready: true, user: newIdentity });
      response.headers.set("Set-Cookie", `${VISITOR_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=5184000`);
      return response;
    }

    // 3. Email One-Time Code: Request Code (Phase 1.1 / A2)
    if (body.action === "send-email-code") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, "Please enter a valid email address.");
      }

      const res = await createEmailVerification(env.DB, email);
      if ("rateLimited" in res) {
        throw new HttpError(429, "Too many requests. Please wait a few minutes before requesting another code.");
      }

      await sendEmailOtp(email, res.code, env);
      return json({ ok: true, message: "Verification code sent to your email." });
    }

    // 4. Email One-Time Code: Verify & Sign In (Phase 1.1 / A2)
    if (body.action === "verify-email-code") {
      const email = String(body.email || "").trim().toLowerCase();
      const code = String(body.code || "").trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, "Please enter a valid email address.");
      }
      if (!code || code.length < 6) {
        throw new HttpError(400, "Please enter the 6-digit verification code.");
      }

      const verification = await verifyEmailVerificationCode(env.DB, email, code);
      if (!verification.valid) {
        if (verification.reason === "expired") {
          throw new HttpError(401, "Verification code has expired. Please request a new one.");
        }
        if (verification.reason === "max_attempts") {
          throw new HttpError(401, "Maximum attempts exceeded. Please request a new code.");
        }
        throw new HttpError(401, "Incorrect verification code. Please check your email and try again.");
      }

      const name = String(body.name || "").trim() || email.split("@")[0];
      const emailHash = await sha256Hex(email);
      const accountId = `acct:${emailHash.slice(0, 32)}`;

      if (env.DB) {
        await env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, password_hash TEXT, salt TEXT, provider TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
        ).run();
        const now = new Date().toISOString();
        await env.DB.prepare(
          "INSERT INTO accounts (id, email, name, provider, created_at, updated_at) VALUES (?, ?, ?, 'email_code', ?, ?) ON CONFLICT(email) DO UPDATE SET updated_at = ?"
        )
          .bind(accountId, email, name, now, now, now)
          .run();
      }

      const token = await createAccountToken(env.SESSION_SECRET, {
        email,
        name,
        provider: "email",
      });
      const newIdentity = await visitorIdentity(token, env.SESSION_SECRET);

      if (env.DB && currentIdentity?.userId.startsWith("visitor:") && newIdentity?.userId) {
        try {
          await env.DB.batch([
            env.DB.prepare("UPDATE projects SET owner = ? WHERE owner = ?").bind(newIdentity.userId, currentIdentity.userId),
            env.DB.prepare("UPDATE runs SET owner = ? WHERE owner = ?").bind(newIdentity.userId, currentIdentity.userId),
            env.DB.prepare("UPDATE daily_usage SET owner = ? WHERE owner = ?").bind(newIdentity.userId, currentIdentity.userId),
          ]);
        } catch {
          /* proceed */
        }
      }

      const response = json({ ready: true, user: newIdentity });
      response.headers.set("Set-Cookie", `${VISITOR_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=5184000`);
      return response;
    }

    // 5. Email & Password Authentication (Fallback & direct password users)
    if (body.action === "login" || body.action === "register") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, "Please enter a valid email address.");
      }
      const password = String(body.password || "");
      if (!password || password.length < 8) {
        throw new HttpError(400, "Password is required and must be at least 8 characters to protect your account.");
      }

      const name = String(body.name || "").trim() || email.split("@")[0];

      if (env.DB) {
        await env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, password_hash TEXT, salt TEXT, provider TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
        ).run();
        const existing = await env.DB.prepare(
          "SELECT id, email, name, password_hash, salt, provider FROM accounts WHERE email = ?"
        )
          .bind(email)
          .first<{ id: string; email: string; name: string | null; password_hash: string | null; salt: string | null; provider: string }>();

        if (existing) {
          if (existing.provider === "google") {
            throw new HttpError(400, "This email is registered with Google. Please use 'Sign in with Google' to log in.");
          }
          if (!existing.password_hash || !existing.salt) {
            throw new HttpError(400, "This account uses email verification codes. Please sign in with your email code.");
          }
          const valid = await verifyPassword(password, existing.password_hash, existing.salt);
          if (!valid) {
            throw new HttpError(401, "Incorrect password for this account. Access denied.");
          }
        } else {
          // New account registration with securely hashed password
          const { hash, salt } = await hashPassword(password);
          const emailHash = await sha256Hex(email);
          const accountId = `acct:${emailHash.slice(0, 32)}`;
          const now = new Date().toISOString();
          await env.DB.prepare(
            "INSERT INTO accounts (id, email, name, password_hash, salt, provider, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'password', ?, ?)"
          )
            .bind(accountId, email, name, hash, salt, now, now)
            .run();
        }
      }

      const token = await createAccountToken(env.SESSION_SECRET, {
        email,
        name,
        provider: "email",
      });
      const newIdentity = await visitorIdentity(token, env.SESSION_SECRET);

      if (env.DB && currentIdentity?.userId.startsWith("visitor:") && newIdentity?.userId) {
        try {
          await env.DB.batch([
            env.DB.prepare("UPDATE projects SET owner = ? WHERE owner = ?").bind(newIdentity.userId, currentIdentity.userId),
            env.DB.prepare("UPDATE runs SET owner = ? WHERE owner = ?").bind(newIdentity.userId, currentIdentity.userId),
            env.DB.prepare("UPDATE daily_usage SET owner = ? WHERE owner = ?").bind(newIdentity.userId, currentIdentity.userId),
          ]);
        } catch {
          /* proceed */
        }
      }

      const response = json({ ready: true, user: newIdentity });
      response.headers.set("Set-Cookie", `${VISITOR_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=5184000`);
      return response;
    }

    // Default: Check or initialize visitor session
    if (currentIdentity) return json({ ready: true, user: currentIdentity });
    const token = await createVisitorToken(env.SESSION_SECRET);
    const newVisitor = await visitorIdentity(token, env.SESSION_SECRET);
    const response = json({ ready: true, user: newVisitor });
    response.headers.set("Set-Cookie", `${VISITOR_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
