// Generic fetch wrapper for calling your Express backend.
// Automatically attaches the logged-in user's Firebase ID token so the
// backend's requireAuth middleware can verify who's calling.
//
// Use this everywhere instead of raw fetch() or any leftover Supabase
// client calls, e.g.:
//   const requests = await apiFetch("/api/requests");
//   await apiFetch("/api/requests", { method: "POST", body: JSON.stringify(data) });

import { auth } from "./firebase";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}
