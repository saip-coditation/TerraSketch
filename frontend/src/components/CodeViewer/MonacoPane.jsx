import React, { useEffect, useMemo, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";

function useResponsiveEditorLayout(fallbackHeight = 480) {
  const [layout, setLayout] = useState({ height: fallbackHeight, narrow: false });

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      let height = fallbackHeight;
      if (w < 400) height = Math.max(200, Math.round(vh * 0.3));
      else if (w < 640) height = Math.max(240, Math.round(vh * 0.34));
      else if (w < 1024) height = Math.max(320, Math.min(520, Math.round(vh * 0.4)));
      else height = Math.min(560, Math.max(400, Math.round(vh * 0.42)));
      return { height, narrow: w < 640 };
    };
    const apply = () => setLayout(compute());
    apply();
    window.addEventListener("resize", apply);
    window.visualViewport?.addEventListener?.("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener?.("resize", apply);
    };
  }, [fallbackHeight]);

  return layout;
}

let hclRegistered = false;

function registerHcl(monaco) {
  if (hclRegistered) return;
  hclRegistered = true;

  monaco.languages.register({ id: "hcl" });

  monaco.languages.setMonarchTokensProvider("hcl", {
    defaultToken: "",
    tokenPostfix: ".hcl",
    keywords: [
      "resource",
      "variable",
      "output",
      "provider",
      "module",
      "data",
      "locals",
      "terraform",
      "for_each",
      "count",
      "depends_on",
      "true",
      "false",
      "null",
    ],
    operators: ["=", "==", "!=", "<", ">", "<=", ">=", "&&", "||", "!", "?", ":"],
    symbols: /[=><!~?:&|+\-*/^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    tokenizer: {
      root: [
        [/#.*$/, "comment"],
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              "@keywords": "keyword",
              "@default": "identifier",
            },
          },
        ],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, "string", "@string_double"],
        [/\d+\.\d+([eE][\-+]?\d+)?/, "number.float"],
        [/\d+/, "number"],
        [/[{}()\[\]]/, "@brackets"],
        [/[<>](?!@symbols)/, "@brackets"],
        [/@symbols/, { cases: { "@operators": "operator", "@default": "" } }],
        [/[;,.]/, "delimiter"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
      string_double: [
        [/[^\\"$]+/, "string"],
        [/\$\{/, { token: "delimiter.bracket", next: "@interp" }],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/"/, "string", "@pop"],
      ],
      interp: [
        [/\}/, { token: "delimiter.bracket", next: "@pop" }],
        [/[a-zA-Z_]\w*/, "variable"],
        [/[.]/, "delimiter"],
      ],
    },
  });

  monaco.editor.defineTheme("terrasketch-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "7cd3ff", fontStyle: "bold" },
      { token: "string", foreground: "a7f3d0" },
      { token: "number", foreground: "fcd34d" },
      { token: "comment", foreground: "64748b", fontStyle: "italic" },
      { token: "variable", foreground: "c4b5fd" },
    ],
    colors: {
      "editor.background": "#0b1120",
      "editor.foreground": "#e2e8f0",
      "editorLineNumber.foreground": "#475569",
      "editorLineNumber.activeForeground": "#94a3b8",
      "editor.selectionBackground": "#0ea5e955",
      "editor.lineHighlightBackground": "#0f172a",
      "editorCursor.foreground": "#7cd3ff",
      "editorIndentGuide.background": "#1e293b",
    },
  });
}

loader.init().then(registerHcl).catch(() => {});

export default function MonacoPane({ value, language = "hcl", height: heightProp, onMount }) {
  const fallback = typeof heightProp === "number" ? heightProp : 480;
  const { height: responsiveHeight, narrow } = useResponsiveEditorLayout(fallback);
  const height = typeof heightProp === "number" ? heightProp : responsiveHeight;

  const options = useMemo(
    () => ({
      readOnly: true,
      minimap: { enabled: false },
      fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: narrow ? 12 : 13,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      renderLineHighlight: "all",
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      padding: { top: narrow ? 10 : 14, bottom: narrow ? 10 : 14 },
      wordWrap: "on",
    }),
    [narrow]
  );

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-white/10">
      <Editor
        height={height}
        defaultLanguage={language}
        language={language}
        value={value || ""}
        theme="terrasketch-dark"
        beforeMount={registerHcl}
        onMount={onMount}
        options={options}
      />
    </div>
  );
}
