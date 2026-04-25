import React from "react";
import { NavLink, Link } from "react-router-dom";

const links = [
  { to: "/generate", label: "Generate" },
  { to: "/history", label: "History" },
  { to: "/docs", label: "Docs" },
];

export default function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/70 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-glow">
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
          <span className="text-lg tracking-tight">
            Terra<span className="text-brand-300">Sketch</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `tab ${isActive ? "tab-active" : ""}`
              }
            >
              {l.label}
            </NavLink>
          ))}
          <Link to="/generate" className="btn-primary ml-2 hidden sm:inline-flex">
            Try it now
          </Link>
        </nav>
      </div>
    </header>
  );
}
