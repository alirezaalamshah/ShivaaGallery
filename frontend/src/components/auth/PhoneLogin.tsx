"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError, call } from "@/lib/client";
import { faNum, toEnDigits, toFaDigits } from "@/lib/format";

import { useAuth, type Me } from "./AuthProvider";
import styles from "./PhoneLogin.module.css";

const LEN = 5;

/** Phone number → SMS code → signed in. No registration, no password. */
export function PhoneLogin({ onDone, compact = false, stacked = false }: { onDone?: (me: Me) => void; compact?: boolean; stacked?: boolean }) {
  const { setMe } = useAuth();
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(""));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [debug, setDebug] = useState("");
  const [shake, setShake] = useState(0);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async () => {
    const raw = toEnDigits(phone).replace(/\D/g, "");
    if (!/^09\d{9}$/.test(raw)) {
      setError("شماره موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود.");
      setShake((s) => s + 1);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await call<{ resend_in: number; debug_code?: string }>("/auth/otp/request", { method: "POST", body: { phone: raw } });
      setStep("code");
      setWait(res.resend_in);
      setDebug(res.debug_code ?? "");
      setDigits(Array(LEN).fill(""));
      setTimeout(() => boxes.current[0]?.focus(), 250);
    } catch (e) {
      const retry = e instanceof ApiError ? Number(e.data?.retry_in) : 0;
      if (retry) {
        setStep("code");
        setWait(retry);
      }
      setError(e instanceof Error ? e.message : "ارسال کد ممکن نشد.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (code: string) => {
    setBusy(true);
    setError("");
    try {
      const me = await call<Me>("/auth/otp/verify", { method: "POST", body: { phone: toEnDigits(phone).replace(/\D/g, ""), code } });
      setMe(me);
      onDone?.(me);
    } catch (e) {
      setError(e instanceof Error ? e.message : "کد درست نیست.");
      setShake((s) => s + 1);
      setDigits(Array(LEN).fill(""));
      setTimeout(() => boxes.current[0]?.focus(), 450);
    } finally {
      setBusy(false);
    }
  };

  const onDigit = (i: number, value: string) => {
    const v = toEnDigits(value).replace(/\D/g, "");
    const next = [...digits];
    if (v.length > 1) [...v].slice(0, LEN - i).forEach((d, k) => (next[i + k] = d));
    else next[i] = v;
    setDigits(next);
    const empty = next.findIndex((d) => !d);
    if (v && empty >= 0) boxes.current[empty]?.focus();
    if (next.every(Boolean)) verify(next.join(""));
  };

  return (
    <div className={`${styles.box} ${compact ? styles.compact : ""} ${stacked ? styles.stacked : ""}`}>
      {step === "phone" ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label className="field">
            <span className="label">شماره موبایل</span>
            <span key={shake} className={`${styles.inline} ${shake ? "shake" : ""}`}>
              <input
                id="login-phone"
                className="input ltr num"
                inputMode="tel"
                autoComplete="tel"
                placeholder="۰۹۱۲ ۰۰۰ ۰۰۰۰"
                value={toFaDigits(phone)}
                aria-invalid={!!error}
                onChange={(e) => setPhone(toEnDigits(e.target.value))}
              />
              <button type="submit" className="btn btn-ink" disabled={busy}>
                {busy ? "در حال ارسال…" : "دریافت کد"}
              </button>
            </span>
          </label>
        </form>
      ) : (
        <div className={styles.form}>
          <div className="label">
            کد {faNum(LEN)} رقمی پیامک‌شده به <b className="num" dir="ltr">{toFaDigits(toEnDigits(phone))}</b>{" "}
            <button type="button" className={styles.link} onClick={() => setStep("phone")}>
              ویرایش شماره
            </button>
          </div>
          <div key={shake} className={`${styles.otp} ${shake ? "shake" : ""}`} dir="ltr">
            {digits.map((d, i) => (
              <input
                key={i}
                id={`otp-${i}`}
                ref={(el) => {
                  boxes.current[i] = el;
                }}
                className={`${styles.digit} num ${d ? styles.filled : ""}`}
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                aria-label={`رقم ${faNum(i + 1)}`}
                value={d ? toFaDigits(d) : ""}
                disabled={busy}
                onChange={(e) => onDigit(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
                }}
              />
            ))}
          </div>
          <div className={styles.meta}>
            {wait > 0 ? (
              <span className="num">ارسال دوباره تا {faNum(wait)} ثانیه</span>
            ) : (
              <button type="button" className={styles.link} onClick={send} disabled={busy}>
                ارسال دوباره‌ی کد
              </button>
            )}
            {debug && (
              <span className="hint">
                محیط آزمایشی؛ کد: <b className="num">{toFaDigits(debug)}</b>
              </span>
            )}
          </div>
        </div>
      )}
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
