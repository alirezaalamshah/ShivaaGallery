"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { call } from "@/lib/client";

export type Role = "admin" | "staff" | "customer";

export type Me = {
  authenticated: boolean;
  role?: Role;
  phone?: string | null;
  name?: string;
  first_name?: string;
  last_name?: string;
  is_staff?: boolean;
  username?: string;
  /** Panel permissions (see backend/apps/accounts/roles.py); every one for the admin. */
  perms?: string[];
};

type Auth = { me: Me | null; refresh: () => Promise<Me>; setMe: (me: Me) => void; logout: () => Promise<void> };

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const refresh = useCallback(async () => {
    try {
      const m = await call<Me>("/auth/me");
      setMe(m);
      return m;
    } catch {
      const m = { authenticated: false };
      setMe(m);
      return m;
    }
  }, []);
  const logout = useCallback(async () => {
    await call("/auth/logout", { method: "POST" }).catch(() => {});
    setMe({ authenticated: false });
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return <AuthContext.Provider value={{ me, refresh, setMe, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside <AuthProvider>");
  return auth;
}
