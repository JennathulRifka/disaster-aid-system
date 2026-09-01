// Generic fetch wrapper for calling the Express backend. Identical contract
// to web/src/lib/api.ts — same auto-attached Firebase ID token, same error
// shape. Use this everywhere instead of raw fetch().

import { auth } from "./firebase";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:5000";

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
