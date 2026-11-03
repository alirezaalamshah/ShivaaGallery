"use client";

import { useEffect } from "react";

import { useStore } from "@/components/StoreProvider";
import { faDateTime, faNum, toFaDigits } from "@/lib/format";

import { useAdmin } from "../hooks";
import p from "./pos.module.css";
import { payText } from "./Register";
import type { Sale } from "./types";

/** A till receipt sized for an 80 mm receipt printer; it also prints fine on A4. */
export function Receipt({ id }: { id: string }) {
  const store = useStore();
  const { data: sale, error } = useAdmin<Sale>(`/pos/sales/${id}`);

  useEffect(() => {
    if (!sale) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [sale]);

  if (error) return <p className="err" style={{ padding: 24 }}>{error}</p>;
  if (!sale) return null;

  return (
    <div className={p.receipt}>
      <header>
        {store.logo && (
          // eslint-disable-next-line @next/next/no-img-element -- printed brand mark
          <img src={store.logo} alt="" />
        )}
        <h1>{store.name}</h1>
        {store.address && <p>{store.address}</p>}
        {(store.phone || store.landline) && <p className="num" dir="ltr">{toFaDigits([store.landline, store.phone].filter(Boolean).join(" · "))}</p>}
      </header>
      <dl>
        <dt>شماره فاکتور</dt><dd className="num" dir="ltr">{toFaDigits(sale.number)}</dd>
        <dt>تاریخ</dt><dd>{faDateTime(sale.created_at)}</dd>
        <dt>فروشنده</dt><dd>{sale.seller}</dd>
        {sale.customer_name && <><dt>مشتری</dt><dd>{sale.customer_name}</dd></>}
      </dl>
      <table>
        <thead>
          <tr><th>کالا</th><th>تعداد</th><th>مبلغ</th></tr>
        </thead>
        <tbody>
          {sale.items?.map((i, n) => (
            <tr key={n}>
              <td>{i.product_name}<small>{i.color_name}، سایز {i.size_label} · {faNum(i.unit_price)}</small></td>
              <td className="num">{faNum(i.qty)}</td>
              <td className="num">{faNum(i.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!!sale.returns?.length && (
        <table>
          <thead>
            <tr><th>پس گرفته شد</th><th>تعداد</th><th>مبلغ</th></tr>
          </thead>
          <tbody>
            {sale.returns.map((r, n) => (
              <tr key={n}>
                <td>{r.product_name}<small>{r.color_name}، سایز {r.size_label} · از فاکتور {toFaDigits(r.from_sale)}</small></td>
                <td className="num">{faNum(r.qty)}</td>
                <td className="num">{faNum(r.line_total)}−</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <dl>
        {sale.subtotal > 0 && <><dt>جمع کالاها</dt><dd className="num">{faNum(sale.subtotal)}</dd></>}
        {sale.discount > 0 && <><dt>{sale.birthday_discount ? "تخفیف تولد" : "تخفیف"}</dt><dd className="num">{faNum(sale.discount)}</dd></>}
        {sale.returned_total > 0 && <><dt>کالاهای پس‌گرفته</dt><dd className="num">{faNum(sale.returned_total)}−</dd></>}
        <dt className={p.receiptTotal}>{sale.total < 0 ? "پرداخت به مشتری" : "مبلغ کل"} ({store.currency_label})</dt><dd className={`num ${p.receiptTotal}`}>{faNum(Math.abs(sale.total))}</dd>
        <dt>پرداخت</dt><dd>{payText(sale)}</dd>
      </dl>
      {sale.status === "voided" && <p className={p.receiptVoid}>این فاکتور باطل شده است</p>}
      <footer>
        <p>از خرید شما سپاسگزاریم</p>
        {store.returns.enabled && <p>مهلت تعویض: {faNum(store.returns.days)} روز با همراه داشتن این فاکتور</p>}
        {store.instagram && <p dir="ltr">instagram.com/{store.instagram}</p>}
      </footer>
      <button type="button" className={p.printBtn} onClick={() => window.print()}>چاپ دوباره</button>
    </div>
  );
}
