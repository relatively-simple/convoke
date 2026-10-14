"use client";

import { useState } from "react";
import type { SecondOpinionReport } from "@/lib/second-opinion";
import { CheckCircle2, AlertTriangle, ShieldCheck, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Answer } from "./answer";

export function SecondOpinionView({
  report,
  onApply,
  busy = false,
}: {
  report: SecondOpinionReport;
  onApply?: (revision: string) => void;
  busy?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showRevision, setShowRevision] = useState(false);

  const verdictBadge = () => {
    switch (report.verdict) {
      case "agrees":
        return <span className="opinion-badge opinion-badge-agrees"><CheckCircle2 size={13} /> Agrees with answer</span>;
      case "critiques":
        return <span className="opinion-badge opinion-badge-critiques"><AlertTriangle size={13} /> Identifies flaws</span>;
      case "refines":
        return <span className="opinion-badge opinion-badge-refines"><Sparkles size={13} /> Suggests refinement</span>;
    }
  };

  return (
    <div className="opinion-card">
      <div className="opinion-header" onClick={() => setExpanded(!expanded)} role="button" tabIndex={0}>
        <div className="opinion-title-row">
          <ShieldCheck size={16} className="opinion-icon" />
          <div className="opinion-meta">
            <strong>Second Opinion · {report.reviewerModel}</strong>
            <small>Independent cross-provider evaluation</small>
          </div>
        </div>
        <div className="opinion-status-row">
          {verdictBadge()}
          <button
            type="button"
            className="opinion-toggle"
            aria-label={expanded ? "Collapse opinion" : "Expand opinion"}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="opinion-body">
          <div className="opinion-summary"><Answer text={report.summary} /></div>

          {report.strengths && report.strengths.length > 0 && (
            <div className="opinion-section">
              <span className="opinion-section-label">Strengths & Confirmed Points:</span>
              <ul className="opinion-list opinion-strengths">
                {report.strengths.map((s, idx) => (
                  <li key={idx}><CheckCircle2 size={13} /> {s}</li>
                ))}
              </ul>
            </div>
          )}

          {report.issues && report.issues.length > 0 && (
            <div className="opinion-section">
              <span className="opinion-section-label">Critiques & Issues:</span>
              <ul className="opinion-list opinion-issues">
                {report.issues.map((issue, idx) => (
                  <li key={idx}><AlertTriangle size={13} /> {issue}</li>
                ))}
              </ul>
            </div>
          )}

          {report.suggestedRevision && (
            <div className="opinion-revision-box">
              <div className="opinion-revision-header">
                <strong>Suggested Revision</strong>
                <button
                  type="button"
                  className="opinion-preview-toggle"
                  onClick={() => setShowRevision(!showRevision)}
                >
                  {showRevision ? "Hide preview" : "View preview"}
                </button>
              </div>

              {showRevision && (
                <div className="opinion-revision-content">
                  <Answer text={report.suggestedRevision} />
                </div>
              )}

              {onApply && (
                <button
                  type="button"
                  className="opinion-apply-btn"
                  disabled={busy}
                  onClick={() => onApply(report.suggestedRevision!)}
                >
                  Apply suggested revision
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
