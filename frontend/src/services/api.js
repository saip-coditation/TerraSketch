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
    }
    const err = new Error(detail);
    err.status = status;
    err.requestId = headers["x-request-id"];
    return Promise.reject(err);
  }
);

export async function generateTerraform(payload) {
  const { data } = await api.post("/api/generate", payload);
  return data;
}

export async function generateTerraformV2(payload) {
  const { data } = await api.post("/api/v2/generate", payload);
  return data;
}

/**
 * Stream a generation over SSE, surfacing the model's live "thinking" and the
 * Terraform config as it's written. Resolves with the final generation result
 * (same shape as generateTerraform). Throws if streaming is unavailable so the
 * caller can fall back to the non-streaming endpoint.
 */
export async function generateTerraformStream(payload, handlers = {}) {
  const token = getStoredToken();
  const res = await fetch(`${baseURL}/api/generate/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    const err = new Error(`Streaming unavailable (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  let errorMsg = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      let evt;
      try {
        evt = JSON.parse(dataLine.slice(5).trim());
      } catch {
        continue;
      }
      if (evt.type === "thinking") handlers.onThinking?.(evt.text);
      else if (evt.type === "output") handlers.onOutput?.(evt.text);
      else if (evt.type === "done") result = evt.result;
      else if (evt.type === "error") errorMsg = evt.message;
    }
  }

  if (errorMsg) throw new Error(errorMsg);
  if (!result) throw new Error("Stream ended without a result");
  return result;
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
  const { data } = await api.post("/api/review", payload);
  return data;
}

export function getApiBaseUrl() {
  return baseURL.replace(/\/$/, "");
}
