import Link from "next/link";

import { Icon } from "@/components/Icon";
import type { Banner } from "@/lib/types";

import styles from "./Banners.module.css";

/**
 * Campaign banners from the panel: a swipeable row on a phone, two or three across on a computer.
 * Each has a color (the site's complementary color stands out most) and a motion the admin picks.
 */
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
                {b.effect === "flow" && (
                  <span className={styles.ribbon} aria-hidden="true">
                    <span>{Array.from({ length: 6 }, () => `${b.title} ✦ `).join("")}</span>
                    <span>{Array.from({ length: 6 }, () => `${b.title} ✦ `).join("")}</span>
                  </span>
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
            const cls = `${styles.banner} ${styles[b.tone] ?? ""} ${styles[b.effect] ?? ""}`;
            return b.link ? (
              <Link key={b.id} href={b.link} className={cls}>{inner}</Link>
            ) : (
              <div key={b.id} className={cls}>{inner}</div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
