"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useCart } from "@/components/cart/CartProvider";
import { flyToCart } from "@/components/cart/fly";
import { Icon } from "@/components/Icon";
import { Price } from "@/components/Price";
import { ProductMedia } from "@/components/ProductMedia";
import { useStore } from "@/components/StoreProvider";
import { useToast } from "@/components/Toast";
import { faNum } from "@/lib/format";
import type { ProductDetail } from "@/lib/types";

import styles from "./Product.module.css";

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

  const variant = variants.find((v) => v.size_id === sizeId);
  const images = useMemo(() => {
    const own = product.images.filter((im) => im.color === colorId);
    const shared = product.images.filter((im) => im.color === null);
    return own.length ? [...own, ...shared] : shared.length ? shared : product.images;
  }, [product.images, colorId]);

  const pickColor = (id: number) => {
    setColorId(id);
    setSlide(0);
    const stillOk = product.variants.some((v) => v.color === id && v.size_id === sizeId && v.in_stock);
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
    flyToCart(from, color.hex, () => {
      cart.add(item);
      toast({ text: "به سبد خرید اضافه شد", action: { label: "مشاهده‌ی سبد", href: "/cart" } });
    });
  };

  const guide = product.size_guide;
  const hasGuide = !!guide.columns?.length && !!guide.rows?.length;
  const price = variant?.price ?? product.current_price;
  const offPct = price < product.price ? Math.round((1 - price / product.price) * 100) : 0;

  return (
    <div className={styles.layout}>
      <div className={styles.gallery}>
        <div className={styles.slides} onScroll={(e) => {
          const el = e.currentTarget;
          setSlide(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
        }}>
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
          <div className={styles.dots} aria-hidden="true">
            {images.map((im, i) => (
              <i key={im.image} className={i === slide ? styles.dotOn : undefined} />
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
        <h1 className={styles.title}>{product.name}</h1>
        <div className={styles.priceRow}>
          <Price price={product.price} salePrice={offPct ? price : null} size="lg" />
          {offPct > 0 && <span className={`${styles.off} num`}>{faNum(offPct)}٪ تخفیف</span>}
        </div>

        {colors.length > 0 && (
          <div className={styles.opt}>
            <div className={styles.label}>
              رنگ: <b>{color?.name}</b>
            </div>
            <div className={styles.colors} role="radiogroup" aria-label="رنگ">
              {colors.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={c.id === colorId} aria-label={c.name} title={c.name} style={{ "--c": c.hex } as React.CSSProperties} onClick={() => pickColor(c.id)} />
              ))}
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
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={s.id === sizeId}
                  aria-disabled={out}
                  aria-label={out ? `${s.label}، ناموجود` : s.label}
                  className={`${styles.sz} num ${out ? styles.out : ""}`}
                  onClick={() => {
                    if (out) return;
                    setSizeId(s.id);
                    setWarn(false);
                  }}
                >
                  {s.label}
                  {v?.low_stock && <span className={styles.low}>آخرین‌ها</span>}
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

        <button type="button" className={`${styles.add} ${variant?.in_stock ? "" : styles.wait}`} onClick={add}>
          <Icon name="bag" />
          {variant?.in_stock ? <>افزودن به سبد · <span className="num">{faNum(price)}</span> {store.currency_label}</> : "افزودن به سبد"}
        </button>
        <p className={styles.assure}>
          <Icon name="ret" />
          {store.returns.enabled ? `${faNum(store.returns.days)} روز مهلت مرجوعی · ` : ""}خرید بدون ثبت‌نام
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
