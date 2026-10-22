export default async function Login({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const error = sp.error === "wrong" ? "Wrong password." : sp.error === "nopassword" ? "Set DASHBOARD_PASSWORD in the environment first." : null;
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form action="/api/auth/login" method="post" className="card w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <h1 className="font-semibold tracking-tight">MailPulse</h1>
        </div>
        <input type="hidden" name="next" value={typeof sp.next === "string" ? sp.next : "/"} />
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" className="input" autoFocus required />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn w-full">Sign in</button>
      </form>
    </div>
  );
}
