import type { Project } from "./project.ts";
export function normalizeMath(text: string) {
  // Protect ordinary code and existing math before normalizing alternative delimiters.
  const token = /(`{3,}|~{3,})[^\n]*\n[\s\S]*?\1|(`+)[^\n]*?\2|\$\$[\s\S]*?\$\$|\\{1,2}\[[\s\S]*?\\{1,2}\]|\\{1,2}\([\s\S]*?\\{1,2}\)|\\{1,2}begin\{([a-zA-Z*]+)\}[\s\S]*?\\{1,2}end\{\3\}|(?<![\\$])\$(?!\s|\d+[.,]?\d*\b)[^$\n]+?(?<!\s)\$/g;
  return text.replace(token, value => {
    if (/^(`{3,}|~{3,})(?:math|latex|tex|katex)\s*\n/i.test(value)) {
      const math = value.replace(/^(`{3,}|~{3,})(?:math|latex|tex|katex)\s*\n/i, '').replace(/\n?(`{3,}|~{3,})$/, '').trim();
      return '\n$$\n' + math.replace(/^\$\$|\$\$$/g, '').replace(/^\\{1,2}\[|\\{1,2}\]$/g, '').trim() + '\n$$\n';
    }
    if (value.startsWith('`') || value.startsWith('~~~')) return value;
    if (/^\\{1,2}\[/.test(value)) {
      const inner = value.replace(/^\\{1,2}\[/, '').replace(/\\{1,2}\]$/, '').trim();
      return '\n$$\n' + inner + '\n$$\n';
    }
    if (/^\\{1,2}\(/.test(value)) {
      const inner = value.replace(/^\\{1,2}\(/, '').replace(/\\{1,2}\)$/, '').replace(/\s*\n\s*/g, ' ').trim();
      return '$' + inner + '$';
    }
    if (value.startsWith('$$')) {
      return '\n$$\n' + value.slice(2, -2).trim() + '\n$$\n';
    }
    if (/^\\{1,2}begin/i.test(value)) {
      const cleanEnv = value.startsWith('\\\\begin') ? value.replace(/^\\\\/, '\\').replace(/\\\\end/, '\\end') : value;
      return '\n$$\n' + cleanEnv.trim() + '\n$$\n';
    }
    return value;
  });
}
export function latestAnswerHasCanvas(project?: Project) {
  const version = project?.versions.at(-1);
  const message=project?.messages.filter(m=>m.role==="assistant").at(-1);
  return !!version && (message?.artifactId ? message.artifactId===version.id : message?.createdAt===version.createdAt);
}
export function estimatedProgress(elapsed: number) { return Math.min(90, 4 + 86 * (1 - Math.exp(-Math.max(0, elapsed) / 45000))); }
