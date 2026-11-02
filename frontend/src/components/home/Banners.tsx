import Link from "next/link";

import { Icon } from "@/components/Icon";
import type { Banner } from "@/lib/types";

import styles from "./Banners.module.css";

/** Campaign banners from the panel: a swipeable row on a phone, two or three across on a computer. */
export function Banners({ banners }: { banners: Banner[] }) {
  return (
    <section className="sec" style={{ paddingTop: 0 }} aria-label="کمپین‌ها">
      <div className="wrap">
        <div className={styles.row} data-reveal-group>
          {banners.map((b, i) => {
            const inner = (
              <>
                {b.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- already a fixed-size WebP from the panel
                  <img src={b.image} alt="" loading={i < 2 ? "eager" : "lazy"} />
                ) : (
                  <span className={styles.plain} aria-hidden="true" />
                )}
                <span className={styles.copy}>
                  <b>{b.title}</b>
                  {b.text && <span>{b.text}</span>}
                  {b.link && (
                    <span className={styles.cta}>
                      {b.button_label || "دیدن"} <Icon name="arrow" />
                    </span>
                  )}
                </span>
              </>
            );
            return b.link ? (
              <Link key={b.id} href={b.link} className={styles.banner}>{inner}</Link>
            ) : (
              <div key={b.id} className={styles.banner}>{inner}</div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
