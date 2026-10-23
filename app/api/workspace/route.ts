import { z } from "zod";
import { modeSchema, newProject } from "@/lib/project";
import { owner, db, json, errorResponse, readBody, HttpError, capabilities, getProject, commitProject, serialize, checkCapacity, decodeProject } from "@/lib/server";
export const dynamic = "force-dynamic";
const id = z.string().uuid();
const actions = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), title: z.string().trim().min(1).max(100), mode: modeSchema }),
  z.object({ action: z.literal("save"), projectId: id, revision: z.number().int().nonnegative(), title: z.string().trim().min(1).max(100).optional(), brief: z.string().max(4000).optional(), html: z.string().min(1).max(45000).optional(), python:z.string().min(1).max(16000).optional(), artifactTitle: z.string().min(1).max(100).optional(), restoreId: id.optional() }),
  z.object({action:z.literal("adopt"),projectId:id,revision:z.number().int().nonnegative(),comparisonId:id,resultId:id}),
  z.object({action:z.literal("adopt-boardroom"),projectId:id,revision:z.number().int().nonnegative(),boardroomId:id,content:z.string().min(1).max(10000),source:z.string().min(1).max(100)}),
  z.object({action:z.literal("apply-correction"),projectId:id,revision:z.number().int().nonnegative(),messageId:z.string().min(1).max(128),correction:z.string().min(1).max(10000)}),
  z.object({action:z.literal("apply-second-opinion"),projectId:id,revision:z.number().int().nonnegative(),messageId:z.string().min(1).max(128),revisionText:z.string().min(1).max(10000)}),
  z.object({ action:z.literal("runtime"),projectId:id,revision:z.number().int().nonnegative(),versionId:id,issues:z.array(z.string().max(1600)).max(8),output:z.string().max(12000).optional(),testsPassed:z.number().optional() }),
  z.object({ action: z.literal("cancel"), projectId: id, runId: id }),
  z.object({ action: z.literal("delete"), projectId: id }),
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
    if (body.action === "delete") {
      await db().batch([
        db().prepare("DELETE FROM projects WHERE id = ? AND owner = ?").bind(body.projectId, userId),
        db().prepare("DELETE FROM runs WHERE project_id = ? AND owner = ?").bind(body.projectId, userId),
      ]);
      return json({ deleted: true, projectId: body.projectId });
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
    if(body.action === "adopt"){
      const comparison=project.comparison,result=comparison?.results.find(r=>r.id===body.resultId);
      if(!comparison||comparison.id!==body.comparisonId||!result||result.error||!result.reply)throw new HttpError(409,"This comparison result is no longer available.");
      checkCapacity(project,!!result.artifact);const time=new Date().toISOString(),artifactId=result.artifact?crypto.randomUUID():undefined;
      project.messages.push({id:crypto.randomUUID(),role:"assistant",text:result.reply,model:result.model,visuals:result.visuals,artifactId,createdAt:time});
      if(result.artifact)project.versions.push({...result.artifact,id:artifactId!,number:(project.versions.at(-1)?.number||0)+1,createdAt:time,source:result.model||result.provider,checks:"static-passed",runtime:{status:"pending",attempts:0,issues:[]}});
      await commitProject(project,userId,body.revision);return json({project});
    }
    if (body.action === "adopt-boardroom") {
      const existing = project.messages.find(m => m.boardroomId === body.boardroomId)
        || project.messages.filter(m => m.role === "assistant" && (m.model?.includes("Boardroom") || m.model?.includes("Chairman"))).at(-1);
      if (existing) {
        existing.text = body.content;
        existing.model = body.source.startsWith("AI Boardroom") ? body.source : `AI Boardroom · ${body.source}`;
        existing.boardroomId = body.boardroomId;
      } else {
        const time = new Date().toISOString();
        project.messages.push({
          id: crypto.randomUUID(),
          role: "assistant",
          text: body.content,
          model: body.source.startsWith("AI Boardroom") ? body.source : `AI Boardroom · ${body.source}`,
          boardroomId: body.boardroomId,
          createdAt: time,
        });
      }
      await commitProject(project, userId, body.revision);
      return json({ project });
    }
    if (body.action === "apply-correction") {
      const msg = project.messages.find(m => m.id === body.messageId);
      if (!msg) throw new HttpError(404, "Target message could not be found.");
      msg.text = body.correction;
      if (msg.factCheck) msg.factCheck.verdict = "verified";
      await commitProject(project, userId, body.revision);
      return json({ project });
    }
    if (body.action === "apply-second-opinion") {
      const msg = project.messages.find(m => m.id === body.messageId);
      if (!msg) throw new HttpError(404, "Target message could not be found.");
      msg.text = body.revisionText;
      if (msg.secondOpinion) msg.secondOpinion.verdict = "agrees";
      await commitProject(project, userId, body.revision);
      return json({ project });
    }
    if(body.action === "runtime"){
      const version=project.versions.at(-1);
      if(!version || version.id!==body.versionId || !version.runtime || version.runtime.status!=="pending")throw new HttpError(409,"This draft is no longer awaiting browser checks.");
      version.runtime={...version.runtime,status:body.issues.length?"failed":"passed",issues:body.issues,output:body.output,testedAt:new Date().toISOString()};
      await commitProject(project,userId,body.revision);return json({project});
    }
    if ((body.html || body.python) && body.restoreId) throw new HttpError(400, "Choose either an edit or a restore.");
    if (body.title !== undefined) project.title = body.title;
    if (body.brief !== undefined) project.brief = body.brief;
    if (body.html || body.python || body.restoreId) {
      checkCapacity(project, true);
      const restored = body.restoreId ? project.versions.find(v => v.id === body.restoreId) : null;
      if (body.restoreId && !restored) throw new HttpError(404, "That version could not be found.");
      project.versions.push({ id: crypto.randomUUID(), number: (project.versions.at(-1)?.number || 0)+1, createdAt: new Date().toISOString(), source: restored ? `Restored v${restored.number}` : "manual", title: restored?.title || body.artifactTitle || "Untitled artifact", html: restored?.html || body.html || "", python:restored?.python || body.python,tests:restored?.tests || (body.html ? project.versions.at(-1)?.tests : undefined),libraries:restored?.libraries || (body.html ? project.versions.at(-1)?.libraries : undefined),runtime:{status:"pending",attempts:0,issues:[]} });
    }
    await commitProject(project, userId, body.revision); return json({ project });
  } catch (e) { return errorResponse(e); }
}
