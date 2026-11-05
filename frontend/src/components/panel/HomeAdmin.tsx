"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { fieldErrors } from "@/lib/client";
import { faDateTime, faNum } from "@/lib/format";

import { DateTimeInput } from "./DateInput";
import { adminCall, refreshSite, useAdmin } from "./hooks";
import { PhotoCropper } from "./PhotoCropper";
import { Card, ConfirmButton, Empty, Field, Modal, PageHead, Switch, SwitchRow } from "./ui";
import s from "./panel.module.css";
import type { AdminProductRow, Paged } from "./types";
import type { BannerEffect, BannerTone } from "@/lib/types";

type Picks = "hero_products" | "story_products";

/** The home page: which products turn on the ring at the top and sit in the store's section at the bottom, and the campaign banners. */
export function HomeAdmin() {
  return (
    <>
      <PageHead title="صفحه‌ی اصلی و بنرها" sub="کارت‌های اسلایدر چرخان بالای صفحه‌ی اصلی، عکس‌های بخش معرفی فروشگاه، بنرهای کمپین و نوار متنی بالای سایت." />
      <ProductPicker
        field="hero_products"
        title="کارت‌های اسلایدر چرخان (بالای صفحه)"
        max={8}
        saved="اسلایدر صفحه‌ی اصلی ذخیره شد"
        hint="تا ۸ محصول را به ترتیب دلخواه انتخاب کنید؛ ۶ تا ۸ تا بهترین حلقه را می‌سازد (اگر کمتر باشد، کارت‌ها تکرار می‌شوند). اگر فهرست خالی بماند، سایت خودش محصولات ویژه و تازه‌ترین‌ها را نشان می‌دهد."
      />
      <ProductPicker
        field="story_products"
        title="عکس‌های بخش معرفی فروشگاه (پایین صفحه، کنار آدرس و اینستاگرام)"
        max={3}
        saved="عکس‌های بخش معرفی فروشگاه ذخیره شد"
        hint="سه محصولی که عکسشان با حرکت آرام کنار معرفی فروشگاه می‌آید. اولی عکس بزرگ است. اگر خالی بماند، سایت خودش محصولات ویژه و تازه‌ترین‌ها را نشان می‌دهد."
      />
      <Banners />
    </>
  );
}

/** Products the admin picks, in order, for one place on the home page. */
function ProductPicker({ field, title, max, hint, saved: savedText }: { field: Picks; title: string; max: number; hint: string; saved: string }) {
  const toast = useToast();
  const { data: settings, setData: setSettings } = useAdmin<Record<Picks, number[]>>("/store");
  const [ids, setIds] = useState<number[] | null>(null);
  const [rows, setRows] = useState<Record<number, AdminProductRow>>({});
  const [q, setQ] = useState("");
  const [found, setFound] = useState<AdminProductRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings || ids !== null) return;
    setIds(settings[field]);
    if (settings[field].length) {
      adminCall<Paged<AdminProductRow>>(`/products?ids=${settings[field].join(",")}`).then((r) =>
        setRows((old) => ({ ...old, ...Object.fromEntries(r.results.map((p) => [p.id, p])) })),
      );
    }
  }, [settings, ids, field]);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const r = await adminCall<Paged<AdminProductRow>>(`/products?active=true${q.trim() ? `&search=${encodeURIComponent(q.trim())}` : ""}`);
        setFound(r.results);
        setRows((old) => ({ ...old, ...Object.fromEntries(r.results.map((p) => [p.id, p])) }));
      } catch {
        setFound([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (!settings || ids === null) return null;
  const dirty = ids.join(",") !== settings[field].join(",");

  const move = (i: number, by: number) => {
    const next = [...ids];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setIds(next);
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = await adminCall<Record<Picks, number[]>>("/store", { method: "PATCH", body: { [field]: ids } });
      setSettings({ ...settings, [field]: saved[field] });
      setIds(saved[field]);
      refreshSite();
      toast({ text: savedText });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "ذخیره نشد." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={title}
      actions={
        <>
          {ids.length > 0 && <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => setIds([])}>خالی کردن (انتخاب خودکار)</button>}
          <button type="button" className={`${s.btn} ${s.btnSm}`} disabled={!dirty || busy} onClick={save}>ذخیره</button>
        </>
      }
    >
      <p className="hint" style={{ marginTop: 0 }}>
        {hint}
      </p>
      <div className={s.cols}>
        <div>
          <b>انتخاب‌شده‌ها ({faNum(ids.length)} از {faNum(max)})</b>
          {ids.length ? (
            <ol className={s.pickList}>
              {ids.map((id, i) => {
                const p = rows[id];
                return (
                  <li key={id}>
                    <span className="num">{faNum(i + 1)}</span>
                    {p?.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- small thumbnail
                      <img src={p.thumb} alt="" />
                    ) : <span className={s.thumb} />}
                    <span className={s.cellStack}>
                      <b>{p?.name ?? "…"}</b>
                      {p && !p.is_active && <small className="err">در سایت نمایش داده نمی‌شود</small>}
                    </span>
                    <span className={s.actions}>
                      <button type="button" className="icon-btn" aria-label="بالاتر" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="chev" className={s.up} /></button>
                      <button type="button" className="icon-btn" aria-label="پایین‌تر" disabled={i === ids.length - 1} onClick={() => move(i, 1)}><Icon name="chev" className={s.down} /></button>
                      <button type="button" className="icon-btn" aria-label="برداشتن" onClick={() => setIds(ids.filter((x) => x !== id))}><Icon name="close" /></button>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="muted">انتخاب خودکار: محصولات ویژه و تازه‌ترین‌ها.</p>
          )}
        </div>
        <div>
          <label className={s.search}>
            <Icon name="search" />
            <span className="sr-only">جستجوی محصول</span>
            <input className="input" placeholder="جستجوی محصول" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <ul className={s.pickList}>
            {found.map((p) => {
              const picked = ids.includes(p.id);
              return (
                <li key={p.id}>
                  {p.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small thumbnail
                    <img src={p.thumb} alt="" />
                  ) : <span className={s.thumb} />}
                  <span className={s.cellStack}><b>{p.name}</b><small className="muted">{p.category_name}</small></span>
                  <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={picked || ids.length >= max} onClick={() => setIds([...ids, p.id])}>
                    {picked ? "انتخاب شده" : "افزودن"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Card>
  );
}

type Banner = {
  id: number;
  placement: "home" | "bar";
  placement_label: string;
  title: string;
  text: string;
  image: string | null;
  link: string;
  button_label: string;
  effect: BannerEffect;
  tone: BannerTone;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  sort: number;
  live: boolean;
};

type Draft = Omit<Banner, "id" | "placement_label" | "live" | "image"> & { id?: number; image: string | null };

const blank = (): Draft => ({ placement: "home", title: "", text: "", image: null, link: "", button_label: "", effect: "shine", tone: "contrast", starts_at: null, ends_at: null, is_active: true, sort: 0 });

const TONES: { value: BannerTone; label: string }[] = [
  { value: "contrast", label: "رنگ مکمل سایت (بیشترین جلب توجه)" },
  { value: "sale", label: "قرمز حراج" },
  { value: "brand", label: "رنگ اصلی سایت" },
  { value: "dark", label: "تیره" },
];

const EFFECTS: { value: BannerEffect; label: string; hint: string }[] = [
  { value: "shine", label: "درخشش", hint: "هر چند ثانیه نوری از روی بنر رد می‌شود." },
  { value: "pulse", label: "چشمک‌زن", hint: "قاب و تیتر بنر چشمک می‌زنند؛ برای کمپین‌های کوتاه و فوری." },
  { value: "flow", label: "روان", hint: "روی بنر عکس، نواری از تیتر حرکت می‌کند؛ در نوار بالای سایت، کل متن روان حرکت می‌کند." },
  { value: "none", label: "ساده (بدون حرکت)", hint: "بدون حرکت؛ فقط با رنگ انتخاب‌شده." },
];

function period(b: Banner) {
  if (b.starts_at && b.ends_at) return `${faDateTime(b.starts_at)} تا ${faDateTime(b.ends_at)}`;
  if (b.starts_at) return `از ${faDateTime(b.starts_at)}`;
  if (b.ends_at) return `تا ${faDateTime(b.ends_at)}`;
  return "همیشه";
}

function Banners() {
  const toast = useToast();
  const { data, setData, loading, reload } = useAdmin<Banner[]>("/banners");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [crop, setCrop] = useState<File[] | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const open = (d: Draft) => {
    setErrors({});
    setPhoto(null);
    setDraft(d);
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setErrors({});
    try {
      const { id, placement, title, text, link, button_label, effect, tone, starts_at, ends_at, is_active, sort } = draft;
      const body = { placement, title, text, link, button_label, effect, tone, starts_at, ends_at, is_active, sort };
      let saved = await adminCall<Banner>(id ? `/banners/${id}` : "/banners", { method: id ? "PATCH" : "POST", body });
      if (photo && draft.placement === "home") {
        const fd = new FormData();
        fd.append("image", photo, "banner.webp");
        saved = await adminCall<Banner>(`/banners/${saved.id}/image`, { method: "POST", form: fd });
      }
      setDraft(null);
      reload();
      refreshSite();
      toast({ text: saved.live ? "ذخیره شد و الان در سایت دیده می‌شود" : "ذخیره شد" });
    } catch (e) {
      setErrors(fieldErrors(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (b: Banner, is_active: boolean) => {
    const saved = await adminCall<Banner>(`/banners/${b.id}`, { method: "PATCH", body: { is_active } });
    setData((data ?? []).map((x) => (x.id === b.id ? saved : x)));
    refreshSite();
  };

  const remove = async (id: number) => {
    await adminCall(`/banners/${id}`, { method: "DELETE" });
    setDraft(null);
    reload();
    refreshSite();
  };

  const removeImage = async () => {
    if (!draft?.id) return;
    const saved = await adminCall<Banner>(`/banners/${draft.id}/image`, { method: "DELETE" });
    setDraft({ ...draft, image: saved.image });
    reload();
  };

  return (
    <Card title="بنرها و کمپین‌ها" actions={<button type="button" className={`${s.btn} ${s.btnSm}`} onClick={() => open(blank())}><Icon name="plus" /> بنر جدید</button>}>
      <p className="hint" style={{ marginTop: 0 }}>
        «بنر تصویری» زیر دسته‌های صفحه‌ی اصلی می‌آید. «نوار متنی» یک خط کوتاه بالای همه‌ی صفحه‌هاست، مثلاً «تا جمعه ۲۰٪ تخفیف مانتوها». با تاریخ شروع و پایان، کمپین خودش روشن و خاموش می‌شود.
      </p>
      {data?.length ? (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>بنر</th><th>جا</th><th>زمان نمایش</th><th>وضعیت</th><th>فعال</th></tr></thead>
            <tbody>
              {data.map((b) => (
                <tr key={b.id} className={s.rowLink} onClick={() => open({ ...b })}>
                  <td>
                    <span className={s.nameCell}>
                      {b.image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- small thumbnail
                        <img src={b.image} alt="" className={s.bannerThumb} />
                      ) : null}
                      <span className={s.cellStack}><b>{b.title}</b>{b.text && <small className="muted">{b.text}</small>}</span>
                    </span>
                  </td>
                  <td>{b.placement_label}</td>
                  <td className="muted">{period(b)}</td>
                  <td>{b.live ? <span className="pill" data-status="delivered">در سایت</span> : <span className="pill" data-status="cancelled">نمایش داده نمی‌شود</span>}</td>
                  <td onClick={(e) => e.stopPropagation()}><Switch checked={b.is_active} onChange={(v) => toggle(b, v)} label={`فعال بودن ${b.title}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !loading && <Empty icon="image" title="هنوز بنری نساخته‌اید" />
      )}

      {draft && (
        <Modal
          title={draft.id ? "ویرایش بنر" : "بنر جدید"}
          onClose={() => setDraft(null)}
          wide
          footer={
            <>
              <button type="button" className={s.btn} disabled={busy || !draft.title.trim()} onClick={save}>ذخیره</button>
              {draft.id && <ConfirmButton label="حذف بنر" onConfirm={() => remove(draft.id!)} />}
            </>
          }
        >
          <div className={s.formGrid}>
            <Field label="جای نمایش" error={errors.placement}>
              <select className="input" value={draft.placement} onChange={(e) => setDraft({ ...draft, placement: e.target.value as Draft["placement"] })}>
                <option value="home">بنر تصویری صفحه‌ی اصلی</option>
                <option value="bar">نوار متنی بالای همه‌ی صفحه‌ها</option>
              </select>
            </Field>
            <Field label="تیتر" error={errors.title}>
              <input className="input" value={draft.title} maxLength={80} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="مثلاً حراج پاییزه" />
            </Field>
            <Field label="متن (اختیاری)" error={errors.text} full>
              <input className="input" value={draft.text} maxLength={200} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="مثلاً تا ۳۰٪ تخفیف روی مانتوهای اداری" />
            </Field>
            <Field label="لینک (اختیاری)" error={errors.link} hint="صفحه‌ای از همین سایت، مثلاً /shop?on_sale=true یا آدرس یک دسته">
              <input className="input ltr" value={draft.link} maxLength={300} onChange={(e) => setDraft({ ...draft, link: e.target.value })} placeholder="/shop?on_sale=true" />
            </Field>
            {draft.placement === "home" && (
              <Field label="متن دکمه (اختیاری)" error={errors.button_label}>
                <input className="input" value={draft.button_label} maxLength={30} onChange={(e) => setDraft({ ...draft, button_label: e.target.value })} placeholder="دیدن حراج" />
              </Field>
            )}
            <Field label="رنگ" error={errors.tone} hint="«رنگ مکمل» رنگ روبه‌روی رنگ سایت است و بیشتر از همه به چشم می‌آید.">
              <select className="input" value={draft.tone} onChange={(e) => setDraft({ ...draft, tone: e.target.value as BannerTone })}>
                {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="جلوه‌ی حرکتی" error={errors.effect} hint={EFFECTS.find((x) => x.value === draft.effect)?.hint}>
              <select className="input" value={draft.effect} onChange={(e) => setDraft({ ...draft, effect: e.target.value as BannerEffect })}>
                {EFFECTS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </Field>
            <div className={`field ${s.full}`}>
              <span className="label">پیش‌نمایش</span>
              <div className={`${s.bannerSample} ${s[`tone_${draft.tone}`] ?? ""} ${s[`fx_${draft.effect}`] ?? ""}`}>
                <b>{draft.title || "تیتر بنر"}</b>
                {draft.text && <span>{draft.text}</span>}
              </div>
            </div>
            <Field label="شروع نمایش (اختیاری)" error={errors.starts_at}>
              <DateTimeInput value={draft.starts_at} onChange={(v) => setDraft({ ...draft, starts_at: v })} />
            </Field>
            <Field label="پایان نمایش (اختیاری)" error={errors.ends_at}>
              <DateTimeInput value={draft.ends_at} defaultTime="23:55" onChange={(v) => setDraft({ ...draft, ends_at: v })} />
            </Field>
            <Field label="ترتیب" hint="عدد کمتر، جلوتر" error={errors.sort}>
              <input className="input ltr num" inputMode="numeric" value={draft.sort} onChange={(e) => setDraft({ ...draft, sort: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            </Field>
          </div>
          {draft.placement === "home" && (
            <div className={s.stack} style={{ marginTop: 12 }}>
              <b>تصویر</b>
              <p className="hint" style={{ margin: 0 }}>نسبت ۴ به ۳. تیتر و متن روی پایین عکس نوشته می‌شوند، پس جای مهم عکس را بالا بگذارید. بدون عکس، بنر با رنگ برند ساخته می‌شود.</p>
              {(photo || draft.image) && (
                // eslint-disable-next-line @next/next/no-img-element -- preview of the cropped banner
                <img src={photo ? URL.createObjectURL(photo) : draft.image!} alt="" className={s.bannerPreview} />
              )}
              <span className={s.actions}>
                <label className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}>
                  {draft.image || photo ? "عوض کردن عکس" : "انتخاب عکس"}
                  <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setCrop([f]); e.target.value = ""; }} />
                </label>
                {draft.image && !photo && <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={removeImage}>حذف عکس</button>}
              </span>
            </div>
          )}
          <SwitchRow title="فعال" hint="خاموش باشد، در سایت نمایش داده نمی‌شود" checked={draft.is_active} onChange={(v) => setDraft({ ...draft, is_active: v })} />
        </Modal>
      )}
      {crop && <PhotoCropper files={crop} aspect={4 / 3} outWidth={1440} onCancel={() => setCrop(null)} onDone={(out) => { setCrop(null); if (out[0]) setPhoto(out[0]); }} />}
    </Card>
  );
}
