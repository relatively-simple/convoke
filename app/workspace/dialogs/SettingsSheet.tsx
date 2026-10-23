"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, Laptop, Sparkles, Shield, Cpu } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { type Capabilities } from "@/lib/project";

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caps: Capabilities;
  loading: boolean;
  publicAccess?: boolean;
  onOpenAccount: () => void;
}

export function SettingsSheet({
  open,
  onOpenChange,
  caps,
  loading,
  publicAccess,
  onOpenAccount,
}: SettingsSheetProps) {
  const { theme, setTheme } = useTheme();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-dialog" style={{ maxWidth: "540px" }}>
        <DialogHeader>
          <DialogTitle>Convoke Settings</DialogTitle>
          <DialogDescription>
            Personalize appearance, inspect connected AI providers, and review privacy options.
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: "grid", gap: "16px", padding: "8px 0" }}>
          {/* Appearance Section */}
          <div className="setting-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: "8px" }}>
            <strong>Appearance</strong>
            <p>Select your interface theme or match your device system settings.</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "8px",
                width: "100%",
                marginTop: "4px",
              }}
              role="radiogroup"
              aria-label="Theme selection"
            >
              <button
                type="button"
                onClick={() => setTheme("system")}
                role="radio"
                aria-checked={theme === "system"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "10px",
                  borderRadius: "var(--radius-sm)",
                  border: theme === "system" ? "2px solid var(--accent)" : "1px solid var(--separator)",
                  backgroundColor: theme === "system" ? "var(--accent-muted)" : "var(--fill-1)",
                  color: theme === "system" ? "var(--accent)" : "var(--label)",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                }}
              >
                <Laptop size={15} /> System
              </button>

              <button
                type="button"
                onClick={() => setTheme("light")}
                role="radio"
                aria-checked={theme === "light"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "10px",
                  borderRadius: "var(--radius-sm)",
                  border: theme === "light" ? "2px solid var(--accent)" : "1px solid var(--separator)",
                  backgroundColor: theme === "light" ? "var(--accent-muted)" : "var(--fill-1)",
                  color: theme === "light" ? "var(--accent)" : "var(--label)",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                }}
              >
                <Sun size={15} /> Light
              </button>

              <button
                type="button"
                onClick={() => setTheme("dark")}
                role="radio"
                aria-checked={theme === "dark"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "10px",
                  borderRadius: "var(--radius-sm)",
                  border: theme === "dark" ? "2px solid var(--accent)" : "1px solid var(--separator)",
                  backgroundColor: theme === "dark" ? "var(--accent-muted)" : "var(--fill-1)",
                  color: theme === "dark" ? "var(--accent)" : "var(--label)",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                }}
              >
                <Moon size={15} /> Dark
              </button>
            </div>
          </div>

          {/* AI Mesh Status */}
          <div className="settings-detail">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <Cpu size={16} style={{ color: "var(--accent)" }} />
              <strong>{caps.live ? "Tri-Model AI Mesh Active" : loading ? "Connecting…" : "AI Mesh Status"}</strong>
            </div>
            <p>
              {caps.live
                ? `Connected to ${caps.provider || "the multi-model network"}. Autonomous failover and load balancing active across connected providers.`
                : loading
                ? "Connecting to AI inference endpoints…"
                : "AI is temporarily unavailable."}
            </p>
            {caps.providers && caps.providers.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                {caps.providers.map((p) => (
                  <span key={p} className="account-tier-badge">
                    <Sparkles size={11} /> {p}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Model Tier & Architecture */}
          <div className="settings-detail">
            <strong>Community Model Tier (Free)</strong>
            <p>
              Autonomous routing mesh combining Google Gemini Flash (structured analysis & physical principles),
              Groq (ultra-low-latency 60 FPS animation loop), and NVIDIA NIM (deep reasoning & interactive state management).
              Zero user API keys required.
            </p>
          </div>

          {/* Device & Sync */}
          {publicAccess && (
            <div className="settings-detail">
              <strong>Device & Multi-Computer Sync</strong>
              <p>
                Carry your chat threads across any laptop, desktop, or mobile device with Google or email login.
              </p>
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onOpenAccount();
                }}
                className="signin-link"
                style={{ marginTop: "6px", cursor: "pointer", background: "none", border: "none", padding: 0 }}
              >
                Manage Account & Device Sync →
              </button>
            </div>
          )}

          {/* Privacy Guarantee */}
          <div className="settings-detail">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <Shield size={16} style={{ color: "var(--accent)" }} />
              <strong>Privacy & Client-Side Masking</strong>
            </div>
            <p>
              When Private Mode is enabled, emails, phone numbers, credit card numbers, and API keys are detected and
              masked in your browser before any payload leaves your device. Responses are unmasked locally.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
