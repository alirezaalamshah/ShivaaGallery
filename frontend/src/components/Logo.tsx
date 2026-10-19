import type { Store } from "@/lib/types";

import styles from "./Logo.module.css";

/** Store logo with its name; falls back to a monogram when no logo is uploaded. */
export function Logo({ store, size = 42, showName = true }: { store: Store; size?: number; showName?: boolean }) {
  return (
    <span className={styles.brand}>
      {store.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny, already-sized brand mark
        <img src={store.logo} alt="" width={size} height={size} className={styles.mark} />
      ) : (
        <span className={styles.mono} style={{ width: size, height: size }} aria-hidden="true">
          {store.name.trim().charAt(0)}
        </span>
      )}
      {showName && (
        <span className={styles.name}>
          <strong>{store.name}</strong>
          {store.name_latin && <small className="latin">{store.name_latin}</small>}
        </span>
      )}
    </span>
  );
}
