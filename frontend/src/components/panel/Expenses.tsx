"use client";

import { useState } from "react";

import { Icon } from "@/components/Icon";
import { useStore } from "@/components/StoreProvider";
import { useToast } from "@/components/Toast";
import { fieldErrors } from "@/lib/client";
import { faDate, faNum } from "@/lib/format";

import { DateInput } from "./DateInput";
import { RANGES, isoDay, rangeOf, type RangeValue } from "./dates";
import { adminCall, useAdmin } from "./hooks";
import { useCan } from "./access";
import { Card, ConfirmButton, Empty, Field, Modal, MoneyInput, PageHead, SwitchRow } from "./ui";
import s from "./panel.module.css";

type Expense = { id: number; day: string; category: string; category_label: string; amount: number; note: string; from_till: boolean };
type List = { total: number; categories: { value: string; label: string }[]; results: Expense[] };
type Draft = { id?: number; day: string; category: string; amount: number | null; note: string; from_till: boolean };

const blank = (): Draft => ({ day: isoDay(new Date()), category: "other", amount: null, note: "", from_till: false });

/**
 * The shop's running costs (rent, wages, bills, ads …), which the profit report takes off the
 * gross profit. Buying stock is not entered here: that is the products' purchase price.
 */
export function Expenses() {
  const store = useStore();
  const toast = useToast();
  const [range, setRange] = useState<RangeValue>("month");
  const can = useCan();
  const [custom, setCustom] = useState({ from: "", to: "" });
  const params = new URLSearchParams(rangeOf(range, custom) as Record<string, string>).toString();
  const { data, loading, reload } = useAdmin<List>(`/expenses?${params}`);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const byCategory = new Map<string, number>();
  data?.results.forEach((e) => byCategory.set(e.category_label, (byCategory.get(e.category_label) ?? 0) + e.amount));

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setErrors({});
    try {
      const body = { day: draft.day, category: draft.category, amount: draft.amount, note: draft.note, from_till: draft.from_till };
      await adminCall(draft.id ? `/expenses/${draft.id}` : "/expenses", { method: draft.id ? "PATCH" : "POST", body });
      toast({ text: "ذخیره شد" });
      setDraft(null);
      reload();
    } catch (e) {
      setErrors(fieldErrors(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await adminCall(`/expenses/${id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "حذف نشد." });
    }
  };

  return (
    <>
      <PageHead title="هزینه‌ها" sub="اجاره، حقوق، قبوض، تبلیغات و هزینه‌های جاری دیگر. خرید جنس را این‌جا ننویسید؛ قیمت خرید هر محصول در خود محصول ثبت می‌شود.">
        {can("expenses.edit") && (
        <button type="button" className={s.btn} onClick={() => { setErrors({}); setDraft(blank()); }}>
          <Icon name="plus" /> هزینه‌ی جدید
        </button>
        )}
      </PageHead>

      <Card>
        <div className={s.toolbar} style={{ marginBottom: 0 }}>
          <select className="input" aria-label="بازه‌ی زمانی" value={range} onChange={(e) => setRange(e.target.value as RangeValue)} style={{ width: "auto" }}>
            {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {range === "custom" && (
            <>
              <DateInput label="از" placeholder="از" value={custom.from} max={custom.to || undefined} clearable onChange={(v) => setCustom({ ...custom, from: v })} style={{ width: "auto" }} />
              <DateInput label="تا" placeholder="تا" value={custom.to} min={custom.from || undefined} clearable onChange={(v) => setCustom({ ...custom, to: v })} style={{ width: "auto" }} />
            </>
          )}
        </div>
      </Card>

      {data && (
        <div className={s.stats}>
          <div className={s.stat}><span>جمع هزینه‌ها</span><b className="num">{faNum(data.total)}</b><small>{store.currency_label} · {faNum(data.results.length)} مورد</small></div>
          {[...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, total]) => (
            <div key={label} className={s.stat}><span>{label}</span><b className="num">{faNum(total)}</b><small>{store.currency_label}</small></div>
          ))}
        </div>
      )}

      <Card>
        {data?.results.length ? (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>تاریخ</th><th>دسته</th><th>شرح</th><th>مبلغ ({store.currency_label})</th><th>از صندوق</th><th /></tr></thead>
              <tbody>
                {data.results.map((e) => (
                  <tr key={e.id} className={can("expenses.edit") ? s.rowLink : undefined} onClick={can("expenses.edit") ? () => { setErrors({}); setDraft({ ...e }); } : undefined}>
                    <td>{faDate(`${e.day}T12:00:00`)}</td>
                    <td>{e.category_label}</td>
                    <td className="muted">{e.note || "—"}</td>
                    <td className="num">{faNum(e.amount)}</td>
                    <td>{e.from_till ? "بله" : ""}</td>
                    <td onClick={(ev) => ev.stopPropagation()}>{can("expenses.delete") && <ConfirmButton label="حذف" small onConfirm={() => remove(e.id)} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && <Empty icon="wallet" title="در این بازه هزینه‌ای ثبت نشده" />
        )}
      </Card>

      {draft && data && (
        <Modal
          title={draft.id ? "ویرایش هزینه" : "هزینه‌ی جدید"}
          onClose={() => setDraft(null)}
          footer={<button type="button" className={s.btn} disabled={busy} onClick={save}>ذخیره</button>}
        >
          <div className={s.formGrid}>
            <Field label="تاریخ" error={errors.day}>
              <DateInput value={draft.day} max={isoDay(new Date())} invalid={!!errors.day} onChange={(v) => setDraft({ ...draft, day: v })} />
            </Field>
            <Field label="دسته" error={errors.category}>
              <select className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                {data.categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            <Field label={`مبلغ (${store.currency_label})`} error={errors.amount}>
              <MoneyInput id="expense-amount" value={draft.amount} onChange={(v) => setDraft({ ...draft, amount: v })} placeholder="۰" />
            </Field>
            <Field label="شرح (اختیاری)" error={errors.note}>
              <input className="input" value={draft.note} maxLength={200} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="مثلاً قبض برق مهر" />
            </Field>
          </div>
          <SwitchRow
            title="از صندوق مغازه پرداخت شد"
            hint="از نقدی که موقع بستن صندوق آن روز باید در صندوق باشد کم می‌شود"
            checked={draft.from_till}
            onChange={(v) => setDraft({ ...draft, from_till: v })}
          />
        </Modal>
      )}
    </>
  );
}
