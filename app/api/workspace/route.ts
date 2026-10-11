import { z } from "zod";
import { modeSchema, newProject, type Project } from "@/lib/project";
import { owner, db, json, errorResponse, readBody, HttpError, capabilities, getProject, commitProject, serialize, checkCapacity, decodeProject } from "@/lib/server";
export const dynamic = "force-dynamic";
const id = z.string().uuid();
const actions = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), title: z.string().trim().min(1).max(100), mode: modeSchema }),
  z.object({ action: z.literal("save"), projectId: id, revision: z.number().int().nonnegative(), title: z.string().trim().min(1).max(100).optional(), brief: z.string().max(4000).optional(), html: z.string().min(1).max(45000).optional(), artifactTitle: z.string().min(1).max(100).optional(), restoreId: id.optional() }),
  z.object({ action: z.literal("cancel"), projectId: id, runId: id }),
]);
export async function GET() {
  try {
    const userId = await owner();
    const rows = await db().prepare("SELECT state FROM projects WHERE owner = ? ORDER BY updated_at DESC LIMIT 50").bind(userId).all<{ state: string }>();
    return json({ projects: rows.results.map(r => decodeProject(r.state)), capabilities: capabilities() });
  } catch (e) { return errorResponse(e); }
}
export async function POST(request: Request) {
  try {
    const userId = await owner(); const parsed = actions.safeParse(await readBody(request));
    if (!parsed.success) throw new HttpError(400, "Please check the project name, content, and request details.");
    const body = parsed.data;
    if (body.action === "create") {
      const p = newProject(body.title); p.mode = body.mode;
      const result = await db().prepare("INSERT INTO projects (id, owner, state, revision, updated_at) SELECT ?, ?, ?, 0, ? WHERE (SELECT count(*) FROM projects WHERE owner = ?) < 50").bind(p.id, userId, serialize(p), p.updatedAt, userId).run();
      if (!result.meta.changes) throw new HttpError(409, "Each workspace supports up to 50 projects.");
      return json({ project: p });
    }
    const project = await getProject(body.projectId, userId);
    if (body.action === "cancel") {
      await db().batch([
        // Remember a stop even if it arrives before the generation request registers.
        db().prepare("INSERT OR IGNORE INTO runs (id, owner, project_id, status, created_at) VALUES (?, ?, ?, 'cancelled', ?)").bind(body.runId,userId,project.id,new Date().toISOString()),
        db().prepare("UPDATE runs SET status = 'cancelled' WHERE id = ? AND owner = ? AND project_id = ? AND status = 'running'").bind(body.runId, userId, project.id),
        db().prepare("UPDATE projects SET locked_by = NULL, locked_until = NULL WHERE id = ? AND owner = ? AND locked_by = ?").bind(project.id, userId, body.runId),
      ]);
      return json({ stopped: true });
    }
    if (project.revision !== body.revision) throw new HttpError(409, "A newer version exists. Reload this project before saving.");
    if (body.html && body.restoreId) throw new HttpError(400, "Choose either an edit or a restore.");
    if (body.title !== undefined) project.title = body.title;
    if (body.brief !== undefined) project.brief = body.brief;
    if (body.html || body.restoreId) {
      checkCapacity(project, true);
      const restored = body.restoreId ? project.versions.find(v => v.id === body.restoreId) : null;
      if (body.restoreId && !restored) throw new HttpError(404, "That version could not be found.");
      project.versions.push({ id: crypto.randomUUID(), number: (project.versions.at(-1)?.number || 0)+1, createdAt: new Date().toISOString(), source: restored ? `Restored v${restored.number}` : "manual", title: restored?.title || body.artifactTitle || "Untitled artifact", html: restored?.html || body.html! });
    }
    await commitProject(project, userId, body.revision); return json({ project });
  } catch (e) { return errorResponse(e); }
}
