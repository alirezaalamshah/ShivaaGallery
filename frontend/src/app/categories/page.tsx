import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { faNum } from "@/lib/format";

import styles from "./categories.module.css";

export const metadata: Metadata = { title: "دسته‌ها" };

export default async function CategoriesPage() {
  const categories = await api.categories();
  return (
    <div className={`wrap ${styles.page}`}>
      <h1 className="page-title">دسته‌ها</h1>
      <ul className={styles.list}>
        {categories.map((c) => (
          <li key={c.id}>
            <Link href={`/c/${c.slug}`} className={styles.root}>
              <span>{c.name}</span>
              <span className={`${styles.count} num`}>{faNum(c.product_count)} مدل</span>
              <Icon name="chev" />
            </Link>
            {c.children.length > 0 && (
              <div className="chips" style={{ flexWrap: "wrap" }}>
                {c.children.map((k) => (
                  <Link key={k.id} href={`/c/${k.slug}`} className="chip">
                    {k.name}
                  </Link>
                ))}
              </div>
            )}
          </li>
        ))}
        <li>
          <Link href="/shop?on_sale=true" className={`${styles.root} ${styles.sale}`}>
            <span>حراج</span>
            <Icon name="chev" />
          </Link>
        </li>
      </ul>
    </div>
  );
}
