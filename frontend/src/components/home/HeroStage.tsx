"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import type { ProductSummary } from "@/lib/types";

import { Price } from "../Price";
import { ProductMedia } from "../ProductMedia";
import styles from "./Hero.module.css";

const DEPTHS = [34, 16, 22];

/** Dotted gold ring that gathers on load, slowly turns, and parts around the pointer; product cards float in front. */
export function HeroStage({ products }: { products: ProductSummary[] }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const stage = stageRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canHover = matchMedia("(hover: hover)").matches;
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue("--accent").trim() || "#c9a24c";
    const deepAccent = css.getPropertyValue("--accent-ink").trim() || "#8a6726";

    let W = 0, H = 0, R = 0, cx = 0, cy = 0, px = -999, py = -999, rot = 0, raf = 0, visible = true;
    const N = 92;
    const dots = Array.from({ length: N }, (_, i) => {
      const w = 0.5 + 0.5 * Math.sin(i * 0.42);
      return { a: (i / N) * Math.PI * 2, s: 0.8 + w * w * 2.8, sx: Math.random() - 0.5, sy: Math.random() - 0.5, ox: 0, oy: 0, delay: i * 9 };
    });
    const dust = Array.from({ length: 30 }, () => ({ x: Math.random(), y: Math.random(), v: 0.0005 + Math.random() * 0.0011, s: 0.5 + Math.random() * 1.3, p: Math.random() * 6.28 }));

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(W, H) * 0.45; cx = W / 2; cy = H / 2;
    };
    resize();
    addEventListener("resize", resize);

    const t0 = performance.now();
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
    const draw = (now: number) => {
      const el = reduced ? 1e5 : now - t0;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = accent;
      for (const d of dust) {
        if (!reduced) { d.y -= d.v; if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); } }
        ctx.globalAlpha = 0.16 + 0.2 * Math.sin(now * 0.002 + d.p);
        ctx.beginPath(); ctx.arc(d.x * W, d.y * H, d.s, 0, 6.283); ctx.fill();
      }
      const kRing = easeOut(Math.min(1, Math.max(0, (el - 900) / 1400)));
      ctx.globalAlpha = 0.25 * kRing; ctx.strokeStyle = accent; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.86, 0, 6.283); ctx.stroke();
      if (!reduced) rot += 0.0011;
      for (const d of dots) {
        const k = easeOut(Math.min(1, Math.max(0, (el - d.delay) / 1700)));
        const a = d.a + rot;
        const tx = cx + Math.cos(a) * R, ty = cy + Math.sin(a) * R;
        const sx = cx + d.sx * W * 1.1, sy = cy + d.sy * H * 1.1;
        let x = sx + (tx - sx) * k, y = sy + (ty - sy) * k;
        const dx = x - px, dy = y - py, dist = Math.hypot(dx, dy);
        let fx = 0, fy = 0;
        if (dist < 110) { const f = ((110 - dist) / 110) * 24; fx = (dx / (dist || 1)) * f; fy = (dy / (dist || 1)) * f; }
        d.ox += (fx - d.ox) * 0.1; d.oy += (fy - d.oy) * 0.1; x += d.ox; y += d.oy;
        const g = 0.5 + 0.5 * Math.sin(a * 2 - now * 0.0016);
        ctx.globalAlpha = (0.4 + 0.6 * g) * (0.3 + 0.7 * k);
        ctx.fillStyle = g > 0.8 ? deepAccent : accent;
        ctx.beginPath(); ctx.arc(x, y, d.s, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduced && visible) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const io = new IntersectionObserver(([en]) => {
      const was = visible;
      visible = en.isIntersecting;
      if (visible && !was && !reduced) raf = requestAnimationFrame(draw);
    });
    io.observe(stage);

    const pars = Array.from(stage.querySelectorAll<HTMLElement>("[data-depth]"));
    const onMove = (e: PointerEvent) => {
      const cr = canvas.getBoundingClientRect();
      px = e.clientX - cr.left; py = e.clientY - cr.top;
      if (reduced || !canHover) return;
      const nx = (e.clientX - cr.left) / cr.width - 0.5, ny = (e.clientY - cr.top) / cr.height - 0.5;
      pars.forEach((p) => {
        const dpt = Number(p.dataset.depth);
        p.style.transform = `translate3d(${nx * dpt}px,${ny * dpt}px,0) rotateY(${nx * 10}deg) rotateX(${-ny * 10}deg)`;
      });
    };
    const onLeave = () => { px = py = -999; pars.forEach((p) => (p.style.transform = "")); };
    const host = stage.closest("section") ?? stage;
    host.addEventListener("pointermove", onMove as EventListener);
    host.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      removeEventListener("resize", resize);
      host.removeEventListener("pointermove", onMove as EventListener);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className={styles.stage} ref={stageRef}>
      <canvas ref={canvasRef} className={styles.ring} aria-hidden="true" />
      {products.slice(0, 3).map((p, i) => (
        <div key={p.id} className={`${styles.hc} ${styles[`c${i + 1}`]}`}>
          <div className={styles.par} data-depth={DEPTHS[i]}>
            <Link href={`/p/${p.slug}`} className={styles.hcard}>
              <ProductMedia image={p.image} alt={p.name} hex={p.colors[0]?.hex} sizes="240px" priority={i === 0} />
              <span className={styles.cap}>
                <b>{p.name}</b>
                <Price price={p.price} salePrice={p.sale_price} />
              </span>
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
