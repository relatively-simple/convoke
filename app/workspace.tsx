"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Orbit,
  Plus,
  MessageSquare,
  Sparkles,
  Settings2,
  PanelRight,
  FileText,
  ChevronRight,
  Trash2,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Toaster, toast } from "sonner";
import { ComparisonView } from "@/components/comparison";
import { BoardroomView } from "@/components/boardroom-view";
import { latestAnswerHasCanvas } from "@/lib/presentation";
import { type Mode } from "@/lib/project";

// Workspace hooks & modular components
import { useWorkspaceData } from "./workspace/hooks/use-workspace-data";
import { useGeneration } from "./workspace/hooks/use-generation";
import { usePreferences } from "./workspace/hooks/use-preferences";
import { MessageList } from "./workspace/conversation/MessageList";
import { Composer } from "./workspace/conversation/Composer";
import { WelcomeView } from "./workspace/conversation/WelcomeView";
import { CanvasPanel } from "./workspace/canvas/CanvasPanel";
import { ClarificationDialog } from "./workspace/dialogs/ClarificationDialog";
import { SettingsSheet } from "./workspace/dialogs/SettingsSheet";
import { AccountDialog } from "./workspace/dialogs/AccountDialog";
import { CommandPalette } from "./workspace/dialogs/CommandPalette";
import { DeleteDialog } from "./workspace/dialogs/DeleteDialog";
import { ProjectBriefDialog } from "./workspace/dialogs/ProjectBriefDialog";

export default function Workspace({
  signedIn,
  displayName,
  publicAccess = false,
}: {
  signedIn: boolean;
  displayName: string;
  publicAccess?: boolean;
}) {
  const {
    projects,
    activeId,
    setActiveId,
    caps,
    loading,
    loadError,
    googleClientId,
    userAccount,
    updateProject,
    load,
    deleteProject,
    handleGoogleLogin,
    handlePasswordAuth,
    handleAccountLogout,
  } = useWorkspaceData({ signedIn, displayName, publicAccess });

  const {
    thorough,
    setThorough,
    smartRouting,
    setSmartRouting,
    privateMode,
    setPrivateMode,
  } = usePreferences();

  const [mode, setMode] = useState<Mode>("auto");
  const [mobileCanvas, setMobileCanvas] = useState(false);
  const [canvasOverride, setCanvasOverride] = useState<boolean | null>(null);
  const [canvasTab, setCanvasTab] = useState("preview");
  const [source, setSource] = useState("");

  // Dialog controls
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [boardroomOpen, setBoardroomOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const activeProject = projects.find((p) => p.id === activeId) || null;
  const version = activeProject?.versions.at(-1);

  // Sync mode when project changes
  const [prevProjectId, setPrevProjectId] = useState<string | undefined>(undefined);
  if (activeProject && activeProject.id !== prevProjectId) {
    setPrevProjectId(activeProject.id);
    setMode(activeProject.mode);
  }

  // Sync source when version changes
  const [prevVersionKey, setPrevVersionKey] = useState<string | undefined>(undefined);
  const currentVersionKey = activeId ? `${activeId}:${version?.id ?? "none"}` : undefined;
  if (currentVersionKey !== prevVersionKey) {
    setPrevVersionKey(currentVersionKey);
    setSource(version?.python || version?.html || "");
  }

  // Open clarification quiz when new clarification arrives
  const [prevClarificationId, setPrevClarificationId] = useState<string | undefined>(undefined);
  const currentClarificationId = activeProject?.clarification?.id;
  if (currentClarificationId !== prevClarificationId) {
    setPrevClarificationId(currentClarificationId);
    setQuizOpen(true);
  }

  const showCanvas = !!version && (canvasOverride ?? latestAnswerHasCanvas(activeProject || undefined));
  const dirty = !!version && source !== (version.python || version.html);

  const {
    busy,
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
  } = useGeneration({
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
  });

  const chooseProject = useCallback(
    (id: string | null) => {
      if (busy) return;
      if (dirty) {
        toast.error("Save or discard your source edits first.");
        return;
      }
      setCanvasOverride(null);
      setActiveId(id);
      setCanvasTab("preview");
      setMobileCanvas(false);
      setMode(projects.find((p) => p.id === id)?.mode || "auto");
    },
    [busy, dirty, projects, setActiveId]
  );

  const handleDownload = useCallback(() => {
    if (!version || !activeProject) return;
    const a = document.createElement("a");
    a.href = `/api/export?project=${activeProject.id}&version=${version.id}`;
    a.download = `${version.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.${version.python ? "py" : "html"}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("Export requested. Check your browser’s downloads.");
  }, [version, activeProject]);

  // Unload guard
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty || busy) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, busy]);

  // ModelContext tool registration
  useEffect(() => {
    const context = (document as Document & {
      modelContext?: {
        registerTool: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void>;
      };
    }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: "read_convoke_project",
          description: "Read the selected Convoke project's brief and saved artifact metadata.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute(input: unknown) {
            if (!input || typeof input !== "object" || Object.keys(input).length) {
              throw new Error("Expected an empty object");
            }
            return activeProject
              ? {
                  id: activeProject.id,
                  title: activeProject.title,
                  brief: activeProject.brief,
                  revision: activeProject.revision,
                  versions: activeProject.versions.map((v) => ({
                    number: v.number,
                    title: v.title,
                    source: v.source,
                  })),
                }
              : { project: null };
          },
        },
        { signal: lifecycle.signal }
      )
    ).catch(() => {});
    return () => lifecycle.abort();
  }, [activeProject]);

  const hasMessages = !!activeProject?.messages.length || !!pendingText;

  return (
    <SidebarProvider style={{ "--sidebar-width": "228px" } as React.CSSProperties}>
      <Toaster theme="system" richColors position="bottom-center" />

      {/* Workspace Sidebar */}
      <Sidebar className="workspace-sidebar">
        <SidebarHeader>
          <a className="brand" href="/" aria-label="Convoke home">
            <span className="brand-icon">
              <Orbit size={20} />
            </span>
            convoke
          </a>
          <Button
            className="new-project"
            onClick={() => chooseProject(null)}
            disabled={busy}
          >
            <Plus size={16} /> New project
          </Button>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>
              Your projects <span>{projects.length}</span>
            </SidebarGroupLabel>
            <SidebarMenu>
              {projects.map((p) => (
                <SidebarMenuItem key={p.id} className="project-menu-item">
                  <SidebarMenuButton
                    isActive={p.id === activeId}
                    onClick={() => chooseProject(p.id)}
                    disabled={busy}
                    title={p.title}
                  >
                    <MessageSquare size={16} />
                    <span className="project-title-label">{p.title}</span>
                  </SidebarMenuButton>
                  <button
                    type="button"
                    className="project-delete-trigger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(p.id);
                    }}
                    disabled={busy}
                    title="Delete chat thread"
                    aria-label={`Delete ${p.title}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
            {!projects.length && (
              <p className="sidebar-empty">
                Your ideas will find<br />a home here.
              </p>
            )}
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="workspace-note">
            <span className="tiny-orbit">
              <Orbit size={16} />
            </span>
            <strong>A place for your ideas</strong>
            <p>
              Pick up where you left off.<br />
              Every saved version stays with you.<br />
              <span style={{ fontSize: "10px", color: "var(--label-tertiary)", opacity: 0.7 }}>v3.0</span>
            </p>
          </div>

          <button
            type="button"
            className="settings-button"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={16} />
            <span>Workspace settings</span>
          </button>

          <div
            className="profile"
            onClick={() => setAccountOpen(true)}
            style={{ cursor: "pointer" }}
            title="Account & Device Sync"
          >
            <span className="avatar">
              {(userAccount?.displayName || displayName)[0].toUpperCase()}
            </span>
            <div>
              <strong>{userAccount?.displayName || displayName}</strong>
              <small>
                {userAccount?.email
                  ? userAccount.email.length > 18
                    ? userAccount.email.slice(0, 16) + "…"
                    : userAccount.email
                  : "Guest · Sync on any device"}
              </small>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Main Content Area */}
      <main className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger />
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{activeProject?.title || "A new beginning"}</strong>
          </div>

          <button
            type="button"
            className="mode-badge"
            onClick={() => setSettingsOpen(true)}
          >
            {caps.live ? <Sparkles size={13} /> : <Settings2 size={13} />}
            {caps.live ? "AI mesh ready" : loading ? "Connecting…" : "AI status"}
          </button>

          <button
            type="button"
            disabled={!version}
            className="mobile-canvas-button"
            onClick={() => {
              setCanvasOverride(!showCanvas);
              setMobileCanvas(!showCanvas);
            }}
            aria-label="Switch between chat and canvas"
          >
            <PanelRight size={18} />
          </button>
        </header>

        <div className={`work-area ${mobileCanvas && showCanvas ? "show-canvas" : ""} ${!showCanvas ? "canvas-closed" : ""}`}>
          {/* Conversation Column */}
          <section className="conversation" aria-label="Conversation">
            <div className="conversation-toolbar">
              <span>
                <MessageSquare size={14} /> Conversation
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {activeProject && (
                  <button
                    type="button"
                    onClick={() => setBriefOpen(true)}
                    disabled={busy}
                  >
                    <FileText size={14} /> Project brief
                  </button>
                )}
                {activeProject && (
                  <button
                    type="button"
                    className="delete-thread-btn"
                    onClick={() => setConfirmDeleteId(activeProject.id)}
                    disabled={busy}
                    title="Delete this chat thread"
                  >
                    <Trash2 size={13} />
                    <span>Delete chat</span>
                  </button>
                )}
              </div>
            </div>

            {hasMessages ? (
              <MessageList
                project={activeProject}
                pendingText={pendingText}
                status={status}
                statusProvider={statusProvider}
                statusPhase={statusPhase}
                progress={progress}
                busy={busy}
                onSend={(t, m) => void send(t, m)}
                onVerify={(mId) => void verifyMessage(mId, mode)}
                onRequestSecondOpinion={(mId) => void requestSecondOpinion(mId, mode)}
                onApplyCorrection={(mId, c) => void applyCorrection(mId, c)}
                onApplySecondOpinion={(mId, rev) => void applySecondOpinion(mId, rev)}
                onOpenBoardroom={() => setBoardroomOpen(true)}
              />
            ) : (
              <div className="conversation-scroll">
                <WelcomeView
                  live={caps.live}
                  loading={loading}
                  onSelectStarter={(p, m) => void send(p, m)}
                />
              </div>
            )}

            {loadError && (
              <div className="load-error" role="alert">
                {loadError}
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  Try again
                </Button>
              </div>
            )}

            <Composer
              signedIn={signedIn}
              live={caps.live}
              loading={loading}
              loadError={loadError}
              busy={busy}
              activeProject={activeProject}
              mode={mode}
              thorough={thorough}
              smartRouting={smartRouting}
              privateMode={privateMode}
              onSetMode={setMode}
              onSetThorough={setThorough}
              onSetSmartRouting={setSmartRouting}
              onSetPrivateMode={setPrivateMode}
              onSend={(t, m, clar, comp, brd) => void send(t, m, clar, comp, brd)}
              onCancel={() => void cancel()}
              onOpenClarification={() => setQuizOpen(true)}
              onOpenComparison={() => setComparisonOpen(true)}
              onOpenBoardroom={() => setBoardroomOpen(true)}
            />
          </section>

          {/* Canvas Column */}
          {showCanvas && (
            <CanvasPanel
              project={activeProject}
              version={version}
              source={source}
              dirty={dirty}
              busy={busy}
              canvasTab={canvasTab}
              onSetCanvasTab={setCanvasTab}
              onSetSource={setSource}
              onSaveSource={save}
              onRestoreVersion={(vId) => save({ restoreId: vId }).then(() => {})}
              onResumeChecks={resumeChecks}
              onDownload={handleDownload}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          )}
        </div>
      </main>

      {/* Accessible Modals & Sheets */}
      <ClarificationDialog
        open={!!activeProject?.clarification && !busy && quizOpen}
        onOpenChange={setQuizOpen}
        clarification={activeProject?.clarification}
        busy={busy}
        onSubmit={(answers) => {
          if (activeProject?.clarification) {
            void send(
              activeProject.clarification.prompt,
              activeProject.clarification.mode,
              { id: activeProject.clarification.id, answers }
            );
          }
        }}
      />

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        caps={caps}
        loading={loading}
        publicAccess={publicAccess}
        onOpenAccount={() => setAccountOpen(true)}
      />

      <AccountDialog
        open={accountOpen}
        onOpenChange={setAccountOpen}
        user={userAccount}
        googleClientId={googleClientId}
        busy={busy}
        onGoogleLogin={handleGoogleLogin}
        onPasswordAuth={handlePasswordAuth}
        onLogout={handleAccountLogout}
      />

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        projects={projects}
        activeId={activeId}
        onSelectProject={chooseProject}
        onNewProject={() => chooseProject(null)}
        onToggleCanvas={() => setCanvasOverride(!showCanvas)}
        onSetMode={setMode}
        onDownload={handleDownload}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAccount={() => setAccountOpen(true)}
      />

      <DeleteDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
        title={projects.find((p) => p.id === confirmDeleteId)?.title}
        busy={busy}
        onConfirm={() => {
          if (confirmDeleteId) void deleteProject(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />

      <ProjectBriefDialog
        open={briefOpen}
        onOpenChange={setBriefOpen}
        project={activeProject}
        busy={busy}
        onSave={(changes) => save(changes)}
      />

      {/* Comparison Modal */}
      <Dialog open={comparisonOpen} onOpenChange={setComparisonOpen}>
        <DialogContent className="compare-dialog">
          <DialogHeader>
            <DialogTitle>Compare model answers</DialogTitle>
            <DialogDescription>
              Independent answers from your connected providers. Choose one to continue; failing previews will be checked and repaired on adoption.
            </DialogDescription>
          </DialogHeader>
          {activeProject?.comparison && (
            <ComparisonView
              comparison={activeProject.comparison}
              onAdopt={(id) => void adoptComparison(id)}
              disabled={busy}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* AI Boardroom Modal */}
      <Dialog open={boardroomOpen} onOpenChange={setBoardroomOpen}>
        <DialogContent className="boardroom-dialog">
          <DialogHeader>
            <DialogTitle>AI Boardroom Deliberation</DialogTitle>
            <DialogDescription>
              3-stage multi-model deliberation: independent drafting, peer critique, and chairman synthesis.
            </DialogDescription>
          </DialogHeader>
          {activeProject?.boardroom && (
            <BoardroomView
              session={activeProject.boardroom}
              currentContent={
                activeProject.messages.find((m) => m.boardroomId === activeProject.boardroom?.id)?.text ||
                activeProject.messages.filter((m) => m.role === "assistant").at(-1)?.text
              }
              onAdoptVerdict={(content, src) => void adoptBoardroom(content, src)}
              disabled={busy}
            />
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
