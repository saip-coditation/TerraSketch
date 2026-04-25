import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL,
  timeout: 120_000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const detail =
      error?.response?.data?.detail ||
      error?.message ||
      "Unexpected error contacting the API";
    return Promise.reject(new Error(detail));
  }
);

export async function generateTerraform(payload) {
  const { data } = await api.post("/api/generate", payload);
  return data;
}

export async function getGeneration(id) {
  const { data } = await api.get(`/api/generation/${id}`);
  return data;
}

export async function getHistory(sessionId, limit = 10) {
  const { data } = await api.get("/api/history", {
    params: { session_id: sessionId, limit },
  });
  return data;
}

export async function postFeedback({ generationId, rating, comment }) {
  const { data } = await api.post("/api/feedback", {
    generation_id: generationId,
    rating,
    comment: comment || null,
  });
  return data;
}

export async function getHealth() {
  const { data } = await api.get("/api/health");
  return data;
}
