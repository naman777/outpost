import { Icon } from "@/components/icon";
import { Logo } from "@/components/logo";

export default async function Login({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const error = sp.error === "wrong" ? "Wrong password." : sp.error === "nopassword" ? "Set DASHBOARD_PASSWORD in the environment first." : null;
  return (
    <div className="login-page">
      <section className="login-story">
        <a href="https://github.com/naman777/outpost" className="brand"><Logo /></a>
        <div className="login-intro"><p className="login-eyebrow">Personal outreach, on your terms.</p><h2>A clearer view of your outreach.</h2><p>Send personalized emails, follow the signals, and keep your applications organized in your own workspace.</p><div className="login-features"><span><Icon name="mail" />Email tracking</span><span><Icon name="bulk" />Bulk sending</span><span><Icon name="applications" />Applications</span></div></div>
        <p className="login-story-footer">Open source. Self-hosted. Yours to make your own.</p>
      </section>
      <div className="login-form-area"><form action="/api/auth/login" method="post" className="login-form">
        <h1>Welcome back</h1>
        <p>Sign in to your Outpost workspace to pick up where you left off.</p>
        <input type="hidden" name="next" value={typeof sp.next === "string" ? sp.next : "/"} />
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" className="input" placeholder="Enter your dashboard password" autoComplete="current-password" autoFocus required />
        </div>
        {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
        <button className="btn">Sign in<Icon name="arrow" /></button>
        <small>This is a private workspace. Use the password for this installation.</small>
      </form></div>
    </div>
  );
}
