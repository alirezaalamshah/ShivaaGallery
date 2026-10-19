"use client";

import Link from "next/link";
import { useState } from "react";

import { faNum } from "@/lib/format";
import type { ProductSummary } from "@/lib/types";

import { Price } from "./Price";
import { ProductMedia } from "./ProductMedia";
import styles from "./ProductCard.module.css";

const NEW_DAYS = 14;

export function ProductCard({ product, priority = false }: { product: ProductSummary; priority?: boolean }) {
  const [colorIdx, setColorIdx] = useState(0);
  const [picked, setPicked] = useState(false);
  const color = product.colors[colorIdx];
  // The cover photo until a swatch is clicked; then that color's own photo, if it has one.
  const image = (picked && color && product.color_images?.[color.id]) || product.image;
  const href = `/p/${product.slug}${color && product.colors.length > 1 ? `?color=${color.id}` : ""}`;
  const isNew = Date.now() - new Date(product.created_at).getTime() < NEW_DAYS * 864e5;

  return (
    <article className={styles.card}>
      <Link href={href} className={styles.media}>
        <ProductMedia image={image} alt={color && picked ? `${product.name}، رنگ ${color.name}` : product.name} hex={color?.hex} priority={priority} />
        {product.discount_percent > 0 ? (
          <span className={`${styles.badge} num`}>{faNum(product.discount_percent)}٪ تخفیف</span>
        ) : (
          isNew && <span className={`${styles.badge} ${styles.new}`}>جدید</span>
        )}
        {!product.in_stock && <span className={styles.soldout}>ناموجود</span>}
      </Link>
      <div className={styles.info}>
        <span className={styles.cat}>{product.category.name}</span>
        <h3>
          <Link href={href}>{product.name}</Link>
        </h3>
        <Price price={product.price} salePrice={product.sale_price} />
        {product.colors.length > 1 ? (
          <div className={styles.sw} role="group" aria-label="رنگ‌ها">
            {product.colors.map((c, i) => (
              <button
                key={c.id}
                type="button"
                style={{ "--c": c.hex } as React.CSSProperties}
                aria-label={c.name}
                title={c.name}
                aria-pressed={i === colorIdx}
                onClick={() => { setColorIdx(i); setPicked(true); }}
              />
            ))}
          </div>
        ) : (
          color && <div className={styles.one}>رنگ {color.name}</div>
        )}
      </div>
    </article>
  );
}
