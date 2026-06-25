import axios from "axios";

const TOKEN_KEY = "terrasketch.access_token";

export function getStoredToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token) {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

// Empty VITE_API_URL → same-origin (correct for prod where frontend+backend share one domain).
const _env = import.meta.env.VITE_API_URL;
const _trim = _env != null ? String(_env).trim() : "";
const baseURL = _trim !== "" ? _trim : "";

export const api = axios.create({
  baseURL,
  timeout: 300_000,
  headers: { "Content-Type": "application/json" },
});

// Generation/review hit the LLM and (on a cold free-tier instance) terraform
// init, so they can take several minutes — give them a longer ceiling than the
// default 5-minute client timeout.
const LLM_TIMEOUT_MS = 600_000;

api.interceptors.request.use((config) => {
  const t = getStoredToken();
  if (t) {
    config.headers.Authorization = `Bearer ${t}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const rid = response.headers["x-request-id"];
    if (rid && response.data && typeof response.data === "object" && !response.data.request_id) {
      response.data.request_id = rid;
    }
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const headers = error.response?.headers || {};
    let detail =
      error?.response?.data?.detail ||
      error?.message ||
      "Unexpected error contacting the API";
    if (typeof detail !== "string") {
      try {
        detail = JSON.stringify(detail);
      } catch {
        detail = "Unexpected error contacting the API";
      }
    }
    if (status === 429) {
      detail =
        "Too many requests. Wait a minute and try again (or raise RATE_LIMIT_GENERATE on the server).";
    } else if (status === 502 || status === 503 || status === 504) {
      detail =
        "The TerraSketch server is waking up or under heavy load and didn't respond in time. Wait ~30 seconds and try again. If this keeps happening, the free-tier instance is likely out of memory — upgrading the hosting plan fixes it.";
    } else if (error.code === "ECONNABORTED") {
      detail =
        "The request took too long and timed out. The server may be cold-starting — wait a moment and try again.";
    }
    const err = new Error(detail);
    err.status = status;
    err.requestId = headers["x-request-id"];
    return Promise.reject(err);
  }
);

// Retry once on a gateway error (502/503) — usually a cold-starting free-tier
// instance that wasn't reachable yet. We don't retry timeouts (the request may
// still be processing server-side) or 504.
async function postWithGatewayRetry(url, payload, config) {
  try {
    return await api.post(url, payload, config);
  } catch (err) {
    if (err.status === 502 || err.status === 503) {
      await new Promise((r) => setTimeout(r, 4000));
      return api.post(url, payload, config);
    }
    throw err;
  }
}

export async function generateTerraform(payload) {
  const { data } = await postWithGatewayRetry("/api/generate", payload, { timeout: LLM_TIMEOUT_MS });
  return data;
}

export async function generateTerraformV2(payload) {
  const { data } = await api.post("/api/v2/generate", payload, { timeout: LLM_TIMEOUT_MS });
  return data;
}

export async function editGenerationIR(generationId, ir) {
  const { data } = await api.post(`/api/v2/generation/${generationId}/ir/edit`, ir);
  return data;
}

export async function editGenerationPlan(generationId, plan) {
  const { data } = await api.post(`/api/v2/generation/${generationId}/plan/edit`, plan);
  return data;
}

export async function editGenerationFiles(generationId, files) {
  const { data } = await api.post(`/api/v2/generation/${generationId}/files/edit`, files);
  return data;
}

export async function getGeneration(id) {
  const { data } = await api.get(`/api/generation/${id}`);
  return data;
}

/** When signed in, omit sessionId so the API uses your account. Pass sessionId only when anonymous. */
export async function getHistory(sessionId, limit = 10) {
  const params = { limit };
  if (sessionId != null && String(sessionId).length > 0) {
    params.session_id = sessionId;
  }
  const { data } = await api.get("/api/history", { params });
  return data;
}

export async function registerUser(body) {
  const { data } = await api.post("/api/auth/register", body);
  return data;
}

export async function loginUser(body) {
  const { data } = await api.post("/api/auth/login", body);
  return data;
}

export async function getMe() {
  const { data } = await api.get("/api/auth/me");
  return data;
}

export async function attachSession(sessionId) {
  const { data } = await api.post("/api/auth/attach-session", {
    session_id: sessionId,
  });
  return data;
}

export async function googleAuthApi(idToken, sessionId) {
  const { data } = await api.post("/api/auth/google", {
    id_token: idToken,
    session_id: sessionId,
  });
  return data;
}

export async function logoutApi() {
  try {
    await api.post("/api/auth/logout");
  } catch {
    /* ignore */
  }
}

export async function postFeedback({ generationId, rating, comment, feedbackType }) {
  const { data } = await api.post("/api/feedback", {
    generation_id: generationId,
    rating,
    comment: comment || null,
    feedback_type: feedbackType || null,
  });
  return data;
}

export async function getHealth() {
  const { data } = await api.get("/api/health");
  return data;
}

export async function reviewTerraform(payload) {
  const { data } = await api.post("/api/review", payload, { timeout: LLM_TIMEOUT_MS });
  return data;
}

/** Live monthly cost via Infracost. Returns { available, total_monthly, items, ... }. */
export async function getCostBreakdown(files) {
  const { data } = await api.post("/api/cost/breakdown", { files }, { timeout: 150_000 });
  return data;
}

// ── Deploy ────────────────────────────────────────────────────────────────────

export async function startDeploy(payload) {
  const { data } = await api.post("/api/deploy", payload, { timeout: 60_000 });
  return data; // { deployment_id }
}

export async function getDeploy(deploymentId) {
  const { data } = await api.get(`/api/deploy/${deploymentId}`, { timeout: 30_000 });
  return data; // { status, logs, outputs, error, action, region }
}

export async function destroyDeploy(deploymentId, payload) {
  const { data } = await api.post(`/api/deploy/${deploymentId}/destroy`, payload, { timeout: 60_000 });
  return data;
}

export function getApiBaseUrl() {
  return baseURL.replace(/\/$/, "");
}
