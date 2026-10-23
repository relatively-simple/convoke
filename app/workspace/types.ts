import { type Project, type Mode, type Capabilities, type Version } from "@/lib/project";

export interface GenerationState {
  busy: boolean;
  generating: boolean;
  progress: number;
  status: string;
  statusProvider: string;
  statusPhase: string;
  pendingText: string;
}

export interface WorkspaceUser {
  email?: string;
  displayName?: string;
  provider?: string;
}

export type { Project, Mode, Capabilities, Version };
