import Link from "next/link";

import { Icon } from "@/components/Icon";
import { ProductMedia } from "@/components/ProductMedia";
import { splitHighlight } from "@/lib/format";
import type { ProductSummary, Store } from "@/lib/types";

import styles from "./StoreStory.module.css";

/** Brand moment: the store itself — its story, its shop, its Instagram — with a collage of its pieces. */
export function StoreStory({ store, products }: { store: Store; products: ProductSummary[] }) {
  const photos = products.filter((p) => p.image).slice(0, 3);
  const title = splitHighlight(store.about_title || store.name);
  return (
    <section className={styles.story}>
      <div className={`wrap ${styles.grid}`}>
        <div className={styles.collage} aria-hidden="true">
          <span className={styles.ring} />
          {photos.map((p, i) => (
            <Link key={p.id} href={`/p/${p.slug}`} tabIndex={-1} className={`${styles.photo} ${styles[`p${i + 1}`]}`} data-reveal>
              <ProductMedia image={p.image} alt={p.name} sizes="(max-width: 899px) 45vw, 300px" />
            </Link>
          ))}
          {store.logo && (
            // eslint-disable-next-line @next/next/no-img-element -- small brand mark
            <img src={store.logo} alt="" className={styles.seal} />
          )}
        </div>

        <div className={styles.copy} data-reveal>
          {store.name_latin && <span className="latin">{store.name_latin}</span>}
          <h2>
            {title.map(([part, gold], i) => (
              <span key={i} className={gold ? styles.gold : undefined}>{part}</span>
            ))}
          </h2>
          {(store.about_text || store.tagline) && <p>{store.about_text || store.tagline}</p>}
          <ul className={styles.facts}>
            {store.address && (
              <li>
                <Icon name="pin" />
                <span>{store.address}</span>
              </li>
            )}
            {store.instagram && (
              <li>
                <Icon name="insta" />
                <span dir="ltr">@{store.instagram}</span>
              </li>
            )}
          </ul>
          <div className={styles.cta}>
            {store.instagram && (
              <a href={`https://instagram.com/${store.instagram}`} target="_blank" rel="noopener noreferrer" className="btn btn-gold">
                <Icon name="insta" /> دنبال کردن در اینستاگرام
              </a>
            )}
            <Link href="/shop" className={`btn ${styles.ghost}`}>
              دیدن همه‌ی مدل‌ها <Icon name="arrow" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
