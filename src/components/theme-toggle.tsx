"use client";

import { useSyncExternalStore } from "react";

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
    <button onClick={next} className="min-h-11 px-2 text-xs text-zinc-600 hover:text-zinc-900 md:min-h-0 md:px-0" title="Switch theme">
      {theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐"} {LABEL[theme]}
    </button>
  );
}

/** Runs before paint so a saved theme never flashes the other one. */
export const themeScript = `try{var t=localStorage.getItem("mp-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
