export type AIProgress = {
  phase: "attempt" | "retry" | "success" | "checking" | "fact-check" | "second-opinion" | "boardroom";
  provider: string;
  model: string;
  task: string;
  attempt: number;
  message: string;
  error?: string;
  waitSeconds?: number;
};
export type ProgressSink = (progress: AIProgress) => void;
