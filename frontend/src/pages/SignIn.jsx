import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

function GoogleSignInButton({ onSuccess, onError, busy }) {
  const initialized = useRef(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !window.google || initialized.current) return;
    initialized.current = true;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        if (response.credential) onSuccess(response.credential);
        else onError("Google sign-in did not return a credential.");
      },
    });
  }, [onSuccess, onError]);

  const handleClick = () => {
    if (!window.google) return;
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // One Tap was suppressed — open the popup flow instead
        window.google.accounts.oauth2
          ? window.google.accounts.oauth2.initTokenClient({
              client_id: GOOGLE_CLIENT_ID,
              scope: "email profile",
              callback: () => {},
            })
          : onError("Please allow pop-ups for Google Sign-In.");
      }
    });
  };

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="group relative w-full overflow-hidden rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm font-medium text-white transition-all duration-300 hover:border-white/20 hover:bg-white/10 hover:shadow-lg hover:shadow-white/5 active:scale-[0.98] disabled:opacity-60"
    >
      {/* shimmer effect on hover */}
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />

      <span className="relative flex items-center justify-center gap-3">
        {/* Google logo SVG */}
        <svg width="20" height="20" viewBox="0 0 48 48" className="shrink-0">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          <path fill="none" d="M0 0h48v48H0z"/>
        </svg>

        <span className="tracking-wide">Continue with Google</span>
      </span>
    </button>
  );
}

export default function SignIn() {
  const navigate = useNavigate();
  const { signIn, signUp, signInWithGoogle, user, ready, signOut } = useAuth();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gsiLoaded, setGsiLoaded] = useState(!!window.google);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || window.google) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setGsiLoaded(true);
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, []);

  const handleGoogleSuccess = async (idToken) => {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle(idToken);
      navigate("/generate", { replace: true });
    } catch (err) {
      setError(err.message || "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  };

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
    <main className="relative min-w-0 overflow-hidden">
      {/* Decorative background — orbs + subtle grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 top-0 h-80 w-80 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-accent-500/20 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      </div>

      <div className="container-page grid min-w-0 items-center gap-10 py-10 sm:py-14 lg:grid-cols-2 lg:gap-16 lg:py-24">
        {/* Branding panel — large screens only */}
        <section className="hidden min-w-0 lg:block">
          <span className="inline-flex items-center gap-2.5 font-display text-xl font-semibold tracking-tight text-white">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-glow ring-1 ring-white/10">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 17 10 7l4 7 6-9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            Terra<span className="-ml-1 text-brand-300">Sketch</span>
          </span>
          <h2 className="heading-display mt-8 text-4xl leading-tight text-white">
            From diagram to
            <br />
            production Terraform.
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-slate-400">
            Sign in to keep every generation in one place — synced to your email, ready to revisit,
            refine, and ship.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              "Your generation history, synced across devices",
              "Pick up past architectures in one click",
              "Private by default — your email is never sold",
            ].map((feat) => (
              <li key={feat} className="flex items-start gap-3 text-sm text-slate-300">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-500/15 text-brand-300 ring-1 ring-brand-400/30">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                {feat}
              </li>
            ))}
          </ul>
        </section>

        {/* Form column */}
        <div className="mx-auto w-full min-w-0 max-w-md">
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

          {GOOGLE_CLIENT_ID && gsiLoaded && (
            <>
              <GoogleSignInButton
                onSuccess={handleGoogleSuccess}
                onError={(msg) => setError(msg)}
                busy={busy}
              />
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs text-slate-500">or continue with email</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
            </>
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
      </div>
    </main>
  );
}
