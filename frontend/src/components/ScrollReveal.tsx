"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Site-wide reveal-on-scroll. Any element with data-reveal fades and rises
 * into place the first time it enters the viewport; siblings marked
 * data-reveal-group stagger. Content stays visible without JavaScript and
 * for people who prefer reduced motion.
 *
 * Endless animations inside an element marked data-motion pause while it is
 * off screen (it gets data-off), so a phone does not keep redrawing what
 * nobody sees.
 */
export function ScrollReveal() {
  const path = usePathname();

  useEffect(() => {
    const motion = new IntersectionObserver((entries) => {
      for (const e of entries) e.target.toggleAttribute("data-off", !e.isIntersecting);
    });
    const watchMotion = () => document.querySelectorAll("[data-motion]").forEach((el) => motion.observe(el));
    watchMotion();
    const mm = new MutationObserver(watchMotion);
    mm.observe(document.body, { childList: true, subtree: true });
    return () => {
      motion.disconnect();
      mm.disconnect();
    };
  }, [path]);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    root.classList.add("reveal-on");

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    const scan = () => {
      document.querySelectorAll<HTMLElement>("[data-reveal-group]").forEach((group) => {
        Array.from(group.children).forEach((child, i) => {
          const el = child as HTMLElement;
          if (!el.hasAttribute("data-reveal")) {
            el.setAttribute("data-reveal", "");
            el.style.setProperty("--reveal-delay", `${Math.min(i, 8) * 70}ms`);
          }
        });
      });
      document.querySelectorAll<HTMLElement>("[data-reveal]:not(.in)").forEach((el) => io.observe(el));
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [path]);

  return null;
}
