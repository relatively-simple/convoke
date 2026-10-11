import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { createVisitorToken, visitorIdentity, VISITOR_COOKIE } from "@/lib/visitor-auth";
import { errorResponse, HttpError, json, readBody } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    await readBody(request);
    if (env.AUTH_MODE !== "public") throw new HttpError(404, "Not found.");
    if (!env.SESSION_SECRET) throw new HttpError(503, "Your workspace is temporarily unavailable. Please try again shortly.");
    const jar = await cookies();
    if (await visitorIdentity(jar.get(VISITOR_COOKIE)?.value, env.SESSION_SECRET)) return json({ ready: true });
    const token = await createVisitorToken(env.SESSION_SECRET);
    const response = json({ ready: true });
    response.headers.set("Set-Cookie", `${VISITOR_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
    return response;
  } catch (error) { return errorResponse(error); }
}
