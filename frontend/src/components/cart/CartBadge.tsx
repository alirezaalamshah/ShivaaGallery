"use client";

import { useEffect, useRef, useState } from "react";

import { faNum } from "@/lib/format";

import { useCart } from "./CartProvider";
import styles from "./Cart.module.css";

/** Item count bubble that bumps whenever the count changes. */
export function CartBadge() {
  const { count, ready } = useCart();
  const [bump, setBump] = useState(0);
  const prev = useRef(count);
  useEffect(() => {
    if (ready && count > prev.current) setBump((b) => b + 1);
    prev.current = count;
  }, [count, ready]);
  if (!ready || !count) return null;
  return (
    <span key={bump} className={`${styles.badge} num ${bump ? styles.bump : ""}`} aria-label={`${faNum(count)} کالا`}>
      {faNum(count)}
    </span>
  );
}
