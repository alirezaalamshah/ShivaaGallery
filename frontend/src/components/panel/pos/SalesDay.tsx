"use client";

import { useState } from "react";

import { useStore } from "@/components/StoreProvider";
import { useToast } from "@/components/Toast";
import { faDate, faDateTime, faNum, signed, toFaDigits } from "@/lib/format";

import { DateInput } from "../DateInput";
import { isoDay } from "../dates";
import { useCan } from "../access";
import { adminCall, refreshSite, useAdmin } from "../hooks";
import { Card, Empty, Modal } from "../ui";
import s from "../panel.module.css";
import p from "./pos.module.css";
import { payText } from "./Register";
import { type DayTotals, KIND_LABEL, type Sale, saleKind } from "./types";

const shift = (day: string, by: number) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + by);
  return isoDay(d);
};

/** One day's till sales with the drawer totals per payment method, for closing the till. */
export function SalesDay() {
  const store = useStore();
  const can = useCan();
  const all = can("pos.all_sales");
  const today = isoDay(new Date());
  const [day, setDay] = useState(today);
  const [open, setOpen] = useState<Sale | null>(null);
  const { data, loading, reload } = useAdmin<{ date: string; totals: DayTotals; results: Sale[] }>(`/pos/sales?date=${day}`);
  const t = data?.totals;

  return (
    <>
      <div className={p.dayNav}>
        <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => setDay(shift(day, -1))}>روز قبل</button>
        <b>{day === today ? "امروز، " : ""}{faDate(`${day}T12:00:00`)}</b>
        <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={day >= today} onClick={() => setDay(shift(day, 1))}>روز بعد</button>
        <DateInput label="انتخاب روز" value={day} max={today} onChange={setDay} style={{ width: "auto" }} />
      </div>

      {t && (
        <div className={s.stats}>
          <div className={s.stat}>
            <span>جمع فروش {all ? "صندوق" : "شما"}</span>
            <b className="num">{faNum(t.total)}</b>
            <small>{faNum(t.count)} فاکتور · {faNum(t.pieces)} عدد{t.discount ? ` · ${faNum(t.discount)} تخفیف` : ""}{t.returned ? ` · ${faNum(t.pieces_returned)} عدد پس‌گرفته (${faNum(t.returned)})` : ""}</small>
          </div>
          <div className={s.stat}>
            <span>نقد خالص (پس‌دادنی‌ها کم شده)</span>
            <b className="num">{faNum(t.cash)}</b>
            <small>{store.currency_label}</small>
          </div>
          <div className={s.stat}>
            <span>کارت‌خوان</span>
            <b className="num">{faNum(t.card)}</b>
            <small>{store.currency_label}</small>
          </div>
          <div className={s.stat}>
            <span>کارت به کارت</span>
            <b className="num">{faNum(t.transfer)}</b>
            <small>{t.voided ? `${faNum(t.voided)} فاکتور باطل‌شده حساب نشده` : store.currency_label}</small>
          </div>
        </div>
      )}

      <Card>
        {data?.results.length ? (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr><th>فاکتور</th><th>نوع</th><th>ساعت</th>{all && <th>فروشنده</th>}<th>عدد</th><th>مبلغ</th><th>پرداخت</th><th>مشتری</th><th>وضعیت</th></tr>
              </thead>
              <tbody>
                {data.results.map((x) => (
                  <tr key={x.id} className={`${s.rowLink} ${x.status === "voided" ? p.voided : ""}`} onClick={async () => setOpen(await adminCall<Sale>(`/pos/sales/${x.id}`))}>
                    <td className="num" dir="ltr">#{toFaDigits(x.number)}</td>
                    <td>{(() => {
                      const kind = saleKind(x.item_count ?? 0, x.returned_count ?? 0);
                      return kind === "sale" ? KIND_LABEL.sale : <span className="pill" data-status={kind === "return" ? "awaiting_payment" : "processing"}>{KIND_LABEL[kind]}</span>;
                    })()}</td>
                    <td className="num">{new Date(x.created_at).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</td>
                    {all && <td>{x.seller}</td>}
                    <td className="num">{faNum(x.item_count ?? 0)}{x.returned_count ? ` · ${faNum(x.returned_count)} پس‌گرفته` : ""}</td>
                    <td className={`num ${x.total < 0 ? "err" : ""}`}>{faNum(x.total)}</td>
                    <td className="muted">{payText(x)}</td>
                    <td>{x.customer_name || (x.customer_phone ? toFaDigits(x.customer_phone) : "—")}</td>
                    <td>{x.status === "voided" ? <span className="pill" data-status="cancelled">باطل شده</span> : <span className="pill" data-status="delivered">ثبت شده</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && <Empty icon="card" title="در این روز فروشی ثبت نشده" />
        )}
      </Card>

      {open && <SaleModal sale={open} canVoid={can("pos.void")} onClose={() => setOpen(null)} onVoided={(x) => { setOpen(x); reload(); }} />}
    </>
  );
}

function SaleModal({ sale, canVoid, onClose, onVoided }: { sale: Sale; canVoid: boolean; onClose: () => void; onVoided: (s: Sale) => void }) {
  const store = useStore();
  const toast = useToast();
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const doVoid = async () => {
    setBusy(true);
    try {
      onVoided(await adminCall<Sale>(`/pos/sales/${sale.id}/void`, { method: "POST", body: { reason } }));
      toast({ text: "فروش باطل شد و کالاها به موجودی برگشتند" });
      refreshSite();
      setVoiding(false);
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "باطل نشد." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`فاکتور ${KIND_LABEL[saleKind(sale.items?.length ?? 0, sale.returns?.length ?? 0)]} ${toFaDigits(sale.number)}`}
      onClose={onClose}
      footer={
        <>
          <a href={`/panel/pos/sales/${sale.id}/print`} target="_blank" rel="noopener" className={s.btn}>چاپ فاکتور</a>
          {canVoid && sale.status === "completed" && !voiding && (
            <button type="button" className={`${s.btn} ${s.btnDanger}`} onClick={() => setVoiding(true)}>ابطال فروش</button>
          )}
        </>
      }
    >
      <dl className={s.kv}>
        <dt>زمان</dt><dd>{faDateTime(sale.created_at)}</dd>
        <dt>فروشنده</dt><dd>{sale.seller}</dd>
        {(sale.customer_name || sale.customer_phone) && <><dt>مشتری</dt><dd>{sale.customer_name} <span className="num" dir="ltr">{toFaDigits(sale.customer_phone)}</span></dd></>}
        {sale.note && <><dt>یادداشت</dt><dd>{sale.note}</dd></>}
      </dl>
      <ul className={p.receiptLines}>
        {sale.items?.map((i, n) => (
          <li key={n}>
            <span>{i.product_name}، {i.color_name}، سایز <span className="num">{i.size_label}</span> × <span className="num">{faNum(i.qty)}</span></span>
            <b className="num">{faNum(i.line_total)}</b>
          </li>
        ))}
      </ul>
      {!!sale.returns?.length && (
        <>
          <b>پس گرفته شد</b>
          <ul className={p.receiptLines}>
            {sale.returns.map((r, n) => (
              <li key={n}>
                <span>{r.product_name}، {r.color_name}، سایز <span className="num">{r.size_label}</span> × <span className="num">{faNum(r.qty)}</span> · از فاکتور <span className="num" dir="ltr">{toFaDigits(r.from_sale)}</span></span>
                <b className="num">{signed("−", r.line_total)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
      <dl className={s.kv}>
        {sale.subtotal > 0 && <><dt>جمع کالاها</dt><dd className="num">{faNum(sale.subtotal)}</dd></>}
        {sale.discount > 0 && <><dt>{sale.birthday_discount ? "تخفیف تولد" : "تخفیف"}</dt><dd className="num">{signed("−", sale.discount)}</dd></>}
        {sale.returned_total > 0 && <><dt>کالاهای پس‌گرفته</dt><dd className="num">{signed("−", sale.returned_total)}</dd></>}
        <dt>{sale.total < 0 ? "پرداخت به مشتری" : "مبلغ کل"}</dt><dd className="num"><b>{faNum(Math.abs(sale.total))} {store.currency_label}</b></dd>
        <dt>پرداخت</dt><dd>{payText(sale)}</dd>
      </dl>
      {sale.status === "voided" && (
        <p className="err">باطل شده در {sale.voided_at ? faDateTime(sale.voided_at) : ""}{sale.void_reason ? ` · ${sale.void_reason}` : ""}</p>
      )}
      {voiding && (
        <div className={s.stack} style={{ marginTop: 12 }}>
          <p className="hint">کالاهای این فاکتور به موجودی برمی‌گردند (و کالاهایی که در آن پس گرفته شده دوباره از موجودی کم می‌شوند) و مبلغش از فروش روز کم می‌شود. پول را جداگانه با مشتری حساب کنید.</p>
          <input className="input" placeholder="دلیل ابطال (مثلاً: مشتری همه را پس آورد)" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          <div className={s.actions}>
            <button type="button" className={`${s.btn} ${s.btnDanger}`} disabled={busy} onClick={doVoid}>بله، باطل کن</button>
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setVoiding(false)}>انصراف</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
