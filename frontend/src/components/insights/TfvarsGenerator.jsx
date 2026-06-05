import React, { useMemo, useState } from "react";

// ── Parse variables.tf ───────────────────────────────────────────────────────

function parseVariables(variablesTf = "") {
  const vars = [];
  const blockRe = /variable\s+"([^"]+)"\s*\{([^}]*)\}/g;
  let match;
  while ((match = blockRe.exec(variablesTf)) !== null) {
    const name = match[1];
    const body = match[2];

    const typeMatch   = body.match(/type\s*=\s*([^\n#]+)/);
    const defaultMatch = body.match(/default\s*=\s*([^\n#]+)/);
    const descMatch   = body.match(/description\s*=\s*"([^"]*)"/);

    const rawType    = typeMatch    ? typeMatch[1].trim()    : "string";
    const rawDefault = defaultMatch ? defaultMatch[1].trim() : "";
    const desc       = descMatch    ? descMatch[1]           : "";

    // Simplify type for display
    let type = "string";
    if (/^number/.test(rawType))  type = "number";
    else if (/^bool/.test(rawType)) type = "bool";
    else if (/^list/.test(rawType)) type = "list";
    else if (/^map/.test(rawType))  type = "map";

    // Stringify default for display
    let defaultValue = "";
    if (rawDefault) {
      defaultValue = rawDefault.replace(/^"(.*)"$/, "$1");
      if (defaultValue === "null") defaultValue = "";
    }

    vars.push({ name, type, defaultValue, desc, rawType });
  }
  return vars;
}

function renderTfvars(vars, values) {
  return vars
    .map(({ name, type, rawType }) => {
      const val = values[name] ?? "";
      let rendered;
      if (type === "bool") {
        rendered = val === "true" || val === true ? "true" : "false";
      } else if (type === "number") {
        rendered = val === "" ? "0" : val;
      } else if (type === "list") {
        rendered = val.trim() ? `[${val.split(",").map((v) => `"${v.trim()}"`).join(", ")}]` : "[]";
      } else if (type === "map") {
        rendered = val.trim() || "{}";
      } else {
        rendered = `"${val}"`;
      }
      return `${name} = ${rendered}`;
    })
    .join("\n");
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default function TfvarsGenerator({ files = {} }) {
  const variablesTf = files["variables.tf"] || "";
  const vars = useMemo(() => parseVariables(variablesTf), [variablesTf]);

  const [values, setValues] = useState(() =>
    Object.fromEntries(vars.map((v) => [v.name, v.defaultValue]))
  );
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState(false);

  const tfvarsContent = useMemo(() => renderTfvars(vars, values), [vars, values]);

  if (vars.length === 0) return null;

  const handleChange = (name, val) => setValues((prev) => ({ ...prev, [name]: val }));

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tfvarsContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleDownload = () => {
    const blob = new Blob([tfvarsContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "terraform.tfvars";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card p-4">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-base">📝</span>
        <h3 className="flex-1 text-xs font-semibold uppercase tracking-wider text-slate-300">
          tfvars Generator
        </h3>
        <span className="mr-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold text-brand-300">
          {vars.length} var{vars.length !== 1 ? "s" : ""}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <p className="mt-1 text-[11px] text-slate-500">
        Fill in values to generate a ready-to-use <code className="text-slate-400">terraform.tfvars</code>.
      </p>

      {expanded && (
        <div className="mt-3 space-y-3">
          {vars.map((v) => (
            <div key={v.name}>
              <label className="mb-1 flex items-baseline gap-1.5">
                <span className="text-xs font-medium text-slate-200">{v.name}</span>
                <span className="rounded bg-ink-700 px-1 py-0.5 font-mono text-[10px] text-slate-400">
                  {v.rawType}
                </span>
              </label>
              {v.desc && (
                <p className="mb-1 text-[11px] text-slate-500 leading-snug">{v.desc}</p>
              )}
              {v.type === "bool" ? (
                <select
                  className="input w-full text-xs py-1.5"
                  value={values[v.name] ?? "false"}
                  onChange={(e) => handleChange(v.name, e.target.value)}
                >
                  <option value="false">false</option>
                  <option value="true">true</option>
                </select>
              ) : v.type === "list" ? (
                <input
                  type="text"
                  className="input w-full text-xs py-1.5"
                  placeholder="val1, val2, val3"
                  value={values[v.name] ?? ""}
                  onChange={(e) => handleChange(v.name, e.target.value)}
                />
              ) : v.type === "map" ? (
                <textarea
                  className="textarea w-full text-xs min-h-[60px] font-mono"
                  placeholder={'{\n  key = "value"\n}'}
                  value={values[v.name] ?? ""}
                  onChange={(e) => handleChange(v.name, e.target.value)}
                />
              ) : (
                <input
                  type={v.type === "number" ? "number" : "text"}
                  className="input w-full text-xs py-1.5"
                  placeholder={v.defaultValue || `Enter ${v.name}…`}
                  value={values[v.name] ?? ""}
                  onChange={(e) => handleChange(v.name, e.target.value)}
                />
              )}
            </div>
          ))}

          <div className="pt-1">
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              className="mb-2 text-[11px] text-brand-300 hover:text-brand-200 transition-colors"
            >
              {preview ? "Hide preview" : "Show preview"}
            </button>
            {preview && (
              <pre className="mb-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-[11px] font-mono text-slate-300 leading-relaxed whitespace-pre-wrap">
                {tfvarsContent || "# (no variables)"}
              </pre>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="btn-secondary flex items-center gap-1.5 py-1.5 px-3 text-xs"
              >
                <CopyIcon />
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="btn-secondary flex items-center gap-1.5 py-1.5 px-3 text-xs"
              >
                <DownloadIcon />
                Download .tfvars
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
