import type { AIProgress, ProgressSink } from "./ai-progress.ts";
import type { Project } from "./project.ts";

export function generationStream(request: Request, execute: (request: Request, progress: ProgressSink) => Promise<Response>) {
  const abort = new AbortController();
  // Vinext's request wrapper is not a native Request in the Workers runtime.
  // Copy explicit fields instead of passing the wrapper to the constructor.
  const forwarded = new Request(request.url, {
    method: request.method, headers: Object.fromEntries(request.headers.entries()),
    body: request.body, signal: AbortSignal.any([request.signal, abort.signal]),
    duplex: "half",
  } as RequestInit);
  let closed = false;
  let timer: ReturnType<typeof setInterval>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: unknown) => { if (!closed) { try { controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); } catch { closed = true; abort.abort(); } } };
      send({ type: "heartbeat" });
      timer = setInterval(() => send({ type: "heartbeat" }), 15000);
      void (async () => {
        try {
          const result = await execute(forwarded, progress => send({ type: "progress", progress }));
          const data = await result.json() as { project?: Project; error?: string };
          send(result.ok ? { type: "result", project: data.project } : { type: "error", error: data.error, status: result.status });
        } catch { send({ type: "error", error: "The connection was interrupted. Reload to check your saved work." }); }
        finally { clearInterval(timer); if (!closed) { closed = true; controller.close(); } }
      })();
    },
    cancel() { closed = true; clearInterval(timer); abort.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store, no-transform", "X-Content-Type-Options": "nosniff" } });
}

export async function readGeneration(response: Response, progress: ProgressSink): Promise<Project> {
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const data = await response.json() as { project?: Project; error?: string };
    if (!response.ok) throw Error(data.error || "Could not complete this request.");
    if (!data.project) throw Error("The response did not contain a saved result.");
    return data.project;
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("The connection closed before a result arrived.");
  const decoder = new TextDecoder(); let buffer = ""; let project: Project | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as { type: string; progress: AIProgress; project?: Project; error?: string };
    if (event.type === "progress") progress(event.progress);
    if (event.type === "error") throw Error(event.error || "Could not complete this request.");
    if (event.type === "result") project = event.project;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let split: number;
      while ((split = buffer.indexOf("\n")) >= 0) { consume(buffer.slice(0, split)); buffer = buffer.slice(split + 1); }
      if (buffer.length > 2000000) throw Error("The response was too large.");
      if (done) { consume(buffer); break; }
    }
  } finally { await reader.cancel().catch(() => {}); try { reader.releaseLock(); } catch { /* ignore if already released */ } }
  if (!project) throw Error("The connection closed before completion. Reload to check your saved work.");
  return project;
}
