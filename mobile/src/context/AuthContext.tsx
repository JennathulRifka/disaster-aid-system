import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { onAuthChange } from "../lib/auth";
import { apiFetch } from "../lib/api";

interface Profile {
  uid: string;
  email: string;
  name: string;
  role: "victim" | "donor" | "volunteer" | "admin";
  phone?: string | null;
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const data = await apiFetch("/api/users/me");
          setProfile(data);
        } catch (err) {
          // Right after registration, this listener can fire before the
          // POST /api/users/profile write (started separately in
          // registerUser) has landed in Firestore, causing a spurious 403.
          // One short retry covers that race without masking a genuinely
          // missing profile.
          try {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const data = await apiFetch("/api/users/me");
            setProfile(data);
          } catch (retryErr) {
            console.error("Failed to load profile:", retryErr);
            setProfile(null);
          }
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function refreshProfile() {
    if (!user) return;
    try {
      const data = await apiFetch("/api/users/me");
      setProfile(data);
    } catch (err) {
      console.error("Failed to refresh profile:", err);
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
