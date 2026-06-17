import * as vscode from "vscode";
import { apiPost, getConfig, SESSION_ID } from "./api.js";

const TF_FILES = ["main.tf", "variables.tf", "outputs.tf", "providers.tf"];

let reviewChannel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("terrasketch.generate", generateCommand),
    vscode.commands.registerCommand("terrasketch.review", (uri?: vscode.Uri) => reviewCommand(uri))
  );
}

export function deactivate() {
  reviewChannel?.dispose();
}

// ── Generate ─────────────────────────────────────────────────────────────────

async function generateCommand() {
  const wsFolder = vscode.workspace.workspaceFolders?.[0];
  if (!wsFolder) {
    vscode.window.showErrorMessage("TerraSketch: open a folder/workspace first.");
    return;
  }

  const description = await vscode.window.showInputBox({
    title: "TerraSketch — describe your architecture",
    prompt: "e.g. 3-tier AWS app with an ALB, ECS Fargate and an RDS Postgres database",
    ignoreFocusOut: true,
  });
  if (!description?.trim()) return;

  const provider = await pick(
    "Cloud provider",
    [
      { label: "AWS", value: "aws" },
      { label: "Azure", value: "azure" },
      { label: "GCP", value: "gcp" },
    ],
    getConfig().defaultProvider
  );
  if (!provider) return;

  const environment = await pick("Environment", [
    { label: "dev", value: "dev" },
    { label: "staging", value: "staging" },
    { label: "production", value: "production" },
  ]);
  if (!environment) return;

  const scale = await pick("Scale tier", [
    { label: "Small (0–100 users)", value: "small" },
    { label: "Mid (100–1k users)", value: "mid" },
    { label: "High (1k+ users)", value: "high" },
  ]);
  if (!scale) return;

  const folderName =
    (await vscode.window.showInputBox({
      title: "Target folder (relative to workspace root)",
      value: "terrasketch",
      ignoreFocusOut: true,
    })) ?? "terrasketch";

  let result: any;
  try {
    result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "TerraSketch: generating Terraform…", cancellable: false },
      () =>
        apiPost("/api/generate", {
          input_type: "text",
          text_description: description,
          cloud_provider: provider,
          environment,
          scale_tier: scale,
          architecture_preset: "auto",
          session_id: SESSION_ID,
        })
    );
  } catch (err) {
    vscode.window.showErrorMessage(`TerraSketch: ${(err as Error).message}`);
    return;
  }

  const files: Record<string, string> = result.files || {};
  const written: string[] = [];
  const dirUri = vscode.Uri.joinPath(wsFolder.uri, folderName.trim() || "terrasketch");
  try {
    await vscode.workspace.fs.createDirectory(dirUri);
    for (const name of TF_FILES) {
      const content = files[name];
      if (!content) continue;
      const fileUri = vscode.Uri.joinPath(dirUri, name);
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf8"));
      written.push(name);
    }
  } catch (err) {
    vscode.window.showErrorMessage(`TerraSketch: could not write files — ${(err as Error).message}`);
    return;
  }

  // Open main.tf
  try {
    const mainUri = vscode.Uri.joinPath(dirUri, "main.tf");
    const doc = await vscode.workspace.openTextDocument(mainUri);
    await vscode.window.showTextDocument(doc);
  } catch {
    /* ignore */
  }

  const placeholders: string[] = result.placeholders || [];
  const match = typeof result.diagram_match_percent === "number" ? `${result.diagram_match_percent}% match · ` : "";
  const note = placeholders.length ? ` · ${placeholders.length} placeholder(s) to replace` : "";
  const choice = await vscode.window.showInformationMessage(
    `TerraSketch wrote ${written.length} file(s) to ${folderName} (${match}~60–70% draft${note}).`,
    "Show details"
  );
  if (choice === "Show details") showGenerationDetails(result);
}

function showGenerationDetails(result: any) {
  const ch = getReviewChannel();
  ch.clear();
  ch.appendLine(`TerraSketch generation ${String(result.generation_id || "").slice(0, 8)}`);
  ch.appendLine("");
  if ((result.resources_identified || []).length) {
    ch.appendLine("Resources:");
    for (const r of result.resources_identified) ch.appendLine(`  • ${r}`);
    ch.appendLine("");
  }
  if ((result.placeholders || []).length) {
    ch.appendLine("Placeholders to replace:");
    for (const p of result.placeholders) ch.appendLine(`  • ${p}`);
    ch.appendLine("");
  }
  if ((result.security_warnings || []).length) {
    ch.appendLine("Security checks:");
    for (const w of result.security_warnings) ch.appendLine(`  • ${w}`);
    ch.appendLine("");
  }
  if (result.usage_instructions) {
    ch.appendLine("Usage:");
    ch.appendLine(result.usage_instructions);
  }
  ch.show(true);
}

// ── Review ───────────────────────────────────────────────────────────────────

async function reviewCommand(contextUri?: vscode.Uri) {
  const files = await collectTerraformFiles(contextUri);
  if (!files) return;
  if (Object.keys(files).length === 0) {
    vscode.window.showWarningMessage("TerraSketch: no .tf files found to review.");
    return;
  }

  let result: any;
  try {
    result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "TerraSketch: reviewing Terraform…", cancellable: false },
      () => apiPost("/api/review", { files })
    );
  } catch (err) {
    vscode.window.showErrorMessage(`TerraSketch: ${(err as Error).message}`);
    return;
  }

  const ch = getReviewChannel();
  ch.clear();
  ch.appendLine(`TerraSketch review — ${Object.keys(files).length} file(s)`);
  ch.appendLine("");
  const issues: any[] = result.issues || result.findings || [];
  if (Array.isArray(issues) && issues.length) {
    for (const i of issues) {
      ch.appendLine(`[${(i.severity || "?").toUpperCase()}] ${i.title || ""}  (${i.category || ""}${i.file ? ", " + i.file : ""})`);
      if (i.detail) ch.appendLine(`  ${i.detail}`);
      if (i.fix) ch.appendLine(`  Fix: ${i.fix}`);
      ch.appendLine("");
    }
    ch.appendLine(`Total: ${issues.length} finding(s).`);
  } else {
    ch.appendLine(JSON.stringify(result, null, 2));
  }
  ch.show(true);
}

async function collectTerraformFiles(contextUri?: vscode.Uri): Promise<Record<string, string> | null> {
  const uris: vscode.Uri[] = [];

  if (contextUri && contextUri.fsPath.endsWith(".tf")) {
    // From the explorer context menu: review all .tf in the same folder.
    const dir = vscode.Uri.joinPath(contextUri, "..");
    const entries = await vscode.workspace.fs.readDirectory(dir);
    for (const [name, type] of entries) {
      if (type === vscode.FileType.File && name.endsWith(".tf")) {
        uris.push(vscode.Uri.joinPath(dir, name));
      }
    }
  } else {
    const active = vscode.window.activeTextEditor?.document;
    if (active && active.fileName.endsWith(".tf")) {
      uris.push(active.uri);
    } else {
      const found = await vscode.workspace.findFiles("**/*.tf", "**/{node_modules,.git,.terraform}/**", 25);
      uris.push(...found);
    }
  }

  if (uris.length === 0) return {};

  const files: Record<string, string> = {};
  for (const uri of uris) {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const name = uri.path.split("/").pop() || uri.path;
      files[name] = Buffer.from(bytes).toString("utf8");
    } catch {
      /* skip unreadable */
    }
  }
  return files;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function pick(
  title: string,
  items: Array<{ label: string; value: string }>,
  preferredValue?: string
): Promise<string | undefined> {
  const ordered = preferredValue
    ? [...items].sort((a, b) => (a.value === preferredValue ? -1 : b.value === preferredValue ? 1 : 0))
    : items;
  const choice = await vscode.window.showQuickPick(
    ordered.map((i) => ({ label: i.label, value: i.value })),
    { title, ignoreFocusOut: true }
  );
  return choice?.value;
}

function getReviewChannel(): vscode.OutputChannel {
  if (!reviewChannel) reviewChannel = vscode.window.createOutputChannel("TerraSketch");
  return reviewChannel;
}
