"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { type Project } from "@/lib/project";

interface ProjectBriefDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  busy: boolean;
  onSave: (changes: { title: string; brief: string }) => Promise<boolean>;
}

export function ProjectBriefDialog({
  open,
  onOpenChange,
  project,
  busy,
  onSave,
}: ProjectBriefDialogProps) {
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [prevId, setPrevId] = useState<string | undefined>(undefined);

  if (project && project.id !== prevId) {
    setPrevId(project.id);
    setTitle(project.title || "");
    setBrief(project.brief || "");
  }

  const handleSave = async () => {
    if (!title.trim()) return;
    const ok = await onSave({ title: title.trim(), brief: brief.trim() });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Project brief</DialogTitle>
          <DialogDescription>
            Keep the important context with your work. This brief is provided as context in AI requests.
          </DialogDescription>
        </DialogHeader>

        {project?.memory && (
          <details className="settings-detail">
            <summary style={{ cursor: "pointer", fontSize: "0.8125rem", fontWeight: 500 }}>
              Shared project memory
            </summary>
            <p style={{ margin: "6px 0", fontSize: "0.8125rem" }}>{project.memory.text}</p>
            <small style={{ color: "var(--label-tertiary)" }}>
              Updated {new Date(project.memory.updatedAt).toLocaleString()}. Your brief and latest instructions take precedence.
            </small>
          </details>
        )}

        <label className="field-label">
          Project name
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            disabled={busy}
          />
        </label>

        <label className="field-label">
          Goal, audience, and constraints
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="What should this project accomplish? Who is the target user? What constraints must be respected?"
            maxLength={4000}
            disabled={busy}
          />
        </label>

        <Button
          disabled={busy || !title.trim()}
          onClick={handleSave}
          style={{ width: "100%", justifyContent: "center" }}
        >
          <Check size={16} /> Save brief
        </Button>
      </DialogContent>
    </Dialog>
  );
}
