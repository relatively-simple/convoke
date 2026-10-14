import type { Project } from "./project.ts";
export function normalizeMath(text: string) {
  // Protect ordinary code and existing math before normalizing alternative delimiters.
  const token=/(`{3,}|~{3,})[^\n]*\n[\s\S]*?\1|(`+)[^\n]*?\2|\$\$[\s\S]*?\$\$|(?<![\\$])\$(?!\s|\d+[.,]?\d*\b)[^$\n]+?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\\begin\{(equation\*?|align\*?|gather\*?|alignat\*?|CD)\}[\s\S]*?\\end\{\3\}/g;
  return text.replace(token, value => {
    if (/^(`{3,}|~{3,})(?:math|latex|tex)\s*\n/i.test(value)) {
      const math=value.replace(/^(`{3,}|~{3,})(?:math|latex|tex)\s*\n/i,'').replace(/\n?(`{3,}|~{3,})$/,'').trim();
      return '\n$$\n'+math.replace(/^\$\$|\$\$$/g,'').replace(/^\\\[|\\\]$/g,'').trim()+'\n$$\n';
    }
    if(value.startsWith('`')||value.startsWith('~~~'))return value;
    if(value.startsWith('\\['))return '\n$$\n'+value.slice(2,-2).trim()+'\n$$\n';
    if(value.startsWith('\\('))return '$'+value.slice(2,-2).replace(/\s*\n\s*/g,' ').trim()+'$';
    if(value.startsWith('$$'))return '\n$$\n'+value.slice(2,-2).trim()+'\n$$\n';
    if(value.startsWith('\\begin'))return '\n$$\n'+value+'\n$$\n';
    return value;
  });
}
export function latestAnswerHasCanvas(project?: Project) {
  const version = project?.versions.at(-1);
  const message=project?.messages.filter(m=>m.role==="assistant").at(-1);
  return !!version && (message?.artifactId ? message.artifactId===version.id : message?.createdAt===version.createdAt);
}
export function estimatedProgress(elapsed: number) { return Math.min(90, 4 + 86 * (1 - Math.exp(-Math.max(0, elapsed) / 45000))); }
