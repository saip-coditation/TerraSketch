import React, { useMemo, useState } from "react";
import FileTab from "./FileTab.jsx";
import MonacoPane from "./MonacoPane.jsx";
import Button from "../shared/Button.jsx";
import { copyToClipboard, downloadZip } from "../../utils/downloadZip.js";

const FILE_ORDER = ["main.tf", "variables.tf", "outputs.tf", "providers.tf"];

export default function CodeViewer({ files }) {
  const ordered = useMemo(() => {
    if (!files) return [];
    const known = FILE_ORDER.filter((name) => files[name]);
    const extras = Object.keys(files).filter((name) => !FILE_ORDER.includes(name));
    return [...known, ...extras];
  }, [files]);

  const [active, setActive] = useState(ordered[0] || "main.tf");
  const [copyState, setCopyState] = useState("idle");

  if (!files || ordered.length === 0) {
    return (
      <div className="card p-6 text-sm text-slate-400">
        No files generated yet.
      </div>
    );
  }

  const currentContent = files[active] || "";
  const lineCount = (name) => (files[name] || "").split("\n").length;

  const handleCopy = async () => {
    try {
      await copyToClipboard(currentContent);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 1500);
    }
  };

  const handleDownload = async () => {
    await downloadZip(files, "terrasketch.zip");
  };

  return (
    <div className="card p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex flex-wrap items-center gap-1">
          {ordered.map((name) => (
            <FileTab
              key={name}
              name={name}
              active={active === name}
              onClick={() => setActive(name)}
              lines={lineCount(name)}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleCopy}>
            {copyState === "copied" ? "Copied!" : "Copy file"}
          </Button>
          <Button onClick={handleDownload}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download ZIP
          </Button>
        </div>
      </div>

      <MonacoPane value={currentContent} language="hcl" />
    </div>
  );
}
