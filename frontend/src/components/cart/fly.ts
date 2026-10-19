/** A colored dot arcs from the add button into the cart icon (bottom nav on phones, header on desktop). */
export function flyToCart(from: DOMRect, color: string, done?: () => void) {
  const target = document.querySelector<HTMLElement>(
    innerWidth < 900 ? '[data-cart-target="bottom"]' : '[data-cart-target="top"]',
  );
  if (!target || matchMedia("(prefers-reduced-motion: reduce)").matches) return done?.();
  const to = target.getBoundingClientRect();
  const x0 = from.left + from.width / 2, y0 = from.top + from.height / 2;
  const x1 = to.left + to.width / 2, y1 = to.top + to.height / 2;

  const outer = document.createElement("div");
  const dot = document.createElement("div");
  Object.assign(outer.style, { position: "fixed", left: "0", top: "0", zIndex: "100", pointerEvents: "none" });
  Object.assign(dot.style, {
    width: "26px", height: "26px", borderRadius: "50%", background: color,
    boxShadow: "0 0 0 3px var(--surface), 0 0 0 4px var(--accent), 0 10px 24px rgb(0 0 0 / .35)",
  });
  outer.appendChild(dot);
  document.body.appendChild(outer);

  const dur = 820;
  // Horizontal motion is linear and vertical motion eases, which traces an arc.
  outer.animate([{ transform: `translate(${x0 - 13}px,${y0 - 13}px)` }, { transform: `translate(${x1 - 13}px,${y0 - 13}px)` }], { duration: dur, easing: "cubic-bezier(.3,0,.7,1)", fill: "forwards" });
  dot.animate(
    [{ transform: "translateY(0) scale(1)" }, { transform: `translateY(${y1 - y0}px) scale(.35)` }],
    { duration: dur, easing: "cubic-bezier(.55,-0.6,.75,.6)", fill: "forwards" },
  ).onfinish = () => {
    outer.remove();
    target.animate([{ transform: "scale(1)" }, { transform: "scale(1.25) rotate(-8deg)" }, { transform: "scale(1)" }], { duration: 450, easing: "cubic-bezier(.34,1.45,.64,1)" });
    done?.();
  };
}
