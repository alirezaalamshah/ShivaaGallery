"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import type { ProductSummary } from "@/lib/types";

import { Price } from "../Price";
import { ProductMedia } from "../ProductMedia";
import styles from "./HeroCarousel.module.css";

const MIN_CARDS = 6;
const MAX_CARDS = 8;
const INTRO_MS = 2600;
const HOLD_MS = 2400;

/** A ring of short lists still needs enough cards to read as a cylinder. */
function fill(products: ProductSummary[]) {
  const list = products.slice(0, MAX_CARDS);
  if (!list.length) return [];
  const out = [...list];
  while (out.length < MIN_CARDS) out.push(list[out.length % list.length]);
  return out;
}

const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/** Products on a slowly turning 3D ring: drag to spin, tap a side card to bring it forward, tap the front card to open it. */
export function HeroCarousel({ products, mark }: { products: ProductSummary[]; mark: string }) {
  const items = fill(products);
  const n = items.length;
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const floorRef = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLAnchorElement | null)[]>([]);
  const [front, setFront] = useState(0);
  const st = useRef({ angle: 0, vel: 0, target: null as number | null, drag: false, moved: 0, lastX: 0, pauseUntil: 0, front: 0 });

  useEffect(() => {
    const stage = stageRef.current!;
    const scene = sceneRef.current!;
    const floor = floorRef.current!;
    const hero = stage.closest("section") ?? stage;
    const s = st.current;
    const step = 360 / n;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canHover = matchMedia("(hover: hover)").matches;

    let R = 200, raf = 0, visible = true, tx = 0, ty = 0, aimX = 0, aimY = 0;
    const t0 = performance.now();
    s.pauseUntil = t0 + INTRO_MS + HOLD_MS;

    const resize = () => {
      const w = stage.clientWidth;
      const cw = w * (w < 460 ? 0.34 : 0.31);
      R = (cw / 2 / Math.tan(Math.PI / n)) * 1.1 + 10;
      stage.style.setProperty("--cw", `${cw}px`);
      stage.style.setProperty("--r", `${R}px`);
    };
    resize();
    addEventListener("resize", resize);

    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const frame = (now: number) => {
      const intro = reduced ? 1 : Math.min(1, (now - t0) / INTRO_MS);
      if (intro < 1) {
        s.angle = -320 * (1 - ease(intro));
      } else if (!s.drag) {
        if (s.target !== null) {
          const diff = s.target - s.angle;
          s.angle += diff * 0.075;
          if (Math.abs(diff) < 0.05) {
            s.angle = s.target;
            s.target = null;
            s.pauseUntil = now + HOLD_MS;
          }
        } else {
          s.vel *= 0.93;
          s.angle += s.vel;
          if (Math.abs(s.vel) < 0.15) {
            const snap = Math.round(s.angle / step) * step;
            if (Math.abs(snap - s.angle) > 0.05) s.target = snap;
            else if (!reduced && now > s.pauseUntil) s.target = snap - step;
          }
        }
      }

      const k = ease(intro);
      for (let i = 0; i < n; i++) {
        const el = cards.current[i];
        if (!el) continue;
        const theta = i * step + s.angle;
        const rad = (theta * Math.PI) / 180;
        const f = (Math.cos(rad) + 1) / 2;
        el.style.transform = `rotateY(${theta}deg) translateZ(${R * k}px)`;
        el.style.opacity = String(Math.min(1, intro * 1.6 - i * 0.06 + 0.2));
        el.style.setProperty("--f", f.toFixed(3));
        el.style.setProperty("--s", Math.sin(rad).toFixed(3));
      }

      const idx = ((Math.round(-s.angle / step) % n) + n) % n;
      if (idx !== s.front) {
        s.front = idx;
        setFront(idx);
      }

      tx += (aimX - tx) * 0.06;
      ty += (aimY - ty) * 0.06;
      const r = hero.getBoundingClientRect();
      const out = Math.min(1, Math.max(0, -r.top / (r.height * 0.8)));
      scene.style.transform = `translateZ(${-R * 0.55}px) translateY(${out * -40}px) rotateX(${-7 + ty + out * 22}deg) rotateZ(${tx}deg)`;
      stage.style.opacity = String(1 - out * 0.65);
      floor.style.setProperty("--a", `${s.angle * 0.5}deg`);

      if (visible) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const io = new IntersectionObserver(([en]) => {
      const was = visible;
      visible = en.isIntersecting && !document.hidden;
      if (visible && !was) raf = requestAnimationFrame(frame);
    });
    io.observe(stage);

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      s.drag = true;
      s.moved = 0;
      s.lastX = e.clientX;
      s.target = null;
      s.vel = 0;
    };
    const onMove = (e: PointerEvent) => {
      if (s.drag) {
        const dx = e.clientX - s.lastX;
        s.lastX = e.clientX;
        s.moved += Math.abs(dx);
        s.angle += dx * 0.32;
        s.vel = dx * 0.32;
      }
      if (canHover && !reduced) {
        const r = hero.getBoundingClientRect();
        aimX = ((e.clientX - r.left) / r.width - 0.5) * -5;
        aimY = ((e.clientY - r.top) / r.height - 0.5) * -10;
      }
    };
    const onUp = () => {
      if (!s.drag) return;
      s.drag = false;
      s.pauseUntil = performance.now() + HOLD_MS * 1.5;
    };
    const onLeave = () => { aimX = aimY = 0; };

    stage.addEventListener("pointerdown", onDown);
    addEventListener("pointermove", onMove);
    addEventListener("pointerup", onUp);
    addEventListener("pointercancel", onUp);
    hero.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      removeEventListener("resize", resize);
      stage.removeEventListener("pointerdown", onDown);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerup", onUp);
      removeEventListener("pointercancel", onUp);
      hero.removeEventListener("pointerleave", onLeave);
    };
  }, [n]);

  const bringForward = (i: number) => {
    const s = st.current;
    s.target = s.angle + wrap180(-i * (360 / n) - s.angle);
    s.vel = 0;
  };

  const onCardClick = (e: React.MouseEvent, i: number) => {
    const s = st.current;
    if (s.moved > 6) {
      e.preventDefault();
      return;
    }
    if (i !== s.front) {
      e.preventDefault();
      bringForward(i);
    }
  };

  const shift = (by: number) => bringForward((((st.current.front + by) % n) + n) % n);

  if (!n) return null;
  const current = items[front];

  return (
    <div className={styles.wrap}>
      <div className={styles.stage} ref={stageRef}>
        <div className={styles.scene} ref={sceneRef}>
          <div className={styles.floor} ref={floorRef} aria-hidden="true">
            <i />
            <i />
          </div>
          {items.map((p, i) => (
            <Link
              key={`${p.id}-${i}`}
              ref={(el) => { cards.current[i] = el; }}
              href={`/p/${p.slug}`}
              className={styles.card}
              draggable={false}
              aria-label={p.name}
              tabIndex={i < products.length ? 0 : -1}
              onClick={(e) => onCardClick(e, i)}
              onFocus={() => bringForward(i)}
            >
              <span className={styles.face}>
                <ProductMedia image={p.image} alt={p.name} hex={p.colors[0]?.hex} sizes="220px" priority={i < 3} />
                <span className={styles.shade} />
                <span className={styles.sheen} />
              </span>
              <span className={styles.back} aria-hidden="true">
                <span className="latin">{mark}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className={styles.caption}>
        <button type="button" className={styles.nav} onClick={() => shift(-1)} aria-label="محصول قبلی">
          <Icon name="back" />
        </button>
        <Link key={front} href={`/p/${current.slug}`} className={styles.label}>
          <b>{current.name}</b>
          <Price price={current.price} salePrice={current.sale_price} />
        </Link>
        <button type="button" className={styles.nav} onClick={() => shift(1)} aria-label="محصول بعدی">
          <Icon name="arrow" />
        </button>
      </div>
    </div>
  );
}
