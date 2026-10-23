"use client";

import { useState } from "react";
import {
  PanelRight,
  Download,
  Eye,
  Code2,
  History,
  Check,
  RotateCcw,
  Smartphone,
  Tablet,
  Monitor,
  Maximize2,
  Minimize2,
  Orbit,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArtifactPreview } from "@/components/artifact-preview";
import { type Version, type Project } from "@/lib/project";

type DevicePreset = "responsive" | "tablet" | "mobile";

interface CanvasPanelProps {
  project: Project | null;
  version?: Version;
  source: string;
  dirty: boolean;
  busy: boolean;
  canvasTab: string;
  onSetCanvasTab: (tab: string) => void;
  onSetSource: (src: string) => void;
  onSaveSource: (changes: Record<string, unknown>) => Promise<boolean>;
  onRestoreVersion: (versionId: string) => Promise<void>;
  onResumeChecks: () => Promise<void>;
  onDownload: () => void;
  onOpenSettings: () => void;
  onBackToChat?: () => void;
}

export function CanvasPanel({
  project,
  version,
  source,
  dirty,
  busy,
  canvasTab,
  onSetCanvasTab,
  onSetSource,
  onSaveSource,
  onRestoreVersion,
  onResumeChecks,
  onDownload,
  onOpenSettings,
  onBackToChat,
}: CanvasPanelProps) {
  const [device, setDevice] = useState<DevicePreset>("responsive");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const getFrameWidth = () => {
    switch (device) {
      case "mobile":
        return "375px";
      case "tablet":
        return "768px";
      case "responsive":
      default:
        return "100%";
    }
  };

  return (
    <section
      className={`canvas ${isFullscreen ? "canvas-fullscreen" : ""}`}
      aria-label="Result canvas"
      style={
        isFullscreen
          ? {
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              backgroundColor: "var(--bg)",
            }
          : undefined
      }
    >
      <div className="canvas-heading">
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          {onBackToChat && (
            <button
              type="button"
              className="mobile-back-to-chat"
              onClick={onBackToChat}
              aria-label="Back to chat"
            >
              <ChevronLeft size={16} />
              <span>Chat</span>
            </button>
          )}
          <span className="canvas-icon" aria-hidden="true">
            <PanelRight size={18} />
          </span>
          <div style={{ minWidth: 0, overflow: "hidden" }}>
            <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
              {version ? version.title : "Your canvas"}
            </strong>
            <small style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
              {version
                ? `v${version.number} · ${version.source === "demo" ? "Saved artifact" : version.source === "manual" ? "Edited" : "AI generated"}`
                : "AI-created results appear here"}
            </small>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          {canvasTab === "preview" && (
            <div className="canvas-device-presets" role="group" aria-label="Device preview presets">
              <button
                type="button"
                className={`quick-pill ${device === "responsive" ? "active" : ""}`}
                onClick={() => setDevice("responsive")}
                title="Responsive width"
                style={{
                  background: device === "responsive" ? "var(--bg-elevated)" : "transparent",
                  color: device === "responsive" ? "var(--accent)" : "var(--label-secondary)",
                }}
              >
                <Monitor size={13} />
              </button>
              <button
                type="button"
                className={`quick-pill ${device === "tablet" ? "active" : ""}`}
                onClick={() => setDevice("tablet")}
                title="Tablet width (768px)"
                style={{
                  background: device === "tablet" ? "var(--bg-elevated)" : "transparent",
                  color: device === "tablet" ? "var(--accent)" : "var(--label-secondary)",
                }}
              >
                <Tablet size={13} />
              </button>
              <button
                type="button"
                className={`quick-pill ${device === "mobile" ? "active" : ""}`}
                onClick={() => setDevice("mobile")}
                title="Mobile width (375px)"
                style={{
                  background: device === "mobile" ? "var(--bg-elevated)" : "transparent",
                  color: device === "mobile" ? "var(--accent)" : "var(--label-secondary)",
                }}
              >
                <Smartphone size={13} />
              </button>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            disabled={!version}
            onClick={onDownload}
            aria-label="Export result file"
            title="Export HTML/Python"
          >
            <Download size={17} />
          </Button>
        </div>
      </div>

      {version && (!version.runtime || version.runtime.status !== "passed") && (
        <div style={{ padding: "8px 20px 0" }}>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void onResumeChecks()}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {version.runtime?.status === "failed" ? "Retry smoke checks and repair" : "Run browser smoke checks"}
          </Button>
        </div>
      )}

      <Tabs value={canvasTab} onValueChange={onSetCanvasTab} className="canvas-tabs">
        <div className="canvas-tabbar">
          <TabsList variant="line">
            <TabsTrigger value="preview">
              <Eye size={14} /> Preview
            </TabsTrigger>
            <TabsTrigger value="source" disabled={!version}>
              <Code2 size={14} /> Source
            </TabsTrigger>
            <TabsTrigger value="history" disabled={!version}>
              <History size={14} /> History
              {version && <span className="version-count">{project?.versions.length}</span>}
            </TabsTrigger>
          </TabsList>
          {version && <span className="version-label">v{version.number}</span>}
        </div>

        <TabsContent value="preview" className="preview-content">
          {version ? (
            <>
              <div
                className="artifact-paper"
                style={{
                  maxWidth: getFrameWidth(),
                  margin: "0 auto",
                  transition: "max-width 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)",
                }}
              >
                <div className="paper-bar">
                  <span className="paper-dots">
                    <i /><i /><i />
                  </span>
                  <span>{version.title}</span>
                  <span className="html-label">{version.python ? "Python" : "HTML"}</span>
                </div>
                <ArtifactPreview key={version.id} version={version} />
              </div>

              <p className="preview-note">
                <span>
                  <Eye size={14} />
                  {version.runtime?.status === "passed"
                    ? "Browser smoke checks passed · interactive artifact ready"
                    : version.runtime?.status === "failed"
                    ? "Smoke checks detected issues · source preserved"
                    : "Browser checks pending"}
                </span>
                <span>
                  {version.source === "demo"
                    ? "Saved artifact"
                    : version.source === "manual"
                    ? "Edited by you"
                    : version.source.startsWith("Restored")
                    ? version.source
                    : version.repaired
                    ? `Auto-repaired ${version.runtime?.attempts || 1} time(s)`
                    : "AI generated"}
                </span>
              </p>
            </>
          ) : (
            <div className="canvas-empty">
              <Orbit size={36} />
              <h2>Room for your next idea</h2>
              <p>Describe what you want to understand or build. Your result will render here.</p>
              <Button variant="outline" onClick={onOpenSettings}>
                AI status
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="source" className="source-content">
          <div className="source-tools">
            <span>{dirty ? "Unsaved edits" : "Saved source"}</span>
            <div>
              <Button
                variant="ghost"
                size="sm"
                disabled={!dirty || busy}
                onClick={() => onSetSource(version?.html || "")}
              >
                Discard
              </Button>
              <Button
                size="sm"
                disabled={!dirty || busy}
                onClick={() =>
                  void onSaveSource({
                    ...(version?.python ? { python: source } : { html: source }),
                    artifactTitle: version?.title,
                  })
                }
              >
                <Check size={14} /> Save version
              </Button>
            </div>
          </div>
          <textarea
            spellCheck={false}
            aria-label="Artifact source code"
            value={source}
            onChange={(e) => onSetSource(e.target.value)}
            maxLength={45000}
          />
        </TabsContent>

        <TabsContent value="history" className="history-content">
          <h2>Version history</h2>
          <p>Restore any earlier version without losing the current one.</p>
          {project?.versions
            .slice()
            .reverse()
            .map((v, i) => (
              <div className="history-item" key={v.id}>
                <span className="history-number">{v.number}</span>
                <div>
                  <strong>{v.title}</strong>
                  <small>
                    {new Date(v.createdAt).toLocaleString()} · {v.source === "demo" ? "Saved artifact" : v.source === "manual" ? "You" : v.source}
                  </small>
                </div>
                <details>
                  <summary style={{ cursor: "pointer", fontSize: "0.75rem", color: "var(--label-secondary)" }}>
                    View source
                  </summary>
                  <pre className="history-source">{v.python || v.html}</pre>
                </details>
                {i === 0 ? (
                  <span className="current-label">Current</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || dirty}
                    onClick={() => void onRestoreVersion(v.id)}
                  >
                    <RotateCcw size={13} /> Restore
                  </Button>
                )}
              </div>
            ))}
        </TabsContent>
      </Tabs>
    </section>
  );
}
