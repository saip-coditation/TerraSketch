import React, { useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const links = [
  { to: "/generate", label: "Generate" },
  { to: "/history", label: "History" },
  { to: "/docs", label: "Docs" },
];

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, signOut, ready } = useAuth();

  return (
    <header className="safe-top sticky top-0 z-40 border-b border-white/5 bg-ink-950/90 backdrop-blur-xl">
      <div className="container-page flex h-14 min-w-0 items-center justify-between gap-2 sm:h-16">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2 font-display font-semibold tracking-tight"
          onClick={() => setMenuOpen(false)}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-glow ring-1 ring-white/10">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <path
                d="M4 17 10 7l4 7 6-9"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="truncate text-base sm:text-lg">
            Terra<span className="text-brand-300">Sketch</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `tab ${isActive ? "tab-active" : ""}`}>
              {l.label}
            </NavLink>
          ))}
          {ready && user ? (
            <>
              <span className="ml-2 max-w-[10rem] truncate text-xs text-slate-400" title={user.email}>
                {user.email}
              </span>
              <button type="button" className="btn-ghost ml-1 text-xs" onClick={() => signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <Link to="/signin" className="btn-ghost ml-1 text-sm">
              Sign in
            </Link>
          )}
          <Link to="/generate" className="btn-primary ml-2">
            Try it now
          </Link>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <Link
            to="/generate"
            className="btn-primary px-3 py-2.5 text-xs sm:text-sm"
            onClick={() => setMenuOpen(false)}
          >
            Generate
          </Link>
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-200"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          id="mobile-nav"
          className="safe-bottom border-t border-white/10 bg-ink-950/98 px-3 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)] md:hidden"
        >
          <nav className="flex flex-col gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex min-h-[48px] items-center rounded-xl px-4 text-base font-medium ${
                    isActive ? "bg-white/10 text-white" : "text-slate-300"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
            {ready && user ? (
              <>
                <p className="mt-2 break-all px-4 text-xs text-slate-500">{user.email}</p>
                <button
                  type="button"
                  className="btn-secondary mt-2 w-full justify-center py-3.5"
                  onClick={() => {
                    signOut();
                    setMenuOpen(false);
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to="/signin"
                className="btn-secondary mt-2 w-full justify-center py-3.5"
                onClick={() => setMenuOpen(false)}
              >
                Sign in
              </Link>
            )}
            <Link
              to="/generate"
              className="btn-primary mt-2 w-full justify-center py-3.5"
              onClick={() => setMenuOpen(false)}
            >
              Open studio
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
