export const AI_RETRY = { attemptsPerModel: 3, delayMs: 5000 } as const;
export const GENERATION_TIMEOUT_MS = 6 * 60 * 1000;
export const GENERATION_LOCK_MS = GENERATION_TIMEOUT_MS + 30000;
export function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
