import { parse } from "acorn";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";

// Static diagnostics only. The CSP and opaque preview frame are the isolation boundary.
// Never evaluate generated JavaScript in the server process.
export function checkArtifact(html: string): string[] {
  const issues = new Set<string>();
  const root = parseFragment(html);
  let elements = 0;
  const ids = new Set<string>();
  function walk(node: DefaultTreeAdapterMap["node"]) {
    if ("tagName" in node) {
      elements++;
      const tag = node.tagName;
      if (["iframe","frame","object","embed","form","base","meta","link"].includes(tag)) issues.add(`Unsupported <${tag}> element. Use self-contained HTML without navigation or embedded pages.`);
      for (const attr of node.attrs) {
        if (attr.name === "id") { if (ids.has(attr.value)) issues.add(`Duplicate element ID: ${attr.value.slice(0,80)}`); ids.add(attr.value); }
        if (["src","href","action","srcset","poster","data"].includes(attr.name) && attr.value && !attr.value.startsWith("#") && !(tag === "img" && attr.name === "src" && /^data:image\/(png|jpeg|gif|webp);base64,/i.test(attr.value))) issues.add(`External or unsupported resource on <${tag}>. Use inline content.`);
        if (attr.name.startsWith("on")) issues.add("Use addEventListener in an inline script instead of inline event attributes.");
      }
      if (tag === "script") {
        const type = node.attrs.find(a=>a.name === "type")?.value || "text/javascript";
        const code = node.childNodes.filter(n=>n.nodeName === "#text").map(n=>(n as DefaultTreeAdapterMap["textNode"]).value).join("");
        if (type === "application/json" || type === "application/ld+json") { try { JSON.parse(code); } catch { issues.add("Invalid JSON in a data script."); } }
        else if (["module","text/javascript","application/javascript"].includes(type)) {
          try { parse(code, { ecmaVersion: "latest", sourceType: type === "module" ? "module" : "script" }); }
          catch (e) { issues.add(`JavaScript syntax: ${(e as Error).message.slice(0,180)}`); }
        } else issues.add(`Unsupported script type: ${type.slice(0,60)}`);
      }
      if (tag === "template" && "content" in node) walk(node.content as DefaultTreeAdapterMap["documentFragment"]);
    }
    if ("childNodes" in node) node.childNodes.forEach(walk);
  }
  walk(root);
  if (!elements) issues.add("The artifact needs visible HTML elements.");
  return [...issues].slice(0,8);
}
