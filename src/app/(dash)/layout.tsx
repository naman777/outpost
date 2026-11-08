import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";
// Mailbox sync can take longer on busy inboxes.
export const maxDuration = 300;

export default function DashLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
