const DURATION = 800;
// How much later the far edge of the photo leaves than the edge nearest the cart.
const LAG = 0.6;
const NECK = 20; // width of the photo where it enters the cart
const MAX_ROWS = 170;

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The photo stretches out of its place and pours into the cart icon (bottom nav on phones, header
 * on desktop). Each row of the photo is drawn on one canvas and rows near the cart leave first, so
 * the picture draws out into a smooth funnel. The rows share their edges, so it never tears.
 */
export function flyToCart(from: DOMRect, photo: HTMLImageElement | null | undefined, done?: () => void) {
  const target = document.querySelector<HTMLElement>(
    innerWidth < 900 ? '[data-cart-target="bottom"]' : '[data-cart-target="top"]',
  );
  if (!target) return done?.();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return done?.();
  const to = target.getBoundingClientRect();
  const land = () => {
    target.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.28) rotate(-8deg)" }, { transform: "scale(1)" }],
      { duration: 450, easing: "cubic-bezier(.34,1.45,.64,1)" },
    );
    ripple(to);
    done?.();
  };

  const dpr = Math.min(devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!photo?.complete || !photo.naturalWidth || !ctx) return land();

  const shown = photo.getBoundingClientRect();
  const inView = Math.min(shown.bottom, innerHeight) - Math.max(shown.top, 0);
  const onScreen = inView > shown.height / 4;
  const { left: x, top: y, width: w, height: h } = onScreen ? shown : besideButton(from);

  // A copy at screen size, cropped as object-fit: cover crops it, so each frame copies few pixels.
  const picture = document.createElement("canvas");
  picture.width = Math.round(w * dpr);
  picture.height = Math.round(h * dpr);
  const zoom = Math.max(picture.width / photo.naturalWidth, picture.height / photo.naturalHeight);
  picture.getContext("2d")?.drawImage(
    photo,
    (picture.width - photo.naturalWidth * zoom) / 2,
    (picture.height - photo.naturalHeight * zoom) / 2,
    photo.naturalWidth * zoom,
    photo.naturalHeight * zoom,
  );

  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  Object.assign(canvas.style, { position: "fixed", left: "0", top: "0", width: `${innerWidth}px`, height: `${innerHeight}px`, zIndex: "100", pointerEvents: "none" });
  document.body.appendChild(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const tx = to.left + to.width / 2, ty = to.top + to.height / 2;
  const cx = x + w / 2;
  const cartBelow = ty > y + h / 2;
  const rows = Math.min(MAX_ROWS, Math.ceil(h / 2));
  const edgeY = new Float32Array(rows + 1), edgeW = new Float32Array(rows + 1), edgeX = new Float32Array(rows + 1);
  const start = performance.now();

  const paint = (p: number) => {
    for (let i = 0; i <= rows; i++) {
      const along = i / rows;
      const far = cartBelow ? 1 - along : along;
      const q = clamp(p * (1 + LAG) - far * LAG);
      edgeY[i] = mix(y + along * h, ty, q * q * (3 - 2 * q) * q ** 0.6);
      edgeW[i] = mix(w, NECK, 1 - (1 - q) ** 2.4);
      edgeX[i] = mix(cx, tx, q ** 2.2);
    }
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const sourceRow = picture.height / rows;
    for (let i = 0; i < rows; i++) {
      const height = edgeY[i + 1] - edgeY[i];
      if (height < 0.02) continue;
      const width = (edgeW[i] + edgeW[i + 1]) / 2;
      const middle = (edgeX[i] + edgeX[i + 1]) / 2;
      // The small overlap hides the hairline a browser can leave between neighbouring rows.
      ctx.drawImage(picture, 0, i * sourceRow, picture.width, sourceRow, middle - width / 2, edgeY[i], width, height + 0.5);
    }
  };

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    canvas.remove();
    land();
  };
  const tick = (now: number) => {
    if (finished) return;
    const p = (now - start) / DURATION;
    if (p >= 1) return finish();
    paint(Math.max(p, 0));
    requestAnimationFrame(tick);
  };
  paint(0);
  requestAnimationFrame(tick);
  // Frames stop in a hidden tab, and the item must still reach the cart.
  setTimeout(finish, DURATION + 300);

  if (onScreen) {
    // The photo has left its place until the copy lands.
    photo.animate(
      [{ opacity: 1 }, { opacity: 0.16, offset: 0.08 }, { opacity: 0.16, offset: 0.85 }, { opacity: 1 }],
      { duration: DURATION + 160 },
    );
  }
}

/** The photo has been scrolled away, so a small copy rises from the add button instead. */
function besideButton(from: DOMRect) {
  const w = 150, h = 200;
  const left = Math.min(Math.max(8, from.left + from.width / 2 - w / 2), innerWidth - w - 8);
  return new DOMRect(left, Math.max(8, from.top - h - 12), w, h);
}

/** A thin ring spreads from the cart icon as the photo lands. */
function ripple(at: DOMRect) {
  const size = Math.max(at.width, at.height);
  const ring = document.createElement("div");
  Object.assign(ring.style, {
    position: "fixed", left: `${at.left + at.width / 2 - size / 2}px`, top: `${at.top + at.height / 2 - size / 2}px`,
    width: `${size}px`, height: `${size}px`, borderRadius: "50%", border: "2px solid var(--accent)",
    zIndex: "100", pointerEvents: "none",
  });
  document.body.appendChild(ring);
  ring.animate(
    [{ transform: "scale(.7)", opacity: 0.9 }, { transform: "scale(1.9)", opacity: 0 }],
    { duration: 480, easing: "ease-out" },
  ).onfinish = () => ring.remove();
}
