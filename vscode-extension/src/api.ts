import * as vscode from "vscode";
import { randomUUID } from "node:crypto";

// One session id per extension activation, so anonymous generations group together.
export const SESSION_ID = `vscode-${randomUUID()}`;
const REQUEST_TIMEOUT_MS = 300_000;

export interface TerraSketchConfig {
  apiUrl: string;
  token: string;
  defaultProvider: string;
}

export function getConfig(): TerraSketchConfig {
  const c = vscode.workspace.getConfiguration("terrasketch");
  return {
    apiUrl: (c.get<string>("apiUrl") || "https://terrasketch.onrender.com").replace(/\/$/, ""),
    token: c.get<string>("token") || "",
    defaultProvider: c.get<string>("defaultProvider") || "aws",
  };
}

export async function apiPost(path: string, body: unknown): Promise<any> {
  const { apiUrl, token } = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
