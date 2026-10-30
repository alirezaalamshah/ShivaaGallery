"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useCart } from "@/components/cart/CartProvider";
import { flyToCart } from "@/components/cart/fly";
import { Icon } from "@/components/Icon";
import { Price } from "@/components/Price";
import { ProductMedia } from "@/components/ProductMedia";
import { useStore } from "@/components/StoreProvider";
import { useToast } from "@/components/Toast";
import { faNum } from "@/lib/format";
import type { ProductDetail } from "@/lib/types";

import { FavButton } from "./FavButton";
import styles from "./Product.module.css";
import { StockNotify } from "./StockNotify";

const SLIDE_MS = 4000;

export function ProductView({ product, initialColor }: { product: ProductDetail; initialColor?: number }) {
  const store = useStore();
  const cart = useCart();
  const toast = useToast();
  const colors = product.colors;
  const [colorId, setColorId] = useState(colors.some((c) => c.id === initialColor) ? initialColor! : colors[0]?.id);
  const color = colors.find((c) => c.id === colorId);
  const variants = product.variants.filter((v) => v.color === colorId);
  const singleSize = product.sizes.length === 1 ? product.sizes[0].id : undefined;
  const [sizeId, setSizeId] = useState<number | undefined>(singleSize);
  const [guideOpen, setGuideOpen] = useState(false);
  const [warn, setWarn] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [slide, setSlide] = useState(0);
  const [held, setHeld] = useState(false);
  const slidesRef = useRef<HTMLDivElement>(null);

  const variant = variants.find((v) => v.size_id === sizeId);
  const images = useMemo(() => {
    const own = product.images.filter((im) => im.color === colorId);
    const shared = product.images.filter((im) => im.color === null);
    return own.length ? [...own, ...shared] : shared.length ? shared : product.images;
  }, [product.images, colorId]);

  /** Scrolls the gallery to photo `i`; in RTL the scroll offset runs negative. */
  const goTo = (i: number, smooth = true) => {
    const el = slidesRef.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollTo({ left: (rtl ? -1 : 1) * i * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  };

  // A new color brings its own photos; start from the first.
  useEffect(() => {
    goTo(0, false);
  }, [images]);

  // Move to the next photo every few seconds. Any change of photo, by hand or not, restarts the wait.
  useEffect(() => {
    if (images.length < 2 || held || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(() => goTo((slide + 1) % images.length), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [slide, held, images.length]);

  const pickColor = (id: number) => {
    setColorId(id);
    setSlide(0);
    const stillOk = product.variants.some((v) => v.color === id && v.size_id === sizeId);
    if (!stillOk && !singleSize) setSizeId(undefined);
  };

  const add = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!variant || !variant.in_stock || !color) {
      setWarn(true);
      setShakeKey((k) => k + 1);
      return;
    }
    const from = e.currentTarget.getBoundingClientRect();
    const item = {
      variantId: variant.id,
      slug: product.slug,
      name: product.name,
      colorName: color.name,
      colorHex: color.hex,
      size: variant.size,
      price: variant.price,
      image: images[0]?.image ?? null,
    };
    const inCart = cart.lines.find((l) => l.variantId === variant.id)?.qty ?? 0;
    if (variant.left !== null && inCart >= variant.left) {
      toast({ text: "همه‌ی موجودی این رنگ و سایز در سبد شماست.", action: { label: "مشاهده‌ی سبد", href: "/cart" } });
      return;
    }
    flyToCart(from, color.hex, () => {
      cart.add(item, 1, variant.left ?? undefined);
      toast({ text: "به سبد خرید اضافه شد", action: { label: "مشاهده‌ی سبد", href: "/cart" } });
    });
  };

  const guide = product.size_guide;
  const hasGuide = !!guide.columns?.length && !!guide.rows?.length;
  const price = variant?.price ?? product.current_price;
  const regular = variant?.regular_price ?? product.price;
  const offPct = price < regular ? Math.round((1 - price / regular) * 100) : 0;

  return (
    <div className={styles.layout}>
      <div className={styles.gallery}>
        <div
          ref={slidesRef}
          className={styles.slides}
          onScroll={(e) => {
            const el = e.currentTarget;
            setSlide(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
          }}
          onPointerEnter={(e) => { if (e.pointerType === "mouse") setHeld(true); }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") setHeld(false); }}
          onTouchStart={() => setHeld(true)}
          onTouchEnd={() => setHeld(false)}
        >
          {images.length ? (
            images.map((im, i) => (
              <div key={im.image} className={styles.slide}>
                <div className={styles.frame}>
                  <Image src={im.image} alt={im.alt || product.name} fill priority={i === 0} sizes="(max-width: 899px) 100vw, 560px" style={{ objectFit: "cover" }} />
                </div>
              </div>
            ))
          ) : (
            <div className={styles.slide}>
              <ProductMedia image={null} alt={product.name} hex={color?.hex} />
            </div>
          )}
        </div>
        {images.length > 1 && (
          <div className={styles.dots}>
            {images.map((im, i) => (
              <button key={im.image} type="button" className={i === slide ? styles.dotOn : undefined} aria-label={`عکس ${faNum(i + 1)}`} aria-current={i === slide} onClick={() => goTo(i)} />
            ))}
          </div>
        )}
      </div>

      <div className={styles.info}>
        <nav className={styles.crumbs} aria-label="مسیر">
          {product.breadcrumbs.map((b, i) => (
            <span key={b.id}>
              {i > 0 && " / "}
              <Link href={`/c/${b.slug}`}>{b.name}</Link>
            </span>
          ))}
        </nav>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{product.name}</h1>
          <FavButton productId={product.id} name={product.name} />
        </div>
        <div className={styles.priceRow}>
          <Price price={regular} salePrice={offPct ? price : null} size="lg" />
          {offPct > 0 && <span className={`${styles.off} num`}>{faNum(offPct)}٪ تخفیف</span>}
        </div>

        {colors.length > 0 && (
          <div className={styles.opt}>
            <div className={styles.label}>
              رنگ: <b>{color?.name}</b>
            </div>
            <div className={styles.colors} role="radiogroup" aria-label="رنگ">
              {colors.map((c) => {
                const soldOut = !product.variants.some((v) => v.color === c.id && v.in_stock);
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={c.id === colorId}
                    aria-label={soldOut ? `${c.name}، ناموجود` : c.name}
                    title={soldOut ? `${c.name} (ناموجود)` : c.name}
                    className={soldOut ? styles.soldOut : undefined}
                    style={{ "--c": c.hex } as React.CSSProperties}
                    onClick={() => pickColor(c.id)}
                  />
                );
              })}
            </div>
          </div>
        )}

        <div className={styles.opt}>
          <div className={`${styles.label} ${warn && !variant ? styles.warn : ""}`}>
            <span>{variant ? <>سایز: <b className="num">{variant.size}</b></> : warn ? "اول سایز را انتخاب کن" : "سایز را انتخاب کنید"}</span>
            {hasGuide && (
              <button type="button" className={styles.guideBtn} aria-expanded={guideOpen} aria-controls="guide" onClick={() => setGuideOpen(!guideOpen)}>
                <Icon name="ruler" /> راهنمای سایز
              </button>
            )}
          </div>
          <div key={shakeKey} className={`${styles.sizes} ${shakeKey ? "shake" : ""}`} role="radiogroup" aria-label="سایز">
            {product.sizes.map((s) => {
              const v = variants.find((x) => x.size_id === s.id);
              const out = !v || !v.in_stock;
              const missing = !v;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={s.id === sizeId}
                  aria-disabled={missing}
                  aria-label={out ? `${s.label}، ناموجود` : s.label}
                  className={`${styles.sz} num ${out ? styles.out : ""}`}
                  onClick={() => {
                    if (missing) return;
                    setSizeId(s.id);
                    setWarn(false);
                  }}
                >
                  {s.label}
                  {v?.left != null && <span className={styles.low}>{v.left === 1 ? "آخرین عدد" : `فقط ${faNum(v.left)} عدد`}</span>}
                </button>
              );
            })}
          </div>
          {hasGuide && (
            <div id="guide" className={`${styles.guide} ${guideOpen ? styles.guideOn : ""}`}>
              <div>
                <div className={styles.tableWrap}>
                  <table className="num">
                    <thead>
                      <tr>{guide.columns!.map((h) => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {guide.rows!.map((r, i) => (
                        <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {guide.note && <p className={styles.note}>{guide.note}</p>}
              </div>
            </div>
          )}
        </div>

        {!product.in_stock && !variant && <p className={styles.soldNote}>این مدل فعلاً تمام شده است. سایز دلخواهت را انتخاب کن تا وقتی موجود شد خبرت کنیم.</p>}
        {variant && !variant.in_stock && color ? (
          <StockNotify variantId={variant.id} what={`${color.name} سایز ${variant.size}`} />
        ) : (
          <button type="button" className={`${styles.add} ${variant?.in_stock ? "" : styles.wait}`} onClick={add}>
            <Icon name="bag" />
            {variant?.in_stock ? <>افزودن به سبد — <span className="num">{faNum(price)}</span> {store.currency_label}</> : "افزودن به سبد"}
          </button>
        )}
        <p className={styles.assure}>
          <Icon name="ret" />
          {store.returns.enabled ? `${faNum(store.returns.days)} روز مهلت مرجوعی` : "ارسال به سراسر ایران"}
        </p>

        {(product.description || product.details.length > 0) && (
          <section className={styles.desc} data-reveal>
            <h2>درباره‌ی این مدل</h2>
            {product.description && <p>{product.description}</p>}
            {product.details.length > 0 && (
              <ul>
                {product.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
