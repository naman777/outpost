const PATHS = {
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  mail: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm0 2 8 6 8-6",
  compose: "m15 4 5 5M4 20l5-1L21 7a2.1 2.1 0 0 0-5-3L4 16l-1 5 1-1Z",
  bulk: "M4 8h13v12H4zM7 5h13v12M10 2h12v12M5 10l5.5 4L16 10",
  insights: "M4 4v16h17M8 16v-5M13 16V7M18 16v-8",
  applications: "M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M3 6h18v14H3zM3 11l9 3 9-3M10 14h4",
  accounts: "M4 3h16v8H4zM4 15h16v6H4zM7 7h.01M7 18h.01M11 7h6M11 18h6",
  settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
  github: "M9 19c-4 1-4-2-6-2m12 5v-4a3.5 3.5 0 0 0-1-3c3 0 6-1 6-5a4 4 0 0 0-1-3 4 4 0 0 0 0-3s-1 0-3 1a11 11 0 0 0-6 0C8 4 7 4 7 4a4 4 0 0 0 0 3 4 4 0 0 0-1 3c0 4 3 5 6 5a3.5 3.5 0 0 0-1 3v4",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  logout: "M9 4H4v16h5M10 12h11m-4-4 4 4-4 4",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M6 18 18 6",
  sun: "M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  moon: "M20 15A8 8 0 0 1 9 4a8.5 8.5 0 1 0 11 11Z",
  monitor: "M3 4h18v13H3zM8 21h8M12 17v4",
  upload: "M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5",
  check: "m5 12 4 4L19 6",
  refresh: "M20 8a8 8 0 1 0 0 8M20 3v5h-5",
  reply: "m9 5-6 6 6 6M3 11h10a7 7 0 0 1 7 7",
  click: "m5 3 14 9-7 1-3 7-4-17Zm8 11 5 6",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
} as const;

export type IconName = keyof typeof PATHS;
export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`icon ${className}`}><path d={PATHS[name]} /></svg>;
}
