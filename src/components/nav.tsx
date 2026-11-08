"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icon";

export const NAV_ITEMS: { href: string; label: string; icon: IconName; group: string }[] = [
  { href: "/", label: "Overview", icon: "overview", group: "Workspace" },
  { href: "/messages", label: "Sent mail", icon: "mail", group: "Workspace" },
  { href: "/compose", label: "Compose", icon: "compose", group: "Workspace" },
  { href: "/bulk", label: "Bulk mail", icon: "bulk", group: "Workspace" },
  { href: "/insights", label: "Content insights", icon: "insights", group: "Workspace" },
  { href: "/applications", label: "Applications", icon: "applications", group: "Workspace" },
  { href: "/accounts", label: "Mailboxes", icon: "accounts", group: "Configuration" },
  { href: "/settings", label: "Settings & API", icon: "settings", group: "Configuration" },
];

export function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return <nav aria-label="Dashboard" className="workspace-nav">
    {["Workspace", "Configuration"].map((group) => <div className="nav-group" key={group}>
      <p className="nav-group-label">{group}</p>
      {NAV_ITEMS.filter((item) => item.group === group).map((item) => {
        const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
        return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`nav-link ${active ? "is-active" : ""}`}><Icon name={item.icon} /><span>{item.label}</span>{active && <span className="nav-active-dot" />}</Link>;
      })}
    </div>)}
  </nav>;
}
