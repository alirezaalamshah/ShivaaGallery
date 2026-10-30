"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { PhoneLogin } from "@/components/auth/PhoneLogin";
import { Icon } from "@/components/Icon";
import { useStore } from "@/components/StoreProvider";
import { ApiError, call } from "@/lib/client";
import type { Order } from "@/lib/types";

import { OrderView } from "./OrderView";
import { ReturnBox } from "./ReturnBox";
import styles from "./Order.module.css";

// What the payment gateway's return trip (?payment=…) means for the customer.
const PAYMENT_RESULT: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: "" },
  failed: { ok: false, text: "پرداخت انجام نشد. اگر مبلغی از حسابت کم شده، حداکثر تا ۷۲ ساعت به حسابت برمی‌گردد. می‌توانی دوباره پرداخت کنی." },
  late: { ok: false, text: "مهلت پرداخت این سفارش تمام شده بود و سفارش لغو شد. اگر مبلغی از حسابت کم شده، حداکثر تا ۷۲ ساعت به حسابت برمی‌گردد." },
};

export function MyOrder({ number }: { number: string }) {
  const { me } = useAuth();
  const { phone } = useStore();
  const params = useSearchParams();
  const payment = PAYMENT_RESULT[params.get("payment") ?? ""];
  const celebrate = params.get("new") === "1" || params.get("payment") === "ok";
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (!me?.authenticated) return;
    call<Order>(`/orders/${encodeURIComponent(number)}`)
      .then(setOrder)
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? "این سفارش در حساب شما پیدا نشد." : "دریافت سفارش ممکن نشد."));
  }, [me, number]);

  const pay = async () => {
    setBusy(true);
    setActionError("");
    try {
      const { redirect } = await call<{ redirect: string }>("/payments/start", { method: "POST", body: { number } });
      window.location.assign(redirect);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "اتصال به درگاه ممکن نشد.");
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    setActionError("");
    try {
      setOrder(await call<Order>(`/orders/${encodeURIComponent(number)}/cancel`, { method: "POST" }));
      setConfirmCancel(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "لغو سفارش ممکن نشد.");
    } finally {
      setBusy(false);
    }
  };

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

  const unpaid = order.status === "awaiting_payment";
  const actions = unpaid && (
    <div className={styles.actions}>
      {actionError && <p className="err" role="alert">{actionError}</p>}
      {order.can_pay && (
        <button type="button" className="btn btn-ink" onClick={pay} disabled={busy}>
          <Icon name="lock" /> {busy ? "در حال انتقال به درگاه…" : "پرداخت آنلاین"}
        </button>
      )}
      {confirmCancel ? (
        <span className={styles.confirm}>
          سفارش لغو شود؟
          <button type="button" className="btn btn-ghost" onClick={cancel} disabled={busy}>بله، لغو کن</button>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmCancel(false)}>نه</button>
        </span>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => setConfirmCancel(true)}>لغو سفارش</button>
      )}
    </div>
  );

  return shell(
    <>
      {payment && !payment.ok && order.status !== "paid" && (
        <div className={styles.alert} role="alert">
          {payment.text}
          {phone && <> برای پیگیری با <a href={`tel:${phone}`} className="num" dir="ltr">{phone}</a> تماس بگیر.</>}
        </div>
      )}
      <OrderView order={order} celebrate={celebrate && order.status !== "cancelled"} actions={actions} />
      <ReturnBox order={order} onChange={setOrder} />
    </>,
  );
}
