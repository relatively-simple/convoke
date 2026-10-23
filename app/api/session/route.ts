import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { createVisitorToken, createAccountToken, visitorIdentity, VISITOR_COOKIE } from "@/lib/visitor-auth";
import { errorResponse, HttpError, json, readBody } from "@/lib/server";
import { decodeJwt } from "jose";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!env.SESSION_SECRET) throw new HttpError(503, "Your workspace is temporarily unavailable. Please try again shortly.");
    const jar = await cookies();
    const user = await visitorIdentity(jar.get(VISITOR_COOKIE)?.value, env.SESSION_SECRET);
    return json({ ready: true, user });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = (await readBody(request)) as { action?: string; email?: string; name?: string; credential?: string; provider?: "google" | "email" };
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

    // 2. Google OAuth / Credential login
    if (body.action === "google-login" && body.credential) {
      let payload: { email?: string; name?: string; picture?: string; sub?: string };
      try {
        payload = decodeJwt(body.credential);
      } catch {
        throw new HttpError(400, "Invalid Google credential.");
      }
      if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
        throw new HttpError(400, "Google account does not contain a valid email.");
      }
      const token = await createAccountToken(env.SESSION_SECRET, {
        email: payload.email,
        name: payload.name || payload.email.split("@")[0],
        picture: payload.picture,
        provider: "google",
      });
      const newIdentity = await visitorIdentity(token, env.SESSION_SECRET);
      // Migrate previous visitor projects to the new Google user
      if (env.DB && currentIdentity?.userId.startsWith("visitor:") && newIdentity?.userId) {
        try {
          await env.DB.prepare("UPDATE projects SET owner = ? WHERE owner = ?").bind(newIdentity.userId, currentIdentity.userId).run();
        } catch { /* proceed */ }
      }
      const response = json({ ready: true, user: newIdentity });
      response.headers.set("Set-Cookie", `${VISITOR_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=5184000`);
      return response;
    }

    // 3. Email login / Cross-device sync
    if (body.action === "login") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, "Please enter a valid email address.");
      }
      const name = String(body.name || "").trim() || email.split("@")[0];
      const token = await createAccountToken(env.SESSION_SECRET, {
        email,
        name,
        provider: body.provider || "email",
      });
      const newIdentity = await visitorIdentity(token, env.SESSION_SECRET);
      // Migrate previous visitor projects to the logged-in user
      if (env.DB && currentIdentity?.userId.startsWith("visitor:") && newIdentity?.userId) {
        try {
          await env.DB.prepare("UPDATE projects SET owner = ? WHERE owner = ?").bind(newIdentity.userId, currentIdentity.userId).run();
        } catch { /* proceed */ }
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
  } catch (error) { return errorResponse(error); }
}
