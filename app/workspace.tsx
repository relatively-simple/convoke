"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Orbit, Plus, MessageSquare, Sparkles, Code2, BookOpen, Settings2, Download, History, Check, Send, PanelRight, FileText, ChevronRight, Square, RotateCcw, Eye, ShieldCheck, ShieldAlert, Users, SlidersHorizontal, Trash2, LogOut, Laptop, Lock, Coins } from "lucide-react";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Toaster, toast } from "sonner";
import { readGeneration } from "@/lib/generation-stream";
import { ComparisonView } from "@/components/comparison";
import { FactCheckView } from "@/components/fact-check-view";
import { SecondOpinionView } from "@/components/second-opinion-view";
import { BoardroomView } from "@/components/boardroom-view";
import { detectSensitiveEntities, maskText, unmaskText } from "@/lib/privacy-proxy";
import { ArtifactPreview } from "@/components/artifact-preview";
import { VisualAnswers } from "@/components/visual-answer";
import { testArtifact, recordRuntime } from "@/lib/runtime-client";
import { Answer } from "@/components/answer";
import { estimatedProgress, latestAnswerHasCanvas } from "@/lib/presentation";
import { type Project, type Mode, type Capabilities } from "@/lib/project";

async function api(body?: unknown) {
  const response = await fetch("/api/workspace", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await response.json() as { error?: string; project: Project; projects: Project[]; capabilities: Capabilities };
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function TypewriterStatus({
  text,
  provider,
  phase,
  progress,
}: {
  text: string;
  provider?: string;
  phase?: string;
  progress: number;
}) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    if (!text) return;
    let idx = 0;
    const interval = setInterval(() => {
      idx += 2;
      setDisplayed(text.slice(0, idx));
      if (idx >= text.length) clearInterval(interval);
    }, 18);
    return () => clearInterval(interval);
  }, [text]);

  const badge = provider || (phase === "repair" ? "Runtime Check" : phase === "deliberation" ? "Deliberation" : "Convoke");

  return (
    <div className="typewriter-status-container" role="status">
      <div className="typewriter-header">
        <div className="typewriter-meta">
          <div className="generation-progress" role="progressbar" aria-label="Response progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress)}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <span className="typewriter-badge">{badge}</span>
        </div>
        <small className="typewriter-percentage">{Math.floor(progress)}%</small>
      </div>
      <div className="typewriter-body">
        <span className="typewriter-text">
          {displayed}
          <span className="typewriter-cursor">▎</span>
        </span>
      </div>
    </div>
  );
}

export default function Workspace({ signedIn, displayName, publicAccess = false }: { signedIn: boolean; displayName: string; publicAccess?: boolean }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [caps, setCaps] = useState<Capabilities>({ live: false, model: null, dailyLimit: null });
  const [loading, setLoading] = useState(signedIn);
  const [loadError, setLoadError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<Mode>("auto");
  const [busy, setBusy] = useState(false);
  const [pendingText, setPendingText] = useState("");
  const [status, setStatus] = useState("");
  const [statusProvider, setStatusProvider] = useState<string>("Convoke");
  const [statusPhase, setStatusPhase] = useState<string>("attempt");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountName, setAccountName] = useState("");
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
    const [userAccount, setUserAccount] = useState<{ email?: string; displayName?: string; provider?: string } | null>(null);

  useEffect(() => {
    fetch("/api/session").then(r => r.json() as Promise<{ user?: { email?: string; displayName?: string; provider?: string }; googleClientId?: string | null }>).then(data => {
      if (data?.user) setUserAccount(data.user);
      if (data?.googleClientId) setGoogleClientId(data.googleClientId);
      
    }).catch(() => {});
  }, []);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [canvasOverride, setCanvasOverride] = useState<boolean | null>(null);
  useEffect(() => {
    if (!generating) return;
    const start = Date.now();
    const timer = window.setInterval(() => setProgress(estimatedProgress(Date.now() - start)), 500);
    return () => window.clearInterval(timer);
  }, [generating]);
  const [comparisonOpen,setComparisonOpen]=useState(false);
  const [boardroomOpen, setBoardroomOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefDraft, setBriefDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [canvasTab, setCanvasTab] = useState("preview");
  const [source, setSource] = useState("");
  const [mobileCanvas, setMobileCanvas] = useState(false);
  const [thorough, setThorough] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = localStorage.getItem("convoke-thorough");
      return saved !== null ? saved !== "false" : true;
    } catch {
      return true;
    }
  });
  const [smartRouting, setSmartRouting] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = localStorage.getItem("convoke-smart-routing");
      return saved !== null ? saved !== "false" : true;
    } catch {
      return true;
    }
  });
  const [privateMode, setPrivateMode] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("convoke-private-mode") === "true";
    } catch {
      return false;
    }
  });
  const [replacementsMap, setReplacementsMap] = useState<Record<string, string>>({});
  const [showControls, setShowControls] = useState(false);
  const detectedEntities = (privateMode && prompt) ? detectSensitiveEntities(prompt) : [];
  const [quizStep, setQuizStep] = useState(0);
  const [quizOpen, setQuizOpen] = useState(true);
  const [answers, setAnswers] = useState<string[]>([]);
  const runRef = useRef<{ projectId: string; runId: string; controller: AbortController } | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const active = projects.find(p => p.id === activeId);
  const version = active?.versions.at(-1);

  const [prevClarificationId, setPrevClarificationId] = useState<string | undefined>(undefined);
  const currentClarificationId = active?.clarification?.id;
  if (currentClarificationId !== prevClarificationId) {
    setPrevClarificationId(currentClarificationId);
    setAnswers([]);
    setQuizStep(0);
    setQuizOpen(true);
  }

  const [prevVersionKey, setPrevVersionKey] = useState<string | undefined>(undefined);
  const currentVersionKey = activeId ? `${activeId}:${version?.id ?? "none"}` : undefined;
  if (currentVersionKey !== prevVersionKey) {
    setPrevVersionKey(currentVersionKey);
    setSource(version?.python || version?.html || "");
  }

  const current = version;
  const showCanvas = !!current && (canvasOverride ?? latestAnswerHasCanvas(active));
  const dirty = !!version && source !== (version.python || version.html);
  function updateProject(project: Project) { setProjects(prev => [project, ...prev.filter(p => p.id !== project.id)]); }
  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (publicAccess) {
        const session = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        if (!session.ok) throw new Error("Could not open your workspace. Please try again.");
      }
      const data = await api();
      setProjects(data.projects);
      setCaps(data.capabilities);
      setLoadError("");
      const selected = new URLSearchParams(window.location.search).get("project");
      if (selected && data.projects.some(p => p.id === selected)) {
        setActiveId(selected);
        setMode(data.projects.find(p => p.id === selected)!.mode);
      }
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [publicAccess]);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    const task = publicAccess
      ? fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
          .then(res => { if (!res.ok) throw new Error("Could not open your workspace. Please try again."); })
          .then(() => api())
      : api();

    task
      .then(data => {
        if (!live) return;
        setProjects(data.projects);
        setCaps(data.capabilities);
        setLoadError("");
        const selected = new URLSearchParams(window.location.search).get("project");
        if (selected && data.projects.some(p => p.id === selected)) {
          setActiveId(selected);
          setMode(data.projects.find(p => p.id === selected)!.mode);
        }
      })
      .catch(e => {
        if (live) setLoadError((e as Error).message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => { live = false; };
  }, [signedIn, publicAccess]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeId) url.searchParams.set("project", activeId);
    else if (!loading) url.searchParams.delete("project");
    window.history.replaceState(null, "", url);
  }, [activeId, loading]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length, pendingText]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirty || busy) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, busy]);
  async function send(text = prompt, chosenMode = mode, clarification?: {id: string; answers: string[]}, compare = false, boardroom = false) {
    if (!text.trim() || busy || loading) return;
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (!signedIn) { window.location.assign("/signin-with-chatgpt?return_to=/"); return; }
    if (!caps.live) { setSettings(true); return; }
    if (dirty) { toast.error("Save or discard your source edits before continuing."); setCanvasTab("source"); return; }
    setGenerating(true); setProgress(4); setBusy(true); setMode(chosenMode); setPrompt(""); setPendingText(text); setStatus("Saving your request…");
    let project = active;
    let textToSend = text;
    let localReplacements: Record<string, string> = {};
    if (privateMode) {
      const masked = maskText(text);
      textToSend = masked.maskedText;
      localReplacements = masked.replacements;
      if (Object.keys(localReplacements).length > 0) {
        setReplacementsMap(prev => ({ ...prev, ...localReplacements }));
      }
    }
    try {
      if (!project) { const data = await api({ action: "create", title: text.slice(0,60), mode: chosenMode }); project = data.project; updateProject(project!); setActiveId(project!.id); }
      const runId = crypto.randomUUID(), controller = new AbortController();
      runRef.current = { projectId: project!.id, runId, controller };
      setStatus("Preparing your response…");
      const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/x-ndjson" }, signal: controller.signal, body: JSON.stringify({ projectId: project!.id, revision: project!.revision, runId, prompt: textToSend, mode: chosenMode, thorough, smartRouting, compare, boardroom, clarificationId: clarification?.id, answers: clarification?.answers }) });
      let completed = await readGeneration(response, event => {
        if (event.phase !== "retry") {
          if (event.message) setStatus(event.message);
          else setStatus(event.task === "clarify" ? "Checking the details…" : event.task === "repair" ? "Refining your result…" : "Working on your answer…");
          if (event.provider) setStatusProvider(event.provider);
          if (event.phase) setStatusPhase(event.phase);
        }
      });
      if (privateMode || Object.keys(localReplacements).length > 0 || Object.keys(replacementsMap).length > 0) {
        const fullReplacements = { ...replacementsMap, ...localReplacements };
        completed.messages = completed.messages.map(m => ({
          ...m,
          text: unmaskText(m.text, fullReplacements),
        }));
        if (completed.versions.length > 0) {
          const lastV = completed.versions[completed.versions.length - 1];
          lastV.html = unmaskText(lastV.html, fullReplacements);
          if (lastV.python) lastV.python = unmaskText(lastV.python, fullReplacements);
        }
      }
      if(!compare && !boardroom) completed = await checkAndRepair(completed, controller.signal);
      if(compare)setComparisonOpen(true);
      if(boardroom)setBoardroomOpen(true);
      setGenerating(false); setProgress(100); setStatus("Ready");
      updateProject(completed); setPrompt(""); setCanvasTab("preview"); setCanvasOverride(null);
      setMobileCanvas(latestAnswerHasCanvas(completed) && !completed.clarification);
      await new Promise(resolve => setTimeout(resolve, 350));
    } catch (e) { if ((e as Error).name !== "AbortError") { toast.error((e as Error).message); await load(); } }
    finally { setBusy(false); setPendingText(""); setStatus(""); setGenerating(false); runRef.current = null; }
  }
  async function checkAndRepair(project:Project, signal:AbortSignal):Promise<Project>{
    while(project.versions.at(-1)?.runtime?.status === "pending"){
      const draft=project.versions.at(-1)!;
      setStatus(draft.python?"Running Python and its checks…":"Testing your result in the browser…");
      let report;
      try{report=await testArtifact(draft,signal);}catch(e){if(signal.aborted)throw e;report={issues:[(e as Error).message]};}
      project=await recordRuntime(project,report,signal);
      if(!report.issues.length)break;
      if((draft.runtime?.attempts||0)>=3){toast.error("The draft still has issues after three repairs. Your previous versions and source are saved.");break;}
      setStatus(`Refining your result (${(draft.runtime?.attempts||0)+1}/3)…`);
      const runId=crypto.randomUUID();if(runRef.current)runRef.current.runId=runId;
      const response=await fetch('/api/generate',{method:'POST',signal,headers:{'Content-Type':'application/json',Accept:'application/x-ndjson'},body:JSON.stringify({projectId:project.id,revision:project.revision,runId,prompt:'Repair the browser-tested draft',mode:'build',thorough:false,smartRouting,runtimeVersionId:project.versions.at(-1)!.id})});
      project=await readGeneration(response,()=>{});
    }
    return project;
  }
  async function adoptComparison(resultId:string){
    if(!active?.comparison||busy)return;setBusy(true);setGenerating(true);setProgress(4);setComparisonOpen(false);
    const controller=new AbortController();runRef.current={projectId:active.id,runId:crypto.randomUUID(),controller};
    try{const data=await api({action:'adopt',projectId:active.id,revision:active.revision,comparisonId:active.comparison.id,resultId});
      const completed=await checkAndRepair(data.project,controller.signal);updateProject(completed);setCanvasOverride(null);setMobileCanvas(latestAnswerHasCanvas(completed));
    }catch(e){if(!controller.signal.aborted)toast.error((e as Error).message);await load();}
    finally{setBusy(false);setGenerating(false);setStatus('');runRef.current=null;}
  }
  async function verifyMessage(messageId: string) {
    if (!active || busy) return;
    setBusy(true); setGenerating(true); setProgress(10); setStatus("Verifying factual claims…");
    const runId = crypto.randomUUID(), controller = new AbortController();
    runRef.current = { projectId: active.id, runId, controller };
    try {
      const targetIndex = active.messages.findIndex(m => m.id === messageId);
      const precedingUserMsg = active.messages.slice(0, targetIndex >= 0 ? targetIndex : undefined).reverse().find(m => m.role === "user");
      const promptToSend = (precedingUserMsg?.text || "Verify factual claims").slice(0, 4000);
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/x-ndjson" },
        signal: controller.signal,
        body: JSON.stringify({
          projectId: active.id,
          revision: active.revision,
          runId,
          prompt: promptToSend,
          mode,
          smartRouting,
          factCheck: { messageId }
        })
      });
      const completed = await readGeneration(response, event => {
        if (event.message) setStatus(event.message);
        if (event.provider) setStatusProvider(event.provider);
        if (event.phase) setStatusPhase(event.phase);
      });
      updateProject(completed);
      toast.success("Fact check completed");
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
    } finally {
      setBusy(false); setStatus(""); setGenerating(false); runRef.current = null;
    }
  }
  async function applyCorrection(messageId: string, correction: string) {
    if (!active || busy) return;
    setBusy(true);
    try {
      const data = await api({ action: "apply-correction", projectId: active.id, revision: active.revision, messageId, correction });
      updateProject(data.project);
      toast.success("Correction applied to answer");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function requestSecondOpinion(messageId: string) {
    if (!active || busy) return;
    setBusy(true); setGenerating(true); setProgress(10); setStatus("Requesting independent second opinion…");
    const runId = crypto.randomUUID(), controller = new AbortController();
    runRef.current = { projectId: active.id, runId, controller };
    try {
      const targetIndex = active.messages.findIndex(m => m.id === messageId);
      const precedingUserMsg = active.messages.slice(0, targetIndex >= 0 ? targetIndex : undefined).reverse().find(m => m.role === "user");
      const promptToSend = (precedingUserMsg?.text || "Second opinion").slice(0, 4000);
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/x-ndjson" },
        signal: controller.signal,
        body: JSON.stringify({
          projectId: active.id,
          revision: active.revision,
          runId,
          prompt: promptToSend,
          mode,
          smartRouting,
          secondOpinion: { messageId }
        })
      });
      const completed = await readGeneration(response, event => {
        if (event.message) setStatus(event.message);
        if (event.provider) setStatusProvider(event.provider);
        if (event.phase) setStatusPhase(event.phase);
      });
      updateProject(completed);
      toast.success("Second opinion received");
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
    } finally {
      setBusy(false); setStatus(""); setGenerating(false); runRef.current = null;
    }
  }
  async function applySecondOpinion(messageId: string, revisionText: string) {
    if (!active || busy) return;
    setBusy(true);
    try {
      const data = await api({ action: "apply-second-opinion", projectId: active.id, revision: active.revision, messageId, revisionText });
      updateProject(data.project);
      toast.success("Suggested revision applied");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function adoptBoardroom(content: string, source: string) {
    if (!active || busy) return;
    setBusy(true); setBoardroomOpen(false);
    try {
      const data = await api({ action: "adopt-boardroom", projectId: active.id, revision: active.revision, boardroomId: active.boardroom?.id, content, source });
      updateProject(data.project);
      toast.success(`Adopted verdict from ${source}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function resumeChecks(){
    if(!active||busy)return;const controller=new AbortController();setBusy(true);setGenerating(true);setProgress(4);
    runRef.current={projectId:active.id,runId:crypto.randomUUID(),controller};
    try{let project=active;
      if(!project.versions.at(-1)?.runtime || project.versions.at(-1)?.runtime?.status === "failed"){const data=await api({action:'save',projectId:project.id,revision:project.revision,restoreId:version!.id});project=data.project;}
      project=await checkAndRepair(project,controller.signal);updateProject(project);setCanvasOverride(true);
    }catch(e){if(!controller.signal.aborted)toast.error((e as Error).message);await load();}
    finally{setBusy(false);setGenerating(false);setStatus('');runRef.current=null;}
  }
  async function cancel() {
    const run = runRef.current; if (!run) return;
    run.controller.abort();
    try { await api({ action: "cancel", projectId: run.projectId, runId: run.runId }); run.controller.abort(); const data = await api(); const latest = data.projects.find(p=>p.id===run.projectId); if (latest) updateProject(latest); toast("Request stopped. Previous versions are safe."); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function save(changes: Record<string, unknown>) {
    if (!active || busy) return;
    setBusy(true);
    try { const data = await api({ action: "save", projectId: active.id, revision: active.revision, ...changes }); updateProject(data.project); setCanvasOverride(true); toast.success("Saved to your project"); return true; }
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
    const a = document.createElement("a"); a.href = `/api/export?project=${active.id}&version=${version.id}`; a.download = `${version.title.replace(/[^a-z0-9]+/gi,"-").toLowerCase()}.${version.python?"py":"html"}`; document.body.appendChild(a); a.click(); a.remove(); toast("Export requested. Check your browser’s downloads.");
  }

  async function deleteProject(idToDelete: string) {
    if (busy) return;
    const target = projects.find(p => p.id === idToDelete);
    try {
      await api({ action: "delete", projectId: idToDelete });
      const updated = projects.filter(p => p.id !== idToDelete);
      setProjects(updated);
      if (activeId === idToDelete) {
        chooseProject(updated[0]?.id || null);
      }
      toast.success(`Deleted "${target?.title?.slice(0, 24) || "thread"}"`);
    } catch (err) {
      toast.error((err as Error).message || "Could not delete project");
    } finally {
      setConfirmDeleteId(null);
    }
  }

  const handleGoogleLogin = useCallback(async (credential: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "google-login", credential, clientId: googleClientId }),
      });
      const data = (await res.json()) as { error?: string; user?: { email: string; displayName?: string; provider?: string } };
      if (!res.ok) throw new Error(data.error || "Google authentication failed");
      setUserAccount(data.user || null);
      setAccountOpen(false);
      await load();
      toast.success(`Signed in with Google as ${data.user?.displayName || data.user?.email}!`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [busy, googleClientId, load]);

  useEffect(() => {
    if (!accountOpen || !googleClientId) return;
    const cid = googleClientId;
    const initGsi = () => {
      if (typeof window !== "undefined" && (window as unknown as { google?: { accounts?: { id?: { initialize: (opts: unknown) => void; renderButton: (el: HTMLElement, opts: unknown) => void } } } }).google?.accounts?.id) {
        try {
          const gsi = (window as unknown as { google: { accounts: { id: { initialize: (opts: unknown) => void; renderButton: (el: HTMLElement, opts: unknown) => void } } } }).google.accounts.id;
          gsi.initialize({
            client_id: cid,
            callback: (response: { credential?: string }) => {
              if (response.credential) {
                void handleGoogleLogin(response.credential);
              }
            },
            auto_select: false,
            cancel_on_tap_outside: true,
          });
          const container = document.getElementById("google-signin-btn-container");
          if (container) {
            container.innerHTML = "";
            gsi.renderButton(container, {
              theme: "outline",
              size: "large",
              text: "signin_with",
              shape: "rectangular",
              width: 320,
            });
          }
        } catch (e) {
          console.warn("Google Sign-In initialization failed", e);
        }
      }
    };
    const timer = setTimeout(initGsi, 150);
    return () => clearTimeout(timer);
  }, [accountOpen, googleClientId, handleGoogleLogin]);

  async function handlePasswordAuth(email: string, password: string, name?: string) {
    if (busy) return;
    if (!email.trim()) return;
    if (!password || password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", email: email.trim(), password, name: name?.trim(), provider: "email" }),
      });
      const data = (await res.json()) as { error?: string; user?: { email: string; displayName?: string; provider?: string } };
      if (!res.ok) throw new Error(data.error || "Login failed");
      setUserAccount(data.user || null);
      setAccountPassword("");
      setAccountOpen(false);
      await load();
      toast.success(`Signed in as ${data.user?.email || email}! Chats securely synced.`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAccountLogout() {
    try {
      await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      setUserAccount(null);
      setAccountOpen(false);
      await load();
      toast.success("Signed out. Switched to guest workspace.");
    } catch (err) {
      toast.error((err as Error).message);
    }
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
      <SidebarContent><SidebarGroup><SidebarGroupLabel>Your projects <span>{projects.length}</span></SidebarGroupLabel><SidebarMenu>{projects.map(p=><SidebarMenuItem key={p.id} className="project-menu-item"><SidebarMenuButton isActive={p.id===activeId} onClick={()=>chooseProject(p.id)} disabled={busy} title={p.title}><MessageSquare size={16}/><span className="project-title-label">{p.title}</span></SidebarMenuButton><button type="button" className="project-delete-trigger" onClick={e=>{e.stopPropagation();setConfirmDeleteId(p.id);}} disabled={busy} title="Delete chat thread" aria-label={`Delete ${p.title}`}><Trash2 size={13}/></button></SidebarMenuItem>)}</SidebarMenu>{!projects.length&&<p className="sidebar-empty">Your ideas will find<br/>a home here.</p>}</SidebarGroup></SidebarContent>
      <SidebarFooter><div className="workspace-note"><span className="tiny-orbit"><Orbit size={17}/></span><strong>A place for your ideas</strong><p>Pick up where you left off.<br/>Every saved version stays with you.<br/><span style={{fontSize:"10px",color:"var(--muted-foreground)",opacity:0.6}}>v3.0</span></p></div><button className="settings-button" onClick={()=>setSettings(true)}><Settings2 size={17}/><span>Workspace settings</span></button><div className="profile" onClick={()=>setAccountOpen(true)} style={{cursor:"pointer"}} title="Account & Device Sync"><span className="avatar">{(userAccount?.displayName || displayName)[0].toUpperCase()}</span><div><strong>{userAccount?.displayName || displayName}</strong><small>{userAccount?.email ? (userAccount.email.length > 18 ? userAccount.email.slice(0, 16) + "…" : userAccount.email) : "Guest · Sync on any device"}</small></div></div></SidebarFooter>
    </Sidebar>
    <main className="workspace-main">
      <header className="topbar"><div className="breadcrumb"><SidebarTrigger/><span>Workspace</span><ChevronRight size={14}/><strong>{active?.title || "A new beginning"}</strong></div><button className="mode-badge" onClick={()=>setSettings(true)}>{caps.live?<Sparkles size={14}/>:<Settings2 size={14}/>} {caps.live?"AI ready":loading?"Connecting…":"AI status"}</button><button disabled={!current} className="mobile-canvas-button" onClick={()=>{setCanvasOverride(!showCanvas);setMobileCanvas(!showCanvas)}} aria-label="Switch between chat and canvas"><PanelRight size={18}/></button></header>
      <div className={`work-area ${mobileCanvas&&showCanvas?"show-canvas":""} ${!showCanvas?"canvas-closed":""}`}>
        <section className="conversation" aria-label="Conversation">
          <div className="conversation-toolbar"><span><MessageSquare size={15}/>Conversation</span><div style={{display:"flex",alignItems:"center",gap:"8px"}}>{active&&<button onClick={()=>{setBriefDraft(active.brief);setTitleDraft(active.title);setBriefOpen(true)}} disabled={busy}><FileText size={15}/>Project brief</button>}{active&&<button type="button" className="delete-thread-btn" onClick={()=>setConfirmDeleteId(active.id)} disabled={busy} title="Delete this chat thread"><Trash2 size={13}/><span>Delete chat</span></button>}</div></div>
          <div className="conversation-scroll">
            {!active?.messages.length&&!pendingText?<div className="welcome"><span className="welcome-mark"><Orbit size={29}/></span><span className="eyebrow">ROOM FOR YOUR NEXT IDEA</span><h1>What are we<br/>making today?</h1><p>Something to understand.<br/>Something to bring to life.</p><p className="connection-caption">{caps.live?"Describe your idea. AI will build the result here.":loading?"Opening your workspace…":"AI is temporarily unavailable. Please try again shortly."}</p></div>:<div className="messages">{active?.messages.map(m=>{const isClarified=m.role==="user"&&m.text.includes("\nUser-confirmed details:\n");const cleanText=isClarified?m.text.split("\nUser-confirmed details:\n")[0]:m.text;return <article key={m.id} className={`message ${m.role}`}><div className="message-heading">{m.role==="assistant"?<span className="assistant-symbol"><Orbit size={16}/></span>:<span className="user-symbol">Y</span>}<strong>{m.role==="assistant"?"Convoke":"You"}</strong>{m.model&&<small>{m.model==="demo"?"Saved response":m.model}</small>}{m.boardroomId&&<button type="button" className="boardroom-pill" onClick={()=>setBoardroomOpen(true)}><Users size={12}/>Boardroom deliberation</button>}{m.cost&&<span className="cost-ledger-tag"><Coins size={12}/> {m.cost.label}</span>}</div>{m.role === "assistant" ? <>{m.visuals?.length?<VisualAnswers visuals={m.visuals} onExplain={busy?undefined:caption=>void send(`Explain this in words: ${caption}`,"explain")}/>:null}<Answer text={m.text}/>{m.factCheck?<FactCheckView report={m.factCheck} onApplyCorrection={c=>void applyCorrection(m.id,c)} disabled={busy}/>:null}{m.secondOpinion?<SecondOpinionView report={m.secondOpinion} onApply={rev=>void applySecondOpinion(m.id,rev)} busy={busy}/>:null}<div className="message-actions">{!m.factCheck&&<Button variant="ghost" size="sm" className="verify-button" disabled={busy} onClick={()=>void verifyMessage(m.id)}><ShieldCheck size={13}/>Verify facts</Button>}{!m.secondOpinion&&<Button variant="ghost" size="sm" className="opinion-button" disabled={busy} onClick={()=>void requestSecondOpinion(m.id)}><Sparkles size={13}/>Second opinion</Button>}</div></> : <><Answer text={cleanText}/>{isClarified&&<details className="route-details" style={{marginTop:"4px"}}><summary style={{fontSize:"11px",color:"var(--muted-foreground)"}}>Confirmed background details</summary><p style={{fontSize:"11px",whiteSpace:"pre-wrap",margin:"6px 0",color:"var(--muted-foreground)"}}>{m.text.split("\nUser-confirmed details:\n")[1]?.split("\nClarification is complete")[0]?.trim()}</p></details>}</>}{m.routing&&<details className="route-details"><summary>How this was routed</summary><p>{m.routing}</p><small>Models are selected for the task. Availability and quality vary.</small></details>}</article>})}{pendingText&&<article className="message user"><div className="message-heading"><span className="user-symbol">Y</span><strong>You</strong></div><Answer text={pendingText}/></article>}{status&&<TypewriterStatus key={status} text={status} provider={statusProvider} phase={statusPhase} progress={progress}/>}<div ref={messagesEnd}/></div>}
            {loading&&<p className="inline-status" role="status"><span className="loading-dots" aria-hidden="true">•••</span>Loading your projects…</p>}
            {loadError&&<div className="load-error" role="alert">{loadError}<Button variant="outline" onClick={()=>void load()}>Try again</Button></div>}
          </div>
          <div className="composer-wrap">
            {active?.clarification && !busy && <Button variant="outline" className="clarification-quiz-btn" onClick={()=>setQuizOpen(true)}>Answer clarification questions</Button>}
            {!signedIn && <a className="signin-link" href="/signin-with-chatgpt?return_to=/" target="_top">Sign in to use your workspace</a>}
            {privateMode && detectedEntities.length > 0 && <div className="privacy-pill-bar"><span className="privacy-pill-text"><ShieldAlert size={13}/> {detectedEntities.length} sensitive item(s) will be masked client-side before sending:</span><div className="privacy-chips">{detectedEntities.map(e=><span key={e.id} className="privacy-chip" title={e.raw}>{e.type.replace('_',' ')}: {e.raw.slice(0,4)}…{e.raw.slice(-3)}</span>)}</div></div>}
            {!showControls && (active?.comparison || active?.boardroom) && (
              <div className="quick-access-pills">
                {active.comparison && <button type="button" className="quick-pill" onClick={()=>setComparisonOpen(true)}><Sparkles size={12}/> View comparison</button>}
                {active.boardroom && <button type="button" className="quick-pill" onClick={()=>setBoardroomOpen(true)}><Users size={12}/> View boardroom</button>}
              </div>
            )}
            <form className="composer" onSubmit={e=>{e.preventDefault();void send()}}>
              <textarea aria-label="Message Convoke" value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Describe what’s on your mind…" maxLength={4000} disabled={busy} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/>
              <div className="composer-bottom">
                <Tabs value={mode} onValueChange={v=>setMode(v as Mode)}>
                  <TabsList className="intent-tabs">
                    <TabsTrigger value="auto" disabled={busy}><Sparkles size={14}/>Auto</TabsTrigger>
                    <TabsTrigger value="explain" disabled={busy}><BookOpen size={14}/>Explain</TabsTrigger>
                    <TabsTrigger value="build" disabled={busy}><Code2 size={14}/>Build</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="composer-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={`controls-toggle-btn ${showControls ? "active" : ""}`}
                    onClick={() => setShowControls(prev => !prev)}
                    title="Settings & Tools"
                    aria-expanded={showControls}
                  >
                    <SlidersHorizontal size={14} />
                    <span className="controls-btn-text">Settings</span>
                    {(privateMode || !smartRouting || !thorough) && <span className="controls-active-dot" />}
                  </Button>
                  {busy ? (
                    <Button type="button" size="icon" aria-label="Stop request" onClick={()=>void cancel()} disabled={!busy}><Square size={15}/></Button>
                  ) : (
                    <Button type="submit" size="icon" aria-label="Send message" disabled={!prompt.trim()||loading||!!loadError||!caps.live}><Send size={17}/></Button>
                  )}
                </div>
              </div>
            </form>
            {showControls && (
              <div className="composer-drawer" role="region" aria-label="Settings and tools">
                <div className="drawer-header">
                  <span className="drawer-title"><SlidersHorizontal size={13}/> Workspace settings & tools</span>
                  <button type="button" className="drawer-close" onClick={()=>setShowControls(false)} aria-label="Close settings">✕</button>
                </div>
                <div className="generation-controls">
                  <div className="thorough-control">
                    <label htmlFor="smart-routing">Smart routing <small>Optimize for task</small></label>
                    <Switch id="smart-routing" checked={smartRouting} onCheckedChange={value=>{setSmartRouting(value);try{localStorage.setItem("convoke-smart-routing",String(value))}catch{}}} disabled={busy} aria-label="Smart routing"/>
                  </div>
                  <div className="thorough-control">
                    <label htmlFor="thorough">Thorough <small>Clarify the first request</small></label>
                    <Switch id="thorough" checked={thorough} onCheckedChange={value=>{setThorough(value);try{localStorage.setItem("convoke-thorough",String(value))}catch{}}} disabled={busy} aria-label="Thorough mode"/>
                  </div>
                  <div className="thorough-control">
                    <label htmlFor="private-mode">Private mode <small>Masks sensitive info locally</small></label>
                    <Switch id="private-mode" checked={privateMode} onCheckedChange={value=>{setPrivateMode(value);try{localStorage.setItem("convoke-private-mode",String(value))}catch{}}} disabled={busy} aria-label="Private mode"/>
                  </div>
                </div>
                {active?.messages.length && !active.clarification ? (
                  <div className="drawer-section">
                    <span className="drawer-section-title">Multi-Model Deliberation</span>
                    <div className="comparison-actions">
                      <Button variant="outline" size="sm" disabled={busy} onClick={()=>void send((active.messages.filter(m=>m.role==="user").at(-1)?.text || active.confirmedTask?.prompt || "").slice(0,4000),mode,undefined,true)}>
                        <Sparkles size={13}/>Compare models
                      </Button>
                      {active.comparison && <Button variant="outline" size="sm" onClick={()=>setComparisonOpen(true)}>View comparison</Button>}
                      <Button variant="outline" size="sm" disabled={busy} onClick={()=>void send((active.messages.filter(m=>m.role==="user").at(-1)?.text || active.confirmedTask?.prompt || "").slice(0,4000),mode,undefined,false,true)}>
                        <Users size={13}/>AI Boardroom
                      </Button>
                      {active.boardroom && <Button variant="outline" size="sm" onClick={()=>setBoardroomOpen(true)}>View boardroom</Button>}
                    </div>
                  </div>
                ) : null}
                <p className="composer-note">{caps.live?"Connected AI · Review AI results before using them.":loading?"Connecting to AI…":"AI temporarily unavailable"}</p>
              </div>
            )}
          </div>
        </section>
        {showCanvas&&<section className="canvas" aria-label="Result canvas"><div className="canvas-heading"><div><span className="canvas-icon"><PanelRight size={18}/></span><span><strong>{version?"Your canvas":"Your canvas starts here"}</strong><small>{version?"An idea you can interact with":"AI-created results appear here"}</small></span></div><Button variant="ghost" size="icon" disabled={!version} onClick={download} aria-label="Export HTML"><Download size={18}/></Button></div>
          {version && (!version.runtime || version.runtime.status!=="passed") && <Button variant="outline" disabled={busy} onClick={()=>void resumeChecks()}>{version.runtime?.status==="failed"?"Retry checks and repair":"Run browser checks"}</Button>}
          <Tabs value={canvasTab} onValueChange={setCanvasTab} className="canvas-tabs"><div className="canvas-tabbar"><TabsList variant="line"><TabsTrigger value="preview"><Eye size={14}/>Preview</TabsTrigger><TabsTrigger value="source" disabled={!version}><Code2 size={14}/>Source</TabsTrigger><TabsTrigger value="history" disabled={!version}><History size={14}/>History{version&&<span className="version-count">{active?.versions.length}</span>}</TabsTrigger></TabsList>{version&&<span className="version-label">v{version.number}</span>}</div>
          <TabsContent value="preview" className="preview-content">{current?<><div className="artifact-paper"><div className="paper-bar"><span className="paper-dots"><i/><i/><i/></span><span>{current.title}</span><span className="html-label">HTML</span></div><ArtifactPreview key={current.id} version={current}/></div><p className="preview-note"><span><Eye size={14}/>{version?(version.runtime?.status==="passed"?"Browser smoke checks passed · review results":version.runtime?.status==="failed"?"Checks failed · source retained":"Browser checks pending"):"Live illustration"}</span>{version?<span>{version.source==="demo"?"Saved artifact":version.source==="manual"?"Edited by you":version.source.startsWith("Restored")?version.source:version.repaired?`Auto-repaired ${version.runtime?.attempts || 1} time(s)`:"AI-generated"}</span>:<span>Move a slider to explore</span>}</p></>:<div className="canvas-empty"><Orbit size={36}/><h2>Room for your next idea</h2><p>Describe what you want to understand or create. Your result will be generated by AI.</p>{!caps.live&&<Button variant="outline" onClick={()=>setSettings(true)}>AI status</Button>}</div>}</TabsContent>
          <TabsContent value="source" className="source-content"><div className="source-tools"><span>{dirty?"Unsaved changes":"Saved source"}</span><div><Button variant="ghost" size="sm" disabled={!dirty||busy} onClick={()=>setSource(version?.html||"")}>Discard</Button><Button size="sm" disabled={!dirty||busy} onClick={()=>void save({ ...(version?.python?{python:source}:{html:source}), artifactTitle: version?.title })}><Check size={14}/>Save version</Button></div></div><textarea spellCheck={false} aria-label="Artifact HTML source" value={source} onChange={e=>setSource(e.target.value)} maxLength={45000}/></TabsContent>
          <TabsContent value="history" className="history-content"><h2>Ideas evolve.</h2><p>Restore an earlier version without losing the current one.</p>{active?.versions.slice().reverse().map((v,i)=><div className="history-item" key={v.id}><span className="history-number">{v.number}</span><div><strong>{v.title}</strong><small>{new Date(v.createdAt).toLocaleString()} · {v.source==="demo"?"Saved artifact":v.source==="manual"?"You":v.source}</small></div><details><summary>View source</summary><pre className="history-source">{v.python||v.html}</pre></details>{i===0?<span className="current-label">Current</span>:<Button size="sm" variant="outline" disabled={busy||dirty} onClick={()=>void save({ restoreId: v.id })}><RotateCcw size={13}/>Restore</Button>}</div>)}</TabsContent></Tabs>
        </section>}
      </div>
    </main>
    <Dialog open={!!active?.clarification && !busy && quizOpen} onOpenChange={setQuizOpen}><DialogContent className="thorough-quiz"><DialogHeader><DialogTitle>A little more direction</DialogTitle><DialogDescription>Choose an answer or write your own. After this set of questions, Convoke will create your result. You can also ask Convoke to decide for you.</DialogDescription></DialogHeader>{active?.clarification&&<form onSubmit={e=>{e.preventDefault();const c=active.clarification!;if(quizStep<c.questions.length-1)setQuizStep(quizStep+1);else { setQuizOpen(false); void send(c.prompt,c.mode,{id:c.id,answers}); }}}><p className="quiz-progress">Question {quizStep+1} of {active.clarification.questions.length}</p><fieldset><legend>{active.clarification.questions[quizStep]}</legend><div className="quiz-options">{active.clarification.options?.[quizStep]?.map(option=><button type="button" key={option} aria-pressed={answers[quizStep]===option} onClick={()=>setAnswers(prev=>{const next=[...prev];next[quizStep]=option;return next})}>{option}</button>)}</div><label className="field-label">Your answer<input autoComplete="off" value={answers[quizStep]||""} onChange={e=>setAnswers(prev=>{const next=[...prev];next[quizStep]=e.target.value;return next})} maxLength={800} required placeholder="Choose above or type your own answer"/></label></fieldset><div className="quiz-actions"><Button type="button" variant="ghost" disabled={quizStep===0 || busy} onClick={()=>setQuizStep(quizStep-1)}>Back</Button><Button type="submit" disabled={busy || !answers[quizStep]?.trim()}>{busy ? "Generating…" : quizStep===active.clarification.questions.length-1?"Create with these details":"Next"}</Button></div></form>}</DialogContent></Dialog>
    <Dialog open={settings} onOpenChange={setSettings}><DialogContent><DialogHeader><DialogTitle>Convoke Workspace Settings</DialogTitle><DialogDescription>A clear view of model tiers, routing, and provider connections.</DialogDescription></DialogHeader><div className="setting-row"><div><strong>{caps.live?"Tri-Model Engine Active":loading?"Connecting…":"AI Status"}</strong><p>{caps.live?`Connected to ${caps.provider || "the multi-model network"}. Autonomous fallback & load balancing active.`:loading?"Checking provider connections…":"AI is temporarily unavailable."}</p></div></div><div className="settings-detail"><strong>Model Tier Architecture</strong><p><span className="account-tier-badge">Free Community Tier (Active)</span><br/>Fast inference redundant mesh powered by Groq (GPT-OSS 120B / Qwen 2.5), Google Gemini Flash, and NVIDIA NIM DeepSeek. High throughput, zero user API key required.</p></div>{publicAccess&&<div className="settings-detail"><strong>Device & Account Sync</strong><p>Your chats can be synced across any computer, phone, or tablet. Click your profile avatar in the bottom left or open Account Sync to log in with Google or your email.</p></div>}<div className="settings-detail"><strong>What happens to your request</strong><p>Convoke 3.0 evaluates prompt requirements and routes each phase to the best provider. Visual prompts undergo collaborative multi-model design deliberation (Gemini physical principles + Groq 60 FPS animation loop + NVIDIA interactive controls) before code synthesis. Generated HTML undergoes syntax validation and sandboxed browser smoke checks.</p></div></DialogContent></Dialog>
    <Dialog open={!!confirmDeleteId} onOpenChange={open=>!open&&setConfirmDeleteId(null)}><DialogContent className="delete-dialog"><DialogHeader><DialogTitle>Delete chat thread?</DialogTitle><DialogDescription>Are you sure you want to delete &ldquo;{projects.find(p=>p.id===confirmDeleteId)?.title || "this chat"}&rdquo;? All messages, versions, and deliberation history in this thread will be permanently deleted.</DialogDescription></DialogHeader><div className="delete-dialog-actions"><Button variant="ghost" onClick={()=>setConfirmDeleteId(null)} disabled={busy}>Cancel</Button><Button variant="destructive" onClick={()=>confirmDeleteId&&void deleteProject(confirmDeleteId)} disabled={busy}><Trash2 size={14}/> Delete thread</Button></div></DialogContent></Dialog>
    <Dialog open={accountOpen} onOpenChange={setAccountOpen}><DialogContent className="account-dialog"><DialogHeader><DialogTitle>Convoke Account & Sync</DialogTitle><DialogDescription>Carry your chats securely across any computer, laptop, phone, or tablet.</DialogDescription></DialogHeader><div className="account-status-card"><div className="account-status-info"><strong>{userAccount?.email ? `Signed in as ${userAccount.displayName || userAccount.email}` : "Guest Workspace"}</strong><p>{userAccount?.email ? `Securely synced with ${userAccount.provider === "google" ? "Google Account" : "Password-protected Email"}. Accessible anywhere.` : "Chats currently belong to this local browser session only."}</p></div>{userAccount?.email ? <Button variant="outline" size="sm" onClick={()=>void handleAccountLogout()}><LogOut size={13}/> Sign out</Button> : <span className="account-tier-badge"><Laptop size={12}/> Local Device</span>}</div>{!userAccount?.email ? <><div style={{display:"grid",gap:"10px",margin:"6px 0"}}><div id="google-signin-btn-container" style={{display:"flex",justifyContent:"center"}}/>{!googleClientId && <button type="button" className="google-signin-btn" onClick={()=>toast.info("Google Sign-In will be active once configured by the administrator. Please sign in or register with email and password below.")}><svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.04h3.88c2.27-2.09 3.66-5.17 3.66-9.14z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.04c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.13C3.26 21.43 7.34 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.28c-.25-.72-.38-1.49-.38-2.28s.13-1.56.38-2.28V6.59H1.24C.45 8.16 0 9.97 0 12s.45 3.84 1.24 5.41l4.04-3.13z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.57 1.24 6.59l4.04 3.13c.95-2.83 3.6-4.97 6.72-4.97z"/></svg>Sign in with Google</button>}</div><div className="account-divider"><span>or sync with email & password</span></div><form className="account-form" onSubmit={e=>{e.preventDefault(); if(accountEmail.trim() && accountPassword.trim()) void handlePasswordAuth(accountEmail, accountPassword, accountName);}}><label>Email Address<input type="email" required placeholder="your.name@gmail.com" value={accountEmail} onChange={e=>setAccountEmail(e.target.value)} disabled={busy}/></label><label>Password (min 8 characters)<input type="password" required minLength={8} placeholder="Enter your password" value={accountPassword} onChange={e=>setAccountPassword(e.target.value)} disabled={busy}/></label><label>Full Name (Optional)<input type="text" placeholder="Your name" value={accountName} onChange={e=>setAccountName(e.target.value)} disabled={busy}/></label><Button type="submit" disabled={!accountEmail.trim() || !accountPassword.trim() || accountPassword.length < 8 || busy}><Lock size={15}/> Sign in / Register with Password</Button></form><p style={{fontSize: "12px", color: "var(--muted-foreground)", marginTop: "10px", lineHeight: "1.5"}}>Protected by PBKDF2 cryptographic hashing. Accounts cannot be accessed without the correct password or verified Google login.</p></> : <div style={{display: "grid", gap: "10px"}}><p style={{fontSize: "13px", color: "var(--foreground)"}}>Your workspace is active and securely synced. Any chats you start on this device will also be available on your other computers and phones.</p><Button variant="outline" onClick={()=>setAccountOpen(false)}>Done</Button></div>}</DialogContent></Dialog>
    <Dialog open={comparisonOpen} onOpenChange={setComparisonOpen}><DialogContent className="compare-dialog"><DialogHeader><DialogTitle>Compare model answers</DialogTitle><DialogDescription>Independent answers from your connected providers. Choose one to continue; failing previews will be checked and repaired on adoption.</DialogDescription></DialogHeader>{active?.comparison&&<ComparisonView comparison={active.comparison} onAdopt={id=>void adoptComparison(id)} disabled={busy}/>}</DialogContent></Dialog>
    <Dialog open={boardroomOpen} onOpenChange={setBoardroomOpen}><DialogContent className="boardroom-dialog"><DialogHeader><DialogTitle>AI Boardroom Deliberation</DialogTitle><DialogDescription>3-stage multi-model deliberation: independent drafting, peer critique, and chairman synthesis.</DialogDescription></DialogHeader>{active?.boardroom&&<BoardroomView session={active.boardroom} currentContent={active.messages.find(m=>m.boardroomId===active.boardroom?.id)?.text || active.messages.filter(m=>m.role==="assistant").at(-1)?.text} onAdoptVerdict={(content, source)=>void adoptBoardroom(content, source)} disabled={busy}/>}</DialogContent></Dialog>
    <Dialog open={briefOpen} onOpenChange={setBriefOpen}><DialogContent><DialogHeader><DialogTitle>Project brief</DialogTitle><DialogDescription>Keep the important details with your work. This brief is included in every AI request.</DialogDescription></DialogHeader>{active?.memory&&<details className="settings-detail"><summary>Shared project memory</summary><p>{active.memory.text}</p><small>Updated {new Date(active.memory.updatedAt).toLocaleString()}. Your brief and latest instructions take precedence.</small></details>}<label className="field-label">Project name<input value={titleDraft} onChange={e=>setTitleDraft(e.target.value)} maxLength={100}/></label><label className="field-label">Goal, audience, and constraints<textarea value={briefDraft} onChange={e=>setBriefDraft(e.target.value)} placeholder="What should this do? Who is it for? What should stay the same?" maxLength={4000}/></label><Button disabled={busy||!titleDraft.trim()} onClick={async()=>{if(await save({title:titleDraft,brief:briefDraft}))setBriefOpen(false)}}><Check size={16}/>Save brief</Button></DialogContent></Dialog>
  </SidebarProvider>;
}
