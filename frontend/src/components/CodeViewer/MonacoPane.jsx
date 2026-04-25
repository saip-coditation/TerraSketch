import React from "react";
import Editor, { loader } from "@monaco-editor/react";

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

export default function MonacoPane({ value, language = "hcl", height = 480, onMount }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <Editor
        height={height}
        defaultLanguage={language}
        language={language}
        value={value || ""}
        theme="terrasketch-dark"
        beforeMount={registerHcl}
        onMount={onMount}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontFamily:
            "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: 13,
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          renderLineHighlight: "all",
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
          padding: { top: 14, bottom: 14 },
          wordWrap: "on",
        }}
      />
    </div>
  );
}
