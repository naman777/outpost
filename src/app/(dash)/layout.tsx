import { Nav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";
// "Check for replies" runs inside these pages; a first IMAP scan of a busy inbox can take a minute or more.
export const maxDuration = 300;

export default function DashLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col md:flex-row">
      <aside className="border-b border-zinc-200 bg-white p-3 md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r md:p-4">
        <div className="mb-3 flex items-center justify-between md:mb-6">
          <div className="flex items-center gap-2 px-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="font-semibold tracking-tight">Outpost</span>
          </div>
          <div className="flex items-center gap-3 md:hidden">
            <ThemeToggle />
            <form action="/api/auth/logout" method="post">
              <button className="min-h-11 px-2 text-xs text-zinc-600 hover:text-zinc-900 md:min-h-0 md:px-0">Log out</button>
            </form>
          </div>
        </div>
        <Nav />
        <div className="mt-6 hidden flex-col items-start gap-2 px-3 md:flex">
          <ThemeToggle />
          <form action="/api/auth/logout" method="post">
            <button className="min-h-11 px-2 text-xs text-zinc-600 hover:text-zinc-900 md:min-h-0 md:px-0">Log out</button>
          </form>
        </div>
      </aside>
      <main className="dashboard min-w-0 flex-1 px-3 py-5 sm:px-5 md:p-8">{children}</main>
    </div>
  );
}
