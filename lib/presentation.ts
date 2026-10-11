import type { Project } from "./project.ts";
export function normalizeMath(text: string) {
  return text.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((part, i) => i % 2 ? part : part.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n$$\n${math}\n$$\n`).replace(/\\\((.*?)\\\)/g, (_, math) => `$${math}$`)).join("");
}
export function latestAnswerHasCanvas(project?: Project) {
  const version = project?.versions.at(-1);
  return !!version && project?.messages.filter(m => m.role === "assistant").at(-1)?.createdAt === version.createdAt;
}
export function estimatedProgress(elapsed: number) { return Math.min(90, 4 + 86 * (1 - Math.exp(-Math.max(0, elapsed) / 45000))); }
