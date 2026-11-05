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
const TURN_MS = 1100;

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
  // Lets a click outside the effect start the ring again after it has gone to rest.
  const wakeRef = useRef(() => {});
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

    let R = 200, raf = 0, nap = 0, visible = true, tx = 0, ty = 0, aimX = 0, aimY = 0, out = 0;
    // What the last frame drew, so a frame with nothing new writes nothing.
    let drawn = { angle: NaN, k: NaN, R: NaN, out: NaN, tx: NaN, ty: NaN };
    // Each card's front-light and side-shade layers, faded by hand instead of through a CSS
    // variable, so the browser can animate them on its own during a turn.
    const layers = cards.current.map((el) => ({
      shade: el?.querySelector<HTMLElement>(`.${styles.shade}`) ?? null,
      sheen: el?.querySelector<HTMLElement>(`.${styles.sheen}`) ?? null,
    }));
    const GLIDE = `${TURN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    const t0 = performance.now();
    s.pauseUntil = t0 + INTRO_MS + HOLD_MS;

    // How far the hero has scrolled away, read on scroll rather than in every frame:
    // reading layout right after writing styles forces the browser to lay the page out again.
    let heroTop = 0, heroHeight = 1;
    const measure = () => {
      const r = hero.getBoundingClientRect();
      heroTop = r.top + scrollY;
      heroHeight = r.height || 1;
    };
    const onScroll = () => {
      out = Math.min(1, Math.max(0, (scrollY - heroTop) / (heroHeight * 0.8)));
      wake();
    };

    const resize = () => {
      const w = stage.clientWidth;
      const cw = w * (w < 460 ? 0.34 : 0.31);
      R = (cw / 2 / Math.tan(Math.PI / n)) * 1.1 + 10;
      stage.style.setProperty("--cw", `${cw}px`);
      stage.style.setProperty("--r", `${R}px`);
      measure();
      onScroll();
    };

    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    /** Start drawing again after a rest; does nothing while already running. */
    function wake() {
      clearTimeout(nap);
      nap = 0;
      if (!raf && visible) raf = requestAnimationFrame(frame);
    }

    function frame(now: number) {
      raf = 0;
      const intro = reduced ? 1 : Math.min(1, (now - t0) / INTRO_MS);
      // A turn to a resting place (the automatic one, a tapped card, or settling after a swipe)
      // is handed to the browser as a CSS transition: it runs on the graphics card without
      // this code drawing every frame. Only the intro and a drag are drawn frame by frame.
      let glide = false;
      if (intro < 1) {
        s.angle = -320 * (1 - ease(intro));
      } else if (!s.drag) {
        if (s.target === null && Math.abs(s.vel) >= 0.15) {
          s.vel *= 0.93;
          s.angle += s.vel;
        } else {
          s.vel = 0;
          const snap = Math.round(s.angle / step) * step;
          if (s.target === null && Math.abs(snap - s.angle) > 0.05) s.target = snap;
          else if (s.target === null && !reduced && now > s.pauseUntil) s.target = snap - step;
          if (s.target !== null) {
            glide = !reduced;
            s.angle = s.target;
            s.target = null;
            s.pauseUntil = now + TURN_MS + HOLD_MS;
          }
        }
      }

      const k = ease(intro);
      if (s.angle !== drawn.angle || k !== drawn.k || R !== drawn.R) {
        const transition = glide ? `transform ${GLIDE}` : "none";
        for (let i = 0; i < n; i++) {
          const el = cards.current[i];
          if (!el) continue;
          const theta = i * step + s.angle;
          const rad = (theta * Math.PI) / 180;
          const f = (Math.cos(rad) + 1) / 2;
          el.style.transition = transition;
          el.style.transform = `rotateY(${theta}deg) translateZ(${R * k}px)`;
          if (intro < 1 || drawn.k !== 1) el.style.opacity = String(Math.min(1, intro * 1.6 - i * 0.06 + 0.2));
          const { shade, sheen } = layers[i] ?? {};
          if (shade) {
            shade.style.transition = glide ? `opacity ${GLIDE}` : "none";
            shade.style.opacity = ((1 - f) * 0.75).toFixed(3);
          }
          if (sheen) {
            sheen.style.transition = glide ? `opacity ${GLIDE}, transform ${GLIDE}` : "none";
            sheen.style.opacity = (f * 0.55).toFixed(3);
            sheen.style.transform = `translateX(${(Math.sin(rad) * -45).toFixed(1)}%)`;
          }
        }
        floor.style.transition = transition;
        floor.style.transform = `rotateX(90deg) rotateZ(${s.angle * 0.5}deg)`;
      }

      const idx = ((Math.round(-s.angle / step) % n) + n) % n;
      if (idx !== s.front) {
        s.front = idx;
        setFront(idx);
      }

      tx += (aimX - tx) * 0.06;
      ty += (aimY - ty) * 0.06;
      if (Math.abs(aimX - tx) < 0.01) tx = aimX;
      if (Math.abs(aimY - ty) < 0.01) ty = aimY;
      if (out !== drawn.out || tx !== drawn.tx || ty !== drawn.ty || R !== drawn.R) {
        scene.style.transform = `translateZ(${-R * 0.55}px) translateY(${out * -40}px) rotateX(${-7 + ty + out * 22}deg) rotateZ(${tx}deg)`;
        stage.style.opacity = String(1 - out * 0.65);
      }
      drawn = { angle: s.angle, k, R, out, tx, ty };

      if (!visible) return;
      // At rest or gliding (intro over, not dragged, no swipe still spinning, pointer settled):
      // sleep until the next automatic turn instead of drawing sixty times a second.
      const resting = intro >= 1 && !s.drag && s.vel === 0 && tx === aimX && ty === aimY;
      if (resting) {
        if (!reduced) nap = window.setTimeout(wake, Math.max(0, s.pauseUntil - now) + 16);
      } else {
        raf = requestAnimationFrame(frame);
      }
    }

    wakeRef.current = wake;
    addEventListener("resize", resize);
    addEventListener("scroll", onScroll, { passive: true });
    resize();
    raf = requestAnimationFrame(frame);

    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting && !document.hidden;
      if (visible) wake();
    });
    io.observe(stage);

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      s.drag = true;
      s.moved = 0;
      s.lastX = e.clientX;
      s.target = null;
      s.vel = 0;
      wake();
    };
    const onMove = (e: PointerEvent) => {
      if (s.drag) {
        const dx = e.clientX - s.lastX;
        s.lastX = e.clientX;
        s.moved += Math.abs(dx);
        s.angle += dx * 0.32;
        s.vel = dx * 0.32;
        wake();
      }
      if (canHover && !reduced) {
        const top = heroTop - scrollY;
        if (e.clientY < top || e.clientY > top + heroHeight) return;
        aimX = (e.clientX / innerWidth - 0.5) * -5;
        aimY = ((e.clientY - top) / heroHeight - 0.5) * -10;
        wake();
      }
    };
    const onUp = () => {
      if (!s.drag) return;
      s.drag = false;
      s.pauseUntil = performance.now() + HOLD_MS * 1.5;
    };
    const onLeave = () => {
      aimX = aimY = 0;
      wake();
    };

    stage.addEventListener("pointerdown", onDown);
    addEventListener("pointermove", onMove);
    addEventListener("pointerup", onUp);
    addEventListener("pointercancel", onUp);
    hero.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(nap);
      io.disconnect();
      removeEventListener("resize", resize);
      removeEventListener("scroll", onScroll);
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
    wakeRef.current();
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
