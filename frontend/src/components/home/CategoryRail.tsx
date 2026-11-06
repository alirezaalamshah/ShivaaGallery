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
 * seamlessly; a swipe always wins, and the drift carries on from where the swipe stopped.
 * On wider screens it is a plain grid.
 */
export function CategoryRail({ categories }: { categories: CategoryNode[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current!;
    const mobile = matchMedia("(max-width: 699px)");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let nap = 0;
    let pausedUntil = 0;
    let visible = false;
    let pos = Math.abs(el.scrollLeft);
    // In RTL, scrollLeft counts down from 0 into negative numbers. Read once: asking for the
    // computed style in every frame makes the browser recompute styles sixty times a second.
    const rtl = getComputedStyle(el).direction === "rtl";
    let half = el.scrollWidth / 2;

    // Runs only while it drifts: on a phone, on screen and not held. Otherwise it stops and
    // `start` brings it back when one of those changes.
    const tick = (now: number) => {
      raf = 0;
      if (!mobile.matches || !visible) return;
      if (now < pausedUntil) {
        nap = window.setTimeout(start, pausedUntil - now);
        return;
      }
      pos += SPEED;
      if (pos >= half) pos -= half;
      el.scrollLeft = rtl ? -pos : pos;
      raf = requestAnimationFrame(tick);
    };
    function start() {
      clearTimeout(nap);
      if (!raf) raf = requestAnimationFrame(tick);
    }
    const pause = () => {
      pausedUntil = performance.now() + 60_000;
    };
    const resume = () => {
      pausedUntil = performance.now() + RESUME_AFTER;
      start();
    };
    // The customer's swipe carries on after the finger lifts, so the drift follows the row itself
    // and waits for it to settle. Only a position it did not set itself counts as theirs.
    const onScroll = () => {
      const at = Math.abs(el.scrollLeft);
      if (Math.abs(at - pos) < 2) return;
      pos = at;
      pausedUntil = Math.max(pausedUntil, performance.now() + RESUME_AFTER);
    };
    const onResize = () => {
      half = el.scrollWidth / 2;
      start();
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
    });
    io.observe(el);
    mobile.addEventListener("change", onResize);
    addEventListener("resize", onResize);
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("pointerdown", pause, { passive: true });
    el.addEventListener("touchstart", pause, { passive: true });
    el.addEventListener("pointerup", resume, { passive: true });
    el.addEventListener("touchend", resume, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(nap);
      io.disconnect();
      mobile.removeEventListener("change", onResize);
      removeEventListener("resize", onResize);
      el.removeEventListener("scroll", onScroll);
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
