import type {Artifact} from "./project.ts";
export async function exportDocument(artifact:Artifact,asset:(path:string)=>Promise<Response>){
  if(artifact.python)return artifact.python;
  async function text(path:string){const response=await asset(path);if(!response.ok)throw Error('Missing export dependency');return response.text();}
  const [math,css,three]=await Promise.all([text('math.js'),text('katex.css'),artifact.libraries?.includes('three')?text('three.js'):Promise.resolve('')]);
  // Keep WOFF2 only, then embed fonts so the downloaded file works offline.
  let embedded=css.replace(/src:([^;}]+)/g,(_,src)=>'src:'+(src.match(/url\([^)]*\.woff2\)\s*format\("woff2"\)/)?.[0]||src));
  const fonts=[...new Set([...embedded.matchAll(/url\((fonts\/[^)]+)\)/g)].map(m=>m[1]))];
  const data=await Promise.all(fonts.map(async path=>{const response=await asset(path);if(!response.ok)throw Error('Missing export font');return [path,Buffer.from(await response.arrayBuffer()).toString('base64')] as const;}));
  for(const [path,base64] of data)embedded=embedded.split(`url(${path})`).join(`url(data:font/woff2;base64,${base64})`);
  const script=(source:string)=>`<script>${source.replace(/<\/script/gi,'<\\/script')}</script>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${embedded}</style>${script(math)}${three?script(three):''}${script(String.raw`addEventListener('DOMContentLoaded',()=>ConvokeMath.default(document.body,{trust:false,throwOnError:false,delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false},{left:'$',right:'$',display:false}]}));`)}</head><body>${artifact.html}</body></html>`;
}
