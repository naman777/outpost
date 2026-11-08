import Link from "next/link";
import { Icon } from "@/components/icon";

export default function NotFound() {
  return <main className="flex min-h-[65dvh] flex-col items-center justify-center px-6 py-16 text-center">
    <span className="brand-mark mb-6"><Icon name="mail" /></span>
    <p className="mb-3 font-mono text-xs text-zinc-500">404 / OUTPOST</p>
    <h1 className="page-title">Page not found</h1>
    <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-500">This page could not be found. The link may have changed, or the record may have been deleted.</p>
    <div className="mt-7 flex flex-wrap justify-center gap-3"><Link href="/" className="btn">Back to overview<Icon name="arrow" /></Link><Link href="/messages" className="btn-ghost">Sent mail</Link></div>
  </main>;
}
