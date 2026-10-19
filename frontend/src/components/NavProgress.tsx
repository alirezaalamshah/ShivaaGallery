"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import styles from "./NavProgress.module.css";

const START = "nav-progress:start";
const GIVE_UP_MS = 12000;

/** Shows the progress bar for a navigation started from code (router.push) rather than a link. */
export function navStart() {
  window.dispatchEvent(new Event(START));
}

/** A thin bar across the top of the page from the moment a link is clicked until the new page is shown. */
export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}

function Bar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const giveUp = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const start = () => {
      setState("running");
      clearTimeout(giveUp.current);
      giveUp.current = setTimeout(() => setState("done"), GIVE_UP_MS);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !a.href || a.target === "_blank" || a.hasAttribute("download")) return;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin) return;
      if (to.pathname === location.pathname && to.search === location.search) return; // same page, or only a #hash
      start();
    };
    document.addEventListener("click", onClick);
    window.addEventListener(START, start);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener(START, start);
    };
  }, []);

  // The new page is on screen.
  useEffect(() => {
    clearTimeout(giveUp.current);
    setState((s) => (s === "running" ? "done" : s));
  }, [pathname, search]);

  useEffect(() => {
    if (state !== "done") return;
    const t = setTimeout(() => setState("idle"), 450);
    return () => clearTimeout(t);
  }, [state]);

  if (state === "idle") return null;
  return <div className={`${styles.bar} ${state === "done" ? styles.done : ""}`} role="progressbar" aria-label="در حال باز کردن صفحه" />;
}
