"use client";
import {useEffect,useState} from "react";
import type {Comparison,Version} from "../lib/project";
import {testArtifact} from "../lib/runtime-client";
import {Answer} from "./answer";
import {VisualAnswers} from "./visual-answer";
import {ArtifactPreview} from "./artifact-preview";
function Card({result,onAdopt,disabled}:{result:Comparison["results"][number];onAdopt:()=>void;disabled:boolean}){
  const [version,setVersion]=useState<Version>();
  useEffect(()=>{
    if(!result.artifact) return;
    const controller=new AbortController();
    void testArtifact(result.artifact,controller.signal).then(report=>{
      if(!controller.signal.aborted) {
        setVersion({
          ...result.artifact!,
          id:result.id,
          number:1,
          createdAt:'',
          source:result.model||result.provider,
          runtime:{status:report.issues.length?'failed':'passed',attempts:0,issues:report.issues,output:report.output}
        });
      }
    }).catch(()=>{});
    return()=>controller.abort();
  },[result.artifact, result.id, result.model, result.provider]);
  return <article className="comparison-card"><h3>{result.model||result.provider}</h3>{result.error?<p>{result.error}</p>:<>{result.visuals?.length?<VisualAnswers visuals={result.visuals}/>:null}<Answer text={result.reply||''}/>{result.artifact&&(version?<ArtifactPreview key={version.id} version={version}/>:<p role="status">Checking this preview…</p>)}<button className="new-project" disabled={disabled} onClick={onAdopt}>{version?.runtime?.status==='failed'?'Use this answer and repair':'Use this answer'}</button></>}</article>;
}
export function ComparisonView({comparison,onAdopt,disabled}:{comparison:Comparison;onAdopt:(id:string)=>void;disabled:boolean}){
  return <div className="comparison-grid">{comparison.results.map(result=><Card key={result.id} result={result} onAdopt={()=>onAdopt(result.id)} disabled={disabled}/>)}</div>;
}
