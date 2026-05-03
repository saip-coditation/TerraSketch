import React, { useEffect, useMemo, useState } from "react";
import FileTab from "./FileTab.jsx";
import MonacoPane from "./MonacoPane.jsx";
import Button from "../shared/Button.jsx";
import { copyToClipboard, downloadTextFile, downloadZip } from "../../utils/downloadZip.js";

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

  useEffect(() => {
    if (ordered.length && !ordered.includes(active)) {
      setActive(ordered[0]);
    }
  }, [ordered, active]);

  if (!files || ordered.length === 0) {
    return (
      <div className="card p-6 text-sm text-slate-400">No files generated yet.</div>
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

  const handleDownloadFile = () => {
    downloadTextFile(active, currentContent);
  };

  return (
    <div className="card min-w-0 space-y-3 p-3 sm:p-4">
      <div className="flex min-w-0 flex-col gap-3 px-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="-mx-1 flex max-w-full snap-x snap-mandatory gap-1 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:overflow-visible">
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
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
          <Button variant="secondary" className="w-full justify-center sm:w-auto" onClick={handleCopy}>
            {copyState === "copied" ? "Copied!" : copyState === "error" ? "Copy failed" : "Copy file"}
          </Button>
          <Button variant="secondary" className="w-full justify-center sm:w-auto" onClick={handleDownloadFile}>
            Download file
          </Button>
          <Button className="w-full justify-center sm:w-auto" onClick={handleDownload}>
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
            ZIP
          </Button>
        </div>
      </div>

      <MonacoPane value={currentContent} language="hcl" />
    </div>
  );
}
