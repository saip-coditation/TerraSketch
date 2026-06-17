#!/usr/bin/env node
/**
 * TerraSketch MCP server.
 *
 * A thin client over the TerraSketch HTTP API that exposes its first-draft
 * Terraform generation and review as MCP tools, so any MCP client
 * (Claude Code, Cursor, Windsurf, Claude Desktop) can call them.
 *
 * Config (env vars):
 *   TERRASKETCH_API_URL   Base URL of the TerraSketch API
 *                         (default: https://terrasketch.onrender.com)
 *   TERRASKETCH_TOKEN     Optional bearer token to attach generations to an account.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const API_URL = (process.env.TERRASKETCH_API_URL || "https://terrasketch.onrender.com").replace(
  /\/$/,
  ""
);
const TOKEN = process.env.TERRASKETCH_TOKEN || "";
// One stable session id per server process, so anonymous generations group together.
const SESSION_ID = `mcp-${randomUUID()}`;
const REQUEST_TIMEOUT_MS = 300_000;

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: "text", text }], isError };
}

async function apiPost(path: string, body: unknown): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await res.text();
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw;
    }
    if (!res.ok) {
      const detail =
        (data && typeof data === "object" && (data.detail || data.message)) ||
        (typeof data === "string" && data) ||
        `HTTP ${res.status}`;
      throw new Error(`TerraSketch API error (${res.status}): ${detail}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const PROVIDER_LABEL: Record<string, string> = { aws: "AWS", azure: "Azure", gcp: "GCP" };

function formatGeneration(result: any): string {
  const provider = PROVIDER_LABEL[result.cloud_provider] || result.cloud_provider;
  const resources: string[] = result.resources_identified || [];
  const placeholders: string[] = result.placeholders || [];
  const security: string[] = result.security_warnings || [];
  const files: Record<string, string> = result.files || {};

  const lines: string[] = [];
  lines.push(
    `# TerraSketch — ${provider} / ${result.environment} (generation ${String(
      result.generation_id || ""
    ).slice(0, 8)})`
  );
  lines.push("");
  lines.push(
    "> ⚠️ This is a **60–70% first-draft** Terraform base, not production-ready. " +
      "Review every `<REPLACE_*>` placeholder and `# TODO` before deploying."
  );
  lines.push("");
  if (typeof result.diagram_match_percent === "number") {
    lines.push(`- **Match score:** ${result.diagram_match_percent}%`);
  }
  if (resources.length) lines.push(`- **Resources:** ${resources.join(", ")}`);
  if (placeholders.length) lines.push(`- **Placeholders to replace:** ${placeholders.join(", ")}`);
  if (security.length) {
    lines.push(`- **Security checks:**`);
    for (const w of security) lines.push(`  - ${w}`);
  }
  if (result.usage_instructions) {
    lines.push("");
    lines.push(`**Usage:** ${result.usage_instructions}`);
  }

  lines.push("");
  lines.push("## Files");
  for (const name of ["main.tf", "variables.tf", "outputs.tf", "providers.tf"]) {
    const content = files[name];
    if (!content) continue;
    lines.push("");
    lines.push(`### ${name}`);
    lines.push("```hcl");
    lines.push(content.trimEnd());
    lines.push("```");
  }
  return lines.join("\n");
}

const server = new McpServer({ name: "terrasketch", version: "0.1.0" });

server.registerTool(
  "generate_terraform",
  {
    title: "Generate Terraform",
    description:
      "Generate a first-draft (~60–70% complete) Terraform configuration for AWS, Azure, or GCP " +
      "from a plain-text architecture description. Returns main.tf, variables.tf, outputs.tf and " +
      "providers.tf plus a resource list, security checks and placeholders to fill in. " +
      "Write the returned files into the user's workspace, then refine them.",
    inputSchema: {
      description: z
        .string()
        .min(1)
        .describe("Plain-text description of the architecture, e.g. '3-tier AWS app with ALB, ECS and RDS'."),
      cloud_provider: z.enum(["aws", "azure", "gcp"]).default("aws").describe("Target cloud provider."),
      environment: z
        .enum(["dev", "staging", "production"])
        .default("dev")
        .describe("Target environment."),
      scale_tier: z
        .enum(["small", "mid", "high"])
        .default("small")
        .describe("Target scale: small (0–100 users), mid (100–1k), high (1k+)."),
      architecture_preset: z
        .enum(["auto", "simple_web", "microservice", "serverless"])
        .default("auto")
        .describe("Optional architecture pattern hint."),
    },
  },
  async ({ description, cloud_provider, environment, scale_tier, architecture_preset }): Promise<ToolResult> => {
    try {
      const result = await apiPost("/api/generate", {
        input_type: "text",
        text_description: description,
        cloud_provider,
        environment,
        scale_tier,
        architecture_preset,
        session_id: SESSION_ID,
      });
      return textResult(formatGeneration(result));
    } catch (err) {
      return textResult(`Generation failed: ${(err as Error).message}`, true);
    }
  }
);

server.registerTool(
  "review_terraform",
  {
    title: "Review Terraform",
    description:
      "Review existing Terraform files for security, cost, reliability, best-practice and compliance " +
      "issues. Pass the file contents keyed by filename. Returns a list of findings with severity and fixes.",
    inputSchema: {
      files: z
        .record(z.string())
        .describe("Terraform file contents keyed by filename, e.g. { 'main.tf': '...', 'variables.tf': '...' }."),
      cloud_provider: z
        .enum(["aws", "azure", "gcp"])
        .optional()
        .describe("Optional provider hint — auto-detected from the files if omitted."),
    },
  },
  async ({ files, cloud_provider }): Promise<ToolResult> => {
    try {
      const fileCount = Object.keys(files || {}).length;
      if (!fileCount) return textResult("No Terraform files provided to review.", true);
      const result = await apiPost("/api/review", {
        files,
        ...(cloud_provider ? { cloud_provider } : {}),
      });
      return textResult(
        "# TerraSketch review\n\n```json\n" + JSON.stringify(result, null, 2) + "\n```"
      );
    } catch (err) {
      return textResult(`Review failed: ${(err as Error).message}`, true);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is the MCP stdio channel.
  console.error(`TerraSketch MCP server running (API: ${API_URL})`);
}

main().catch((err) => {
  console.error("Fatal error starting TerraSketch MCP server:", err);
  process.exit(1);
});
