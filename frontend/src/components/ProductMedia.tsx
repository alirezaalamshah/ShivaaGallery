import Image from "next/image";

import { tintOf } from "@/lib/format";

import styles from "./ProductMedia.module.css";

/**
 * Product photo in a fixed 3:4 frame (photos are cropped to fill it, so model
 * shots and flat shots line up). Without a photo, shows an arch monogram
 * tinted with the product's color.
 */
export function ProductMedia({
  image,
  alt,
  hex,
  sizes = "(max-width: 699px) 50vw, (max-width: 1023px) 33vw, 300px",
  priority = false,
}: {
  image: string | null;
  alt: string;
  hex?: string;
  sizes?: string;
  priority?: boolean;
}) {
  if (image) {
    return (
      <div className={styles.frame}>
        <Image src={image} alt={alt} fill sizes={sizes} priority={priority} className={styles.img} />
      </div>
    );
  }
  return (
    <div className={`${styles.frame} ${styles.empty}`} style={{ background: hex ? tintOf(hex) : undefined }} role="img" aria-label={alt}>
      <span className={styles.arch} style={hex ? { color: hex } : undefined}>
        <span>{alt.trim().charAt(0)}</span>
      </span>
    </div>
  );
}
