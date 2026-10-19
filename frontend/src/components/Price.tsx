"use client";

import { faNum } from "@/lib/format";

import { useStore } from "./StoreProvider";
import styles from "./Price.module.css";

export function Price({
  price,
  salePrice,
  size = "md",
}: {
  price: number;
  salePrice?: number | null;
  size?: "md" | "lg";
}) {
  const { currency_label } = useStore();
  const onSale = salePrice != null && salePrice < price;
  return (
    <div className={`${styles.price} ${styles[size]} num`}>
      <span>{faNum(onSale ? salePrice : price)}</span>
      <small>{currency_label}</small>
      {onSale && (
        <s>
          <span className="sr-only">قیمت قبل: </span>
          {faNum(price)}
        </s>
      )}
    </div>
  );
}
