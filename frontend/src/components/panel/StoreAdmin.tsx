"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { Select } from "@/components/Select";
import { useToast } from "@/components/Toast";
import { fieldErrors } from "@/lib/client";
import { faDateTime, faNum, latinCode, toEnDigits, toFaDigits } from "@/lib/format";

import { DateTimeInput } from "./DateInput";
import { adminCall, refreshSite, useAdmin } from "./hooks";
import type { Paged } from "./types";
import { PhotoCropper } from "./PhotoCropper";
import { Card, ConfirmButton, Empty, Field, Modal, MoneyInput, PageHead, Pager, SaveBar, Switch, SwitchRow } from "./ui";
import s from "./panel.module.css";

/* ---------- inventory ledger ---------- */

type Movement = { id: number; created_at: string; product: string; color: string; size: string; delta: number; balance: number; reason: string; reason_label: string; reference: string; note: string; by: string };

const REASONS = [
  { value: "", label: "همه" },
  { value: "receive", label: "ورود کالا" },
  { value: "sale", label: "فروش اینترنتی" },
  { value: "store_sale", label: "فروش حضوری" },
  { value: "cancel", label: "لغو سفارش" },
  { value: "return", label: "مرجوعی" },
  { value: "adjust", label: "اصلاح دستی" },
  { value: "stocktake", label: "انبارگردانی" },
  { value: "supplier", label: "مرجوع به تأمین‌کننده" },
  { value: "damaged", label: "خراب" },
  { value: "lost", label: "گم‌شده" },
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
      <PageHead title="دفتر موجودی" sub="هر تغییر موجودی با دلیلش این‌جا ثبت می‌شود: فروش، لغو سفارش، ورود کالا، انبارگردانی و کسر موجودی." />
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
                  <tr key={m.id} className={m.delta > 0 ? s.rowIn : s.rowOut}>
                    <td className="muted">{faDateTime(m.created_at)}</td>
                    <td>{m.product}</td>
                    <td>{m.color}، سایز <span className="num">{m.size}</span></td>
                    <td className={`num ${s.delta}`} dir="ltr">{m.delta > 0 ? "+" : ""}{faNum(m.delta)}</td>
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
        {data && <Pager page={page} pages={data.pages} onChange={setPage} />}
      </Card>
    </>
  );
}

/* ---------- shipping methods ---------- */

type Method = { id?: number; name: string; description: string; fee: number | null; free_from: number | null; only_city: string; needs_postal_code: boolean; is_active: boolean; sort: number };

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
      <PageHead title="روش‌های ارسال" sub="هزینه‌ی هر روش در تسویه‌حساب به مشتری نشان داده می‌شود. برای هر روش می‌توانید مبلغی بگذارید که از آن به بالا ارسال رایگان باشد.">
        <button type="button" className={s.btn} onClick={() => setDraft({ name: "", description: "", fee: null, free_from: null, only_city: "", needs_postal_code: true, is_active: true, sort: data?.length ?? 0 })}><Icon name="plus" /> روش جدید</button>
      </PageHead>
      <Card>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>روش</th><th>هزینه (تومان)</th><th>رایگان از خرید (تومان)</th><th>محدود به شهر</th><th>فعال</th><th /></tr></thead>
            <tbody>
              {data?.map((m) => (
                <tr key={m.id}>
                  <td><b>{m.name}</b><small className="muted" style={{ display: "block" }}>{m.description}</small></td>
                  <td className="num">{faNum(m.fee ?? 0)}</td>
                  <td className="num">{m.free_from === null ? <span className="muted">هیچ‌وقت</span> : faNum(m.free_from)}</td>
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
            <Field
              label="ارسال رایگان از خرید (تومان، اختیاری)"
              hint="اگر جمع کالاهای سفارش (بعد از کد تخفیف) به این مبلغ برسد، این روش برای مشتری رایگان می‌شود. در صفحه‌ی پرداخت به مشتری می‌گوییم چقدر دیگر بخرد تا رایگان شود. خالی یعنی هیچ‌وقت رایگان نیست."
              full
            >
              <MoneyInput id="sh-free" value={draft.free_from} onChange={(v) => setDraft({ ...draft, free_from: v })} placeholder="مثلاً ۳٬۰۰۰٬۰۰۰" />
            </Field>
            <Field label="توضیح کوتاه" full><input id="sh-desc" className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="مثلاً سراسر ایران · ۲ تا ۴ روز کاری" /></Field>
            <Field label="فقط برای شهر (اختیاری)" hint="مثلاً پیک فقط برای شهر خودتان" full><input id="sh-city" className="input" value={draft.only_city} onChange={(e) => setDraft({ ...draft, only_city: e.target.value })} /></Field>
          </div>
          <SwitchRow title="کد پستی لازم است" hint="برای پست و تیپاکس روشن کنید؛ مشتری بدون کد پستی نمی‌تواند این روش را انتخاب کند" checked={draft.needs_postal_code} onChange={(v) => setDraft({ ...draft, needs_postal_code: v })} />
        </Modal>
      )}
    </>
  );
}

/* ---------- discount codes ---------- */

type Discount = { id?: number; code: string; kind: "percent" | "fixed"; value: number | null; max_amount: number | null; min_subtotal: number | null; max_uses: number | null; once_per_customer: boolean; used_count?: number; ends_at: string | null; is_active: boolean };

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
        <button type="button" className={s.btn} onClick={() => { setErrors({}); setDraft({ code: "", kind: "percent", value: 10, max_amount: null, min_subtotal: null, max_uses: null, once_per_customer: true, ends_at: null, is_active: true }); }}><Icon name="plus" /> کد جدید</button>
      </PageHead>
      <Card>
        {data?.length ? (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>کد</th><th>تخفیف</th><th>حداقل خرید</th><th>استفاده</th><th>پایان</th><th>فعال</th><th /></tr></thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.id}>
                    <td dir="ltr"><b>{d.code}</b></td>
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
            <Field label="کد (حروف بزرگ انگلیسی و عدد)" error={errors.code} hint="حروف کوچک و حروفی که با کیبورد فارسی تایپ شوند خودکار به حروف بزرگ انگلیسی تبدیل می‌شوند؛ مشتری هم همین‌طور تایپ می‌کند."><input id="dc-code" className="input ltr" value={draft.code} onChange={(e) => setDraft({ ...draft, code: latinCode(e.target.value) })} autoFocus autoComplete="off" spellCheck={false} placeholder="مثلاً YALDA20" /></Field>
            <Field label="نوع">
              <Select id="dc-kind" label="نوع" value={draft.kind} options={[{ value: "percent", label: "درصدی" }, { value: "fixed", label: "مبلغ ثابت" }]} onChange={(v) => setDraft({ ...draft, kind: v as Discount["kind"] })} />
            </Field>
            <Field label={draft.kind === "percent" ? "درصد تخفیف" : "مبلغ تخفیف (تومان)"} error={errors.value}><MoneyInput id="dc-value" value={draft.value} onChange={(v) => setDraft({ ...draft, value: v })} /></Field>
            {draft.kind === "percent" && <Field label="سقف مبلغ تخفیف (اختیاری)"><MoneyInput id="dc-max" value={draft.max_amount} onChange={(v) => setDraft({ ...draft, max_amount: v })} /></Field>}
            <Field label="حداقل مبلغ خرید (اختیاری)"><MoneyInput id="dc-min" value={draft.min_subtotal} onChange={(v) => setDraft({ ...draft, min_subtotal: v })} /></Field>
            <Field label="حداکثر دفعات استفاده (اختیاری)"><MoneyInput id="dc-uses" value={draft.max_uses} onChange={(v) => setDraft({ ...draft, max_uses: v })} /></Field>
            <Field label="تاریخ پایان (اختیاری)" full><DateTimeInput id="dc-end" value={draft.ends_at} defaultTime="23:55" onChange={(v) => setDraft({ ...draft, ends_at: v })} /></Field>
          </div>
          <SwitchRow title="هر مشتری فقط یک بار" hint="خاموش باشد، یک مشتری می‌تواند این کد را در چند سفارش استفاده کند" checked={draft.once_per_customer} onChange={(v) => setDraft({ ...draft, once_per_customer: v })} />
        </Modal>
      )}
    </>
  );
}

/* ---------- store settings ---------- */

type Settings = {
  name: string; name_latin: string; tagline: string; logo: string | null;
  hero_title: string; hero_text: string; about_title: string; about_text: string;
  theme: "day" | "night";
  phone: string; landline: string; instagram: string; city: string;
  socials: Social[]; social_networks: { value: string; label: string }[]; address: string; currency_label: string;
  returns_enabled: boolean; returns_type: "refund" | "exchange"; returns_days: number; returns_policy: string;
  terms_text: string; privacy_text: string; working_hours: string; enamad_id: string; enamad_code: string;
  order_notify_phone: string; unpaid_hold_hours: number; seller_max_discount: number;
  birthday_discount_enabled: boolean; birthday_discount_percent: number; birthday_discount_max: number | null;
};

type Social = { network: string; handle: string };

/** Swatches for the theme cards; the full palettes live in globals.css. */
const THEMES = [
  { value: "day", label: "روز گرم", hint: "زمینه‌ی شنی و کرم، مشکی و طلایی", ground: "#e5d7c1", surface: "#f2e9da", line: "#cfc1ab", text: "#1a1612", fill: "#14110e", onFill: "#ecd393", accent: "#c9a24c" },
  { value: "night", label: "شب طلایی", hint: "زمینه‌ی مشکی گرم، متن کرم و طلایی", ground: "#0e0c0a", surface: "#18150f", line: "#352e23", text: "#f1e8d8", fill: "#d4ae5a", onFill: "#14110e", accent: "#c9a24c" },
] as const;

export function StoreSettings() {
  const toast = useToast();
  const { data, setData } = useAdmin<Settings>("/store");
  const [logo, setLogo] = useState<File | null>(null);
  const [logoCrop, setLogoCrop] = useState<File[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  if (!data) return <PageHead title="تنظیمات فروشگاه" sub="در حال بارگذاری…" />;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setData({ ...data, [k]: v });
    setTouched(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(data)) {
        // Lists (the home page ring) are edited on their own page.
        if (k === "logo" || (v !== null && typeof v === "object")) continue;
        fd.append(k, typeof v === "boolean" ? String(v) : String(v ?? ""));
      }
      if (logo) fd.append("logo", logo);
      await adminCall<Settings>("/store", { method: "PATCH", form: fd });
      // The social pages are a list, so they go as JSON.
      setData(await adminCall<Settings>("/store", { method: "PATCH", body: { socials: data.socials.filter((x) => x.handle.trim()) } }));
      setLogo(null);
      setErrors({});
      setTouched(false);
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
                  <input id="st-logo" type="file" accept="image/*" className="input" onChange={(e) => { const f = e.target.files?.[0]; if (f) setLogoCrop([f]); e.target.value = ""; }} />
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
              {text("city", "شهر")}
              {text("currency_label", "واحد پول")}
              {text("address", "آدرس فروشگاه حضوری", { full: true, area: true })}
              {text("working_hours", "ساعت کاری", { full: true, hint: "در پایین همه‌ی صفحه‌ها، بخش معرفی فروشگاه و صفحه‌ی «تماس با ما» نمایش داده می‌شود" })}
            </div>
          </Card>
          <Card
            title="شبکه‌های اجتماعی"
            actions={
              <button type="button" className={`${s.btn} ${s.btnSm}`} onClick={() => set("socials", [...data.socials, { network: data.socials.length ? "telegram" : "instagram", handle: "" }])}>
                <Icon name="plus" /> افزودن
              </button>
            }
          >
            <p className="hint" style={{ marginTop: 0 }}>
              هر تعداد صفحه که دارید، حتی دو اینستاگرام. شبکه را انتخاب کنید و فقط آیدی را بنویسید؛ لینک خودش ساخته می‌شود. برای واتس‌اپ شماره‌ی موبایل را بنویسید. اگر لینک صفحه‌ای فرق دارد، کل آدرس https:// را بنویسید. اولین اینستاگرام، صفحه‌ی اصلی دعوت به دنبال کردن است.
            </p>
            {data.socials.length ? (
              <ol className={s.socials}>
                {data.socials.map((x, i) => {
                  const put = (next: Partial<Social>) => set("socials", data.socials.map((y, j) => (j === i ? { ...y, ...next } : y)));
                  return (
                    <li key={i}>
                      <Select label={`شبکه‌ی ردیف ${faNum(i + 1)}`} value={x.network} options={data.social_networks} onChange={(v) => put({ network: v })} />
                      <input
                        className="input ltr"
                        aria-label={`آیدی ردیف ${faNum(i + 1)}`}
                        value={x.handle}
                        onChange={(e) => put({ handle: e.target.value })}
                        placeholder={x.network === "whatsapp" ? "09123456789" : "shivagallery"}
                      />
                      <span className={s.actions}>
                        <button type="button" className="icon-btn" aria-label="بالاتر" disabled={i === 0} onClick={() => { const next = [...data.socials]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; set("socials", next); }}><Icon name="chev" className={s.up} /></button>
                        <button type="button" className="icon-btn" aria-label="حذف" onClick={() => set("socials", data.socials.filter((_, j) => j !== i))}><Icon name="trash" /></button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="muted">هنوز شبکه‌ای ثبت نشده.</p>
            )}
            {errors.socials && <p className="err">{errors.socials}</p>}
          </Card>
          <Card title="سفارش‌ها">
            <div className={s.formGrid}>
              {text("order_notify_phone", "موبایل‌های دریافت خبر سفارش جدید", { ltr: true, hint: "با هر سفارش جدید (یا هر پرداخت موفق) و هر درخواست مرجوعی به این شماره‌ها پیامک می‌رود. چند شماره را با ویرگول جدا کنید." })}
              <Field label="نگه‌داشتن سفارش پرداخت‌نشده (ساعت)" hint="تا وقتی پرداخت آنلاین فعال نیست: سفارشی که در این مدت پرداخت نشود خودکار لغو و کالایش به موجودی برمی‌گردد. صفر یعنی هیچ‌وقت." error={errors.unpaid_hold_hours}>
                <input id="st-hold" className="input ltr num" inputMode="numeric" value={toFaDigits(data.unpaid_hold_hours)} onChange={(e) => set("unpaid_hold_hours", Number(toEnDigits(e.target.value).replace(/\D/g, "")) || 0)} />
              </Field>
            </div>
          </Card>
          <Card title="صندوق فروش حضوری">
            <div className={s.formGrid}>
              <Field label="سقف تخفیف فروشنده (درصد)" hint="بیشترین تخفیفی که فروشنده در صندوق می‌تواند روی یک فاکتور بدهد. مدیر محدودیتی ندارد. صفر یعنی فروشنده تخفیف نمی‌دهد." error={errors.seller_max_discount}>
                <input id="st-seller-discount" className="input ltr num" inputMode="numeric" value={toFaDigits(data.seller_max_discount)} onChange={(e) => set("seller_max_discount", Math.min(100, Number(toEnDigits(e.target.value).replace(/\D/g, "")) || 0))} />
              </Field>
            </div>
          </Card>
          <Card title="باشگاه مشتری: تخفیف تولد">
            <SwitchRow
              title="تخفیف تولد"
              hint="مشتری‌ای که تاریخ تولدش ثبت شده، از ۳ روز قبل تا ۳ روز بعد از تولدش یک بار در سال تخفیف می‌گیرد؛ در سایت خودکار و در صندوق با یک دکمه. با کد تخفیف جمع نمی‌شود: هر کدام بیشتر بود اعمال می‌شود."
              checked={data.birthday_discount_enabled}
              onChange={(v) => set("birthday_discount_enabled", v)}
            />
            {data.birthday_discount_enabled && (
              <div className={s.formGrid} style={{ marginTop: 12 }}>
                <Field label="درصد تخفیف" error={errors.birthday_discount_percent}>
                  <input id="st-bday-percent" className="input ltr num" inputMode="numeric" value={toFaDigits(data.birthday_discount_percent)} onChange={(e) => set("birthday_discount_percent", Math.min(100, Number(toEnDigits(e.target.value).replace(/\D/g, "")) || 0))} />
                </Field>
                <Field label={`سقف مبلغ تخفیف (${data.currency_label})`} hint="خالی یعنی بدون سقف" error={errors.birthday_discount_max}>
                  <MoneyInput id="st-bday-max" value={data.birthday_discount_max} onChange={(v) => set("birthday_discount_max", v)} placeholder="بدون سقف" />
                </Field>
              </div>
            )}
          </Card>
          <Card title="قوانین، حریم خصوصی و اینماد">
            <p className="hint" style={{ marginBottom: 12 }}>
              اینماد و درگاه پرداخت این صفحه‌ها را لازم دارند. اگر خالی بمانند، متن پیش‌فرض مناسبی بر اساس تنظیمات فروشگاه نمایش داده می‌شود. خطی که با «# » شروع شود، تیتر می‌شود.
            </p>
            <div className={s.formGrid}>
              {text("terms_text", "متن قوانین و مقررات", { full: true, area: true })}
              {text("privacy_text", "متن حریم خصوصی", { full: true, area: true })}
              {text("enamad_id", "اینماد: id", { ltr: true, hint: "از کد نماد اینماد، عدد بعد از id=" })}
              {text("enamad_code", "اینماد: Code", { ltr: true, hint: "از کد نماد اینماد، مقدار بعد از Code=" })}
            </div>
          </Card>
          <Card title="مرجوعی">
            <SwitchRow title="امکان مرجوعی" hint="خاموش باشد، صفحه‌ی قوانین مرجوعی و نشانه‌هایش از سایت برداشته می‌شود" checked={data.returns_enabled} onChange={(v) => set("returns_enabled", v)} />
            {data.returns_enabled && (
              <div className={s.formGrid} style={{ marginTop: 10 }}>
                <Field label="نوع">
                  <Select id="st-rtype" label="نوع" value={data.returns_type} options={[{ value: "refund", label: "بازگشت وجه یا تعویض" }, { value: "exchange", label: "فقط تعویض سایز" }]} onChange={(v) => set("returns_type", v as Settings["returns_type"])} />
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
          <Card title="تم سایت">
            <p className="hint" style={{ marginTop: 0 }}>هر تم رنگ‌های کامل و آزموده‌ی خودش را دارد. پنل مدیریت همیشه همین ظاهر روشن می‌ماند.</p>
            <div className={s.themes} role="radiogroup" aria-label="تم سایت">
              {THEMES.map((t) => (
                <button key={t.value} type="button" role="radio" aria-checked={data.theme === t.value} className={s.theme} onClick={() => set("theme", t.value)}>
                  <span className={s.themePreview} style={{ background: t.ground, color: t.text }} aria-hidden="true">
                    <b style={{ fontFamily: "var(--f-display)" }}>{data.name}</b>
                    <span style={{ background: t.fill, color: t.onFill }}>افزودن به سبد</span>
                    <i style={{ background: t.surface, borderColor: t.line }}><em style={{ background: t.accent }} /></i>
                  </span>
                  <span className={s.themeName}>{t.label}</span>
                  <small>{t.hint}</small>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
      {(touched || logo) && <SaveBar saving={saving} onSave={save} />}
      {logoCrop && <PhotoCropper files={logoCrop} aspect={1} outWidth={600} onCancel={() => setLogoCrop(null)} onDone={(out) => { setLogoCrop(null); if (out[0]) setLogo(out[0]); }} />}
    </>
  );
}
