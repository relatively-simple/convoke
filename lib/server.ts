import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { type Project } from "./project";

import { HttpError } from "./errors";
export { HttpError } from "./errors";
export function db() { if (!env.DB) throw new HttpError(503, "Project storage is unavailable. Please try again shortly."); return env.DB; }
export function capabilities() { const providers = [env.GEMINI_API_KEY && "Google Gemini", env.GROQ_API_KEY && "Groq", env.NVIDIA_API_KEY && "NVIDIA NIM"].filter(Boolean) as string[]; return { live: providers.length > 0, provider: providers.join(" / "), providers, model: "Automatic routing across connected providers", dailyLimit: null }; }
export async function owner() { const user = await getChatGPTUser(); if (!user) throw new HttpError(401, "Please sign in to open your workspace."); return user.userId; }
export function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof Error && /TimeoutError|AbortError/.test(error.name)) return json({error:"The request timed out or was stopped. Please retry. Your last saved version is unchanged."},504);
  console.error("Workspace operation failed", error instanceof Error ? error.stack || error.message : String(error));
  return json({ error: "Could not save or load your work. Your last saved version is safe. Please try again." }, 503);
}
const utf8Decoder = new TextDecoder();
const utf8Encoder = new TextEncoder();

export async function readBody(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "Cross-site requests are not allowed.");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, "This request came from a different site.");
  if (!request.headers.get("content-type")?.includes("application/json")) throw new HttpError(415, "Send a JSON request.");
  const cl = request.headers.get("content-length");
  if (cl && Number(cl) > 200000) throw new HttpError(413, "This request is too large.");
  const reader = request.body?.getReader(); if (!reader) throw new HttpError(400, "Request body is missing.");
  let length = 0; const chunks: Uint8Array[] = [];
  while (true) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > 200000) { await reader.cancel(); throw new HttpError(413, "This request is too large."); } chunks.push(value); }
  const bytes = new Uint8Array(length); let offset=0; for (const chunk of chunks) { bytes.set(chunk, offset); offset+=chunk.length; }
  try { return JSON.parse(utf8Decoder.decode(bytes)); } catch { throw new HttpError(400, "Invalid JSON request."); }
}
export async function getProject(id: string, userId: string): Promise<Project> {
  const row = await db().prepare("SELECT state FROM projects WHERE id = ? AND owner = ?").bind(id, userId).first<{ state: string }>();
  if (!row) throw new HttpError(404, "Project not found.");
  return decodeProject(row.state);
}
export function serialize(project: Project) {
  const value = JSON.stringify(project);
  if (utf8Encoder.encode(value).length > 850000) throw new HttpError(413, "This project has reached its storage limit. Export your work and start a new project.");
  return value;
}
export function checkCapacity(project: Project, addsVersion = false) {
  if (project.messages.length >= 150 || (addsVersion && project.versions.length >= 25)) throw new HttpError(409, "Each project supports 150 messages and 25 versions per project. Export your work and start a new project.");
}
export async function commitProject(project: Project, userId: string, base: number, runId?: string, usage?: {model:string;tokens:number}) {
  project.revision = base + 1; project.updatedAt = new Date().toISOString();
  const query = runId
    ? "UPDATE projects SET state = ?, revision = ?, updated_at = ?, locked_by = NULL, locked_until = NULL WHERE id = ? AND owner = ? AND revision = ? AND locked_by = ?"
    : "UPDATE projects SET state = ?, revision = ?, updated_at = ? WHERE id = ? AND owner = ? AND revision = ? AND (locked_by IS NULL OR locked_until < ?)";
  const write = db().prepare(query).bind(serialize(project), project.revision, project.updatedAt, project.id, userId, base, runId || Date.now());
  // D1 batches are transactional: completion metadata and the new project are committed together.
  const result = runId ? (await db().batch([
    db().prepare("UPDATE runs SET status = 'completed', model = ?, tokens = ? WHERE id = ? AND owner = ? AND status = 'running' AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND owner = ? AND revision = ? AND locked_by = ?)").bind(usage?.model||null,usage?.tokens||0,runId,userId,project.id,userId,base,runId),
    write,
  ]))[1] : await write.run();
  if (!result.meta.changes) throw new HttpError(409, "This project changed in another tab or has an active request. Reload it before continuing. Your draft has not been overwritten.");
}

export function decodeProject(state: string): Project {
  const project = JSON.parse(state) as Project;
  // Retain saved history, but retire unanswered questions from the removed demo mode.
  if (project.messages.at(-1)?.model === "demo") delete project.clarification;
  return project;
}
