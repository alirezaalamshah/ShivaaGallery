"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { ProductMedia } from "@/components/ProductMedia";
import { faNum } from "@/lib/format";
import type { CategoryNode } from "@/lib/types";

import styles from "./Home.module.css";

const SPEED = 0.35; // px per frame, a slow drift
const RESUME_AFTER = 2500;

/**
 * Category arches. On phones the row drifts slowly on its own and loops
 * seamlessly; touching it pauses the drift so the customer can swipe freely.
 * On wider screens it is a plain grid.
 */
export function CategoryRail({ categories }: { categories: CategoryNode[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current!;
    const mobile = matchMedia("(max-width: 699px)");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let pausedUntil = 0;
    let visible = false;
    let pos = Math.abs(el.scrollLeft);

    const tick = (now: number) => {
      if (mobile.matches && visible && now > pausedUntil) {
        const half = el.scrollWidth / 2;
        pos += SPEED;
        if (pos >= half) pos -= half;
        // In RTL, scrollLeft counts down from 0 into negative numbers.
        el.scrollLeft = getComputedStyle(el).direction === "rtl" ? -pos : pos;
      } else {
        pos = Math.abs(el.scrollLeft);
      }
      raf = requestAnimationFrame(tick);
    };
    const pause = () => {
      pausedUntil = performance.now() + 60_000;
    };
    const resume = () => {
      pausedUntil = performance.now() + RESUME_AFTER;
    };
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);
    el.addEventListener("pointerdown", pause, { passive: true });
    el.addEventListener("touchstart", pause, { passive: true });
    el.addEventListener("pointerup", resume, { passive: true });
    el.addEventListener("touchend", resume, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      el.removeEventListener("pointerdown", pause);
      el.removeEventListener("touchstart", pause);
      el.removeEventListener("pointerup", resume);
      el.removeEventListener("touchend", resume);
    };
  }, []);

  const tile = (c: CategoryNode, copy: number) => (
    <Link
      key={`${copy}-${c.id}`}
      href={`/c/${c.slug}`}
      className={`${styles.cat} ${copy ? styles.dup : ""}`}
      tabIndex={copy ? -1 : undefined}
      aria-hidden={copy ? true : undefined}
    >
      <div className={styles.arch}>
        <ProductMedia image={c.cover} alt={c.name} sizes="(max-width: 699px) 140px, 220px" />
      </div>
      <h3>{c.name}</h3>
      <p className="num">{faNum(c.product_count)} مدل</p>
    </Link>
  );

  return (
    <div ref={ref} className={styles.cats} data-reveal-group>
      {categories.map((c) => tile(c, 0))}
      {/* A second copy lets the phone drift loop without a jump; hidden on wide screens. */}
      {categories.map((c) => tile(c, 1))}
    </div>
  );
}
