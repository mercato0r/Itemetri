import { useCallback, useEffect, useState } from "react";
import type { ThemePreference } from "../types";

const STORAGE_KEY = "itemetri-color-scheme";

function readStoredPreference(): ThemePreference {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === "light" || val === "dark" || val === "system") {
      return val;
    }
  } catch {
    // Ignore storage denial in restricted contexts.
  }
  return "light";
}

function applyMetaScheme(pref: ThemePreference): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (!meta) return;
  meta.content = pref === "system" ? "light dark" : pref;
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStoredPreference());
  const [systemDark, setSystemDark] = useState<boolean>(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    applyMetaScheme(preference);
  }, [preference]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = (event: MediaQueryListEvent) => {
      setSystemDark(event.matches);
    };
    mq.addEventListener("change", onSystemChange);

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setPreferenceState(readStoredPreference());
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mq.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    applyMetaScheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Theme still applies in memory when storage is blocked.
    }
  }, []);

  const resolvedScheme: "light" | "dark" =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;

  const toggleLightDark = useCallback(() => {
    setPreference(resolvedScheme === "dark" ? "light" : "dark");
  }, [resolvedScheme, setPreference]);

  return {
    preference,
    resolvedScheme,
    systemDark,
    setPreference,
    toggleLightDark,
  };
}
