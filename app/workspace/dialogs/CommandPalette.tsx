"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import {
  Plus,
  MessageSquare,
  PanelRight,
  Sun,
  Moon,
  Laptop,
  Download,
  Settings2,
  Users,
  Sparkles,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { type Project, type Mode } from "@/lib/project";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  activeId: string | null;
  onSelectProject: (id: string | null) => void;
  onNewProject: () => void;
  onToggleCanvas: () => void;
  onSetMode: (mode: Mode) => void;
  onDownload: () => void;
  onOpenSettings: () => void;
  onOpenAccount: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  projects,
  activeId,
  onSelectProject,
  onNewProject,
  onToggleCanvas,
  onSetMode,
  onDownload,
  onOpenSettings,
  onOpenAccount,
}: CommandPaletteProps) {
  const { setTheme } = useTheme();

  // ⌘K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const runCommand = (command: () => void) => {
    onOpenChange(false);
    command();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search chat threads…" />
      <CommandList>
        <CommandEmpty>No matching commands or projects found.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runCommand(onNewProject)}>
            <Plus className="mr-2 h-4 w-4" />
            <span>New project</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(onToggleCanvas)}>
            <PanelRight className="mr-2 h-4 w-4" />
            <span>Toggle result canvas</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(onDownload)}>
            <Download className="mr-2 h-4 w-4" />
            <span>Export current artifact</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(onOpenSettings)}>
            <Settings2 className="mr-2 h-4 w-4" />
            <span>Workspace settings</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(onOpenAccount)}>
            <Users className="mr-2 h-4 w-4" />
            <span>Account & device sync</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Generation Mode">
          <CommandItem onSelect={() => runCommand(() => onSetMode("auto"))}>
            <Sparkles className="mr-2 h-4 w-4" />
            <span>Auto mode (intent detection)</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onSetMode("explain"))}>
            <Sparkles className="mr-2 h-4 w-4" />
            <span>Explain mode (verbal breakdown)</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onSetMode("build"))}>
            <Sparkles className="mr-2 h-4 w-4" />
            <span>Build mode (code & interactive visual)</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Appearance">
          <CommandItem onSelect={() => runCommand(() => setTheme("light"))}>
            <Sun className="mr-2 h-4 w-4" />
            <span>Light theme</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setTheme("dark"))}>
            <Moon className="mr-2 h-4 w-4" />
            <span>Dark theme</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setTheme("system"))}>
            <Laptop className="mr-2 h-4 w-4" />
            <span>System theme</span>
          </CommandItem>
        </CommandGroup>

        {projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Your Projects">
              {projects.map((p) => (
                <CommandItem
                  key={p.id}
                  onSelect={() => runCommand(() => onSelectProject(p.id))}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  <span style={{ fontWeight: p.id === activeId ? 600 : 400 }}>
                    {p.title}
                  </span>
                  {p.id === activeId && (
                    <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--accent)" }}>
                      Active
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
