import Link from "next/link";

import { CategoryRail } from "@/components/home/CategoryRail";
import { HeroStage } from "@/components/home/HeroStage";
import { StoreStory } from "@/components/home/StoreStory";
import heroStyles from "@/components/home/Hero.module.css";
import styles from "@/components/home/Home.module.css";
import { Icon } from "@/components/Icon";
import { ProductCard } from "@/components/ProductCard";
import { api } from "@/lib/api";
import { faNum, splitHighlight } from "@/lib/format";
import type { CategoryNode } from "@/lib/types";

/** Show the most specific shopping entry points: a root's children if it has any, else the root. */
const shelves = (roots: CategoryNode[]) => roots.flatMap((c) => (c.children.length ? c.children : [c]));

export default async function HomePage() {
  const [store, categories, latest, featured] = await Promise.all([
    api.store(),
    api.categories(),
    api.products({ ordering: "-created_at" }),
    api.products({ featured: true }),
  ]);
  const heroProducts = (featured.results.length >= 3 ? featured.results : latest.results).slice(0, 3);
  const storyProducts = [...featured.results, ...latest.results].filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i);
  const title = splitHighlight(store.hero_title || store.name);
  let wordIndex = 0;

  return (
    <>
      <section className={heroStyles.hero}>
        <div className={`wrap ${heroStyles.grid}`}>
          <div className={heroStyles.copy}>
            {store.name_latin && <span className={`${heroStyles.eyebrow} latin`}>{store.name_latin}</span>}
            <h1 className={heroStyles.title}>
              {title.map(([part, gold], li) => (
                <span key={li} style={{ display: "block" }}>
                  {part.trim().split(/\s+/).map((word) => (
                    <span key={wordIndex} className={heroStyles.w}>
                      <span className={gold ? heroStyles.gold : undefined} style={{ "--i": wordIndex++ } as React.CSSProperties}>
                        {word}
                      </span>{" "}
                    </span>
                  ))}
                </span>
              ))}
            </h1>
            {(store.hero_text || store.tagline) && <p className={heroStyles.lead}>{store.hero_text || store.tagline}</p>}
            <div className={heroStyles.cta}>
              <Link href="/shop" className="btn btn-gold">
                دیدن محصولات <Icon name="arrow" />
              </Link>
              <Link href="/shop?on_sale=true" className="btn btn-ghost">
                حراج
              </Link>
            </div>
            <div className={heroStyles.trust}>
              {store.city && <span>فروشگاه حضوری در {store.city}</span>}
              <span>خرید بدون ثبت‌نام</span>
              {store.returns.enabled && <span>{faNum(store.returns.days)} روز مهلت مرجوعی</span>}
            </div>
          </div>
          {heroProducts.length > 0 && <HeroStage products={heroProducts} />}
        </div>
      </section>

      <div className={styles.marquee} aria-label="دسته‌ها">
        <div className={styles.track}>
          {[0, 1].map((copy) =>
            shelves(categories).map((c) => (
              <Link key={`${copy}-${c.id}`} href={`/c/${c.slug}`} className={styles.mqItem} tabIndex={copy ? -1 : undefined} aria-hidden={copy ? true : undefined}>
                <b>{c.name}</b>
              </Link>
            )),
          )}
        </div>
      </div>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head" data-reveal>
            <div>
              <span className="latin">Collections</span>
              <h2>دسته‌ها را بگرد</h2>
            </div>
          </div>
          <CategoryRail categories={shelves(categories)} />
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sec-head" data-reveal>
            <div>
              <span className="latin">New In</span>
              <h2>تازه‌ها</h2>
            </div>
            <Link href="/shop" className="link-more">
              همه‌ی محصولات <Icon name="arrow" />
            </Link>
          </div>
          <div className="grid" data-reveal-group>
            {latest.results.slice(0, 8).map((p, i) => (
              <ProductCard key={p.id} product={p} priority={i < 2} />
            ))}
          </div>
        </div>
      </section>

      <StoreStory store={store} products={storyProducts} />

      <div className={styles.svcBand}>
        <div className={`wrap ${styles.svc}`} data-reveal-group>
          <div className={styles.svcItem}>
            <span className={styles.svcIc}><Icon name="truck" /></span>
            <div>
              <h3>ارسال به سراسر ایران</h3>
              <p>{store.city ? `پیک در ${store.city} و ارسال پستی برای شهرهای دیگر` : "روش ارسال را موقع خرید انتخاب کن"}</p>
            </div>
          </div>
          {store.returns.enabled && (
            <div className={styles.svcItem}>
              <span className={styles.svcIc}><Icon name="ret" /></span>
              <div>
                <h3>{faNum(store.returns.days)} روز مهلت مرجوعی</h3>
                <p>{store.returns.type === "exchange" ? "اندازه نبود؟ سایزش را عوض کن" : "اندازه نبود؟ تعویض یا بازگشت وجه"}</p>
              </div>
            </div>
          )}
          <div className={styles.svcItem}>
            <span className={styles.svcIc}><Icon name="shield" /></span>
            <div>
              <h3>خرید بدون ثبت‌نام</h3>
              <p>فقط موقع پرداخت، شماره موبایل و یک کد پیامکی</p>
            </div>
          </div>
          <div className={styles.svcItem}>
            <span className={styles.svcIc}><Icon name="ruler" /></span>
            <div>
              <h3>جدول سایز هر مدل</h3>
              <p>اندازه‌ها به سانتی‌متر، کنار انتخاب سایز</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
