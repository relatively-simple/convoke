"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { type Project, type Capabilities } from "@/lib/project";
import { type WorkspaceUser } from "../types";

export async function api(body?: unknown) {
  const response = await fetch(
    "/api/workspace",
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined
  );
  const data = (await response.json()) as {
    error?: string;
    project: Project;
    projects: Project[];
    capabilities: Capabilities;
  };
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

export function useWorkspaceData({
  signedIn,
  publicAccess,
}: {
  signedIn: boolean;
  displayName: string;
  publicAccess?: boolean;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [caps, setCaps] = useState<Capabilities>({ live: false, model: null, dailyLimit: null });
  const [loading, setLoading] = useState(signedIn);
  const [loadError, setLoadError] = useState("");
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [userAccount, setUserAccount] = useState<WorkspaceUser | null>(null);

  // Fetch session & googleClientId once
  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json() as Promise<{ user?: WorkspaceUser; googleClientId?: string | null }>)
      .then((data) => {
        if (data?.user) setUserAccount(data.user);
        if (data?.googleClientId) setGoogleClientId(data.googleClientId);
      })
      .catch(() => {});
  }, []);

  const updateProject = useCallback((project: Project) => {
    setProjects((prev) => [project, ...prev.filter((p) => p.id !== project.id)]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (publicAccess) {
        const session = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!session.ok) throw new Error("Could not open your workspace. Please try again.");
      }
      const data = await api();
      setProjects(data.projects);
      setCaps(data.capabilities);
      setLoadError("");
      const selected = new URLSearchParams(window.location.search).get("project");
      if (selected && data.projects.some((p) => p.id === selected)) {
        setActiveId(selected);
      }
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [publicAccess]);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    const task = publicAccess
      ? fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
          .then((res) => {
            if (!res.ok) throw new Error("Could not open your workspace. Please try again.");
          })
          .then(() => api())
      : api();

    task
      .then((data) => {
        if (!live) return;
        setProjects(data.projects);
        setCaps(data.capabilities);
        setLoadError("");
        const selected = new URLSearchParams(window.location.search).get("project");
        if (selected && data.projects.some((p) => p.id === selected)) {
          setActiveId(selected);
        }
      })
      .catch((e) => {
        if (live) setLoadError((e as Error).message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [signedIn, publicAccess]);

  // Sync URL search params
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeId) url.searchParams.set("project", activeId);
    else if (!loading) url.searchParams.delete("project");
    window.history.replaceState(null, "", url);
  }, [activeId, loading]);

  const deleteProject = useCallback(async (idToDelete: string) => {
    const target = projects.find((p) => p.id === idToDelete);
    try {
      await api({ action: "delete", projectId: idToDelete });
      setProjects((prev) => prev.filter((p) => p.id !== idToDelete));
      setActiveId((curr) => (curr === idToDelete ? null : curr));
      toast.success(`Deleted "${target?.title?.slice(0, 24) || "thread"}"`);
    } catch (err) {
      toast.error((err as Error).message || "Could not delete project");
    }
  }, [projects]);

  const handleGoogleLogin = useCallback(
    async (credential: string) => {
      try {
        const res = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "google-login", credential, clientId: googleClientId }),
        });
        const data = (await res.json()) as { error?: string; user?: WorkspaceUser };
        if (!res.ok) throw new Error(data.error || "Google authentication failed");
        setUserAccount(data.user || null);
        await load();
        toast.success(`Signed in with Google as ${data.user?.displayName || data.user?.email}!`);
      } catch (err) {
        toast.error((err as Error).message);
      }
    },
    [googleClientId, load]
  );

  const handlePasswordAuth = useCallback(
    async (emailAddr: string, password: string, name?: string) => {
      try {
        const res = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "login", email: emailAddr, password, name, provider: "email" }),
        });
        const data = (await res.json()) as { error?: string; user?: WorkspaceUser };
        if (!res.ok) throw new Error(data.error || "Login failed");
        setUserAccount(data.user || null);
        await load();
        toast.success(`Signed in as ${data.user?.email || emailAddr}! Chats securely synced.`);
      } catch (err) {
        toast.error((err as Error).message);
      }
    },
    [load]
  );

  const handleAccountLogout = useCallback(async () => {
    try {
      await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      setUserAccount(null);
      await load();
      toast.success("Signed out. Switched to guest workspace.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [load]);

  return {
    projects,
    setProjects,
    activeId,
    setActiveId,
    caps,
    loading,
    loadError,
    googleClientId,
    userAccount,
    updateProject,
    load,
    deleteProject,
    handleGoogleLogin,
    handlePasswordAuth,
    handleAccountLogout,
  };
}
