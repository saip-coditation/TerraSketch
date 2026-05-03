import { useCallback, useEffect, useRef, useState } from "react";

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function pickRecognitionLang() {
  const raw = navigator.language || navigator.userLanguage || "en-US";
  return String(raw).replace(/_/g, "-");
}

/**
 * Web Speech API helper: restarts sessions when the browser ends recognition
 * (silence timeout, mobile quirks) while the user keeps the mic "on".
 */
export function useVoiceToText(appendToText) {
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState(null);

  const wantMicRef = useRef(false);
  const recognitionRef = useRef(null);
  const restartTimerRef = useRef(null);
  const appendRef = useRef(appendToText);
  appendRef.current = appendToText;

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current != null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    wantMicRef.current = false;
    clearRestartTimer();
    const r = recognitionRef.current;
    recognitionRef.current = null;
    if (r) {
      try {
        r.onend = null;
        r.onerror = null;
        r.onresult = null;
        r.abort();
      } catch {
        try {
          r.stop();
        } catch {
          /* ignore */
        }
      }
    }
    setListening(false);
  }, [clearRestartTimer]);

  const startSessionRef = useRef(() => {});

  startSessionRef.current = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || !wantMicRef.current) return;

    let rec;
    try {
      rec = new Ctor();
    } catch {
      setHint("Could not start speech recognition.");
      stop();
      return;
    }

    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.lang = pickRecognitionLang();

    rec.onresult = (event) => {
      let finalChunk = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const piece = (res[0] && res[0].transcript) || "";
        if (res.isFinal) finalChunk += piece;
        else interim += piece;
      }
      if (interim.trim()) {
        setHint(`Listening… ${interim.trim()}`);
      }
      const trimmed = finalChunk.trim();
      if (trimmed) {
        appendRef.current((prev) => {
          const base = prev.trimEnd();
          const needsSpace = base.length > 0 && !/\s$/.test(base);
          return base + (needsSpace ? " " : "") + trimmed;
        });
        if (wantMicRef.current) {
          setHint("Listening… tap mic to stop.");
        }
      }
    };

    rec.onerror = (ev) => {
      if (!wantMicRef.current) return;
      const err = ev.error || "unknown";

      if (err === "aborted") return;

      if (err === "no-speech") {
        setHint("No speech detected — speak again or move closer to the mic.");
        clearRestartTimer();
        restartTimerRef.current = setTimeout(() => startSessionRef.current(), 350);
        return;
      }

      if (err === "audio-capture") {
        setHint("No microphone — check it is plugged in and allowed.");
        stop();
        return;
      }

      if (err === "not-allowed" || err === "service-not-allowed") {
        setHint("Microphone blocked — allow mic for this site in browser settings.");
        stop();
        return;
      }

      if (err === "network") {
        setHint("Voice service unreachable — check Wi‑Fi/data and try again.");
        clearRestartTimer();
        restartTimerRef.current = setTimeout(() => startSessionRef.current(), 800);
        return;
      }

      setHint(`Voice paused (${err}) — retrying…`);
      clearRestartTimer();
      restartTimerRef.current = setTimeout(() => startSessionRef.current(), 500);
    };

    rec.onend = () => {
      recognitionRef.current = null;
      if (!wantMicRef.current) {
        setListening(false);
        return;
      }
      // Browsers end the session after silence; start a fresh one while mic stays on.
      clearRestartTimer();
      restartTimerRef.current = setTimeout(() => {
        if (wantMicRef.current) startSessionRef.current();
      }, 120);
    };

    try {
      recognitionRef.current = rec;
      rec.start();
    } catch {
      clearRestartTimer();
      restartTimerRef.current = setTimeout(() => {
        if (wantMicRef.current) startSessionRef.current();
      }, 250);
    }
  };

  const start = useCallback(async () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setHint("Voice needs Chrome, Edge, or Safari with microphone access.");
      return;
    }

    if (wantMicRef.current) return;

    wantMicRef.current = true;
    setListening(true);
    setHint("Allow the mic if asked, then speak…");

    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch {
      wantMicRef.current = false;
      setListening(false);
      setHint("Microphone permission denied — allow the mic, then tap again.");
      return;
    }

    setHint("Listening… speak clearly. Tap mic to stop.");
    startSessionRef.current();
  }, []);

  const toggle = useCallback(() => {
    if (wantMicRef.current) {
      stop();
      setHint(null);
      return;
    }
    start();
  }, [start, stop]);

  useEffect(() => () => stop(), [stop]);

  return {
    supported: Boolean(getSpeechRecognitionCtor()),
    listening,
    hint,
    toggle,
    stop,
    setHint,
  };
}
