import { owner, getProject, HttpError, errorResponse } from "@/lib/server";
import { previewDocument } from "@/lib/project";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const userId = await owner();
    const url = new URL(request.url);
    const parsed = z.object({project:z.string().uuid(),version:z.string().uuid()}).safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) throw new HttpError(400,"Choose a saved version to export.");
    const project = await getProject(parsed.data.project,userId);
    const artifact = project.versions.find(v=>v.id===parsed.data.version);
    if (!artifact) throw new HttpError(404,"This version was not found.");
    const filename = artifact.title.replace(/[^a-z0-9]+/gi,"-").toLowerCase() || "convoke-artifact";
    return new Response(previewDocument(artifact.html),{headers:{"Content-Type":"text/html; charset=utf-8","Content-Disposition":`attachment; filename="${filename}.html"`,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  } catch(e) { return errorResponse(e); }
}
