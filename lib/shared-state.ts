import { z } from "zod";
import { HttpError } from "./errors.ts";
import type { Project, Artifact } from "./project.ts";
export const summarySchema = z.object({summary:z.string().min(1).max(3500)});
export const patchSchema = z.object({baseVersionId:z.string(),title:z.string().min(1).max(100).optional(),changes:z.array(z.object({find:z.string().min(1).max(45000),replace:z.string().max(45000)})).min(1).max(12)});
export function applyArtifactPatch(project: Project, patch:z.infer<typeof patchSchema>):Artifact {
  const current=project.versions.at(-1);
  if(!current || current.id!==patch.baseVersionId || current.python) throw new HttpError(409,"The canvas patch references a different version. Return the complete current artifact instead.");
  let html=current.html;
  for(const change of patch.changes){
    const index=html.indexOf(change.find);
    if(index<0 || html.indexOf(change.find,index+1)>=0) throw new HttpError(422,"Each patch must match exactly one location in the current canvas. Return complete HTML if the match is ambiguous.");
    html=html.slice(0,index)+change.replace+html.slice(index+change.find.length);
    if(html.length>45000) throw new HttpError(413,"The patched artifact is too large.");
  }
  return {title:patch.title||current.title,html,tests:current.tests,libraries:current.libraries};
}
export function summaryBatch(project:Project){
  const through=project.memory?.throughMessageId;
  const start=through?project.messages.findIndex(m=>m.id===through)+1:0;
  const end=Math.max(0,project.messages.length-6);
  return end-start>=4?project.messages.slice(start,end):[];
}
