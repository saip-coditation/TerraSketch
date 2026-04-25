import React, { useCallback, useRef, useState } from "react";
import { fileToBase64 } from "../../utils/imageToBase64.js";

export default function UploadZone({ value, onChange, onError }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = useCallback(
    async (files) => {
      const file = files?.[0];
      if (!file) return;
      try {
        const result = await fileToBase64(file);
        onChange(result);
      } catch (err) {
        onError?.(err.message || "Failed to read file");
      }
    },
    [onChange, onError]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const isPreviewableImage =
    value && typeof value.dataUrl === "string" && value.dataUrl.startsWith("data:image/");

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition ${
          dragOver
            ? "border-brand-400 bg-brand-400/10"
            : "border-white/15 bg-ink-900/40 hover:border-white/25 hover:bg-white/5"
        }`}
      >
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-white/5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-brand-300"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </span>
        <p className="text-sm font-medium text-white">
          Drag &amp; drop your diagram or click to browse
        </p>
        <p className="mt-1 text-xs text-slate-400">
          PNG, JPG, WEBP, GIF, PDF, or draw.io XML — up to 8MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,application/xml,.drawio,.xml"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </button>

      {value && (
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-ink-900/60 p-3">
          <div className="flex min-w-0 items-center gap-3">
            {isPreviewableImage ? (
              <img
                src={value.dataUrl}
                alt="diagram preview"
                className="h-12 w-12 rounded-lg border border-white/10 object-cover"
              />
            ) : (
              <span className="grid h-12 w-12 place-items-center rounded-lg border border-white/10 bg-white/5 text-xs font-semibold text-slate-300">
                {(value.name?.split(".").pop() || "FILE").slice(0, 5).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{value.name}</p>
              <p className="text-xs text-slate-400">
                {(value.size / 1024).toFixed(1)} KB · {value.type || "unknown"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="btn-ghost text-xs"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
