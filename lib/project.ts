import { z } from "zod";
export const modeSchema = z.enum(["auto", "explain", "build"]);
export type Mode = z.infer<typeof modeSchema>;
export const artifactSchema = z.object({ title: z.string().min(1).max(100), html: z.string().min(1).max(45000) });
export const resultSchema = z.object({ reply: z.string().min(1).max(6000), artifact: artifactSchema.nullable() });
export type Artifact = z.infer<typeof artifactSchema>;
export type Version = Artifact & { id: string; number: number; createdAt: string; source: string; checks?: "static-passed"; repaired?: boolean };
export type Message = { id: string; role: "user" | "assistant"; text: string; model?: string; routing?: string; createdAt: string };
export type Clarification = { id: string; prompt: string; mode: Mode; questions: string[]; options?: string[][] };
export type Project = { id: string; title: string; revision: number; updatedAt: string; mode: Mode; brief: string; messages: Message[]; versions: Version[]; clarification?: Clarification; confirmedTask?: { prompt: string; answers: { question: string; answer: string }[] } };
export type Capabilities = { live: boolean; model: string | null; dailyLimit: number | null; provider?: string };
export function newProject(title = "Untitled project"): Project {
  return { id: crypto.randomUUID(), title, revision: 0, updatedAt: new Date().toISOString(), mode: "auto", brief: "", messages: [], versions: [] };
}
export const PREVIEW_POLICY = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export function previewDocument(html: string) {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${PREVIEW_POLICY}"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${html}</body></html>`;
}
