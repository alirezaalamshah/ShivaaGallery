"use client";

import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Eased mouse-wheel scrolling on desktop. Touch devices keep their native
 * momentum scrolling, the admin panel keeps plain scrolling, and people who
 * prefer reduced motion get the browser default.
 */
export function SmoothScroll() {
  const inPanel = usePathname().startsWith("/panel");

  useEffect(() => {
    if (inPanel) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia("(pointer: coarse)").matches) return;
    const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true });
    let raf = requestAnimationFrame(function loop(time) {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, [inPanel]);

  return null;
}
