"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "./icon";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];
const LABEL: Record<Theme, string> = { system: "System theme", light: "Light", dark: "Dark" };

/** Sets data-theme on <html>; "system" removes it so the OS preference applies. */
function apply(t: Theme) {
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
function read(): Theme {
  try {
    const saved = localStorage.getItem("mp-theme") as Theme | null;
    return saved && ORDER.includes(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);

  function next() {
    const t = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    apply(t);
    try {
      localStorage.setItem("mp-theme", t);
    } catch {}
    listeners.forEach((fn) => fn());
  }

  return (
    <button onClick={next} className="theme-button" title="Switch theme" aria-label={`Switch theme, currently ${LABEL[theme].toLowerCase()}`}>
      <Icon name={theme === "dark" ? "moon" : theme === "light" ? "sun" : "monitor"} /><span>{LABEL[theme]}</span>
    </button>
  );
}

/** Runs before paint so a saved theme never flashes the other one. */
export const themeScript = `try{var t=localStorage.getItem("mp-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
