"use client";

import { useState, useRef, useEffect, useCallback, useTransition } from "react";
import {
  Send,
  Square,
  Sparkles,
  BookOpen,
  Code2,
  SlidersHorizontal,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { detectSensitiveEntities } from "@/lib/privacy-proxy";
import { type Mode, type Project } from "@/lib/project";

interface ComposerProps {
  signedIn: boolean;
  live: boolean;
  loading: boolean;
  loadError: string;
  busy: boolean;
  activeProject: Project | null;
  mode: Mode;
  thorough: boolean;
  smartRouting: boolean;
  privateMode: boolean;
  onSetMode: (mode: Mode) => void;
  onSetThorough: (val: boolean) => void;
  onSetSmartRouting: (val: boolean) => void;
  onSetPrivateMode: (val: boolean) => void;
  onSend: (text: string, chosenMode: Mode, clarification?: { id: string; answers: string[] }, compare?: boolean, boardroom?: boolean) => void;
  onCancel: () => void;
  onOpenClarification: () => void;
  onOpenComparison: () => void;
  onOpenBoardroom: () => void;
}

export function Composer({
  signedIn,
  live,
  loading,
  loadError,
  busy,
  activeProject,
  mode,
  thorough,
  smartRouting,
  privateMode,
  onSetMode,
  onSetThorough,
  onSetSmartRouting,
  onSetPrivateMode,
  onSend,
  onCancel,
  onOpenClarification,
  onOpenComparison,
  onOpenBoardroom,
}: ComposerProps) {
  // Owns its text state so keystrokes don't re-render MessageList or CanvasPanel
  const [text, setText] = useState("");
  const [showDrawer, setShowDrawer] = useState(false);
  const [, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when not busy
  useEffect(() => {
    if (!busy && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [busy]);

  const detectedEntities = privateMode && text ? detectSensitiveEntities(text) : [];

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || busy || loading || !live) return;
    onSend(trimmed, mode);
    setText("");
  }, [text, busy, loading, live, onSend, mode]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasNonDefaultSettings = privateMode || !smartRouting || !thorough;

  return (
    <div className="composer-wrap">
      {activeProject?.clarification && !busy && (
        <Button
          type="button"
          variant="outline"
          className="clarification-quiz-btn"
          onClick={onOpenClarification}
        >
          Answer clarification questions
        </Button>
      )}

      {!signedIn && (
        <a className="signin-link" href="/signin-with-chatgpt?return_to=/" target="_top">
          Sign in to use your workspace
        </a>
      )}

      {privateMode && detectedEntities.length > 0 && (
        <div className="privacy-pill-bar">
          <span className="privacy-pill-text">
            <ShieldAlert size={13} /> {detectedEntities.length} sensitive item(s) masked locally before sending:
          </span>
          <div className="privacy-chips">
            {detectedEntities.map((e) => (
              <span key={e.id} className="privacy-chip" title={e.raw}>
                {e.type.replace("_", " ")}: {e.raw.slice(0, 4)}…{e.raw.slice(-3)}
              </span>
            ))}
          </div>
        </div>
      )}

      {!showDrawer && (activeProject?.comparison || activeProject?.boardroom) && (
        <div className="quick-access-pills">
          {activeProject.comparison && (
            <button type="button" className="quick-pill" onClick={onOpenComparison}>
              <Sparkles size={12} /> View comparison
            </button>
          )}
          {activeProject.boardroom && (
            <button type="button" className="quick-pill" onClick={onOpenBoardroom}>
              <Users size={12} /> View boardroom
            </button>
          )}
        </div>
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <textarea
          ref={textareaRef}
          aria-label="Message Convoke"
          value={text}
          onChange={(e) => {
            const val = e.target.value;
            startTransition(() => {
              setText(val);
            });
          }}
          placeholder="Describe what’s on your mind…"
          maxLength={4000}
          disabled={busy}
          onKeyDown={handleKeyDown}
        />

        <div className="composer-bottom">
          <Tabs value={mode} onValueChange={(v) => onSetMode(v as Mode)}>
            <TabsList className="intent-tabs">
              <TabsTrigger value="auto" disabled={busy}>
                <Sparkles size={14} /> <span className="tab-label">Auto</span>
              </TabsTrigger>
              <TabsTrigger value="explain" disabled={busy}>
                <BookOpen size={14} /> <span className="tab-label">Explain</span>
              </TabsTrigger>
              <TabsTrigger value="build" disabled={busy}>
                <Code2 size={14} /> <span className="tab-label">Build</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="composer-actions">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`controls-toggle-btn ${showDrawer ? "active" : ""}`}
              onClick={() => setShowDrawer((prev) => !prev)}
              title="Settings & Tools"
              aria-expanded={showDrawer}
            >
              <SlidersHorizontal size={14} />
              <span className="controls-btn-text">Settings</span>
              {hasNonDefaultSettings && <span className="controls-active-dot" />}
            </Button>

            {busy ? (
              <Button
                type="button"
                size="icon"
                className="stop-btn"
                style={{ flexShrink: 0 }}
                aria-label="Stop request"
                onClick={onCancel}
              >
                <Square size={15} />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                className="send-btn"
                style={{ flexShrink: 0 }}
                aria-label="Send message"
                disabled={!text.trim() || loading || !!loadError || !live}
              >
                <Send size={17} />
              </Button>
            )}
          </div>
        </div>
      </form>

      {showDrawer && (
        <div className="composer-drawer" role="region" aria-label="Settings and tools">
          <div className="drawer-header">
            <span className="drawer-title">
              <SlidersHorizontal size={13} /> Workspace settings & tools
            </span>
            <button
              type="button"
              className="drawer-close"
              onClick={() => setShowDrawer(false)}
              aria-label="Close settings drawer"
            >
              ✕
            </button>
          </div>

          <div className="generation-controls">
            <div className="thorough-control">
              <label htmlFor="smart-routing">
                Smart routing <small>Optimize model for task</small>
              </label>
              <Switch
                id="smart-routing"
                checked={smartRouting}
                onCheckedChange={onSetSmartRouting}
                disabled={busy}
                aria-label="Smart routing"
              />
            </div>
            <div className="thorough-control">
              <label htmlFor="thorough">
                Thorough <small>Clarify the first request</small>
              </label>
              <Switch
                id="thorough"
                checked={thorough}
                onCheckedChange={onSetThorough}
                disabled={busy}
                aria-label="Thorough mode"
              />
            </div>
            <div className="thorough-control">
              <label htmlFor="private-mode">
                Private mode <small>Masks sensitive info locally</small>
              </label>
              <Switch
                id="private-mode"
                checked={privateMode}
                onCheckedChange={onSetPrivateMode}
                disabled={busy}
                aria-label="Private mode"
              />
            </div>
          </div>

          {activeProject?.messages.length && !activeProject.clarification ? (
            <div className="drawer-section">
              <span className="drawer-section-title">Multi-Model Deliberation</span>
              <div className="comparison-actions">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    const lastUserMsg = activeProject.messages.filter((m) => m.role === "user").at(-1)?.text || activeProject.confirmedTask?.prompt || "";
                    onSend(lastUserMsg.slice(0, 4000), mode, undefined, true);
                  }}
                >
                  <Sparkles size={13} /> Compare models
                </Button>
                {activeProject.comparison && (
                  <Button variant="outline" size="sm" onClick={onOpenComparison}>
                    View comparison
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    const lastUserMsg = activeProject.messages.filter((m) => m.role === "user").at(-1)?.text || activeProject.confirmedTask?.prompt || "";
                    onSend(lastUserMsg.slice(0, 4000), mode, undefined, false, true);
                  }}
                >
                  <Users size={13} /> AI Boardroom
                </Button>
                {activeProject.boardroom && (
                  <Button variant="outline" size="sm" onClick={onOpenBoardroom}>
                    View boardroom
                  </Button>
                )}
              </div>
            </div>
          ) : null}

          <p className="composer-note">
            {live
              ? "Connected AI mesh · Review AI-generated results before using them."
              : loading
              ? "Connecting to AI mesh…"
              : "AI temporarily unavailable"}
          </p>
        </div>
      )}
    </div>
  );
}
