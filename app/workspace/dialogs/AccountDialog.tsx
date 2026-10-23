"use client";

import { useState, useEffect } from "react";
import { LogOut, Laptop, Lock } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { type WorkspaceUser } from "../types";

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: WorkspaceUser | null;
  googleClientId: string | null;
  busy: boolean;
  onGoogleLogin: (credential: string) => Promise<void>;
  onPasswordAuth: (email: string, pass: string, name?: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

export function AccountDialog({
  open,
  onOpenChange,
  user,
  googleClientId,
  busy,
  onGoogleLogin,
  onPasswordAuth,
  onLogout,
}: AccountDialogProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open || !googleClientId) return;
    const cid = googleClientId;
    const initGsi = () => {
      if (
        typeof window !== "undefined" &&
        (window as unknown as { google?: { accounts?: { id?: { initialize: (opts: unknown) => void; renderButton: (el: HTMLElement, opts: unknown) => void } } } }).google?.accounts?.id
      ) {
        try {
          const gsi = (window as unknown as { google: { accounts: { id: { initialize: (opts: unknown) => void; renderButton: (el: HTMLElement, opts: unknown) => void } } } }).google.accounts.id;
          gsi.initialize({
            client_id: cid,
            callback: (response: { credential?: string }) => {
              if (response.credential) {
                void onGoogleLogin(response.credential);
              }
            },
            auto_select: false,
            cancel_on_tap_outside: true,
          });
          const container = document.getElementById("google-signin-btn-container");
          if (container) {
            container.innerHTML = "";
            gsi.renderButton(container, {
              theme: "outline",
              size: "large",
              text: "signin_with",
              shape: "rectangular",
              width: 320,
            });
          }
        } catch (e) {
          console.warn("Google Sign-In initialization failed", e);
        }
      }
    };
    const timer = setTimeout(initGsi, 150);
    return () => clearTimeout(timer);
  }, [open, googleClientId, onGoogleLogin]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    void onPasswordAuth(email.trim(), password, name.trim() || undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="account-dialog">
        <DialogHeader>
          <DialogTitle>Convoke Account & Device Sync</DialogTitle>
          <DialogDescription>
            Carry your chat threads securely across any computer, laptop, phone, or tablet.
          </DialogDescription>
        </DialogHeader>

        <div className="account-status-card">
          <div className="account-status-info">
            <strong>
              {user?.email ? `Signed in as ${user.displayName || user.email}` : "Guest Workspace"}
            </strong>
            <p>
              {user?.email
                ? `Securely synced with ${user.provider === "google" ? "Google Account" : "Password-protected Email"}. Accessible on any browser.`
                : "Chats currently belong to this local browser session only."}
            </p>
          </div>
          {user?.email ? (
            <Button variant="outline" size="sm" onClick={() => void onLogout()}>
              <LogOut size={13} /> Sign out
            </Button>
          ) : (
            <span className="account-tier-badge">
              <Laptop size={12} /> Local Device
            </span>
          )}
        </div>

        {!user?.email ? (
          <>
            <div style={{ display: "grid", gap: "10px", margin: "6px 0" }}>
              <div id="google-signin-btn-container" style={{ display: "flex", justifyContent: "center" }} />
              {!googleClientId && (
                <button
                  type="button"
                  className="google-signin-btn"
                  onClick={() =>
                    toast.info(
                      "Google Sign-In is active once configured by the administrator. Sign in or register with email and password below."
                    )
                  }
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.04h3.88c2.27-2.09 3.66-5.17 3.66-9.14z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.04c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.13C3.26 21.43 7.34 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.28c-.25-.72-.38-1.49-.38-2.28s.13-1.56.38-2.28V6.59H1.24C.45 8.16 0 9.97 0 12s.45 3.84 1.24 5.41l4.04-3.13z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.57 1.24 6.59l4.04 3.13c.95-2.83 3.6-4.97 6.72-4.97z"
                    />
                  </svg>
                  Sign in with Google
                </button>
              )}
            </div>

            <div className="account-divider">
              <span>or sync with email & password</span>
            </div>

            <form className="account-form" onSubmit={handleSubmit}>
              <label>
                Email Address
                <input
                  type="email"
                  required
                  placeholder="your.name@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                Password (min 8 characters)
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                Full Name (Optional)
                <input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                />
              </label>
              <Button
                type="submit"
                disabled={!email.trim() || !password.trim() || password.length < 8 || busy}
              >
                <Lock size={15} /> Sign in / Register with Password
              </Button>
            </form>

            <p style={{ fontSize: "12px", color: "var(--label-tertiary)", marginTop: "10px", lineHeight: "1.5" }}>
              Protected by PBKDF2 cryptographic hashing. Accounts cannot be accessed without the correct password or verified Google login.
            </p>
          </>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            <p style={{ fontSize: "13px", color: "var(--label)" }}>
              Your workspace is active and securely synced. Any chats you start on this device will also be available on your other computers and phones.
            </p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
