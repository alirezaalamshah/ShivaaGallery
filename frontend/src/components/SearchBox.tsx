"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "./Icon";
import styles from "./SearchBox.module.css";

/** Search field that updates the results as you type (after a short pause). */
export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const v = q.trim();
      router.replace(v ? `/search?search=${encodeURIComponent(v)}` : "/search", { scroll: false });
    }, 350);
    return () => clearTimeout(t);
  }, [q, router]);

  return (
    <form className={styles.field} role="search" onSubmit={(e) => e.preventDefault()}>
      <Icon name="search" />
      <label htmlFor="q" className="sr-only">
        جستجو در محصولات
      </label>
      <input id="q" type="search" autoFocus autoComplete="off" placeholder="دنبال چه می‌گردی؟" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  );
}
