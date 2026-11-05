import styles from "@/components/product/Product.module.css";

/** Shown at once while a product page is built for the first time, shaped like the real page. */
export default function Loading() {
  return (
    <div className="wrap" role="status" aria-label="در حال بارگذاری">
      <div className={styles.layout}>
        <div className={styles.gallery}>
          <span className="skel" style={{ aspectRatio: "3 / 4" }} />
        </div>
        <div className={styles.info}>
          <span className="skel" style={{ width: "40%", height: 14 }} />
          <span className="skel" style={{ width: "80%", height: 32 }} />
          <span className="skel" style={{ width: "35%", height: 24 }} />
          <span className="skel" style={{ height: 120 }} />
          <span className="skel" style={{ height: 52 }} />
        </div>
      </div>
    </div>
  );
}
