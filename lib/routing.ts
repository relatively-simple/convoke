import type { Mode } from "./project.ts";

export type Task = "coding" | "reasoning" | "explain" | "clarify" | "repair" | "summary" | "fact-check" | "second-opinion" | "boardroom-draft" | "boardroom-review" | "boardroom-synthesis";
export type CatalogModel = { id: string; name?: string; description?: string; context_length?: number; architecture?: { input_modalities?: string[]; output_modalities?: string[] }; pricing?: Record<string, unknown>; supported_parameters?: string[]; top_provider?: { max_completion_tokens?: number | null }; benchmarks?: { artificial_analysis?: { coding_index?: number | null; intelligence_index?: number | null } } };
export type Route = { task: Task; model: string; reason: string };
export const FREE_PROVIDER = { max_price: { prompt: 0, completion: 0, request: 0, image: 0 }, allow_fallbacks: true };

function zero(value: unknown) { return (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) && Number.isFinite(Number(value)) && Number(value) === 0; }
export function isFree(model: CatalogModel) {
  return !!model && typeof model.id === "string" && model.id.endsWith(":free") && !/guard|content-safety|moderation/i.test(model.id) && !!model.pricing &&
    zero(model.pricing.prompt) && zero(model.pricing.completion) && Object.values(model.pricing).every(zero) &&
    model.architecture?.input_modalities?.includes("text") && model.architecture?.output_modalities?.includes("text");
}
export const VISUAL_PROMPT_REGEX = /\b(visual|visualize|visualization|visuals|diagram|chart|graph|plot|animation|simulate|simulation|interactive|canvas|draw|render)\b/i;

export function isCodeOrVisualPrompt(prompt: string): boolean {
  return VISUAL_PROMPT_REGEX.test(prompt) || /\b(code|coding|build|debug|fix|html|javascript|app|website|calculator|timer|game|widget|dashboard|interactive|canvas|simulate|simulation|demo|gui)\b/i.test(prompt);
}

export function userRequestedVisualization(prompt: string, mode: Mode): boolean {
  if (mode === "build") return true;
  return isCodeOrVisualPrompt(prompt);
}

export function taskFor(mode: Mode, prompt: string): Task {
  if (mode === "build") return "coding";
  if (VISUAL_PROMPT_REGEX.test(prompt)) return "coding";
  if (mode === "explain") return "explain";
  if (/\b(code|coding|build|debug|fix|html|javascript|app|website|calculator|timer)\b/i.test(prompt)) return "coding";
  if (/\b(prove|proof|logic|reason|solve|equation|calculate|math)\b/i.test(prompt)) return "reasoning";
  return "explain";
}
export function selectRoute(catalog: CatalogModel[], task: Task, requiredContext: number, smartRouting = true): Route {
  // These endpoints explicitly reject ordinary chat/workspace clients (HTTP 403).
  const restricted = new Set(["thinkingmachines/inkling-small:free", "thinkingmachines/inkling:free"]);
  const available = catalog.filter(m => isFree(m) && !restricted.has(m.id) && (m.context_length || 0) >= requiredContext && (!m.top_provider?.max_completion_tokens || m.top_provider.max_completion_tokens >= 5000));
  const quality = (m: CatalogModel) => {
    if (!smartRouting || task === "clarify") return -1;
    const metrics = m.benchmarks?.artificial_analysis;
    const value = task === "coding" || task === "repair" ? metrics?.coding_index : metrics?.intelligence_index;
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : -1;
  };
  const score = (m: CatalogModel) => {
    if (!smartRouting) return 0;
    const label = `${m.id} ${m.name || ""} ${m.description || ""}`;
    let n = m.supported_parameters?.includes("response_format") ? 4 : 0;
    if (task === "coding" || task === "repair") n += /coding|coder|code generation|software/i.test(label) ? 12 : 0;
    if (task === "reasoning") n += /reasoning|mathematical|logic/i.test(label) ? 12 : 0;
    if (task === "clarify") n += /mini|small|flash|fast|instruct/i.test(label) ? 12 : 0;
    if (task === "explain") n += /general|instruction|instruct|conversation/i.test(label) ? 8 : 0;
    return n;
  };
  available.sort((a,b) => quality(b)-quality(a) || score(b)-score(a) || a.id.localeCompare(b.id));
  if (!available.length) throw new Error("No eligible free model is available for this task and context. Try again later or shorten the project brief.");
  const metric = task === "coding" || task === "repair" ? "coding index" : "intelligence index";
  const reason = smartRouting
    ? (quality(available[0]) >= 0 ? `Highest catalog-reported ${metric} (${quality(available[0])}) among eligible free models with published scores. This is a quality proxy, not a guarantee for this task.` : `Free-only ${task} selection based on task keywords and context capacity. No comparable benchmark score was available.`)
    : `Standard sequential model order (Smart routing switched off). Will fall back between models until one works.`;
  return { task, model: available[0].id, reason };
}
