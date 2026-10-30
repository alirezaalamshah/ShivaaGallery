"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { call } from "@/lib/client";

import styles from "./Product.module.css";

/** Heart that keeps a product in the customer's favorites. Guests are asked to sign in. */
export function FavButton({ productId, name }: { productId: number; name: string }) {
  const { me } = useAuth();
  const toast = useToast();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const customer = me?.role === "customer";

  useEffect(() => {
    if (!customer) return;
    call<number[]>("/favorites?ids=1").then((ids) => setOn(ids.includes(productId))).catch(() => {});
  }, [customer, productId]);

  const toggle = async () => {
    if (!customer) {
      toast({ text: "برای ذخیره در علاقه‌مندی‌ها وارد حسابت شو.", action: { label: "ورود", href: "/account" } });
      return;
    }
    setBusy(true);
    try {
      if (on) await call(`/favorites/${productId}`, { method: "DELETE" });
      else await call("/favorites", { method: "POST", body: { product: productId } });
      setOn(!on);
      toast(on ? { text: "از علاقه‌مندی‌ها برداشته شد" } : { text: "به علاقه‌مندی‌ها اضافه شد", action: { label: "دیدن همه", href: "/account#favorites" } });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "انجام نشد." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`${styles.fav} ${on ? styles.favOn : ""}`}
      aria-pressed={on}
      aria-label={on ? `برداشتن ${name} از علاقه‌مندی‌ها` : `افزودن ${name} به علاقه‌مندی‌ها`}
      disabled={busy}
      onClick={toggle}
    >
      <Icon name="heart" />
    </button>
  );
}
