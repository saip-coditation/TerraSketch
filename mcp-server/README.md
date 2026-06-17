# TerraSketch MCP Server

An [MCP](https://modelcontextprotocol.io) server that brings TerraSketch's
first-draft Terraform generation into any MCP client — **Claude Code, Cursor,
Windsurf, Claude Desktop**. It's a thin client over the TerraSketch HTTP API.

> TerraSketch generates a **~60–70% complete** Terraform base, not production-ready
> code. Always review the `<REPLACE_*>` placeholders and `# TODO` comments before
> deploying. Your AI editor is the perfect tool to refine the draft from here.

## Tools

| Tool | What it does |
|------|--------------|
| `generate_terraform` | Generate `main.tf` / `variables.tf` / `outputs.tf` / `providers.tf` from a plain-text architecture description (AWS / Azure / GCP), with a resource list, security checks and placeholders. |
| `review_terraform` | Review existing Terraform files for security, cost, reliability, best-practice and compliance issues. |

## Configuration

Environment variables (all optional):

| Var | Default | Purpose |
|-----|---------|---------|
| `TERRASKETCH_API_URL` | `https://terrasketch.onrender.com` | TerraSketch API base URL (point at your own deploy or `http://localhost:8000`). |
| `TERRASKETCH_TOKEN` | – | Bearer token to attach generations to a TerraSketch account. |

## Install & build

```bash
cd mcp-server
npm install
npm run build
```

This produces `dist/index.js` (the runnable server, stdio transport).

## Wire it into a client

### Claude Code

```bash
claude mcp add terrasketch -- node /absolute/path/to/TerraSketch/mcp-server/dist/index.js
```

### Cursor / Windsurf / Claude Desktop

Add to the client's MCP config (`mcp.json` / `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "terrasketch": {
      "command": "node",
      "args": ["/absolute/path/to/TerraSketch/mcp-server/dist/index.js"],
      "env": {
        "TERRASKETCH_API_URL": "https://terrasketch.onrender.com"
      }
    }
  }
}
```

Once published to npm you'll be able to replace the `command`/`args` with
`"command": "npx", "args": ["-y", "terrasketch-mcp"]`.

## Try it

In your MCP client, ask:

> Use TerraSketch to generate a 3-tier AWS app with an ALB, ECS Fargate and an RDS Postgres database, then write the files into `infra/`.

The client calls `generate_terraform`, gets the four files back, and writes them
into your workspace — ready to refine.
