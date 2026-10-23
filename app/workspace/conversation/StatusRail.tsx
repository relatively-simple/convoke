"use client";

import { useMemo, useState, useEffect } from "react";
import { Sparkles, RotateCw, ShieldCheck, Cpu } from "lucide-react";

interface StatusRailProps {
  status: string;
  provider?: string;
  phase?: string;
  progress: number;
}

export function StatusRail({ status, provider, phase, progress }: StatusRailProps) {
  const [displayedLength, setDisplayedLength] = useState(0);

  useEffect(() => {
    if (!status) return;

    let length = 0;
    const timer = setInterval(() => {
      length += 2;
      if (length >= status.length) {
        setDisplayedLength(status.length);
        clearInterval(timer);
      } else {
        setDisplayedLength(length);
      }
    }, 18);

    return () => clearInterval(timer);
  }, [status]);

  const displayedText = status ? status.slice(0, Math.max(1, displayedLength)) : "";

  const badgeInfo = useMemo(() => {
    if (provider && provider !== "Convoke") {
      return { label: provider, icon: Cpu };
    }
    switch (phase) {
      case "repair":
        return { label: "Runtime smoke check", icon: ShieldCheck };
      case "deliberation":
        return { label: "Multi-Model Deliberation", icon: Sparkles };
      case "retry":
        return { label: "Auto-fallback", icon: RotateCw };
      default:
        return { label: "Convoke Tri-Mesh", icon: Sparkles };
    }
  }, [provider, phase]);

  const Icon = badgeInfo.icon;
  const clampedProgress = Math.min(100, Math.max(0, Math.floor(progress)));

  return (
    <div className="typewriter-status-container" role="status" aria-live="polite">
      <div className="typewriter-header">
        <div className="typewriter-meta">
          <div
            className="generation-progress"
            role="progressbar"
            aria-label="Generation progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={clampedProgress}
          >
            <span style={{ width: `${clampedProgress}%` }} />
          </div>
          <span className="typewriter-badge">
            <Icon size={12} style={{ display: "inline-block", marginRight: "4px" }} />
            {badgeInfo.label}
          </span>
        </div>
        <small className="typewriter-percentage">{clampedProgress}%</small>
      </div>
      <div className="typewriter-body">
        <span className="typewriter-text">
          {displayedText || status}
          {clampedProgress < 100 && <span className="typewriter-cursor">▎</span>}
        </span>
      </div>
    </div>
  );
}
