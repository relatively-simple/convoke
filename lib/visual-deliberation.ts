import type { ProgressSink } from "./ai-progress.ts";

export type VisualDeliberationStep = {
  provider: string;
  role: string;
  message: string;
};

export type VisualDeliberationPlan = {
  steps: VisualDeliberationStep[];
  blueprint: string;
  promptEnhancement: string;
};

/**
 * Executes a collaborative multi-model self-improvement deliberation before building a visualization.
 * Google Gemini: Identifies the foundational physical/mathematical structure and spatial coordinate layout.
 * Groq: Critiques static representations and designs the real-time 60 FPS animation loop, particle dynamics, and temporal flow.
 * NVIDIA: Enhances with direct manipulation, interactive range sliders, clickable canvas probes, and live readouts.
 */
export async function deliberateVisualization(
  userPrompt: string,
  progress: ProgressSink = () => {}
): Promise<VisualDeliberationPlan> {
  const cleanPrompt = userPrompt.trim();

  const steps: VisualDeliberationStep[] = [
    {
      provider: "Google Gemini",
      role: "Scientific & Physical Foundations",
      message: `Gemini: "Establish the foundational coordinate framework and mathematical principles for '${cleanPrompt.slice(0, 40)}'. Define spatial nodes, physical variables, and exact boundary states."`,
    },
    {
      provider: "Groq",
      role: "Dynamic Animation & Motion Engine",
      message: `Groq: "A static diagram cannot build deep intuition. Implement a continuous 60 FPS simulation loop with requestAnimationFrame, animated vector fields, dynamic flow, and visible temporal evolution."`,
    },
    {
      provider: "NVIDIA NIM",
      role: "Interactive Agency & Control Surface",
      message: `NVIDIA: "Give the user hands-on agency: draggable interactive canvas probes, real-time control sliders for key parameters, pause/resume/reset triggers, and a live synchronized telemetry readout."`,
    },
    {
      provider: "Convoke 3.0",
      role: "Consensus Blueprint Synthesis",
      message: `Consensus reached: Synthesizing multi-model blueprint into an interactive HTML5 Canvas simulation with dynamic controls, real-time motion, and telemetry readouts.`,
    },
  ];

  // Emit progress events with slight pacing so the user watches the multi-model dialogue unfold
  for (const step of steps) {
    progress({
      phase: "attempt",
      provider: step.provider,
      model: step.role,
      task: "coding",
      attempt: 1,
      message: step.message,
    });
    // Brief non-blocking yield for progressive streaming
    await new Promise(r => setTimeout(r, 60));
  }

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
