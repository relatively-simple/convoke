"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Orbit, Users, Coins, ShieldCheck, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Answer } from "@/components/answer";
import { VisualAnswers } from "@/components/visual-answer";
import { FactCheckView } from "@/components/fact-check-view";
import { SecondOpinionView } from "@/components/second-opinion-view";
import { StatusRail } from "./StatusRail";
import { type Project } from "@/lib/project";

interface MessageListProps {
  project: Project | null;
  pendingText: string;
  status: string;
  statusProvider: string;
  statusPhase: string;
  progress: number;
  busy: boolean;
  onSend: (text: string, mode: "auto" | "explain" | "build") => void;
  onVerify: (messageId: string) => void;
  onRequestSecondOpinion: (messageId: string) => void;
  onApplyCorrection: (messageId: string, correction: string) => void;
  onApplySecondOpinion: (messageId: string, revisionText: string) => void;
  onOpenBoardroom: () => void;
}

export function MessageList({
  project,
  pendingText,
  status,
  statusProvider,
  statusPhase,
  progress,
  busy,
  onSend,
  onVerify,
  onRequestSecondOpinion,
  onApplyCorrection,
  onApplySecondOpinion,
  onOpenBoardroom,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // If more than 80px away from bottom, consider user scrolled up
    setUserScrolledUp(distanceToBottom > 80);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
    setUserScrolledUp(false);
  }, []);

  useEffect(() => {
    if (!userScrolledUp) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [project?.messages.length, pendingText, status, userScrolledUp]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="conversation-scroll"
      style={{ position: "relative" }}
    >
      <div className="messages">
        {project?.messages.map((m) => {
          const isClarified = m.role === "user" && m.text.includes("\nUser-confirmed details:\n");
          const cleanText = isClarified
            ? m.text.split("\nUser-confirmed details:\n")[0]
            : m.text;

          return (
            <article key={m.id} className={`message ${m.role}`}>
              <div className="message-heading">
                {m.role === "assistant" ? (
                  <span className="assistant-symbol" aria-hidden="true">
                    <Orbit size={16} />
                  </span>
                ) : (
                  <span className="user-symbol" aria-hidden="true">Y</span>
                )}
                <strong>{m.role === "assistant" ? "Convoke" : "You"}</strong>
                {m.model && (
                  <small>{m.model === "demo" ? "Saved response" : m.model}</small>
                )}
                {m.boardroomId && (
                  <button
                    type="button"
                    className="boardroom-pill"
                    onClick={onOpenBoardroom}
                    title="View 3-model deliberation transcript"
                  >
                    <Users size={12} /> <span className="boardroom-pill-text">Boardroom deliberation</span>
                  </button>
                )}
                {m.cost && (
                  <span className="cost-ledger-tag">
                    <Coins size={12} /> {m.cost.label}
                  </span>
                )}
              </div>

              {m.role === "assistant" ? (
                <>
                  {m.visuals?.length ? (
                    <VisualAnswers
                      visuals={m.visuals}
                      onExplain={busy ? undefined : (caption) => onSend(`Explain this in words: ${caption}`, "explain")}
                    />
                  ) : null}
                  <Answer text={m.text} />
                  {m.factCheck ? (
                    <FactCheckView
                      report={m.factCheck}
                      onApplyCorrection={(c) => onApplyCorrection(m.id, c)}
                      disabled={busy}
                    />
                  ) : null}
                  {m.secondOpinion ? (
                    <SecondOpinionView
                      report={m.secondOpinion}
                      onApply={(rev) => onApplySecondOpinion(m.id, rev)}
                      busy={busy}
                    />
                  ) : null}
                  <div className="message-actions">
                    {!m.factCheck && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="verify-button"
                        disabled={busy}
                        onClick={() => onVerify(m.id)}
                      >
                        <ShieldCheck size={13} /> Verify facts
                      </Button>
                    )}
                    {!m.secondOpinion && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opinion-button"
                        disabled={busy}
                        onClick={() => onRequestSecondOpinion(m.id)}
                      >
                        <Sparkles size={13} /> Second opinion
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Answer text={cleanText} />
                  {isClarified && (
                    <details className="route-details" style={{ marginTop: "4px" }}>
                      <summary style={{ fontSize: "11px", color: "var(--label-tertiary)" }}>
                        Confirmed background details
                      </summary>
                      <p style={{ fontSize: "11px", whiteSpace: "pre-wrap", margin: "6px 0", color: "var(--label-secondary)" }}>
                        {m.text
                          .split("\nUser-confirmed details:\n")[1]
                          ?.split("\nClarification is complete")[0]
                          ?.trim()}
                      </p>
                    </details>
                  )}
                </>
              )}

              {m.routing && (
                <details className="route-details">
                  <summary>How this was routed</summary>
                  <p>{m.routing}</p>
                  <small>Models are selected for the task. Availability and quality vary.</small>
                </details>
              )}
            </article>
          );
        })}

        {pendingText && (
          <article className="message user">
            <div className="message-heading">
              <span className="user-symbol" aria-hidden="true">Y</span>
              <strong>You</strong>
            </div>
            <Answer text={pendingText} />
          </article>
        )}

        {status && (
          <StatusRail
            status={status}
            provider={statusProvider}
            phase={statusPhase}
            progress={progress}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {userScrolledUp && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          style={{
            position: "sticky",
            bottom: "16px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "var(--bg-elevated)",
            color: "var(--label)",
            border: "1px solid var(--separator)",
            borderRadius: "var(--radius-full)",
            boxShadow: "var(--shadow-2)",
            padding: "6px 14px",
            fontSize: "0.75rem",
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            cursor: "pointer",
            zIndex: 10,
          }}
        >
          <ChevronDown size={14} /> Jump to latest
        </button>
      )}
    </div>
  );
}
