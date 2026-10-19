"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useRef, useState } from "react";

import { Icon } from "./Icon";
import styles from "./Toast.module.css";

type ToastMsg = { text: string; action?: { label: string; href: string } };
const ToastContext = createContext<(msg: ToastMsg) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((m: ToastMsg) => {
    setMsg(m);
    setOn(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), m.action ? 4200 : 2600);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={`${styles.toast} ${on ? styles.on : ""}`} role="status" aria-live="polite">
        {msg && (
          <>
            <Icon name="check" />
            <span>{msg.text}</span>
            {msg.action && (
              <Link href={msg.action.href} onClick={() => setOn(false)}>
                {msg.action.label}
              </Link>
            )}
          </>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
