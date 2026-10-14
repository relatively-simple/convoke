"use client";
import { useState } from "react";
import { Users, Scale, AlertTriangle, CheckCircle2, MessageSquare, Award } from "lucide-react";
import type { BoardroomSession } from "../lib/boardroom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Button } from "./ui/button";
import { Answer } from "./answer";

export function BoardroomView({
  session,
  onAdoptVerdict,
  disabled = false,
}: {
  session: BoardroomSession;
  onAdoptVerdict?: (content: string, source: string) => void;
  disabled?: boolean;
}) {
  const [activeTab, setActiveTab] = useState("synthesis");

  return (
    <div className="boardroom-container">
      <div className="boardroom-header">
        <div className="boardroom-heading-title">
          <span className="boardroom-icon"><Users size={20} /></span>
          <div>
            <h3>Executive AI Boardroom</h3>
            <p>3-stage deliberation: independent drafting, peer critique, and chairman synthesis</p>
          </div>
        </div>
        <div className="boardroom-members-roster">
          {session.members.map((m) => (
            <div key={m.id} className="boardroom-member-chip">
              <span className="member-avatar">{m.provider.slice(0, 1).toUpperCase()}</span>
              <div>
                <strong>{m.title}</strong>
                <small>{m.role || m.provider}</small>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="boardroom-tabs">
        <TabsList className="boardroom-tablist">
          <TabsTrigger value="synthesis">
            <Award size={14} /> Chairman Synthesis
          </TabsTrigger>
          <TabsTrigger value="critiques">
            <Scale size={14} /> Peer Cross-Examination
          </TabsTrigger>
          <TabsTrigger value="drafts">
            <MessageSquare size={14} /> Member Proposals ({session.drafts.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Chairman Synthesis */}
        <TabsContent value="synthesis" className="boardroom-tab-content">
          <div className="boardroom-synthesis-card">
            <div className="synthesis-badge">
              <Award size={16} />
              <span>Presiding Chairman: <strong>{session.chairmanModel}</strong></span>
            </div>

            <div className="consensus-box">
              <h4><CheckCircle2 size={15} className="text-green" /> Points of Unanimous Consensus</h4>
              <Answer text={session.synthesis.consensus} />
            </div>

            {session.synthesis.disagreements.length > 0 && (
              <div className="disagreements-box">
                <h4><AlertTriangle size={15} className="text-amber" /> Key Debates & Disagreements</h4>
                <div className="disagreements-list">
                  {session.synthesis.disagreements.map((dis, idx) => (
                    <div key={idx} className="disagreement-item">
                      <Answer text={dis} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="verdict-box">
              <h4>Executive Verdict & Comprehensive Solution</h4>
              <Answer text={session.synthesis.verdict} />
            </div>

            {onAdoptVerdict && (
              <div className="boardroom-adopt-bar">
                <Button
                  disabled={disabled}
                  onClick={() => onAdoptVerdict(session.synthesis.verdict, `Chairman (${session.chairmanModel})`)}
                >
                  Adopt Executive Verdict into Workspace
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab 2: Peer Cross-Examination */}
        <TabsContent value="critiques" className="boardroom-tab-content">
          <div className="boardroom-critiques-grid">
            {session.reviews.map((rev) => (
              <div key={rev.reviewerId} className="boardroom-review-card">
                <div className="reviewer-heading">
                  <strong>Evaluator: {rev.reviewerModel}</strong>
                </div>
                <div className="critique-items">
                  {rev.critiques.map((c, cIdx) => (
                    <div key={cIdx} className="critique-item">
                      <div className="critique-target-badge">
                        <span>{c.targetPerspective}</span>
                        {c.score !== undefined && <span className="score-pill">{c.score} / 10</span>}
                      </div>
                      <div className="critique-strengths">
                        <small className="critique-label">Strengths:</small>
                        <ul>
                          {c.strengths.map((s, sIdx) => <li key={sIdx}>{s}</li>)}
                        </ul>
                      </div>
                      <div className="critique-flaws">
                        <small className="critique-label">Concrete Flaws & Gaps:</small>
                        <ul>
                          {c.flaws.map((f, fIdx) => <li key={fIdx}>{f}</li>)}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Member Proposals */}
        <TabsContent value="drafts" className="boardroom-tab-content">
          <div className="boardroom-drafts-list">
            {session.drafts.map((draft, idx) => (
              <div key={draft.memberId} className="boardroom-draft-card">
                <div className="draft-header">
                  <div>
                    <strong>Perspective {String.fromCharCode(65 + idx)} · {draft.model}</strong>
                    <span className="provider-tag">{draft.provider}</span>
                  </div>
                  {onAdoptVerdict && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onClick={() => onAdoptVerdict(draft.content, `${draft.provider} · ${draft.model}`)}
                    >
                      Use this proposal
                    </Button>
                  )}
                </div>
                {draft.summary && <p className="draft-summary">{draft.summary}</p>}
                <div className="draft-body">
                  <Answer text={draft.content} />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
