"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { fieldErrors } from "@/lib/client";
import { faNum, toEnDigits } from "@/lib/format";

import { adminCall, refreshSite, useAdmin } from "./hooks";
import { categoryOptions } from "./Products";
import type { AdminCategory, AdminColor, AdminProduct, AdminSizeSystem } from "./types";
import { Card, ConfirmButton, Field, MoneyInput, PageHead, SwitchRow } from "./ui";
import s from "./panel.module.css";

type Basic = { name: string; category: number | null; description: string; details: string; price: number | null; sale_price: number | null; is_active: boolean; is_featured: boolean };

const EMPTY: Basic = { name: "", category: null, description: "", details: "", price: null, sale_price: null, is_active: true, is_featured: false };
const key = (c: number, z: number) => `${c}-${z}`;

export function ProductEditor({ id }: { id?: string }) {
  const router = useRouter();
  const toast = useToast();
  const isNew = !id;
  const { data: product, setData: setProduct } = useAdmin<AdminProduct>(id ? `/products/${id}` : null);
  const { data: cats } = useAdmin<AdminCategory[]>("/categories");
  const { data: colors } = useAdmin<AdminColor[]>("/colors");
  const { data: systems } = useAdmin<AdminSizeSystem[]>("/size-systems");

  const [form, setForm] = useState<Basic>(EMPTY);
  const [picked, setPicked] = useState<{ colors: number[]; sizes: number[] }>({ colors: [], sizes: [] });
  const [stock, setStock] = useState<Record<string, number>>({});
  const [systemId, setSystemId] = useState<number | null>(null);
  const [pending, setPending] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  // Fill the form once the product arrives.
  useEffect(() => {
    if (!product || loaded.current) return;
    loaded.current = true;
    setForm({
      name: product.name, category: product.category, description: product.description, details: product.details.join("\n"),
      price: product.price, sale_price: product.sale_price, is_active: product.is_active, is_featured: product.is_featured,
    });
    const live = product.variants.filter((v) => v.is_active);
    setPicked({ colors: [...new Set(live.map((v) => v.color))], sizes: [...new Set(live.map((v) => v.size))] });
    setStock(Object.fromEntries(product.variants.map((v) => [key(v.color, v.size), v.stock])));
  }, [product]);

  // The size system comes from the category (or its parent), unless the admin picks another.
  const categorySystem = useMemo(() => {
    let c = cats?.find((x) => x.id === form.category);
    while (c) {
      if (c.size_system) return c.size_system;
      c = cats?.find((x) => x.id === c!.parent);
    }
    return null;
  }, [cats, form.category]);
  const system = systems?.find((x) => x.id === (systemId ?? categorySystem)) ?? systems?.find((x) => x.sizes.some((z) => picked.sizes.includes(z.id!))) ?? systems?.[0];

  const toggle = (kind: "colors" | "sizes", value: number) =>
    setPicked((p) => ({ ...p, [kind]: p[kind].includes(value) ? p[kind].filter((x) => x !== value) : [...p[kind], value] }));

  const set = <K extends keyof Basic>(k: K, v: Basic[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  const offPct = form.price && form.sale_price && form.sale_price < form.price ? Math.round((1 - form.sale_price / form.price) * 100) : 0;
  const sizesInOrder = system?.sizes.filter((z) => picked.sizes.includes(z.id!)) ?? [];
  const colorsInOrder = colors?.filter((c) => picked.colors.includes(c.id)) ?? [];
  const totalStock = colorsInOrder.reduce((n, c) => n + sizesInOrder.reduce((m, z) => m + (stock[key(c.id, z.id!)] ?? 0), 0), 0);

  const upload = async (productId: number, files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    return adminCall<AdminProduct>(`/products/${productId}/images`, { method: "POST", form: fd });
  };

  const onFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    if (isNew || !product) {
      setPending((p) => [...p, ...list]);
      return;
    }
    setUploading(true);
    try {
      setProduct(await upload(product.id, list));
      refreshSite();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "آپلود عکس ممکن نشد." });
    } finally {
      setUploading(false);
    }
  };

  const imageAction = async (action: "delete" | "left" | "right" | "color", imageId: number, value?: number | null) => {
    if (!product) return;
    const imgs = [...product.images];
    if (action === "delete") {
      await adminCall(`/product-images/${imageId}`, { method: "DELETE" });
      setProduct({ ...product, images: imgs.filter((x) => x.id !== imageId) });
    } else if (action === "color") {
      await adminCall(`/product-images/${imageId}`, { method: "PATCH", body: { color: value } });
      setProduct({ ...product, images: imgs.map((x) => (x.id === imageId ? { ...x, color: value ?? null } : x)) });
    } else {
      const i = imgs.findIndex((x) => x.id === imageId);
      const j = action === "right" ? i - 1 : i + 1;
      if (j < 0 || j >= imgs.length) return;
      [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
      setProduct({ ...product, images: imgs });
      await adminCall(`/products/${product.id}/images/reorder`, { method: "POST", body: { ids: imgs.map((x) => x.id) } });
    }
    refreshSite();
  };

  const save = async () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "نام محصول را بنویسید.";
    if (!form.category) errs.category = "دسته را انتخاب کنید.";
    if (!form.price) errs.price = "قیمت را وارد کنید.";
    if (form.sale_price != null && form.price != null && form.sale_price >= form.price) errs.sale_price = "قیمت حراج باید کمتر از قیمت اصلی باشد.";
    if (Object.keys(errs).length) {
      setErrors(errs);
      scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSaving(true);
    try {
      const body = { ...form, details: form.details.split("\n").map((x) => x.trim()).filter(Boolean) };
      let saved = isNew
        ? await adminCall<AdminProduct>("/products", { method: "POST", body })
        : await adminCall<AdminProduct>(`/products/${id}`, { method: "PATCH", body });
      if (pending.length) {
        saved = await upload(saved.id, pending);
        setPending([]);
      }
      const stockBody = Object.fromEntries(colorsInOrder.flatMap((c) => sizesInOrder.map((z) => [key(c.id, z.id!), stock[key(c.id, z.id!)] ?? 0])));
      saved = await adminCall<AdminProduct>(`/products/${saved.id}/matrix`, {
        method: "POST",
        body: { colors: colorsInOrder.map((c) => c.id), sizes: sizesInOrder.map((z) => z.id), stock: stockBody },
      });
      setProduct(saved);
      refreshSite();
      toast({ text: isNew ? "محصول ساخته شد" : "تغییرات ذخیره شد", action: { label: "مشاهده در سایت", href: `/p/${saved.slug}` } });
      if (isNew) router.replace(`/panel/products/${saved.id}`);
    } catch (e) {
      setErrors(fieldErrors(e));
      toast({ text: e instanceof Error ? e.message : "ذخیره نشد." });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await adminCall(`/products/${id}`, { method: "DELETE" });
      refreshSite();
      router.replace("/panel/products");
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "حذف نشد." });
    }
  };

  if (!isNew && !product) return <PageHead title="ویرایش محصول" sub="در حال بارگذاری…" />;

  return (
    <>
      <PageHead title={isNew ? "محصول جدید" : form.name || "ویرایش محصول"} sub={isNew ? "اطلاعات، عکس‌ها و رنگ و سایزها را وارد کنید و ذخیره بزنید." : undefined}>
        <Link href="/panel/products" className={`${s.btn} ${s.btnGhost}`}><Icon name="back" /> محصولات</Link>
        {!isNew && product && <a href={`/p/${product.slug}`} target="_blank" rel="noopener" className={`${s.btn} ${s.btnGhost}`}>مشاهده در سایت</a>}
        <button type="button" className={s.btn} onClick={save} disabled={saving}>
          <Icon name="check" /> {saving ? "در حال ذخیره…" : "ذخیره"}
        </button>
      </PageHead>

      <div className={s.cols}>
        <div className={s.stack}>
          <Card title="اطلاعات اصلی">
            <div className={s.formGrid}>
              <Field label="نام محصول" error={errors.name} full>
                <input id="p-name" className="input" value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} placeholder="مثلاً مانتو مجلسی کرپ «شب»" />
              </Field>
              <Field label="دسته" error={errors.category}>
                <select id="p-cat" className="input" value={form.category ?? ""} onChange={(e) => { set("category", e.target.value ? Number(e.target.value) : null); setSystemId(null); }} aria-invalid={!!errors.category}>
                  <option value="">انتخاب کنید</option>
                  {cats && categoryOptions(cats).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Field>
              <div />
              <Field label="توضیحات" full>
                <textarea id="p-desc" className="input" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="چند جمله درباره‌ی مدل، پارچه و حس لباس" />
              </Field>
              <Field label="مشخصات (هر خط یک مورد)" hint="مثلاً «جنس: کرپ حریر» یا «قد: ۱۱۵ سانتی‌متر»" error={errors.details} full>
                <textarea id="p-details" className="input" value={form.details} onChange={(e) => set("details", e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card title="عکس‌ها" actions={<span className="muted">{faNum((product?.images.length ?? 0) + pending.length)} عکس</span>}>
            <button
              type="button"
              className={`${s.drop} ${dragOver ? s.dropOn : ""}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
              style={{ width: "100%" }}
            >
              <Icon name="plus" />
              <b>{uploading ? "در حال آپلود…" : "عکس‌ها را این‌جا بکشید یا کلیک کنید"}</b>
              <span>چند عکس را با هم انتخاب کنید. عکس اول، عکس اصلی محصول است. عکس‌ها خودکار صاف و سبک می‌شوند.</span>
            </button>
            <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.target.value = ""; }} />
            {(product?.images.length || pending.length) ? (
              <div className={s.images}>
                {product?.images.map((im, i) => (
                  <div key={im.id} className={s.imgTile}>
                    <div style={{ position: "relative", aspectRatio: "3/4" }}>
                      <Image src={im.image} alt="" fill sizes="140px" style={{ objectFit: "cover" }} />
                    </div>
                    {i === 0 && <span className={s.cover}>عکس اصلی</span>}
                    <div className={s.imgTools}>
                      <span style={{ display: "flex", gap: 4 }}>
                        <button type="button" aria-label="جابه‌جایی به راست" onClick={() => imageAction("right", im.id)}><Icon name="back" /></button>
                        <button type="button" aria-label="جابه‌جایی به چپ" onClick={() => imageAction("left", im.id)}><Icon name="arrow" /></button>
                      </span>
                      <button type="button" aria-label="حذف عکس" onClick={() => imageAction("delete", im.id)}><Icon name="trash" /></button>
                    </div>
                    <select aria-label="رنگ این عکس" value={im.color ?? ""} onChange={(e) => imageAction("color", im.id, e.target.value ? Number(e.target.value) : null)}>
                      <option value="">همه‌ی رنگ‌ها</option>
                      {colors?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                ))}
                {pending.map((f, i) => (
                  <div key={`${f.name}-${i}`} className={s.imgTile}>
                    <div style={{ position: "relative", aspectRatio: "3/4" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- local preview of a file not uploaded yet */}
                      <img src={URL.createObjectURL(f)} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                    <div className={s.imgTools}>
                      <span />
                      <button type="button" aria-label="حذف عکس" onClick={() => setPending((p) => p.filter((_, j) => j !== i))}><Icon name="trash" /></button>
                    </div>
                    <select disabled aria-label="رنگ این عکس"><option>بعد از ذخیره</option></select>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>

          <Card title="رنگ‌ها، سایزها و موجودی" actions={<span className="muted num">موجودی کل: {faNum(totalStock)}</span>}>
            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <div className="label" style={{ marginBottom: 8 }}>رنگ‌هایی که این مدل دارد</div>
                <div className={s.chipset}>
                  {colors?.map((c) => (
                    <button key={c.id} type="button" className={s.pick} aria-pressed={picked.colors.includes(c.id)} onClick={() => toggle("colors", c.id)}>
                      <i style={{ background: c.hex }} /> {c.name}
                    </button>
                  ))}
                  <Link href="/panel/attributes" className={`${s.pick}`} style={{ borderStyle: "dashed" }}><Icon name="plus" className="" /> رنگ جدید</Link>
                </div>
              </div>
              <div>
                <div className="label" style={{ marginBottom: 8, display: "flex", gap: 10, alignItems: "center" }}>
                  سایزها
                  <select aria-label="سایزبندی" className="input" style={{ width: "auto", minHeight: 34, padding: "2px 10px", fontSize: 13 }} value={system?.id ?? ""} onChange={(e) => setSystemId(Number(e.target.value))}>
                    {systems?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
                <div className={s.chipset}>
                  {system?.sizes.map((z) => (
                    <button key={z.id} type="button" className={`${s.pick} num`} aria-pressed={picked.sizes.includes(z.id!)} onClick={() => toggle("sizes", z.id!)} style={{ paddingInline: 16 }}>
                      {z.label}
                    </button>
                  ))}
                </div>
              </div>
              {colorsInOrder.length > 0 && sizesInOrder.length > 0 ? (
                <div style={{ overflowX: "auto" }}>
                  <div className="label" style={{ marginBottom: 6 }}>تعداد موجود از هر رنگ و سایز</div>
                  <table className={s.matrix}>
                    <thead>
                      <tr>
                        <th />
                        {sizesInOrder.map((z) => <th key={z.id} className="num">{z.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {colorsInOrder.map((c) => (
                        <tr key={c.id}>
                          <th><span className={s.colorHead}><i style={{ background: c.hex }} />{c.name}</span></th>
                          {sizesInOrder.map((z) => {
                            const k = key(c.id, z.id!);
                            const v = stock[k] ?? 0;
                            return (
                              <td key={k}>
                                <input
                                  aria-label={`موجودی ${c.name} سایز ${z.label}`}
                                  className={`num ${v === 0 ? s.zero : ""}`}
                                  inputMode="numeric"
                                  value={faNum(v)}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) => {
                                    const n = Number(toEnDigits(e.target.value).replace(/\D/g, "") || 0);
                                    setStock((st) => ({ ...st, [k]: Math.min(n, 9999) }));
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="hint" style={{ marginTop: 6 }}>عدد صفر یعنی این ترکیب در سایت «ناموجود» نشان داده می‌شود. هر تغییر موجودی در بخش انبار ثبت می‌شود.</p>
                </div>
              ) : (
                <p className="hint">حداقل یک رنگ و یک سایز انتخاب کنید تا جدول موجودی ظاهر شود.</p>
              )}
            </div>
          </Card>
        </div>

        <div className={s.stack}>
          <Card title="قیمت">
            <div style={{ display: "grid", gap: 14 }}>
              <Field label="قیمت (تومان)" error={errors.price}>
                <MoneyInput id="p-price" value={form.price} onChange={(v) => set("price", v)} />
              </Field>
              <Field label="قیمت حراج (اختیاری)" error={errors.sale_price} hint={offPct ? `${faNum(offPct)}٪ تخفیف روی کارت محصول نشان داده می‌شود` : "اگر خالی باشد، محصول حراج نیست"}>
                <MoneyInput id="p-sale" value={form.sale_price} onChange={(v) => set("sale_price", v)} />
              </Field>
            </div>
          </Card>
          <Card title="نمایش">
            <SwitchRow title="نمایش در سایت" hint="خاموش باشد، مشتری این محصول را نمی‌بیند" checked={form.is_active} onChange={(v) => set("is_active", v)} />
            <SwitchRow title="محصول ویژه" hint="در صفحه‌ی اصلی و بخش‌های ویژه می‌آید" checked={form.is_featured} onChange={(v) => set("is_featured", v)} />
          </Card>
          {!isNew && (
            <Card title="حذف محصول">
              <p className="hint" style={{ marginBottom: 12 }}>محصولی که سفارش داشته حذف نمی‌شود؛ آن را از نمایش در سایت خارج کنید.</p>
              <ConfirmButton label="حذف این محصول" onConfirm={remove} />
            </Card>
          )}
          <button type="button" className={s.btn} onClick={save} disabled={saving} style={{ height: 50 }}>
            <Icon name="check" /> {saving ? "در حال ذخیره…" : "ذخیره‌ی محصول"}
          </button>
        </div>
      </div>
    </>
  );
}
