const STORAGE_KEY = "terrasketch.session_id";

function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `sess_${crypto.randomUUID()}`;
  }
  return `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function getSessionId() {
  if (typeof window === "undefined") return "sess_ssr";
  let id = window.localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = randomId();
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

export function resetSessionId() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
