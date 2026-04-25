import React from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="container-page py-24 text-center">
      <p className="text-sm font-semibold text-brand-300">404</p>
      <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
        Page not found
      </h1>
      <p className="mt-2 text-slate-400">
        That route doesn't exist. Let's get you back on track.
      </p>
      <Link to="/" className="btn-primary mt-6 inline-flex">
        Back home
      </Link>
    </main>
  );
}
