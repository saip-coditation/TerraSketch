import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function SignIn() {
  const navigate = useNavigate();
  const { signIn, signUp, user, ready, signOut } = useAuth();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUp({
          email: email.trim(),
          password,
          name: name.trim() || null,
          marketing_opt_in: marketingOptIn,
        });
      } else {
        await signIn(email.trim(), password);
      }
      navigate("/generate", { replace: true });
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (ready && user) {
    return (
      <main className="container-page min-w-0 py-10 sm:py-14">
        <div className="card mx-auto max-w-md p-6 sm:p-8">
          <h1 className="heading-display text-xl text-white sm:text-2xl">You&apos;re signed in</h1>
          <p className="mt-2 break-all text-sm text-slate-400">{user.email}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link to="/generate" className="btn-primary w-full justify-center py-3.5 sm:w-auto sm:py-2">
              Open studio
            </Link>
            <button
              type="button"
              className="btn-secondary w-full justify-center py-3.5 sm:w-auto sm:py-2"
              onClick={() => signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container-page min-w-0 py-8 sm:py-14">
      <div className="mx-auto min-w-0 max-w-md">
        <header className="mb-6">
          <h1 className="heading-display text-2xl text-white sm:text-3xl">Account</h1>
          <p className="mt-2 text-sm text-slate-400">
            Sign in to save generations to your email. We&apos;ll only use it for product updates if
            you opt in — never sold.
          </p>
        </header>

        <div className="mb-4 flex min-w-0 rounded-xl border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            className={`min-h-[44px] flex-1 rounded-lg px-2 py-2 text-center text-xs font-medium sm:text-sm ${
              mode === "signin" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
            }`}
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`min-h-[44px] flex-1 rounded-lg px-2 py-2 text-center text-xs font-medium sm:text-sm ${
              mode === "signup" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
            }`}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
          >
            Create account
          </button>
        </div>

        {mode === "signup" && (
          <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-white/20 bg-ink-900 text-brand-500"
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
            />
            <span>
              Email me occasional product updates and tips (optional). You can change your mind
              anytime.
            </span>
          </label>
        )}

        <div className="card-glow space-y-4 p-5 sm:p-7">
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200"
            >
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Name (optional)</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Ada"
                />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Email</label>
              <input
                className="input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Password</label>
              <input
                className="input"
                type="password"
                required
                minLength={mode === "signup" ? 8 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder="At least 8 characters"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="btn-primary w-full justify-center py-3.5 disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          <Link to="/" className="link">
            Back home
          </Link>
        </p>
      </div>
    </main>
  );
}
