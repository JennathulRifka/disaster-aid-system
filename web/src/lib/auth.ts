// Auth helpers. Use these in place of any Supabase auth calls
// (supabase.auth.signUp, supabase.auth.signInWithPassword, etc.)
// that Lovable generated in your components.

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";
import { apiFetch } from "./api";

export type UserRole = "victim" | "donor" | "volunteer" | "admin";

interface RegisterInput {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  phone?: string;
  nic?: string;
  homeAddress?: string;
}

/**
 * Registers a new user with Firebase Auth, then creates their profile
 * document (with role) in Firestore via the backend.
 */
export async function registerUser({ email, password, name, role, phone, nic, homeAddress }: RegisterInput) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  // Immediately create the matching profile in Firestore via the backend.
  await apiFetch("/api/users/profile", {
    method: "POST",
    body: JSON.stringify({ name, role, phone, nic, homeAddress }),
  });

  return credential.user;
}

export async function loginUser(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logoutUser() {
  await signOut(auth);
}

/**
 * Subscribe to auth state changes. Call this once, e.g. in an AuthContext,
 * to know whether someone is logged in and re-render accordingly.
 * Returns an unsubscribe function — call it in a useEffect cleanup.
 */
export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
