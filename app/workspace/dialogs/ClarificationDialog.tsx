"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ClarificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clarification?: {
    id: string;
    prompt: string;
    mode: "auto" | "explain" | "build";
    questions: string[];
    options?: string[][];
  };
  busy: boolean;
  onSubmit: (answers: string[]) => void;
}

export function ClarificationDialog({
  open,
  onOpenChange,
  clarification,
  busy,
  onSubmit,
}: ClarificationDialogProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [prevId, setPrevId] = useState<string | undefined>(undefined);

  if (clarification && clarification.id !== prevId) {
    setPrevId(clarification.id);
    setStep(0);
    setAnswers([]);
  }

  if (!clarification) return null;

  const currentQuestion = clarification.questions[step];
  const currentOptions = clarification.options?.[step] || [];
  const isLast = step === clarification.questions.length - 1;

  const handleNext = () => {
    if (isLast) {
      onOpenChange(false);
      onSubmit(answers);
    } else {
      setStep((prev) => prev + 1);
    }
  };

  const handleLetConvokeDecide = () => {
    // Fill remaining answers with Convoke's recommendation / first option
    const resolvedAnswers = [...answers];
    for (let i = step; i < clarification.questions.length; i++) {
      resolvedAnswers[i] = clarification.options?.[i]?.[0] || "Optimized default chosen by Convoke";
    }
    onOpenChange(false);
    onSubmit(resolvedAnswers);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="thorough-quiz">
        <DialogHeader>
          <DialogTitle>A little more direction</DialogTitle>
          <DialogDescription>
            Choose an option or type your own. Convoke will synthesize your result based on these specifications.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleNext();
          }}
        >
          <p className="quiz-progress">
            Question {step + 1} of {clarification.questions.length}
          </p>

          <fieldset>
            <legend>{currentQuestion}</legend>

            <div className="quiz-options">
              {currentOptions.map((opt) => (
                <button
                  type="button"
                  key={opt}
                  aria-pressed={answers[step] === opt}
                  onClick={() => {
                    const next = [...answers];
                    next[step] = opt;
                    setAnswers(next);
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>

            <label className="field-label">
              Your answer
              <input
                autoComplete="off"
                value={answers[step] || ""}
                onChange={(e) => {
                  const next = [...answers];
                  next[step] = e.target.value;
                  setAnswers(next);
                }}
                maxLength={800}
                required
                placeholder="Select above or type a specific preference"
              />
            </label>
          </fieldset>

          <div className="quiz-actions">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 0 || busy}
              onClick={() => setStep((prev) => prev - 1)}
            >
              Back
            </Button>

            <div className="quiz-action-group">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleLetConvokeDecide}
                disabled={busy}
                title="Let Convoke pick the optimal architectural defaults"
              >
                <Sparkles size={13} /> Let Convoke decide
              </Button>

              <Button
                type="submit"
                disabled={busy || !answers[step]?.trim()}
              >
                {busy ? "Generating…" : isLast ? "Create with these details" : "Next"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
