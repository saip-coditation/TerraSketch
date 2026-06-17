# TerraSketch for VS Code

Generate a first-draft Terraform configuration from a plain-text description, and
review existing Terraform — without leaving your editor. Powered by the
[TerraSketch](https://terrasketch.onrender.com) API.

> The output is a **~60–70% complete** base, not production-ready. Review every
> `<REPLACE_*>` placeholder and `# TODO` before deploying — your AI assistant
> (Copilot, etc.) is great at refining the draft from here.

## Commands

- **TerraSketch: Generate Terraform from a description** — pick a cloud / environment / scale, describe your architecture, and the four `.tf` files are written into a folder in your workspace (default `terrasketch/`) and opened.
- **TerraSketch: Review Terraform in this workspace** — review the active `.tf` file (or right-click a `.tf` in the Explorer to review its folder; otherwise all `.tf` in the workspace). Findings show in the **TerraSketch** output channel.

## Settings

| Setting | Default | Purpose |
|---------|---------|---------|
| `terrasketch.apiUrl` | `https://terrasketch.onrender.com` | TerraSketch API base URL (use your own deploy or `http://localhost:8000`). |
| `terrasketch.token` | – | Optional bearer token to attach generations to an account. |
| `terrasketch.defaultProvider` | `aws` | Default cloud provider in the generate flow. |

## Develop / run locally

```bash
cd vscode-extension
npm install
npm run compile
```

Then press **F5** in VS Code (Run Extension) to launch an Extension Development
Host, and run the commands from the Command Palette.

To package a `.vsix`: `npx @vscode/vsce package`.

## Relationship to the MCP server

This extension and the [`mcp-server/`](../mcp-server) both wrap the same
TerraSketch API. Use the extension for a GUI flow inside VS Code; use the MCP
server to let AI agents (Copilot Chat, Claude Code, Cursor, Windsurf) call
TerraSketch as a tool. You can also register the MCP server with VS Code's native
MCP support via a `.vscode/mcp.json`:

```json
{
  "servers": {
    "terrasketch": {
      "command": "node",
      "args": ["${workspaceFolder}/mcp-server/dist/index.js"]
    }
  }
}
```
