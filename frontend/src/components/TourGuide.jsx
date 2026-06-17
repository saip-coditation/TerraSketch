import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import Joyride, { STATUS } from "react-joyride";
import { stepsForPath, greetingForPath } from "../data/tourSteps.js";

const SEEN_KEY = "terrasketch.tourSeen";

const JOYRIDE_STYLES = {
  options: {
    primaryColor: "#0ea5e9",
    backgroundColor: "#0b1120",
    arrowColor: "#0b1120",
    textColor: "#e2e8f0",
    overlayColor: "rgba(2, 6, 23, 0.72)",
    zIndex: 10000,
  },
  tooltip: { borderRadius: 16, padding: 18, border: "1px solid rgba(255,255,255,0.1)" },
  tooltipTitle: { fontSize: 16, fontWeight: 700 },
  tooltipContent: { fontSize: 14, lineHeight: 1.55, color: "#cbd5e1" },
  buttonNext: { borderRadius: 10, fontSize: 13, fontWeight: 600, padding: "8px 14px" },
  buttonBack: { color: "#94a3b8", fontSize: 13, marginRight: 8 },
  buttonSkip: { color: "#64748b", fontSize: 13 },
  spotlight: { borderRadius: 12 },
};

export default function TourGuide() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState(false);
  const [steps, setSteps] = useState([]);
  const [seen, setSeen] = useState(true);

  // First-ever visit: gently surface the helper.
  useEffect(() => {
    let alreadySeen = true;
    try {
      alreadySeen = window.localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* ignore */
    }
    setSeen(alreadySeen);
    if (!alreadySeen) {
      const t = setTimeout(() => setOpen(true), 1200);
      return () => clearTimeout(t);
    }
  }, []);

  // Stop any running tour and close the popover when the route changes.
  useEffect(() => {
    setRun(false);
    setOpen(false);
  }, [location.pathname]);

  const greeting = useMemo(() => greetingForPath(location.pathname), [location.pathname]);

  const markSeen = () => {
    setSeen(true);
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const startTour = () => {
    markSeen();
    setOpen(false);
    // Keep only steps whose target exists right now (body steps always pass).
    const available = stepsForPath(location.pathname).filter(
      (s) => s.target === "body" || document.querySelector(s.target)
    );
    setSteps(available.length ? available : stepsForPath(location.pathname));
    // Defer so the popover unmounts before the overlay appears.
    setTimeout(() => setRun(true), 50);
  };

  const handleCallback = (data) => {
    const { status } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false);
    }
  };

  const toggleOpen = () => {
    markSeen();
    setOpen((o) => !o);
  };

  return (
    <>
      <Joyride
        steps={steps}
        run={run}
        continuous
        showProgress
        showSkipButton
        scrollToFirstStep
        disableScrollParentFix
        locale={{ last: "Done", skip: "Skip" }}
        styles={JOYRIDE_STYLES}
        callback={handleCallback}
      />

      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6 print:hidden">
        {/* Greeting / launcher popover */}
        {open && (
          <div className="w-72 origin-bottom-right rounded-2xl border border-white/10 bg-ink-900/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-glow ring-1 ring-white/10">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 17 10 7l4 7 6-9" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">TerraSketch Guide</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{greeting}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-white"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <button type="button" onClick={startTour} className="btn-primary mt-3 w-full justify-center py-2.5 text-sm">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Take the tour
            </button>
          </div>
        )}

        {/* Floating launcher button */}
        <button
          type="button"
          onClick={toggleOpen}
          aria-label="Open the product tour guide"
          className={`group relative grid h-[52px] w-[52px] place-items-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-glow ring-1 ring-white/10 transition hover:scale-105 active:scale-95 ${
            !seen ? "animate-bounce" : ""
          }`}
        >
          {!seen && (
            <span className="absolute inset-0 animate-ping rounded-full bg-brand-400/40" aria-hidden />
          )}
          {open ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="relative">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="relative">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <circle cx="9" cy="10" r="0.5" fill="currentColor" />
              <circle cx="12" cy="10" r="0.5" fill="currentColor" />
              <circle cx="15" cy="10" r="0.5" fill="currentColor" />
            </svg>
          )}
        </button>
      </div>
    </>
  );
}
