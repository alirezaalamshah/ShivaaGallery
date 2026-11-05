import styles from "./Listing.module.css";

/** Shown at once while a list of products comes from the server, shaped like the real page. */
export function ListingLoading() {
  return (
    <div className={`wrap ${styles.page}`} role="status" aria-label="در حال بارگذاری">
      <header className={styles.head}>
        <span className="skel" style={{ width: 180, height: 34 }} />
      </header>
      <div className="grid">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i}>
            <span className="skel" style={{ aspectRatio: "3 / 4" }} />
            <span className="skel" style={{ width: "75%", height: 14, marginTop: 12 }} />
            <span className="skel" style={{ width: "45%", height: 14, marginTop: 8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
