"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Store } from "@/lib/types";

import styles from "./AnnouncementBar.module.css";

type Item = Store["announcements"][number];

const SLOT_MS = 5000;

/**
 * One short line above the header for live campaigns ("free delivery until Friday"); several take turns.
 * Each line has the color and motion picked in the panel; «flow» runs the text across the bar.
 */
export function AnnouncementBar({ items }: { items: Item[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (items.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % items.length), SLOT_MS);
    return () => clearInterval(t);
  }, [items.length]);
  if (!items.length) return null;
  const a = items[i % items.length];
  const body = (
    <>
      <b>{a.title}</b>
      {a.text && <span>{a.text}</span>}
    </>
  );
  const line = a.link ? <Link href={a.link}>{body}</Link> : body;
  return (
    <div className={`${styles.bar} ${styles[a.tone] ?? ""} ${styles[a.effect] ?? ""}`} role="region" aria-label="اطلاعیه‌ها" data-motion>
      {a.effect === "flow" ? (
        <p key={a.id} className={`${styles.item} ${styles.run}`}>
          <span>{line}</span>
          <span aria-hidden="true">{line}</span>
          <span aria-hidden="true">{line}</span>
        </p>
      ) : (
        <p key={a.id} className={styles.item}>{line}</p>
      )}
    </div>
  );
}
