"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { readGeneration } from "@/lib/generation-stream";
import { testArtifact, recordRuntime } from "@/lib/runtime-client";
import { maskText, unmaskText } from "@/lib/privacy-proxy";
import { latestAnswerHasCanvas } from "@/lib/presentation";
import { type Project, type Mode, type Capabilities } from "@/lib/project";
import { api } from "./use-workspace-data";

interface UseGenerationProps {
  activeProject: Project | null;
  signedIn: boolean;
  caps: Capabilities;
  thorough: boolean;
  smartRouting: boolean;
  privateMode: boolean;
  updateProject: (project: Project) => void;
  setActiveId: (id: string) => void;
  load: () => Promise<void>;
  setCanvasTab: (tab: string) => void;
  setCanvasOverride: (override: boolean | null) => void;
  setMobileCanvas: (val: boolean) => void;
  setComparisonOpen: (open: boolean) => void;
  setBoardroomOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
}

export function useGeneration({
  activeProject,
  signedIn,
  caps,
  thorough,
  smartRouting,
  privateMode,
  updateProject,
  setActiveId,
  load,
  setCanvasTab,
  setCanvasOverride,
  setMobileCanvas,
  setComparisonOpen,
  setBoardroomOpen,
  setSettingsOpen,
}: UseGenerationProps) {
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [statusProvider, setStatusProvider] = useState("Convoke");
  const [statusPhase, setStatusPhase] = useState("attempt");
  const [pendingText, setPendingText] = useState("");
  const [replacementsMap, setReplacementsMap] = useState<Record<string, string>>({});

  const runRef = useRef<{ projectId: string; runId: string; controller: AbortController } | null>(null);

  // Gentle micro-creep while waiting on a step, without jumping ahead to 88%
  useEffect(() => {
    if (!generating) return;
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 98) return prev;
        return Number((prev + 0.2).toFixed(1));
      });
    }, 800);
    return () => window.clearInterval(timer);
  }, [generating]);

  const checkAndRepair = useCallback(
    async (project: Project, signal: AbortSignal): Promise<Project> => {
      while (project.versions.at(-1)?.runtime?.status === "pending") {
        const draft = project.versions.at(-1)!;
        setProgress(86);
        setStatus(draft.python ? "Running Python smoke checks on code output…" : "Testing output code in browser sandbox…");
        let report;
        try {
          report = await testArtifact(draft, signal);
        } catch (e) {
          if (signal.aborted) throw e;
          report = { issues: [(e as Error).message] };
        }
        project = await recordRuntime(project, report, signal);
        if (!report.issues.length) break;
        if ((draft.runtime?.attempts || 0) >= 3) {
          toast.error("The draft still has issues after three repairs. Your previous versions and source are saved.");
          break;
        }
        setProgress(92);
        setStatus(`Refining code output (${(draft.runtime?.attempts || 0) + 1}/3)…`);
        const runId = crypto.randomUUID();
        if (runRef.current) runRef.current.runId = runId;
        const response = await fetch("/api/generate", {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
          body: JSON.stringify({
            projectId: project.id,
            revision: project.revision,
            runId,
            prompt: "Repair the browser-tested draft",
            mode: "build",
            thorough: false,
            smartRouting,
            runtimeVersionId: project.versions.at(-1)!.id,
          }),
        });
        project = await readGeneration(response, () => {});
      }
      return project;
    },
    [smartRouting]
  );

  const send = useCallback(
    async (
      text: string,
      chosenMode: Mode,
      clarification?: { id: string; answers: string[] },
      compare = false,
      boardroom = false
    ) => {
      if (!text.trim() || busy) return;
      if (!signedIn) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/signin-with-chatgpt?return_to=/");
        return;
      }
      if (!caps.live) {
        setSettingsOpen(true);
        return;
      }

      setGenerating(true);
      setProgress(10);
      setBusy(true);
      setPendingText(text);
      setStatus("Analyzing request and selecting AI model…");

      let project = activeProject;
      let textToSend = text;
      let localReplacements: Record<string, string> = {};

      if (privateMode) {
        const masked = maskText(text);
        textToSend = masked.maskedText;
        localReplacements = masked.replacements;
        if (Object.keys(localReplacements).length > 0) {
          setReplacementsMap((prev) => ({ ...prev, ...localReplacements }));
        }
      }

      try {
        if (!project) {
          const data = await api({ action: "create", title: text.slice(0, 60), mode: chosenMode });
          project = data.project;
          updateProject(project!);
          setActiveId(project!.id);
        }

        const runId = crypto.randomUUID();
        const controller = new AbortController();
        runRef.current = { projectId: project!.id, runId, controller };
        setStatus("Preparing your response…");

        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
          signal: controller.signal,
          body: JSON.stringify({
            projectId: project!.id,
            revision: project!.revision,
            runId,
            prompt: textToSend,
            mode: chosenMode,
            thorough,
            smartRouting,
            compare,
            boardroom,
            clarificationId: clarification?.id,
            answers: clarification?.answers,
          }),
        });

        let completed = await readGeneration(response, (event) => {
          if (event.message) setStatus(event.message);
          else
            setStatus(
              event.task === "clarify"
                ? "Analyzing prompt for missing details…"
                : event.task === "repair"
                ? "Refining code output…"
                : "Working on your answer…"
            );
          if (event.provider) setStatusProvider(event.provider);
          if (event.phase) setStatusPhase(event.phase);
          if (typeof event.progressPercent === "number") {
            setProgress(event.progressPercent);
          }
        });

        if (privateMode || Object.keys(localReplacements).length > 0 || Object.keys(replacementsMap).length > 0) {
          const fullReplacements = { ...replacementsMap, ...localReplacements };
          completed.messages = completed.messages.map((m) => ({
            ...m,
            text: unmaskText(m.text, fullReplacements),
          }));
          if (completed.versions.length > 0) {
            const lastV = completed.versions[completed.versions.length - 1];
            lastV.html = unmaskText(lastV.html, fullReplacements);
            if (lastV.python) lastV.python = unmaskText(lastV.python, fullReplacements);
          }
        }

        if (!compare && !boardroom) {
          completed = await checkAndRepair(completed, controller.signal);
        }
        if (compare) setComparisonOpen(true);
        if (boardroom) setBoardroomOpen(true);

        if (completed.versions.length > 0) {
          setProgress(97);
          setStatus(completed.versions.at(-1)?.python ? "Rendering output Python code UI…" : "Rendering output UI in interactive canvas…");
          await new Promise((resolve) => setTimeout(resolve, 250));
        }

        setGenerating(false);
        setProgress(100);
        setStatus("Ready");
        updateProject(completed);
        setCanvasTab("preview");
        setCanvasOverride(null);
        setMobileCanvas(latestAnswerHasCanvas(completed) && !completed.clarification);
        await new Promise((resolve) => setTimeout(resolve, 350));
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          toast.error((e as Error).message);
          await load();
        }
      } finally {
        setBusy(false);
        setPendingText("");
        setStatus("");
        setGenerating(false);
        runRef.current = null;
      }
    },
    [
      activeProject,
      busy,
      signedIn,
      caps.live,
      privateMode,
      replacementsMap,
      thorough,
      smartRouting,
      updateProject,
      setActiveId,
      checkAndRepair,
      setComparisonOpen,
      setBoardroomOpen,
      setCanvasTab,
      setCanvasOverride,
      setMobileCanvas,
      load,
      setSettingsOpen,
    ]
  );

  const cancel = useCallback(async () => {
    const run = runRef.current;
    if (!run) return;
    run.controller.abort();
    try {
      await api({ action: "cancel", projectId: run.projectId, runId: run.runId });
      const data = await api();
      const latest = data.projects.find((p) => p.id === run.projectId);
      if (latest) updateProject(latest);
      toast("Request stopped. Previous versions are safe.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [updateProject]);

  const save = useCallback(
    async (changes: Record<string, unknown>) => {
      if (!activeProject || busy) return false;
      setBusy(true);
      try {
        const data = await api({
          action: "save",
          projectId: activeProject.id,
          revision: activeProject.revision,
          ...changes,
        });
        updateProject(data.project);
        setCanvasOverride(true);
        toast.success("Saved to your project");
        return true;
      } catch (e) {
        toast.error((e as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [activeProject, busy, updateProject, setCanvasOverride]
  );

  const adoptComparison = useCallback(
    async (resultId: string) => {
      if (!activeProject?.comparison || busy) return;
      setBusy(true);
      setGenerating(true);
      setProgress(4);
      setComparisonOpen(false);
      const controller = new AbortController();
      runRef.current = { projectId: activeProject.id, runId: crypto.randomUUID(), controller };
      try {
        const data = await api({
          action: "adopt",
          projectId: activeProject.id,
          revision: activeProject.revision,
          comparisonId: activeProject.comparison.id,
          resultId,
        });
        const completed = await checkAndRepair(data.project, controller.signal);
        updateProject(completed);
        setCanvasOverride(null);
        setMobileCanvas(latestAnswerHasCanvas(completed));
      } catch (e) {
        if (!controller.signal.aborted) toast.error((e as Error).message);
        await load();
      } finally {
        setBusy(false);
        setGenerating(false);
        setStatus("");
        runRef.current = null;
      }
    },
    [activeProject, busy, checkAndRepair, updateProject, setCanvasOverride, setMobileCanvas, load, setComparisonOpen]
  );

  const verifyMessage = useCallback(
    async (messageId: string, currentMode: Mode) => {
      if (!activeProject || busy) return;
      setBusy(true);
      setGenerating(true);
      setProgress(10);
      setStatus("Verifying factual claims…");
      const runId = crypto.randomUUID();
      const controller = new AbortController();
      runRef.current = { projectId: activeProject.id, runId, controller };
      try {
        const targetIndex = activeProject.messages.findIndex((m) => m.id === messageId);
        const precedingUserMsg = activeProject.messages
          .slice(0, targetIndex >= 0 ? targetIndex : undefined)
          .reverse()
          .find((m) => m.role === "user");
        const promptToSend = (precedingUserMsg?.text || "Verify factual claims").slice(0, 4000);
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
          signal: controller.signal,
          body: JSON.stringify({
            projectId: activeProject.id,
            revision: activeProject.revision,
            runId,
            prompt: promptToSend,
            mode: currentMode,
            smartRouting,
            factCheck: { messageId },
          }),
        });
        const completed = await readGeneration(response, (event) => {
          if (event.message) setStatus(event.message);
          if (event.provider) setStatusProvider(event.provider);
          if (event.phase) setStatusPhase(event.phase);
        });
        updateProject(completed);
        toast.success("Fact check completed");
      } catch (e) {
        if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
      } finally {
        setBusy(false);
        setStatus("");
        setGenerating(false);
        runRef.current = null;
      }
    },
    [activeProject, busy, smartRouting, updateProject]
  );

  const applyCorrection = useCallback(
    async (messageId: string, correction: string) => {
      if (!activeProject || busy) return;
      setBusy(true);
      try {
        const data = await api({
          action: "apply-correction",
          projectId: activeProject.id,
          revision: activeProject.revision,
          messageId,
          correction,
        });
        updateProject(data.project);
        toast.success("Correction applied to answer");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [activeProject, busy, updateProject]
  );

  const requestSecondOpinion = useCallback(
    async (messageId: string, currentMode: Mode) => {
      if (!activeProject || busy) return;
      setBusy(true);
      setGenerating(true);
      setProgress(10);
      setStatus("Requesting independent second opinion…");
      const runId = crypto.randomUUID();
      const controller = new AbortController();
      runRef.current = { projectId: activeProject.id, runId, controller };
      try {
        const targetIndex = activeProject.messages.findIndex((m) => m.id === messageId);
        const precedingUserMsg = activeProject.messages
          .slice(0, targetIndex >= 0 ? targetIndex : undefined)
          .reverse()
          .find((m) => m.role === "user");
        const promptToSend = (precedingUserMsg?.text || "Second opinion").slice(0, 4000);
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
          signal: controller.signal,
          body: JSON.stringify({
            projectId: activeProject.id,
            revision: activeProject.revision,
            runId,
            prompt: promptToSend,
            mode: currentMode,
            smartRouting,
            secondOpinion: { messageId },
          }),
        });
        const completed = await readGeneration(response, (event) => {
          if (event.message) setStatus(event.message);
          if (event.provider) setStatusProvider(event.provider);
          if (event.phase) setStatusPhase(event.phase);
        });
        updateProject(completed);
        toast.success("Second opinion received");
      } catch (e) {
        if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
      } finally {
        setBusy(false);
        setStatus("");
        setGenerating(false);
        runRef.current = null;
      }
    },
    [activeProject, busy, smartRouting, updateProject]
  );

  const applySecondOpinion = useCallback(
    async (messageId: string, revisionText: string) => {
      if (!activeProject || busy) return;
      setBusy(true);
      try {
        const data = await api({
          action: "apply-second-opinion",
          projectId: activeProject.id,
          revision: activeProject.revision,
          messageId,
          revisionText,
        });
        updateProject(data.project);
        toast.success("Suggested revision applied");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [activeProject, busy, updateProject]
  );

  const adoptBoardroom = useCallback(
    async (content: string, source: string) => {
      if (!activeProject || busy) return;
      setBusy(true);
      setBoardroomOpen(false);
      try {
        const data = await api({
          action: "adopt-boardroom",
          projectId: activeProject.id,
          revision: activeProject.revision,
          boardroomId: activeProject.boardroom?.id,
          content,
          source,
        });
        updateProject(data.project);
        toast.success(`Adopted verdict from ${source}`);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [activeProject, busy, updateProject, setBoardroomOpen]
  );

  const resumeChecks = useCallback(async () => {
    if (!activeProject || busy) return;
    const controller = new AbortController();
    setBusy(true);
    setGenerating(true);
    setProgress(4);
    runRef.current = { projectId: activeProject.id, runId: crypto.randomUUID(), controller };
    try {
      let project = activeProject;
      const latestVer = project.versions.at(-1);
      if (!latestVer?.runtime || latestVer.runtime.status === "failed") {
        const data = await api({
          action: "save",
          projectId: project.id,
          revision: project.revision,
          restoreId: latestVer?.id,
        });
        project = data.project;
      }
      project = await checkAndRepair(project, controller.signal);
      updateProject(project);
      setCanvasOverride(true);
    } catch (e) {
      if (!controller.signal.aborted) toast.error((e as Error).message);
      await load();
    } finally {
      setBusy(false);
      setGenerating(false);
      setStatus("");
      runRef.current = null;
    }
  }, [activeProject, busy, checkAndRepair, updateProject, setCanvasOverride, load]);

  return {
    busy,
    generating,
    progress,
    status,
    statusProvider,
    statusPhase,
    pendingText,
    send,
    cancel,
    save,
    adoptComparison,
    adoptBoardroom,
    verifyMessage,
    applyCorrection,
    requestSecondOpinion,
    applySecondOpinion,
    resumeChecks,
  };
}
