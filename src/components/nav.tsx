"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/messages", label: "Sent mail" },
  { href: "/compose", label: "Compose" },
  { href: "/bulk", label: "Bulk mail" },
  { href: "/insights", label: "Content insights" },
  { href: "/applications", label: "Applications" },
  { href: "/accounts", label: "Mailboxes" },
  { href: "/settings", label: "Settings & API" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Dashboard" className="grid grid-cols-4 gap-1 md:flex md:flex-col">
      {ITEMS.map((i) => {
        const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`grid min-h-11 place-items-center rounded-lg px-1.5 py-2 text-center text-xs font-medium leading-tight md:justify-items-start md:px-3 md:text-left md:text-sm ${active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"}`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
