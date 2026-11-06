"use client";

import { useState } from "react";

import { Select } from "@/components/Select";
import { call, fieldErrors } from "@/lib/client";
import { toEnDigits, toFaDigits } from "@/lib/format";
import { cityOptions, OTHER_CITY, PROVINCE_OPTIONS, PROVINCES, provinceOf } from "@/lib/iran";
import type { Address } from "@/lib/types";

import styles from "./Account.module.css";

type Draft = Omit<Address, "id">;

const EMPTY: Draft = { receiver_name: "", receiver_phone: "", province: "", city: "", address: "", postal_code: "" };

/** Add a saved address, or edit one. Saves to the server and hands back what it saved. */
export function AddressForm({ address, onSaved, onCancel }: { address?: Address; onSaved: (a: Address) => void; onCancel: () => void }) {
  const start = address ? { ...address, province: address.province || provinceOf(address.city) } : EMPTY;
  const [form, setForm] = useState<Draft>(start);
  const [customCity, setCustomCity] = useState(!!start.city && !(PROVINCES[start.province] ?? []).includes(start.city));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof Draft, digits = false) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [k]: digits ? toEnDigits(e.target.value) : e.target.value });
    setErrors((er) => ({ ...er, [k]: "" }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.receiver_name.trim() && form.receiver_name.trim().length < 3) errs.receiver_name = "نام تحویل‌گیرنده را کامل بنویس.";
    if (!form.province) errs.province = "استان را انتخاب کن.";
    if (!form.city.trim()) errs.city = "شهر را انتخاب کن.";
    if (form.address.trim().length < 10) errs.address = "آدرس را کامل بنویس.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const saved = await call<Address>(address ? `/addresses/${address.id}` : "/addresses", { method: address ? "PATCH" : "POST", body: form });
      onSaved(saved);
    } catch (err) {
      const f = fieldErrors(err);
      setErrors(Object.keys(f).length ? f : { form: err instanceof Error ? err.message : "ذخیره نشد." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={save} noValidate>
      <label className="field">
        <span className="label">نام تحویل‌گیرنده (اختیاری)</span>
        <input className="input" autoComplete="name" value={form.receiver_name} onChange={set("receiver_name")} aria-invalid={!!errors.receiver_name} autoFocus />
        {errors.receiver_name ? <span className="err">{errors.receiver_name}</span> : <span className="hint">اگر خالی بماند، سفارش به نام خودت ثبت می‌شود.</span>}
      </label>
      <label className="field">
        <span className="label">موبایل تحویل‌گیرنده (اختیاری)</span>
        <input className="input ltr num" inputMode="tel" value={toFaDigits(form.receiver_phone)} onChange={set("receiver_phone", true)} aria-invalid={!!errors.receiver_phone} />
        {errors.receiver_phone && <span className="err">{errors.receiver_phone}</span>}
      </label>
      <div className="row2">
        <label className="field">
          <span className="label">استان</span>
          <Select
            label="استان"
            value={form.province}
            options={PROVINCE_OPTIONS}
            invalid={!!errors.province}
            onChange={(v) => {
              setForm({ ...form, province: v, city: "" });
              setCustomCity(false);
              setErrors((er) => ({ ...er, province: "", city: "" }));
            }}
          />
          {errors.province && <span className="err">{errors.province}</span>}
        </label>
        <label className="field">
          <span className="label">شهر</span>
          <Select
            label="شهر"
            value={customCity ? OTHER_CITY : form.city}
            options={cityOptions(form.province)}
            disabled={!form.province}
            invalid={!!errors.city}
            onChange={(v) => {
              const other = v === OTHER_CITY;
              setCustomCity(other);
              setForm({ ...form, city: other ? "" : v });
              setErrors((er) => ({ ...er, city: "" }));
            }}
          />
          {errors.city && !customCity && <span className="err">{errors.city}</span>}
        </label>
      </div>
      {customCity && (
        <label className="field">
          <span className="label">نام شهر یا روستا</span>
          <input className="input" value={form.city} onChange={set("city")} aria-invalid={!!errors.city} />
          {errors.city && <span className="err">{errors.city}</span>}
        </label>
      )}
      <label className="field">
        <span className="label">آدرس کامل</span>
        <textarea className="input" autoComplete="street-address" value={form.address} onChange={set("address")} aria-invalid={!!errors.address} placeholder="خیابان، کوچه، پلاک، واحد" />
        {errors.address && <span className="err">{errors.address}</span>}
      </label>
      <label className="field">
        <span className="label">کد پستی (اختیاری)</span>
        <input className="input ltr num" inputMode="numeric" value={toFaDigits(form.postal_code)} onChange={set("postal_code", true)} aria-invalid={!!errors.postal_code} placeholder="۱۰ رقم" />
        {errors.postal_code && <span className="err">{errors.postal_code}</span>}
      </label>
      {errors.form && <p className="err" role="alert">{errors.form}</p>}
      <div className={styles.formActions}>
        <button type="submit" className="btn btn-ink" disabled={busy}>{busy ? "در حال ذخیره…" : "ذخیره‌ی آدرس"}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>انصراف</button>
      </div>
    </form>
  );
}
