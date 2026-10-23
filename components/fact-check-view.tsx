"use client";
import { useState } from "react";
import { AlertCircle, CheckCircle2, XCircle, ChevronDown, ChevronUp, ExternalLink, Check } from "lucide-react";
import type { FactCheckReport } from "../lib/fact-check";
import { Button } from "./ui/button";
import { Answer } from "./answer";

export function FactCheckView({
  report,
  onApplyCorrection,
  disabled = false,
}: {
  report: FactCheckReport;
  onApplyCorrection?: (correction: string) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isVerified = report.verdict === "verified";
  const isDisputed = report.verdict === "disputed";
  const isMixed = report.verdict === "mixed";

  const badgeClass = isVerified
    ? "fact-badge-verified"
    : isDisputed
    ? "fact-badge-disputed"
    : isMixed
    ? "fact-badge-mixed"
    : "fact-badge-unverified";

  const badgeIcon = isVerified ? (
    <CheckCircle2 size={14} />
  ) : isDisputed ? (
    <XCircle size={14} />
  ) : (
    <AlertCircle size={14} />
  );

  const verdictLabel = isVerified
    ? "All core claims verified"
    : isDisputed
    ? "Disputed claims detected"
    : isMixed
    ? "Mixed / partial verification"
    : "Unverified claims";

  return (
    <div className={`fact-check-card ${badgeClass}`}>
      <button type="button" className="fact-check-header" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        <div className="fact-check-title">
          <span className="fact-check-icon">{badgeIcon}</span>
          <strong>{verdictLabel}</strong>
          <small>{report.claims.length} claim{report.claims.length === 1 ? "" : "s"} checked</small>
        </div>
        <span className="fact-check-toggle" aria-hidden="true">
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      <div className="fact-check-summary"><Answer text={report.summary} /></div>

      {expanded && (
        <div className="fact-claims-list">
          {report.claims.map((claim, idx) => (
            <div key={idx} className={`fact-claim-item claim-${claim.status}`}>
              <div className="claim-status-indicator">
                {claim.status === "supported" ? (
                  <CheckCircle2 size={13} className="text-green" />
                ) : claim.status === "contradicted" ? (
                  <XCircle size={13} className="text-red" />
                ) : (
                  <AlertCircle size={13} className="text-amber" />
                )}
                <span className="claim-status-tag">{claim.status}</span>
              </div>
              <div className="claim-body">
                <strong>{claim.claim}</strong>
                <Answer text={claim.explanation} />
                {claim.correction && (
                  <div className="claim-correction">
                    <em>Correction:</em> <Answer text={claim.correction} />
                  </div>
                )}
                {claim.sources && claim.sources.length > 0 && (
                  <div className="claim-sources">
                    {claim.sources.map((src, sIdx) => (
                      <span key={sIdx} className="claim-source-tag">
                        {src.url ? (
                          <a href={src.url} target="_blank" rel="noreferrer">
                            {src.title} <ExternalLink size={10} />
                          </a>
                        ) : (
                          src.title
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {report.correctedAnswer && onApplyCorrection && (
            <div className="fact-correction-action">
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => onApplyCorrection(report.correctedAnswer!)}
              >
                <Check size={13} />
                Apply verified correction
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
