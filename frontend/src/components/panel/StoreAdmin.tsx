"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { fieldErrors } from "@/lib/client";
import { faDateTime, faNum, toFaDigits } from "@/lib/format";

import { adminCall, refreshSite, useAdmin } from "./hooks";
import type { Paged } from "./types";
import { Card, ConfirmButton, Empty, Field, Modal, MoneyInput, PageHead, Switch, SwitchRow } from "./ui";
import s from "./panel.module.css";

/* ---------- inventory ledger ---------- */

type Movement = { id: number; created_at: string; product: string; color: string; size: string; delta: number; balance: number; reason: string; reason_label: string; reference: string; note: string; by: string };

const REASONS = [
  { value: "", label: "همه" },
  { value: "receive", label: "ورود کالا" },
  { value: "sale", label: "فروش" },
  { value: "cancel", label: "لغو سفارش" },
  { value: "return", label: "مرجوعی" },
  { value: "adjust", label: "اصلاح دستی" },
];

export function Inventory() {
  const [reason, setReason] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const qs = new URLSearchParams({ page: String(page), ...(reason && { reason }), ...(search && { search }) });
  const { data, loading } = useAdmin<Paged<Movement>>(`/stock-movements?${qs}`);
  return (
    <>
      <PageHead title="انبار" sub="هر تغییر موجودی با دلیلش این‌جا ثبت می‌شود. برای تغییر موجودی، محصول را ویرایش کنید." />
      <Card>
        <div className={s.toolbar}>
          <div className={s.tabs} role="group" aria-label="علت">
            {REASONS.map((r) => (
              <button key={r.value} type="button" className={s.tab} aria-pressed={reason === r.value} onClick={() => { setReason(r.value); setPage(1); }}>{r.label}</button>
            ))}
          </div>
          <label className={s.search}>
            <Icon name="search" />
            <span className="sr-only">جستجو</span>
            <input id="mv-search" className="input" placeholder="محصول، کد انبار یا شماره سفارش" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </label>
        </div>
        {data?.results.length ? (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>زمان</th><th>محصول</th><th>رنگ / سایز</th><th>تغییر</th><th>موجودی بعد</th><th>علت</th><th>مرجع</th><th>توسط</th></tr></thead>
              <tbody>
                {data.results.map((m) => (
                  <tr key={m.id}>
                    <td className="muted">{faDateTime(m.created_at)}</td>
                    <td>{m.product}</td>
                    <td>{m.color} · <span className="num">{m.size}</span></td>
                    <td className="num" style={{ color: m.delta > 0 ? "#22663e" : "var(--sale)", fontWeight: 700 }} dir="ltr">{m.delta > 0 ? "+" : ""}{faNum(m.delta)}</td>
                    <td className="num">{faNum(m.balance)}</td>
                    <td>{m.reason_label}{m.note ? <small className="muted" style={{ display: "block" }}>{m.note}</small> : null}</td>
                    <td className="num" dir="ltr">{m.reference ? `#${toFaDigits(m.reference)}` : "—"}</td>
                    <td className="muted">{m.by || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && <Empty icon="ret" title="گردشی پیدا نشد" />
        )}
        {data && (data.next || data.previous) && (
          <div className={s.toolbar} style={{ justifyContent: "center", marginTop: 14, marginBottom: 0 }}>
            <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={!data.previous} onClick={() => setPage(page - 1)}>قبلی</button>
            <span className="muted num">صفحه‌ی {faNum(page)}</span>
            <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={!data.next} onClick={() => setPage(page + 1)}>بعدی</button>
          </div>
        )}
      </Card>
    </>
  );
}

/* ---------- shipping methods ---------- */

type Method = { id?: number; name: string; description: string; fee: number | null; only_city: string; is_active: boolean; sort: number };

export function Shipping() {
  const toast = useToast();
  const { data, reload } = useAdmin<Method[]>("/shipping-methods");
  const [draft, setDraft] = useState<Method | null>(null);
  const save = async () => {
    if (!draft) return;
    try {
      await adminCall(draft.id ? `/shipping-methods/${draft.id}` : "/shipping-methods", { method: draft.id ? "PATCH" : "POST", body: { ...draft, fee: draft.fee ?? 0 } });
      setDraft(null);
      reload();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "ذخیره نشد." });
    }
  };
  const del = async (id: number) => {
    try {
      await adminCall(`/shipping-methods/${id}`, { method: "DELETE" });
      setDraft(null);
      reload();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "حذف نشد." });
    }
  };
  return (
    <>
      <PageHead title="روش‌های ارسال" sub="هزینه‌ی هر روش ثابت است و در تسویه‌حساب به مشتری نشان داده می‌شود.">
        <button type="button" className={s.btn} onClick={() => setDraft({ name: "", description: "", fee: null, only_city: "", is_active: true, sort: data?.length ?? 0 })}><Icon name="plus" /> روش جدید</button>
      </PageHead>
      <Card>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>روش</th><th>هزینه (تومان)</th><th>محدود به شهر</th><th>فعال</th><th /></tr></thead>
            <tbody>
              {data?.map((m) => (
                <tr key={m.id}>
                  <td><b>{m.name}</b><small className="muted" style={{ display: "block" }}>{m.description}</small></td>
                  <td className="num">{faNum(m.fee ?? 0)}</td>
                  <td>{m.only_city || <span className="muted">همه‌ی شهرها</span>}</td>
                  <td><Switch checked={m.is_active} onChange={async (v) => { await adminCall(`/shipping-methods/${m.id}`, { method: "PATCH", body: { is_active: v } }); reload(); }} label={`فعال بودن ${m.name}`} /></td>
                  <td><button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => setDraft(m)}>ویرایش</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {draft && (
        <Modal title={draft.id ? `ویرایش «${draft.name}»` : "روش ارسال جدید"} onClose={() => setDraft(null)} footer={<>
          {draft.id && <span style={{ marginInlineEnd: "auto" }}><ConfirmButton label="حذف" onConfirm={() => del(draft.id!)} /></span>}
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setDraft(null)}>انصراف</button>
          <button type="button" className={s.btn} onClick={save}>ذخیره</button>
        </>}>
          <div className={s.formGrid}>
            <Field label="نام روش"><input id="sh-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus placeholder="مثلاً پست پیشتاز" /></Field>
            <Field label="هزینه (تومان)"><MoneyInput id="sh-fee" value={draft.fee} onChange={(v) => setDraft({ ...draft, fee: v })} /></Field>
            <Field label="توضیح کوتاه" full><input id="sh-desc" className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="مثلاً سراسر ایران · ۲ تا ۴ روز کاری" /></Field>
            <Field label="فقط برای شهر (اختیاری)" hint="مثلاً پیک فقط برای شهر خودتان" full><input id="sh-city" className="input" value={draft.only_city} onChange={(e) => setDraft({ ...draft, only_city: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------- discount codes ---------- */

type Discount = { id?: number; code: string; kind: "percent" | "fixed"; value: number | null; max_amount: number | null; min_subtotal: number | null; max_uses: number | null; used_count?: number; ends_at: string | null; is_active: boolean };

export function Discounts() {
  const toast = useToast();
  const { data, reload } = useAdmin<Discount[]>("/discounts");
  const [draft, setDraft] = useState<Discount | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = async () => {
    if (!draft) return;
    try {
      await adminCall(draft.id ? `/discounts/${draft.id}` : "/discounts", { method: draft.id ? "PATCH" : "POST", body: { ...draft, min_subtotal: draft.min_subtotal ?? 0, value: draft.value ?? 0, ends_at: draft.ends_at || null } });
      setDraft(null);
      reload();
    } catch (e) {
      setErrors(fieldErrors(e));
    }
  };
  return (
    <>
      <PageHead title="کدهای تخفیف" sub="مشتری کد را در تسویه‌حساب وارد می‌کند.">
        <button type="button" className={s.btn} onClick={() => { setErrors({}); setDraft({ code: "", kind: "percent", value: 10, max_amount: null, min_subtotal: null, max_uses: null, ends_at: null, is_active: true }); }}><Icon name="plus" /> کد جدید</button>
      </PageHead>
      <Card>
        {data?.length ? (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>کد</th><th>تخفیف</th><th>حداقل خرید</th><th>استفاده</th><th>پایان</th><th>فعال</th><th /></tr></thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.id}>
                    <td dir="ltr" style={{ textAlign: "right" }}><b>{d.code}</b></td>
                    <td className="num">{d.kind === "percent" ? `${faNum(d.value ?? 0)}٪${d.max_amount ? ` تا ${faNum(d.max_amount)}` : ""}` : `${faNum(d.value ?? 0)} تومان`}</td>
                    <td className="num">{d.min_subtotal ? faNum(d.min_subtotal) : "—"}</td>
                    <td className="num">{faNum(d.used_count ?? 0)}{d.max_uses ? ` از ${faNum(d.max_uses)}` : ""}</td>
                    <td className="muted">{d.ends_at ? faDateTime(d.ends_at) : "بدون پایان"}</td>
                    <td><Switch checked={d.is_active} onChange={async (v) => { await adminCall(`/discounts/${d.id}`, { method: "PATCH", body: { is_active: v } }); reload(); }} label={`فعال بودن ${d.code}`} /></td>
                    <td><button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => { setErrors({}); setDraft(d); }}>ویرایش</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="card" title="هنوز کد تخفیفی نساخته‌اید" />
        )}
      </Card>
      {draft && (
        <Modal title={draft.id ? `ویرایش ${draft.code}` : "کد تخفیف جدید"} onClose={() => setDraft(null)} footer={<>
          {draft.id && <span style={{ marginInlineEnd: "auto" }}><ConfirmButton label="حذف" onConfirm={async () => { await adminCall(`/discounts/${draft.id}`, { method: "DELETE" }).catch((e) => toast({ text: e.message })); setDraft(null); reload(); }} /></span>}
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setDraft(null)}>انصراف</button>
          <button type="button" className={s.btn} onClick={save}>ذخیره</button>
        </>}>
          <div className={s.formGrid}>
            <Field label="کد (حروف انگلیسی و عدد)" error={errors.code}><input id="dc-code" className="input ltr" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} autoFocus placeholder="مثلاً YALDA20" /></Field>
            <Field label="نوع">
              <select id="dc-kind" className="input" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Discount["kind"] })}>
                <option value="percent">درصدی</option>
                <option value="fixed">مبلغ ثابت</option>
              </select>
            </Field>
            <Field label={draft.kind === "percent" ? "درصد تخفیف" : "مبلغ تخفیف (تومان)"} error={errors.value}><MoneyInput id="dc-value" value={draft.value} onChange={(v) => setDraft({ ...draft, value: v })} /></Field>
            {draft.kind === "percent" && <Field label="سقف مبلغ تخفیف (اختیاری)"><MoneyInput id="dc-max" value={draft.max_amount} onChange={(v) => setDraft({ ...draft, max_amount: v })} /></Field>}
            <Field label="حداقل مبلغ خرید (اختیاری)"><MoneyInput id="dc-min" value={draft.min_subtotal} onChange={(v) => setDraft({ ...draft, min_subtotal: v })} /></Field>
            <Field label="حداکثر دفعات استفاده (اختیاری)"><MoneyInput id="dc-uses" value={draft.max_uses} onChange={(v) => setDraft({ ...draft, max_uses: v })} /></Field>
            <Field label="تاریخ پایان (اختیاری)" full><input id="dc-end" type="datetime-local" className="input ltr" value={draft.ends_at ? draft.ends_at.slice(0, 16) : ""} onChange={(e) => setDraft({ ...draft, ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------- store settings ---------- */

type Settings = {
  name: string; name_latin: string; tagline: string; logo: string | null;
  hero_title: string; hero_text: string; about_title: string; about_text: string;
  color_ink: string; color_accent: string; color_background: string;
  phone: string; landline: string; instagram: string; city: string; address: string; currency_label: string;
  returns_enabled: boolean; returns_type: "refund" | "exchange"; returns_days: number; returns_policy: string;
};

export function StoreSettings() {
  const toast = useToast();
  const { data, setData } = useAdmin<Settings>("/store");
  const [logo, setLogo] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  if (!data) return <PageHead title="تنظیمات فروشگاه" sub="در حال بارگذاری…" />;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setData({ ...data, [k]: v });

  const save = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(data)) {
        if (k === "logo") continue;
        fd.append(k, typeof v === "boolean" ? String(v) : String(v ?? ""));
      }
      if (logo) fd.append("logo", logo);
      setData(await adminCall<Settings>("/store", { method: "PATCH", form: fd }));
      setLogo(null);
      setErrors({});
      await refreshSite();
      toast({ text: "تنظیمات ذخیره شد. سایت به‌روز شد." });
    } catch (e) {
      setErrors(fieldErrors(e));
      toast({ text: e instanceof Error ? e.message : "ذخیره نشد." });
    } finally {
      setSaving(false);
    }
  };

  const text = (k: keyof Settings, label: string, opts: { hint?: string; full?: boolean; area?: boolean; ltr?: boolean } = {}) => (
    <Field label={label} hint={opts.hint} error={errors[k]} full={opts.full}>
      {opts.area ? (
        <textarea id={`st-${k}`} className="input" value={String(data[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} />
      ) : (
        <input id={`st-${k}`} className={`input ${opts.ltr ? "ltr" : ""}`} value={String(data[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} />
      )}
    </Field>
  );

  const color = (k: "color_ink" | "color_accent" | "color_background", label: string, hint: string) => (
    <Field label={label} hint={hint} error={errors[k]}>
      <span style={{ display: "flex", gap: 8 }}>
        <input type="color" aria-label={label} value={data[k]} onChange={(e) => set(k, e.target.value.toUpperCase())} style={{ width: 56, height: 48, border: 0, background: "none", padding: 0 }} />
        <input id={`st-${k}`} className="input ltr" value={data[k]} onChange={(e) => set(k, e.target.value)} />
      </span>
    </Field>
  );

  return (
    <>
      <PageHead title="تنظیمات فروشگاه" sub="هر چیزی که این‌جا تغییر دهید، بلافاصله در سایت دیده می‌شود.">
        <button type="button" className={s.btn} onClick={save} disabled={saving}><Icon name="check" /> {saving ? "در حال ذخیره…" : "ذخیره"}</button>
      </PageHead>
      <div className={s.cols}>
        <div className={s.stack}>
          <Card title="هویت فروشگاه">
            <div className={s.formGrid}>
              {text("name", "نام فروشگاه")}
              {text("name_latin", "نام لاتین", { ltr: true })}
              {text("tagline", "شعار کوتاه", { full: true, hint: "زیر لوگو و در عنوان صفحه‌ها می‌آید" })}
              <Field label="لوگو" hint="عکس مربعی، ترجیحاً با زمینه‌ی تیره یا شفاف" full>
                <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- current logo or local preview */}
                  {(logo || data.logo) && <img src={logo ? URL.createObjectURL(logo) : data.logo!} alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", boxShadow: "0 0 0 1px var(--accent)" }} />}
                  <input id="st-logo" type="file" accept="image/*" className="input" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
                </span>
              </Field>
            </div>
          </Card>
          <Card title="صفحه‌ی اصلی">
            <div className={s.formGrid}>
              {text("hero_title", "تیتر بزرگ", { full: true, hint: "بخشی را که بین دو ستاره بنویسید طلایی می‌شود؛ مثلاً: درخشش، *به سبک تو*" })}
              {text("hero_text", "متن زیر تیتر", { full: true, area: true })}
              {text("about_title", "تیتر بخش معرفی فروشگاه", { full: true })}
              {text("about_text", "متن معرفی فروشگاه", { full: true, area: true })}
            </div>
          </Card>
          <Card title="تماس و فروشگاه حضوری">
            <div className={s.formGrid}>
              {text("phone", "موبایل", { ltr: true })}
              {text("landline", "تلفن ثابت", { ltr: true })}
              {text("instagram", "اینستاگرام (بدون @)", { ltr: true })}
              {text("city", "شهر")}
              {text("currency_label", "واحد پول")}
              {text("address", "آدرس فروشگاه حضوری", { full: true, area: true })}
            </div>
          </Card>
          <Card title="مرجوعی">
            <SwitchRow title="امکان مرجوعی" hint="خاموش باشد، صفحه‌ی قوانین مرجوعی و نشانه‌هایش از سایت برداشته می‌شود" checked={data.returns_enabled} onChange={(v) => set("returns_enabled", v)} />
            {data.returns_enabled && (
              <div className={s.formGrid} style={{ marginTop: 10 }}>
                <Field label="نوع">
                  <select id="st-rtype" className="input" value={data.returns_type} onChange={(e) => set("returns_type", e.target.value as Settings["returns_type"])}>
                    <option value="refund">بازگشت وجه یا تعویض</option>
                    <option value="exchange">فقط تعویض سایز</option>
                  </select>
                </Field>
                <Field label="مهلت (روز)">
                  <input id="st-rdays" className="input ltr num" inputMode="numeric" value={toFaDigits(data.returns_days)} onChange={(e) => set("returns_days", Number(e.target.value.replace(/[^\d۰-۹]/g, "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))) || 0)} />
                </Field>
                {text("returns_policy", "متن قوانین مرجوعی", { full: true, area: true })}
              </div>
            )}
          </Card>
        </div>
        <div className={s.stack}>
          <Card title="رنگ‌های برند">
            <div style={{ display: "grid", gap: 14 }}>
              {color("color_ink", "رنگ اصلی", "متن، دکمه‌ها و بخش‌های تیره")}
              {color("color_accent", "رنگ تأکید", "طلایی لوگو، خطوط و نشانه‌ها")}
              {color("color_background", "رنگ زمینه", "زمینه‌ی کل سایت")}
              <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid var(--line)" }} aria-label="پیش‌نمایش رنگ‌ها">
                <div style={{ background: data.color_background, padding: 16, display: "grid", gap: 10 }}>
                  <b style={{ color: data.color_ink, fontFamily: "var(--f-display)", fontSize: 20 }}>{data.name}</b>
                  <span style={{ display: "inline-flex", alignSelf: "start", padding: "8px 16px", borderRadius: 999, background: data.color_ink, color: data.color_accent, fontWeight: 700, fontSize: 13, width: "fit-content" }}>افزودن به سبد</span>
                  <span style={{ height: 3, borderRadius: 2, background: data.color_accent, width: "40%" }} />
                </div>
              </div>
            </div>
          </Card>
          <button type="button" className={s.btn} onClick={save} disabled={saving} style={{ height: 50 }}><Icon name="check" /> {saving ? "در حال ذخیره…" : "ذخیره‌ی تنظیمات"}</button>
        </div>
      </div>
    </>
  );
}
