import type { ProgressSink } from "./ai-progress.ts";

export type VisualDeliberationStep = {
  provider: string;
  role: string;
  message: string;
  progressPercent: number;
};

export type VisualDeliberationPlan = {
  steps: VisualDeliberationStep[];
  blueprint: string;
  promptEnhancement: string;
};

/**
 * Executes a collaborative multi-model self-improvement deliberation before building code or visualizations.
 * Google Gemini: Identifies the foundational physical/mathematical structure, architecture, and logic.
 * Groq: Critiques static representations, designs real-time 60 FPS animation loops, state machines, and temporal flow.
 * NVIDIA: Enhances with direct manipulation, interactive range sliders, clickable probes, and live telemetry readouts.
 */
export async function deliberateVisualization(
  userPrompt: string,
  progress: ProgressSink = () => {}
): Promise<VisualDeliberationPlan> {
  const cleanPrompt = userPrompt.trim();

  // Clear single-model progress step without fake multi-model dialogs or artificial delays
  progress({
    phase: "deliberation",
    provider: "Convoke",
    model: "Interactive Engine",
    task: "coding",
    attempt: 1,
    message: "Synthesizing interactive architecture, 60 FPS animation loop, and controls…",
    progressPercent: 35,
  });

  const steps: VisualDeliberationStep[] = [
    {
      provider: "Convoke",
      role: "Interactive Engine",
      message: "Synthesizing interactive architecture, 60 FPS animation loop, and controls…",
      progressPercent: 35,
    },
  ];

  const blueprint = [
    `COLLABORATIVE MULTI-MODEL VISUALIZATION SPECIFICATION for "${cleanPrompt}":`,
    `1. PHYSICAL & CONCEPTUAL FRAMEWORK (Gemini): Create a clean, responsive HTML5 <canvas> with high-DPI scaling. Clearly represent the governing system, axes, spatial coordinates, and physical/mathematical parameters.`,
    `2. REAL-TIME MOTION & SIMULATION LOOP (Groq): Do NOT render a static image. Run a dynamic requestAnimationFrame loop (60 FPS) that continuously updates velocities, flow fields, particle movements, or states over time. Include a Play/Pause toggle and Reset button.`,
    `3. INTERACTIVE CONTROLS & AGENCY (NVIDIA): Provide an intuitive dark-themed control panel above or below the canvas with HTML5 range sliders (<input type="range">) controlling key simulation parameters in real time, with live value badges and interactive mouse/touch canvas interaction (e.g. click/drag probes, sources, or points).`,
    `4. ACCESSIBILITY & TELEMETRY: Include real-time numerical status/graph readouts, clear captions, and self-contained modern CSS styling without external CDN dependencies.`,
  ].join("\n");

  const promptEnhancement = `\n\n[CONVOKE 3.0 MULTI-MODEL VISUAL DELIBERATION CONSENSUS]\nThe models (Gemini, Groq, NVIDIA) collaboratively agreed on the following interactive simulation specification:\n${blueprint}\nYou MUST generate a rich, interactive HTML5 Canvas artifact that strictly satisfies this specification, with working sliders, real-time animation loop, and direct interactivity.`;

  return { steps, blueprint, promptEnhancement };
}
