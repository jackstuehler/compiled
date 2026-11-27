"use client";

import { useSyncExternalStore } from "react";
import { appearanceStorageKey as storageKey } from "./appearance-storage";
import styles from "./layout.module.css";

type Appearance = "system" | "light" | "dark";

function preference(value: string | null | undefined): Appearance {
  return value === "light" || value === "dark" ? value : "system";
}

function getAppearance() {
  return preference(document.documentElement.dataset.appearance);
}

function subscribe(onChange: () => void) {
  const root = document.documentElement;
  const observer = new MutationObserver(onChange);
  observer.observe(root, { attributeFilter: ["data-appearance"] });

  function syncTabs(event: StorageEvent) {
    if (event.key === storageKey || event.key === null) {
      root.dataset.appearance = preference(event.newValue);
    }
  }

  window.addEventListener("storage", syncTabs);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", syncTabs);
  };
}

const systemThemeQuery = "(prefers-color-scheme: dark)";

function getSystemDark() {
  return window.matchMedia(systemThemeQuery).matches;
}

function subscribeToSystem(onChange: () => void) {
  const query = window.matchMedia(systemThemeQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function setAppearance(value: Appearance) {
  document.documentElement.dataset.appearance = value;
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    // The current tab can still change appearance if storage is unavailable.
  }
}

export default function AppearanceToggle() {
  const appearance = useSyncExternalStore(subscribe, getAppearance, () => "system" as const);
  const systemDark = useSyncExternalStore(subscribeToSystem, getSystemDark, () => false);
  const dark = appearance === "dark" || (appearance === "system" && systemDark);
  const nextTheme = dark ? "light" : "dark";
  const matchesSystem = (nextTheme === "dark") === systemDark;
  const action = `Switch to ${nextTheme} mode`;

  return (
    <button
      type="button"
      className={styles.appearance}
      aria-label={action}
      title={action}
      onClick={() => setAppearance(matchesSystem ? "system" : nextTheme)}
    >
      <span aria-hidden="true">{dark ? "☀︎" : "☾"}</span>
    </button>
  );
}
