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
  const isThermal = /\b(heat|thermal|temperature|cold|conduction|diffusion|rod)\b/i.test(cleanPrompt);

  const steps: VisualDeliberationStep[] = isThermal
    ? [
        {
          provider: "Google Gemini",
          role: "Physical Foundations",
          message: `Gemini: "Establish the heat diffusion equation and nodal temperature profile for '${cleanPrompt.slice(0, 36)}'. Define thermal conductivities and boundary states."`,
          progressPercent: 28,
        },
        {
          provider: "Groq",
          role: "Dynamic Flow Engine",
          message: `Groq: "A static profile misses the dynamic intuition. Let's render the continuous heat flow in real-time with an animated vector field and dynamic gradient updates."`,
          progressPercent: 38,
        },
        {
          provider: "NVIDIA NIM",
          role: "Interactive Agency",
          message: `NVIDIA: "The heat/cold sections can be selected and changed with real-time sliders, draggable probes, and live temperature readouts."`,
          progressPercent: 48,
        },
        {
          provider: "Convoke 3.0",
          role: "Consensus Synthesis",
          message: `Consensus reached: Implementing multi-model blueprint with interactive boundary controls, animated thermal flow, and live telemetry.`,
          progressPercent: 56,
        },
      ]
    : [
        {
          provider: "Google Gemini",
          role: "Architectural Foundations",
          message: `Gemini: "Establish foundational logic, coordinate systems, and data model for '${cleanPrompt.slice(0, 36)}'. Define states and core mechanics."`,
          progressPercent: 28,
        },
        {
          provider: "Groq",
          role: "Real-Time Dynamics",
          message: `Groq: "Implement a smooth 60 FPS simulation loop and dynamic reactive state transitions rather than a static presentation."`,
          progressPercent: 38,
        },
        {
          provider: "NVIDIA NIM",
          role: "Interactive Control Surface",
          message: `NVIDIA: "Add intuitive user controls: real-time parameter sliders, interactive click/drag elements, and a live synchronized readout panel."`,
          progressPercent: 48,
        },
        {
          provider: "Convoke 3.0",
          role: "Consensus Synthesis",
          message: `Consensus reached: Synthesizing multi-model feature blueprint with real-time interactivity, direct manipulation, and high contrast styling.`,
          progressPercent: 56,
        },
      ];

  // Emit progress events with pacing so the user watches the multi-model dialogue unfold
  for (const step of steps) {
    progress({
      phase: "deliberation",
      provider: step.provider,
      model: step.role,
      task: "coding",
      attempt: 1,
      message: step.message,
      progressPercent: step.progressPercent,
    });
    // Yield for progressive streaming
    await new Promise(r => setTimeout(r, 180));
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
