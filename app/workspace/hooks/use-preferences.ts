"use client";

import { useSyncExternalStore, useCallback } from "react";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getStoredBoolean(key: string, defaultValue: boolean): boolean {
  if (typeof window === "undefined") return defaultValue;
  try {
    const val = localStorage.getItem(key);
    return val !== null ? val === "true" : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStoredBoolean(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, String(value));
    window.dispatchEvent(new Event("storage"));
  } catch {}
}

export function usePreferences() {
  const thorough = useSyncExternalStore(
    subscribe,
    () => getStoredBoolean("convoke-thorough", true),
    () => true
  );

  const smartRouting = useSyncExternalStore(
    subscribe,
    () => getStoredBoolean("convoke-smart-routing", true),
    () => true
  );

  const privateMode = useSyncExternalStore(
    subscribe,
    () => getStoredBoolean("convoke-private-mode", false),
    () => false
  );

  const setThorough = useCallback((val: boolean) => {
    setStoredBoolean("convoke-thorough", val);
  }, []);

  const setSmartRouting = useCallback((val: boolean) => {
    setStoredBoolean("convoke-smart-routing", val);
  }, []);

  const setPrivateMode = useCallback((val: boolean) => {
    setStoredBoolean("convoke-private-mode", val);
  }, []);

  return {
    thorough,
    setThorough,
    smartRouting,
    setSmartRouting,
    privateMode,
    setPrivateMode,
  };
}
