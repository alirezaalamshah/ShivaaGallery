"use client";

import { useEffect, useState } from "react";

import styles from "./Header.module.css";

/** Sticky header that gains a backdrop once the page scrolls. */
export function HeaderShell({ children }: { children: React.ReactNode }) {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return <header className={`${styles.hdr} ${solid ? styles.solid : ""}`}>{children}</header>;
}
