"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth, type Me } from "@/components/auth/AuthProvider";
import { useStore } from "@/components/StoreProvider";
import { call } from "@/lib/client";

import s from "./panel.module.css";

export function PanelLogin() {
  const store = useStore();
  const { me, setMe } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/panel";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me?.role === "admin") router.replace(next.startsWith("/panel") ? next : "/panel");
    // Sellers only have the till.
    else if (me?.role === "seller") router.replace(next.startsWith("/panel/pos") ? next : "/panel/pos");
  }, [me, next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setMe(await call<Me>("/auth/login", { method: "POST", body: { username, password } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ورود ممکن نشد.");
      setBusy(false);
    }
  };

  return (
    <div className={s.login}>
      <form className={s.loginCard} onSubmit={submit}>
        {store.logo && (
          // eslint-disable-next-line @next/next/no-img-element -- brand mark
          <img src={store.logo} alt="" className={s.loginLogo} />
        )}
        <div>
          <h1>پنل مدیریت {store.name}</h1>
          <p className="hint" style={{ marginTop: 4 }}>با نام کاربری و رمز مدیر وارد شوید.</p>
        </div>
        <label className="field">
          <span className="label">نام کاربری</span>
          <input id="pl-user" className="input ltr" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span className="label">رمز عبور</span>
          <input id="pl-pass" className="input ltr" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="err" role="alert">{error}</p>}
        <button type="submit" className={s.btn} disabled={busy} style={{ height: 48 }}>
          {busy ? "در حال ورود…" : "ورود به پنل"}
        </button>
      </form>
    </div>
  );
}
