"use client";

import { Orbit, Compass, Flame, Cpu, LineChart } from "lucide-react";

interface WelcomeViewProps {
  live: boolean;
  loading: boolean;
  onSelectStarter: (prompt: string, mode: "auto" | "explain" | "build") => void;
}

const STARTERS = [
  {
    icon: Flame,
    title: "Interactive Heat Conduction",
    description: "Simulate 2D thermal dissipation across copper, iron, and glass with adjustable heat sources.",
    prompt: "Create an interactive heat conduction simulation across a metal rod with hot/cold source controls and real-time thermal gradient flow visualization.",
    mode: "build" as const,
  },
  {
    icon: Cpu,
    title: "Pathfinding Algorithm Visualizer",
    description: "Compare Dijkstra and A* path search algorithms on an interactive grid with obstacles.",
    prompt: "Build an interactive grid visualizer comparing Dijkstra and A* pathfinding with adjustable obstacle density and step-by-step frontier expansion.",
    mode: "build" as const,
  },
  {
    icon: LineChart,
    title: "Market Depth & Order Book",
    description: "Simulate a live limit order book with real-time bid/ask spread and order matching.",
    prompt: "Simulate a live financial order book with interactive limit orders, cumulative depth chart, and simulated trade fills.",
    mode: "build" as const,
  },
  {
    icon: Compass,
    title: "Double Pendulum Chaos",
    description: "Model chaotic trajectory dynamics with real-time angle controls and phase space plotting.",
    prompt: "Create an interactive double pendulum physics simulator showing chaotic motion with traceable trajectories and phase space plots.",
    mode: "build" as const,
  },
];

export function WelcomeView({ live, loading, onSelectStarter }: WelcomeViewProps) {
  return (
    <div className="welcome">
      <span className="welcome-mark" aria-hidden="true">
        <Orbit size={28} />
      </span>
      <span className="eyebrow">ROOM FOR YOUR NEXT IDEA</span>
      <h1>What are we<br />making today?</h1>
      <p>Something to understand.<br />Something to bring to life.</p>
      <p className="connection-caption">
        {live
          ? "Describe your idea or choose a starter below. AI will create your result."
          : loading
          ? "Opening your workspace…"
          : "AI is temporarily unavailable. Please try again shortly."}
      </p>

      <div className="starters-grid" role="region" aria-label="Suggested starter projects">
        {STARTERS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.title}
              type="button"
              className="starter-card"
              onClick={() => onSelectStarter(s.prompt, s.mode)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Icon size={16} style={{ color: "var(--accent)" }} />
                <strong>{s.title}</strong>
              </div>
              <span>{s.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
