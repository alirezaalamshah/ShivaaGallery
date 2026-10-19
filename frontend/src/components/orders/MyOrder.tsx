"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { PhoneLogin } from "@/components/auth/PhoneLogin";
import { Icon } from "@/components/Icon";
import { ApiError, call } from "@/lib/client";
import type { Order } from "@/lib/types";

import { OrderView } from "./OrderView";

export function MyOrder({ number }: { number: string }) {
  const { me } = useAuth();
  const isNew = useSearchParams().get("new") === "1";
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!me?.authenticated) return;
    call<Order>(`/orders/${encodeURIComponent(number)}`)
      .then(setOrder)
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? "این سفارش در حساب شما پیدا نشد." : "دریافت سفارش ممکن نشد."));
  }, [me, number]);

  const shell = (children: React.ReactNode) => (
    <div style={{ maxWidth: 720, marginInline: "auto", padding: "20px 16px 64px", display: "grid", gap: 16 }}>
      <Link href="/account" className="link-more" style={{ justifySelf: "start" }}>
        <Icon name="back" /> سفارش‌های من
      </Link>
      {children}
    </div>
  );

  if (!me) return shell(null);
  if (!me.authenticated) return shell(<PhoneLogin />);
  if (error) return shell(<p className="err">{error}</p>);
  if (!order) return shell(<div aria-busy="true" style={{ minHeight: 300 }} />);
  return shell(<OrderView order={order} celebrate={isNew} />);
}
