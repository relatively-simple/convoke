import type { Project } from "./project.ts";
export function normalizeMath(text: string) {
  // Protect ordinary code and existing math before normalizing alternative delimiters.
  const token = /(`{3,}|~{3,})[^\n]*\n[\s\S]*?\1|(`+)[^\n]*?\2|\$\$[\s\S]*?\$\$|\\{1,2}\[[\s\S]*?\\{1,2}\]|\\{1,2}\([\s\S]*?\\{1,2}\)|\\{1,2}begin\{([a-zA-Z*]+)\}[\s\S]*?\\{1,2}end\{\3\}|(?<![\\$])\$(?!\s|\d+[.,]?\d*\b)[^$\n]+?(?<!\s)\$/g;
  return text.replace(token, value => {
    if (/^(`{3,}|~{3,})(?:math|latex|tex|katex)\s*\n/i.test(value)) {
      const math = value.replace(/^(`{3,}|~{3,})(?:math|latex|tex|katex)\s*\n/i, '').replace(/\n?(`{3,}|~{3,})$/, '').trim();
      return '\n$$\n' + math.replace(/^\$\$|\$\$$/g, '').replace(/^\\{1,2}\[|\\{1,2}\]$/g, '').trim() + '\n$$\n';
    }
    if (value.startsWith('`') && !value.startsWith('```')) {
      const inner = value.slice(1, -1).trim();
      const isMath = (
        (inner.startsWith('$') && inner.endsWith('$') && inner.length > 2) ||
        /\\(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|cdot|times|div|pm|mp|leq|geq|neq|approx|equiv|sim|simeq|le|ge|ne|frac|sqrt|partial|nabla|sum|int|iint|iiint|oint|prod|coprod|lim|to|leftarrow|rightarrow|infty|in|notin|subset|subseteq|cap|cup|forall|exists|emptyset|land|lor|lnot|mathbf|mathrm|mathcal|mathbb)\b/.test(inner) ||
        /\^\{[^{}]+\}|_\{[^{}]+\}/.test(inner) ||
        /[a-zA-Z]_[a-zA-Z0-9]\^[a-zA-Z0-9]/.test(inner) ||
        /[α-ωΑ-Ω]\s*[·\+\-\*/<>=]/.test(inner) ||
        /[·≈≠≤≥]/.test(inner)
      );
      if (isMath) {
        return '$' + inner.replace(/^\$|\$$/g, '').trim() + '$';
      }
      return value;
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
