"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Nav, NAV_ITEMS } from "./nav";
import { Icon } from "./icon";
import { ThemeToggle } from "./theme-toggle";
import { Logo } from "./logo";

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const current = NAV_ITEMS.find((item) => item.href === "/" ? path === "/" : path.startsWith(item.href));
  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <aside className={`app-sidebar ${open ? "nav-open" : ""}`}>
      <div className="sidebar-brand-row">
        <Link href="/" className="brand" aria-label="Outpost overview"><Logo /></Link>
        <button className="mobile-menu icon-button" aria-expanded={open} aria-controls="sidebar-navigation" aria-label={open ? "Close navigation" : "Open navigation"} onClick={() => setOpen(!open)}><Icon name={open ? "close" : "menu"} /></button>
      </div>
      <div id="sidebar-navigation" className="sidebar-navigation"><Nav onNavigate={() => setOpen(false)} /></div>
      <div className="sidebar-footer">
        <span className="workspace-label"><span className="workspace-initial">O</span><span>Your workspace<small>Self-hosted · MIT licensed</small></span></span>
        <a href="https://github.com/naman777/outpost" target="_blank" rel="noreferrer" className="sidebar-source">Built in the open<Icon name="arrow" /></a>
      </div>
    </aside>
    <div className="app-workspace">
      <header className="workspace-topbar">
        <nav aria-label="Breadcrumb" className="breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><span>{current?.label || "Message details"}</span>{path.split("/").filter(Boolean).length > 1 && <><span aria-hidden="true">/</span><span>Details</span></>}</nav>
        <div className="workspace-tools">
          <a className="source-link" href="https://github.com/naman777/outpost" target="_blank" rel="noreferrer"><Icon name="github" /><span>GitHub</span></a>
          <ThemeToggle />
          <form action="/api/auth/logout" method="post"><button className="logout-button" title="Log out"><Icon name="logout" /><span>Log out</span></button></form>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="dashboard app-content">{children}</main>
      <footer className="workspace-bottom"><span>Outpost</span><span>Made for thoughtful outreach.</span><a href="https://github.com/naman777/outpost/blob/main/docs/open-tracking.md" target="_blank" rel="noreferrer">About tracking estimates <span aria-hidden="true">↗</span></a></footer>
    </div>
  </div>;
}
