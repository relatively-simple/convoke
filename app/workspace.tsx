"use client";
import { useEffect, useRef, useState } from "react";
import { Orbit, Plus, MessageSquare, Sparkles, Code2, BookOpen, Settings2, Download, History, Check, Send, PanelRight, FileText, ChevronRight, LoaderCircle, Square, RotateCcw, Eye,  } from "lucide-react";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Toaster, toast } from "sonner";
import { readGeneration } from "@/lib/generation-stream";
import { Answer } from "@/components/answer";
import { estimatedProgress, latestAnswerHasCanvas } from "@/lib/presentation";
import { previewDocument, type Project, type Mode, type Capabilities } from "@/lib/project";

async function api(body?: unknown) {
  const response = await fetch("/api/workspace", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await response.json() as { error?: string; project: Project; projects: Project[]; capabilities: Capabilities };
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
export default function Workspace({ signedIn, displayName, publicAccess = false }: { signedIn: boolean; displayName: string; publicAccess?: boolean }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [caps, setCaps] = useState<Capabilities>({ live: false, model: null, dailyLimit: null });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<Mode>("auto");
  const [busy, setBusy] = useState(false);
  const [pendingText, setPendingText] = useState("");
  const [status, setStatus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [canvasOverride, setCanvasOverride] = useState<boolean | null>(null);
  useEffect(() => {
    if (!generating) return;
    const start = Date.now(); setProgress(4);
    const timer = window.setInterval(() => setProgress(estimatedProgress(Date.now() - start)), 500);
    return () => window.clearInterval(timer);
  }, [generating]);
  const [settings, setSettings] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefDraft, setBriefDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [canvasTab, setCanvasTab] = useState("preview");
  const [source, setSource] = useState("");
  const [mobileCanvas, setMobileCanvas] = useState(false);
  const [thorough, setThorough] = useState(true);
  useEffect(() => { try { const saved = localStorage.getItem("convoke-thorough"); if (saved !== null) setThorough(saved !== "false"); } catch {} }, []);
  const [quizStep, setQuizStep] = useState(0);
  const [quizOpen, setQuizOpen] = useState(true);
  const [loadedFrame, setLoadedFrame] = useState<string | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const runRef = useRef<{ projectId: string; runId: string; controller: AbortController } | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const active = projects.find(p => p.id === activeId);
  const version = active?.versions.at(-1);
  useEffect(() => { setAnswers([]); setQuizStep(0); setQuizOpen(true); }, [active?.clarification?.id]);
  const current = version;
  const showCanvas = !!current && (canvasOverride ?? latestAnswerHasCanvas(active));
  const dirty = !!version && source !== version.html;
  function updateProject(project: Project) { setProjects(prev => [project, ...prev.filter(p => p.id !== project.id)]); }
  async function load() {
    setLoadError(""); setLoading(true);
    try { if (publicAccess) { const session = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); if (!session.ok) throw new Error("Could not open your workspace. Please try again."); } const data = await api(); setProjects(data.projects); setCaps(data.capabilities); const selected = new URLSearchParams(window.location.search).get("project"); if (selected && data.projects.some(p=>p.id===selected)) { setActiveId(selected); setMode(data.projects.find(p=>p.id===selected)!.mode); } }
    catch (e) { setLoadError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (signedIn) void load(); else setLoading(false); }, [signedIn]);
  useEffect(() => { setSource(version?.html || ""); }, [version?.id, activeId]);
  useEffect(() => { const url = new URL(window.location.href); if (activeId) url.searchParams.set("project", activeId); else if (!loading) url.searchParams.delete("project"); window.history.replaceState(null, "", url); }, [activeId, loading]);
  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [active?.messages.length, pendingText]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirty || busy) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, busy]);
  async function send(text = prompt, chosenMode = mode, clarification?: {id: string; answers: string[]}) {
    if (!text.trim() || busy || loading) return;
    if (!signedIn) { window.location.href = "/signin-with-chatgpt?return_to=/"; return; }
    if (!caps.live) { setSettings(true); return; }
    if (dirty) { toast.error("Save or discard your source edits before continuing."); setCanvasTab("source"); return; }
    setGenerating(true); setProgress(4); setBusy(true); setMode(chosenMode); setPrompt(text); setPendingText(text); setStatus("Saving your request…");
    let project = active;
    try {
      if (!project) { const data = await api({ action: "create", title: text.slice(0,60), mode: chosenMode }); project = data.project; updateProject(project!); setActiveId(project!.id); }
      const runId = crypto.randomUUID(), controller = new AbortController();
      runRef.current = { projectId: project!.id, runId, controller };
      setStatus("Preparing your response…");
      const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/x-ndjson" }, signal: controller.signal, body: JSON.stringify({ projectId: project!.id, revision: project!.revision, runId, prompt: text, mode: chosenMode, thorough, clarificationId: clarification?.id, answers: clarification?.answers }) });
      const completed = await readGeneration(response, event => {
        if (event.phase !== "retry") setStatus(event.task === "clarify" ? "Checking the details…" : event.task === "repair" ? "Refining your result…" : "Working on your answer…");
      });
      setGenerating(false); setProgress(100); setStatus("Ready");
      updateProject(completed); setPrompt(""); setCanvasTab("preview"); setCanvasOverride(null);
      setMobileCanvas(latestAnswerHasCanvas(completed) && !completed.clarification);
      await new Promise(resolve => setTimeout(resolve, 350));
    } catch (e) { if ((e as Error).name !== "AbortError") toast.error((e as Error).message); }
    finally { setBusy(false); setPendingText(""); setStatus(""); setGenerating(false); runRef.current = null; }
  }
  async function cancel() {
    const run = runRef.current; if (!run) return;
    try { await api({ action: "cancel", projectId: run.projectId, runId: run.runId }); run.controller.abort(); const data = await api(); const latest = data.projects.find(p=>p.id===run.projectId); if (latest) updateProject(latest); toast("Request stopped. Previous versions are safe."); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function save(changes: Record<string, unknown>) {
    if (!active || busy) return;
    setBusy(true);
    try { const data = await api({ action: "save", projectId: active.id, revision: active.revision, ...changes }); updateProject(data.project); toast.success("Saved to your project"); return true; }
    catch (e) { toast.error((e as Error).message); return false; }
    finally { setBusy(false); }
  }
  function chooseProject(id: string | null) {
    if (busy) return;
    if (dirty) { toast.error("Save or discard your source edits first."); return; }
    setCanvasOverride(null); setActiveId(id); setPrompt(""); setCanvasTab("preview"); setMobileCanvas(false); setMode(projects.find(p=>p.id===id)?.mode || "auto");
  }
  function download() {
    if (!version || !active) return;
    const a = document.createElement("a"); a.href = `/api/export?project=${active.id}&version=${version.id}`; a.download = `${version.title.replace(/[^a-z0-9]+/gi,"-").toLowerCase()}.html`; document.body.appendChild(a); a.click(); a.remove(); toast("Export requested. Check your browser’s downloads.");
  }
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    Promise.resolve(context.registerTool({ name: "read_convoke_project", description: "Read the selected Convoke project's brief and saved artifact metadata.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute(input: unknown) { if (!input || typeof input !== "object" || Object.keys(input).length) throw new Error("Expected an empty object"); return active ? { id: active.id, title: active.title, brief: active.brief, revision: active.revision, versions: active.versions.map(v=>({number:v.number,title:v.title,source:v.source})) } : { project: null }; } }, { signal: lifecycle.signal })).catch(()=>{});
    return ()=>lifecycle.abort();
  }, [active]);
  return <SidebarProvider style={{ "--sidebar-width": "228px" } as React.CSSProperties}>
    <Toaster theme="dark" richColors position="bottom-center" />
    <Sidebar className="workspace-sidebar">
      <SidebarHeader><a className="brand" href="/" aria-label="Convoke home"><span className="brand-icon"><Orbit size={23}/></span>convoke</a><Button className="new-project" onClick={()=>chooseProject(null)} disabled={busy}><Plus size={17}/>New project</Button></SidebarHeader>
      <SidebarContent><SidebarGroup><SidebarGroupLabel>Your projects <span>{projects.length}</span></SidebarGroupLabel><SidebarMenu>{projects.map(p=><SidebarMenuItem key={p.id}><SidebarMenuButton isActive={p.id===activeId} onClick={()=>chooseProject(p.id)} disabled={busy} title={p.title}><MessageSquare size={16}/><span>{p.title}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>{!projects.length&&<p className="sidebar-empty">Your ideas will find<br/>a home here.</p>}</SidebarGroup></SidebarContent>
      <SidebarFooter><div className="workspace-note"><span className="tiny-orbit"><Orbit size={17}/></span><strong>A place for your ideas</strong><p>Pick up where you left off.<br/>Every saved version stays with you.</p></div><button className="settings-button" onClick={()=>setSettings(true)}><Settings2 size={17}/><span>Workspace settings</span></button><div className="profile"><span className="avatar">{signedIn?displayName[0].toUpperCase():"Y"}</span><div><strong>{displayName}</strong><small>Private workspace</small></div></div></SidebarFooter>
    </Sidebar>
    <main className="workspace-main">
      <header className="topbar"><div className="breadcrumb"><SidebarTrigger/><span>Workspace</span><ChevronRight size={14}/><strong>{active?.title || "A new beginning"}</strong></div><button className="mode-badge" onClick={()=>setSettings(true)}>{caps.live?<Sparkles size={14}/>:<Settings2 size={14}/>} {caps.live?"AI ready":loading?"Connecting…":"AI status"}</button><button disabled={!current} className="mobile-canvas-button" onClick={()=>{setCanvasOverride(!showCanvas);setMobileCanvas(!showCanvas)}} aria-label="Switch between chat and canvas"><PanelRight size={18}/></button></header>
      <div className={`work-area ${mobileCanvas&&showCanvas?"show-canvas":""} ${!showCanvas?"canvas-closed":""}`}>
        <section className="conversation" aria-label="Conversation">
          <div className="conversation-toolbar"><span><MessageSquare size={15}/>Conversation</span>{active&&<button onClick={()=>{setBriefDraft(active.brief);setTitleDraft(active.title);setBriefOpen(true)}} disabled={busy}><FileText size={15}/>Project brief</button>}</div>
          <div className="conversation-scroll">
            {!active?.messages.length&&!pendingText?<div className="welcome"><span className="welcome-mark"><Orbit size={29}/></span><span className="eyebrow">ROOM FOR YOUR NEXT IDEA</span><h1>What are we<br/>making today?</h1><p>Something to understand.<br/>Something to bring to life.</p><p className="connection-caption">{caps.live?"Describe your idea. AI will build the result here.":loading?"Opening your workspace…":"AI is temporarily unavailable. Please try again shortly."}</p></div>:<div className="messages">{active?.messages.map(m=><article key={m.id} className={`message ${m.role}`}><div className="message-heading">{m.role==="assistant"?<span className="assistant-symbol"><Orbit size={16}/></span>:<span className="user-symbol">Y</span>}<strong>{m.role==="assistant"?"Convoke":"You"}</strong>{m.model&&<small>{m.model==="demo"?"Saved response":m.model}</small>}</div>{m.role === "assistant" ? <Answer text={m.text}/> : <p>{m.text}</p>}{m.routing&&<details className="route-details"><summary>How this was routed</summary><p>{m.routing}</p><small>Models are selected for the task. Availability and quality vary.</small></details>}</article>)}{pendingText&&<article className="message user"><div className="message-heading"><span className="user-symbol">Y</span><strong>You</strong></div><p>{pendingText}</p></article>}{status&&<div className="run-status" role="status"><div className="generation-progress" role="progressbar" aria-label="Estimated response progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress)}><span style={{width:`${progress}%`}}/></div><span>{status}</span><small>{Math.floor(progress)}%</small></div>}<div ref={messagesEnd}/></div>}
            {loading&&<p className="inline-status" role="status"><span className="loading-dots" aria-hidden="true">•••</span>Loading your projects…</p>}
            {loadError&&<div className="load-error" role="alert">{loadError}<Button variant="outline" onClick={()=>void load()}>Try again</Button></div>}
          </div>
          <div className="composer-wrap">{active?.clarification&&!busy&&<Button variant="outline" onClick={()=>setQuizOpen(true)}>Answer clarification questions</Button>}{!signedIn&&<a className="signin-link" href="/signin-with-chatgpt?return_to=/" target="_top">Sign in to use your workspace</a>}<form className="composer" onSubmit={e=>{e.preventDefault();void send()}}><textarea aria-label="Message Convoke" value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Describe what’s on your mind…" maxLength={4000} disabled={busy} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/><div className="composer-bottom"><Tabs value={mode} onValueChange={v=>setMode(v as Mode)}><TabsList className="intent-tabs"><TabsTrigger value="auto" disabled={busy}><Sparkles size={14}/>Auto</TabsTrigger><TabsTrigger value="explain" disabled={busy}><BookOpen size={14}/>Explain</TabsTrigger><TabsTrigger value="build" disabled={busy}><Code2 size={14}/>Build</TabsTrigger></TabsList></Tabs>{busy?<Button type="button" size="icon" aria-label="Stop request" onClick={()=>void cancel()} disabled={!runRef.current}><Square size={15}/></Button>:<Button type="submit" size="icon" aria-label="Send message" disabled={!prompt.trim()||loading||!!loadError||!caps.live}><Send size={17}/></Button>}</div></form><div className="thorough-control"><label htmlFor="thorough">Thorough <small>Clarify the first request</small></label><Switch id="thorough" checked={thorough} onCheckedChange={value=>{setThorough(value);try{localStorage.setItem("convoke-thorough",String(value))}catch{}}} disabled={busy} aria-label="Thorough mode"/></div><p className="composer-note">{caps.live?"Connected AI · Review AI results before using them.":loading?"Connecting to AI…":"AI temporarily unavailable"}</p></div>
        </section>
        {showCanvas&&<section className="canvas" aria-label="Result canvas"><div className="canvas-heading"><div><span className="canvas-icon"><PanelRight size={18}/></span><span><strong>{version?"Your canvas":"Your canvas starts here"}</strong><small>{version?"An idea you can interact with":"AI-created results appear here"}</small></span></div><Button variant="ghost" size="icon" disabled={!version} onClick={download} aria-label="Export HTML"><Download size={18}/></Button></div>
          <Tabs value={canvasTab} onValueChange={setCanvasTab} className="canvas-tabs"><div className="canvas-tabbar"><TabsList variant="line"><TabsTrigger value="preview"><Eye size={14}/>Preview</TabsTrigger><TabsTrigger value="source" disabled={!version}><Code2 size={14}/>Source</TabsTrigger><TabsTrigger value="history" disabled={!version}><History size={14}/>History{version&&<span className="version-count">{active?.versions.length}</span>}</TabsTrigger></TabsList>{version&&<span className="version-label">v{version.number}</span>}</div>
          <TabsContent value="preview" className="preview-content">{current?<><div className="artifact-paper"><div className="paper-bar"><span className="paper-dots"><i/><i/><i/></span><span>{current.title}</span><span className="html-label">HTML</span></div><div className="frame-wrap">{loadedFrame!==current.id&&<div className="frame-loading" role="status"><span className="loading-dots" aria-hidden="true">•••</span>Opening your result…</div>}<iframe key={current.id} style={{visibility:loadedFrame===current.id?"visible":"hidden"}} onLoad={()=>setLoadedFrame(current.id)} title={current.title} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={previewDocument(current.html)}/></div></div><p className="preview-note"><span><Eye size={14}/>{version?(version.checks==="static-passed"?"Structure checked · runtime untested":"Browser preview · not execution-tested"):"Live illustration"}</span>{version?<span>{version.source==="demo"?"Saved artifact":version.source==="manual"?"Edited by you":version.source.startsWith("Restored")?version.source:version.repaired?"AI · repaired once":"AI-generated"}</span>:<span>Move a slider to explore</span>}</p></>:<div className="canvas-empty"><Orbit size={36}/><h2>Room for your next idea</h2><p>Describe what you want to understand or create. Your result will be generated by AI.</p>{!caps.live&&<Button variant="outline" onClick={()=>setSettings(true)}>AI status</Button>}</div>}</TabsContent>
          <TabsContent value="source" className="source-content"><div className="source-tools"><span>{dirty?"Unsaved changes":"Saved source"}</span><div><Button variant="ghost" size="sm" disabled={!dirty||busy} onClick={()=>setSource(version?.html||"")}>Discard</Button><Button size="sm" disabled={!dirty||busy} onClick={()=>void save({ html: source, artifactTitle: version?.title })}><Check size={14}/>Save version</Button></div></div><textarea spellCheck={false} aria-label="Artifact HTML source" value={source} onChange={e=>setSource(e.target.value)} maxLength={45000}/></TabsContent>
          <TabsContent value="history" className="history-content"><h2>Ideas evolve.</h2><p>Restore an earlier version without losing the current one.</p>{active?.versions.slice().reverse().map((v,i)=><div className="history-item" key={v.id}><span className="history-number">{v.number}</span><div><strong>{v.title}</strong><small>{new Date(v.createdAt).toLocaleString()} · {v.source==="demo"?"Saved artifact":v.source==="manual"?"You":v.source}</small></div>{i===0?<span className="current-label">Current</span>:<Button size="sm" variant="outline" disabled={busy||dirty} onClick={()=>void save({ restoreId: v.id })}><RotateCcw size={13}/>Restore</Button>}</div>)}</TabsContent></Tabs>
        </section>}
      </div>
    </main>
    <Dialog open={!!active?.clarification && !busy && quizOpen} onOpenChange={setQuizOpen}><DialogContent className="thorough-quiz"><DialogHeader><DialogTitle>A little more direction</DialogTitle><DialogDescription>Choose an answer or write your own. After this set of questions, Convoke will create your result. You can also ask Convoke to decide for you.</DialogDescription></DialogHeader>{active?.clarification&&<form onSubmit={e=>{e.preventDefault();const c=active.clarification!;if(quizStep<c.questions.length-1)setQuizStep(quizStep+1);else void send(c.prompt,c.mode,{id:c.id,answers});}}><p className="quiz-progress">Question {quizStep+1} of {active.clarification.questions.length}</p><fieldset><legend>{active.clarification.questions[quizStep]}</legend><div className="quiz-options">{active.clarification.options?.[quizStep]?.map(option=><button type="button" key={option} aria-pressed={answers[quizStep]===option} onClick={()=>setAnswers(prev=>{const next=[...prev];next[quizStep]=option;return next})}>{option}</button>)}</div><label className="field-label">Your answer<input autoComplete="off" value={answers[quizStep]||""} onChange={e=>setAnswers(prev=>{const next=[...prev];next[quizStep]=e.target.value;return next})} maxLength={800} required placeholder="Choose above or type your own answer"/></label></fieldset><div className="quiz-actions"><Button type="button" variant="ghost" disabled={quizStep===0} onClick={()=>setQuizStep(quizStep-1)}>Back</Button><Button type="submit" disabled={!answers[quizStep]?.trim()}>{quizStep===active.clarification.questions.length-1?"Create with these details":"Next"}</Button></div></form>}</DialogContent></Dialog>
    <Dialog open={settings} onOpenChange={setSettings}><DialogContent><DialogHeader><DialogTitle>Workspace settings</DialogTitle><DialogDescription>A clear view of what’s connected.</DialogDescription></DialogHeader><div className="setting-row"><div><strong>{caps.live?"AI ready":loading?"Connecting…":"AI status"}</strong><p>{caps.live?`Your prompts, brief, and current artifact are sent to ${caps.provider || "the AI provider"}. Its data policies and account limits apply.`:loading?"Checking the connection…":"AI is temporarily unavailable. No setup is needed on your part."}</p></div></div>{caps.live?<div className="settings-detail">{caps.model}<br/>No daily Convoke usage cap. Your AI providers still apply their own quotas and rate limits.</div>:<div className="settings-detail">AI access is included. You do not need an account with an AI provider or your own API key.</div>}{publicAccess&&<div className="settings-detail">Your projects belong to this browser. Use the same browser to return to them; clearing cookies removes access. Export any work you want to keep.</div>}<div className="settings-detail"><strong>What happens to your request</strong><p>Convoke chooses a {caps.provider || "connected AI"} model for the task. Thorough mode asks one set of questions on the first request in a project. Your answers and later messages go directly to generation. Generated HTML receives structural and JavaScript syntax checks, with at most one automatic repair.</p><p>Busy or unavailable providers are skipped for the next attempt. Convoke keeps retrying temporary failures across connected providers until a result arrives, you stop, or the 20-minute request window ends. Attempts pause for at least five seconds. Provider-required waits may be longer. These checks do not execute code or prove it works. The preview restricts external resources. Provider limits apply. If a provider fails, your prompt and project context may be sent to another connected provider.</p></div></DialogContent></Dialog>
    <Dialog open={briefOpen} onOpenChange={setBriefOpen}><DialogContent><DialogHeader><DialogTitle>Project brief</DialogTitle><DialogDescription>Keep the important details with your work. This brief is included in every AI request.</DialogDescription></DialogHeader><label className="field-label">Project name<input value={titleDraft} onChange={e=>setTitleDraft(e.target.value)} maxLength={100}/></label><label className="field-label">Goal, audience, and constraints<textarea value={briefDraft} onChange={e=>setBriefDraft(e.target.value)} placeholder="What should this do? Who is it for? What should stay the same?" maxLength={4000}/></label><Button disabled={busy||!titleDraft.trim()} onClick={async()=>{if(await save({title:titleDraft,brief:briefDraft}))setBriefOpen(false)}}><Check size={16}/>Save brief</Button></DialogContent></Dialog>
  </SidebarProvider>;
}
