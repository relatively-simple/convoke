"use client";
import {useEffect,useId,useState} from "react";
import DOMPurify from "dompurify";
import type {Visual} from "../lib/visuals";
let rendering=Promise.resolve();
export async function renderDiagram(source:string,id:string){
  if(/%%\{|^\s*---|\bclick\s/im.test(source))throw Error("Diagram directives and links are not supported.");
  const {default:mermaid}=await import("mermaid");
  // Mermaid uses shared configuration: serialize rendering to avoid concurrent races.
  let svg="";
  const task=rendering.catch(()=>{}).then(async()=>{
    mermaid.initialize({startOnLoad:false,securityLevel:"strict",theme:"dark",maxTextSize:12000,maxEdges:100,flowchart:{htmlLabels:false},suppressErrorRendering:true});
    svg=(await mermaid.render(id,source)).svg;
  });rendering=task;await task;return svg;
}
function Diagram({visual}:{visual:Extract<Visual,{type:"mermaid"|"svg"}>}){
  const id="diagram"+useId().replace(/[^a-z0-9]/gi,"");const [svg,setSvg]=useState("");const [error,setError]=useState("");
  useEffect(()=>{
    let live=true;
    void (async()=>{
      try{const raw=visual.type==="mermaid"?await renderDiagram(visual.source,id):visual.source;
        const clean=DOMPurify.sanitize(raw,{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:["foreignObject","image","a","animate","set"],FORBID_ATTR:["href","xlink:href"]});
        if(!clean.includes('<svg'))throw Error('No valid SVG content');
        if(live){setSvg(clean);setError("");}
      }catch{if(live){setError("This diagram could not be rendered. Its description and source are available below.");setSvg("");}}
    })();
    return()=>{live=false;};
  },[visual.source,visual.type,id]);
  return <>{svg?<img className="diagram-image" alt={visual.caption} src={"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg)}/>:error?<p role="status">{error}</p>:<p role="status">Preparing diagram…</p>}<details><summary>Diagram source</summary><pre>{visual.source}</pre></details></>;
}
function Chart({visual}:{visual:Extract<Visual,{type:"chart"}>}){
  const values=visual.data.map(d=>d.value),lo=Math.min(0,...values),hi=Math.max(0,...values),range=hi-lo||1;
  const y=(n:number)=>230-(n-lo)/range*190;const x=(i:number)=>50+(i+.5)*540/values.length;const width=Math.max(1,540/values.length*.65);
  return <><svg viewBox="0 0 640 290" role="img" aria-label={visual.caption}><title>{visual.caption}</title><line x1="50" x2="590" y1={y(0)} y2={y(0)} stroke="currentColor" opacity=".4"/>{visual.kind==="line"?<polyline points={values.map((v,i)=>`${x(i)},${y(v)}`).join(' ')} fill="none" stroke="#8cd9ae" strokeWidth="3"/>:values.map((v,i)=><rect key={i} x={x(i)-width/2} y={Math.min(y(v),y(0))} width={width} height={Math.max(1,Math.abs(y(v)-y(0)))} fill="#8cd9ae"><title>{visual.data[i].label}: {v}</title></rect>)}<text x="20" y="20" fill="currentColor" fontSize="13">{visual.yLabel}</text><text x="320" y="278" textAnchor="middle" fill="currentColor" fontSize="13">{visual.xLabel}</text>{values.map((v,i)=><g key={i}><text x={x(i)} y={Math.max(32,y(v)-8)} textAnchor="middle" fill="currentColor" fontSize="11">{v}</text>{values.length<=12&&<text x={x(i)} y="250" textAnchor="middle" fill="currentColor" fontSize="10">{visual.data[i].label.slice(0,12)}</text>}</g>)}</svg><details><summary>Accessible data table</summary><table><thead><tr><th>{visual.xLabel}</th><th>{visual.yLabel}</th></tr></thead><tbody>{visual.data.map((d,i)=><tr key={i}><td>{d.label}</td><td>{d.value}</td></tr>)}</tbody></table></details></>;
}
export function VisualAnswers({visuals,onExplain}:{visuals:Visual[];onExplain?:(caption:string)=>void}){
  return <div className="visual-answers">{visuals.map((visual,index)=><figure className="visual-block" key={index}>
    {visual.type==="table"?<div className="visual-table"><table><thead><tr>{visual.headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{visual.rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>:visual.type==="chart"?<Chart visual={visual}/>:<Diagram visual={visual}/>}
    <figcaption>{visual.caption}</figcaption>{onExplain&&<button onClick={()=>onExplain(visual.caption)}>Explain in words</button>}
  </figure>)}</div>;
}
