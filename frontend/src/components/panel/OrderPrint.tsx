"use client";

import { useEffect } from "react";

import { useStore } from "@/components/StoreProvider";
import { faDate, faNum, toFaDigits } from "@/lib/format";

import { useAdmin } from "./hooks";
import type { AdminOrder } from "./types";

const page: React.CSSProperties = { maxWidth: 760, margin: "0 auto", padding: 24, background: "#fff", color: "#111", fontSize: 13, lineHeight: 1.9 };
const box: React.CSSProperties = { border: "1px solid #999", borderRadius: 8, padding: 14 };
const cell: React.CSSProperties = { borderBottom: "1px solid #ddd", padding: "6px 4px", textAlign: "right" };

/** An invoice for the parcel, with a cut-out address label at the bottom. Opens the print dialog by itself. */
export function OrderPrint({ id }: { id: string }) {
  const store = useStore();
  const { data: order } = useAdmin<AdminOrder>(`/orders/${id}`);

  useEffect(() => {
    if (order) setTimeout(() => print(), 300);
  }, [order]);

  if (!order) return <p style={{ padding: 24 }}>در حال آماده‌سازی…</p>;
  const receiverPhone = order.receiver_phone || order.phone;

  return (
    <div style={page}>
      <style>{"@media print { @page { margin: 12mm } body { background: #fff !important } .no-print { display: none !important } }"}</style>
      <p className="no-print" style={{ textAlign: "center" }}>
        <button type="button" onClick={() => print()} style={{ padding: "8px 18px" }}>چاپ</button>
      </p>

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>{store.name}</h1>
          <div>{[store.phone && toFaDigits(store.phone), store.landline && toFaDigits(store.landline)].filter(Boolean).join(" · ")}</div>
          {store.address && <div>{store.address}</div>}
        </div>
        <div style={{ textAlign: "left" }}>
          <b style={{ fontSize: 16 }}>فاکتور سفارش #{toFaDigits(order.number)}</b>
          <div>تاریخ: {faDate(order.created_at)}</div>
          <div>وضعیت: {order.status_label}</div>
        </div>
      </header>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <thead>
          <tr>
            <th style={cell}>کالا</th><th style={cell}>رنگ</th><th style={cell}>سایز</th><th style={cell}>کد</th><th style={cell}>تعداد</th><th style={cell}>قیمت واحد</th><th style={cell}>جمع</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((it, i) => (
            <tr key={i}>
              <td style={cell}>{it.product_name}</td>
              <td style={cell}>{it.color_name}</td>
              <td style={cell}>{it.size_label}</td>
              <td style={{ ...cell, direction: "ltr" }}>{it.sku}</td>
              <td style={cell}>{faNum(it.qty)}</td>
              <td style={cell}>{faNum(it.unit_price)}</td>
              <td style={cell}>{faNum(it.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "grid", gridTemplateColumns: "auto auto", justifyContent: "end", gap: "2px 24px", marginBottom: 20 }}>
        <span>جمع کالاها</span><b>{faNum(order.subtotal)}</b>
        <span>ارسال ({order.shipping_name})</span><b>{faNum(order.shipping_fee)}</b>
        {order.discount_amount > 0 && (<><span>{order.birthday_discount ? "تخفیف تولد" : `تخفیف ${order.discount_code}`}</span><b>{faNum(order.discount_amount)}−</b></>)}
        <span>مبلغ کل ({store.currency_label})</span><b style={{ fontSize: 15 }}>{faNum(order.total)}</b>
        <span>پرداخت</span><b>{order.paid_at ? "پرداخت شده" : "پرداخت نشده"}</b>
      </div>

      {order.note && <p style={box}>یادداشت مشتری: {order.note}</p>}

      <div style={{ borderTop: "2px dashed #888", margin: "28px 0 16px", position: "relative" }}>
        <span style={{ position: "absolute", top: -11, right: 0, background: "#fff", paddingInline: 6, fontSize: 11 }}>✂ برچسب روی بسته</span>
      </div>

      <div style={{ ...box, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 14 }}>
        <div>
          <b>گیرنده:</b> {order.receiver_name}
          <div>موبایل: <span dir="ltr">{toFaDigits(receiverPhone)}</span></div>
          <div>{order.province ? `${order.province}، ` : ""}{order.city}</div>
          <div>{order.address}</div>
          {order.postal_code && <div>کد پستی: {toFaDigits(order.postal_code)}</div>}
        </div>
        <div>
          <b>فرستنده:</b> {store.name}
          {store.phone && <div>تلفن: <span dir="ltr">{toFaDigits(store.phone)}</span></div>}
          {store.address && <div>{store.address}</div>}
          <div style={{ marginTop: 8 }}>سفارش #{toFaDigits(order.number)} · {order.shipping_name}</div>
        </div>
      </div>
    </div>
  );
}
