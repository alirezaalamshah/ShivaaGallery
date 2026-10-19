"use client";

import { useEffect, useRef } from "react";

import { Icon } from "./Icon";
import styles from "./Footer.module.css";

/** Back-to-top button whose gold ring fills as the page is scrolled. */
export function BackToTop() {
  const ring = useRef<SVGCircleElement>(null);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max > 0 ? Math.min(1, scrollY / max) : 0;
      ring.current?.style.setProperty("stroke-dashoffset", String(113 * (1 - p)));
    };
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button type="button" className={styles.top2} aria-label="بازگشت به بالای صفحه" onClick={() => scrollTo({ top: 0, behavior: "smooth" })}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="18" className={styles.track} />
        <circle ref={ring} cx="20" cy="20" r="18" className={styles.progress} />
      </svg>
      <Icon name="arrow" />
    </button>
  );
}
