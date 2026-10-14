"use client";
import {useEffect,useState} from "react";
import type {Version} from "../lib/project";
import {documentForArtifact} from "../lib/runtime-client";
export function ArtifactPreview({version}:{version:Version}){
  const [doc,setDoc]=useState("");const [loaded,setLoaded]=useState(false);const [error,setError]=useState("");
  useEffect(()=>{let live=true;setLoaded(false);setDoc("");setError("");if(version.runtime?.status!=="passed")return;
    if(version.python)return;
    void documentForArtifact({...version,tests:[]},crypto.randomUUID()).then(d=>{if(live)setDoc(d);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};
  },[version.id,version.runtime?.status]);
  if(version.runtime?.status!=="passed")return <div className="canvas-empty"><h2>{version.runtime?.status==="failed"?"This draft needs attention":"Browser checks pending"}</h2><p>{version.runtime?.status==="failed"?"Automatic repairs could not resolve every issue. The source and earlier versions are retained.":"Run browser checks before opening this draft."}</p>{version.runtime?.issues.map((issue,i)=><p key={i}>{issue}</p>)}</div>;
  if(version.python)return <pre className="python-output">{version.runtime.output||"Python completed without printed output."}</pre>;
  return <div className="frame-wrap">{(!loaded||error)&&<div className="frame-loading" role="status">{error||"Opening your checked result…"}</div>}{doc&&<iframe title={version.title} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={doc} style={{visibility:loaded?"visible":"hidden"}} onLoad={()=>setLoaded(true)}/>}</div>;
}
