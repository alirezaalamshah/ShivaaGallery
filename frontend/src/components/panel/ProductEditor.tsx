"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { ApiError, fieldErrors } from "@/lib/client";
import { faNum, toEnDigits } from "@/lib/format";

import { adminCall, refreshSite, useAdmin } from "./hooks";
import { useCan } from "./access";
import { PhotoCropper } from "./PhotoCropper";
import { cellKey, PriceMatrix, type Prices } from "./PriceMatrix";
import { categoryOptions } from "./Products";
import type { AdminCategory, AdminColor, AdminProduct, AdminSizeSystem } from "./types";
import { Card, ConfirmButton, Field, MoneyInput, PageHead, SwitchRow } from "./ui";
import s from "./panel.module.css";

type Basic = { name: string; category: number | null; description: string; details: string; price: number | null; cost_price: number | null; is_active: boolean; is_featured: boolean };

const EMPTY: Basic = { name: "", category: null, description: "", details: "", price: null, cost_price: null, is_active: true, is_featured: false };
const key = cellKey;
const MAX_STOCK = 999;
// An earlier panel stored "available" as 9999 instead of a count.
const LEGACY_STOCK = 9999;

const stockOf = (p: AdminProduct) => Object.fromEntries(p.variants.map((v) => [key(v.color, v.size), v.stock]));

export function ProductEditor({ id }: { id?: string }) {
  const router = useRouter();
  const toast = useToast();
  const isNew = !id;
  const can = useCan();
  const canEdit = can("products.edit");
  const { data: product, setData: setProduct } = useAdmin<AdminProduct>(id ? `/products/${id}` : null);
  const { data: cats } = useAdmin<AdminCategory[]>("/categories");
  const { data: colors } = useAdmin<AdminColor[]>("/colors");
  const { data: systems } = useAdmin<AdminSizeSystem[]>("/size-systems");

  const [form, setForm] = useState<Basic>(EMPTY);
  const [picked, setPicked] = useState<{ colors: number[]; sizes: number[] }>({ colors: [], sizes: [] });
  const [stock, setStock] = useState<Record<string, number>>({});
  // The stock as loaded. Only cells the admin changed are sent, with this as proof of what they saw.
  const [base, setBase] = useState<Record<string, number>>({});
  const [prices, setPrices] = useState<Prices>({});
  const [sales, setSales] = useState<Prices>({});
  const [systemId, setSystemId] = useState<number | null>(null);
  const [pending, setPending] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toCrop, setToCrop] = useState<File[] | null>(null);
  const [priceTab, setPriceTab] = useState<"price" | "sale">("sale");
  const fileInput = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);
  // What the page looked like when it was loaded or last saved, to warn about unsaved changes.
  const [savedSnap, setSavedSnap] = useState<string | null>(null);
  const [snapAt, setSnapAt] = useState(isNew ? 1 : 0);
  const snapTaken = useRef(0);

  // Fill the form once the product arrives.
  useEffect(() => {
    if (!product || loaded.current) return;
    loaded.current = true;
    setForm({
      name: product.name, category: product.category, description: product.description, details: product.details.join("\n"),
      price: product.price, cost_price: product.cost_price, is_active: product.is_active, is_featured: product.is_featured,
    });
    const live = product.variants.filter((v) => v.is_active);
    setPicked({ colors: [...new Set(live.map((v) => v.color))], sizes: [...new Set(live.map((v) => v.size))] });
    setStock(stockOf(product));
    setBase(stockOf(product));
    setPrices(Object.fromEntries(product.variants.map((v) => [key(v.color, v.size), v.price_override])));
    setSales(Object.fromEntries(product.variants.map((v) => [key(v.color, v.size), v.sale_price])));
    setSnapAt((n) => n + 1);
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

  const sizesInOrder = system?.sizes.filter((z) => picked.sizes.includes(z.id!)) ?? [];
  const colorsInOrder = colors?.filter((c) => picked.colors.includes(c.id)) ?? [];
  const regularOf = (k: string) => prices[k] ?? form.price;
  const cells = colorsInOrder.flatMap((c) => sizesInOrder.map((z) => key(c.id, z.id!)));
  const totalStock = cells.reduce((n, k) => n + Math.min(stock[k] ?? 0, MAX_STOCK), 0);
  const legacy = cells.some((k) => (stock[k] ?? 0) >= LEGACY_STOCK);
  // Only sizes with stock take their own price or sale: an empty size is not sold, so its price only confuses.
  const outOfStock = (k: string) => (stock[k] ?? 0) <= 0;
  const sellable = cells.filter((k) => !outOfStock(k));
  const ownPrices = sellable.filter((k) => prices[k] != null).length;
  const onSale = sellable.filter((k) => sales[k] != null).length;

  const snapshot = JSON.stringify([form, picked, stock, prices, sales, pending.length]);
  useEffect(() => {
    if (snapAt && snapAt !== snapTaken.current) {
      snapTaken.current = snapAt;
      setSavedSnap(snapshot);
    }
  }, [snapAt, snapshot]);
  const dirty = savedSnap !== null && snapshot !== savedSnap;
  useEffect(() => {
    if (!dirty) return;
    const stay = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", stay);
    return () => removeEventListener("beforeunload", stay);
  }, [dirty]);

  const upload = async (productId: number, files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    return adminCall<AdminProduct>(`/products/${productId}/images`, { method: "POST", form: fd });
  };

  /** Picked photos go through the cropper first; cropped files continue below. */
  const onFiles = (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length) setToCrop(list);
  };

  const onCropped = async (list: File[]) => {
    setToCrop(null);
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
    if (sellable.some((k) => sales[k] != null && sales[k]! >= (regularOf(k) ?? 0))) errs.sale_prices = "قیمت حراج خانه‌های قرمز باید کمتر از قیمت همان رنگ و سایز باشد.";
    if (Object.keys(errs).length) {
      setErrors(errs);
      if (errs.name || errs.category || errs.price) scrollTo({ top: 0, behavior: "smooth" });
      else {
        setPriceTab("sale");
        toast({ text: errs.sale_prices });
      }
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
      const changed = cells.filter((k) => (stock[k] ?? 0) !== (base[k] ?? 0));
      const stockBody = Object.fromEntries(changed.map((k) => [k, stock[k] ?? 0]));
      const stockBase = Object.fromEntries(changed.filter((k) => k in base).map((k) => [k, base[k]]));
      const priceBody = Object.fromEntries(cells.map((k) => [k, prices[k] ?? null]));
      // A hidden sale on an empty size that the new price no longer undercuts is dropped rather than refused.
      const saleBody = Object.fromEntries(cells.map((k) => [k, outOfStock(k) && (sales[k] ?? 0) >= (regularOf(k) ?? 0) ? null : sales[k] ?? null]));
      try {
        saved = await adminCall<AdminProduct>(`/products/${saved.id}/matrix`, {
          method: "POST",
          body: { colors: colorsInOrder.map((c) => c.id), sizes: sizesInOrder.map((z) => z.id), stock: stockBody, stock_base: stockBase, prices: priceBody, sale_prices: saleBody },
        });
      } catch (e) {
        if (e instanceof ApiError && e.data?.code === "stock_changed") {
          // Something sold while the page was open. Show the real numbers; the admin's other edits stay.
          const fresh = stockOf(await adminCall<AdminProduct>(`/products/${saved.id}`));
          const moved = Object.fromEntries(Object.entries(fresh).filter(([k, v]) => v !== base[k]));
          setStock((st) => ({ ...st, ...moved }));
          setBase(fresh);
        }
        throw e;
      }
      setStock(stockOf(saved));
      setBase(stockOf(saved));
      setPrices(Object.fromEntries(saved.variants.map((v) => [key(v.color, v.size), v.price_override])));
      setSales(Object.fromEntries(saved.variants.map((v) => [key(v.color, v.size), v.sale_price])));
      setProduct(saved);
      setPending([]);
      setSnapAt((n) => n + 1);
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
        {canEdit && (
          <button type="button" className={s.btn} onClick={save} disabled={saving}>
            <Icon name="check" /> {saving ? "در حال ذخیره…" : "ذخیره"}
          </button>
        )}
      </PageHead>

      <div className={s.cols}>
        <div className={s.stack}>
          <Card title="۱. اطلاعات اصلی">
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

          <Card title="۲. عکس‌ها" actions={<span className="muted">{faNum((product?.images.length ?? 0) + pending.length)} عکس</span>}>
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
              <span>چند عکس را با هم انتخاب کنید؛ هر عکس را در قاب سایت تنظیم می‌کنید و سبک و یک‌اندازه آپلود می‌شود. عکس اول، عکس اصلی محصول است.</span>
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

          <Card title="۳. رنگ‌ها، سایزها و موجودی" actions={cells.length ? <span className="muted num">موجودی کل: {legacy ? "؟" : faNum(totalStock)}</span> : undefined}>
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
                  {legacy && (
                    <p className="err" style={{ marginBottom: 8 }}>
                      خانه‌های «؟» تعداد واقعی ندارند (از نسخه‌ی قبلی پنل مانده‌اند). تعداد واقعی را بنویسید تا سایت بیشتر از موجودی نفروشد.
                    </p>
                  )}
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
                            const unknown = v >= LEGACY_STOCK;
                            const changed = k in base ? base[k] !== v : v > 0;
                            return (
                              <td key={k}>
                                <input
                                  aria-label={`موجودی ${c.name} سایز ${z.label}`}
                                  className={`num ${v === 0 || unknown ? s.zero : changed ? s.own : ""}`}
                                  title={changed && k in base ? `قبلاً ${faNum(base[k])}` : undefined}
                                  inputMode="numeric"
                                  readOnly={!can("stock.edit")}
                                  value={unknown ? "؟" : faNum(v)}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) => {
                                    const n = Number(toEnDigits(e.target.value).replace(/\D/g, "") || 0);
                                    setStock((st) => ({ ...st, [k]: Math.min(n, MAX_STOCK) }));
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="hint" style={{ marginTop: 6 }}>
                    موجودی بین مغازه و سایت مشترک است: با هر سفارش اینترنتی خودکار کم می‌شود. فروش حضوری را در صفحه‌ی{" "}
                    <Link href="/panel/stock" style={{ textDecoration: "underline" }}>موجودی و فروش حضوری</Link> ثبت کنید تا سایت بیشتر از موجودی نفروشد. صفر یعنی «ناموجود». خانه‌های تغییرکرده پررنگ می‌شوند تا ذخیره کنید.
                  </p>
                </div>
              ) : (
                <p className="hint">حداقل یک رنگ و یک سایز انتخاب کنید تا جدول موجودی ظاهر شود.</p>
              )}
            </div>
          </Card>

          <Card
            title="۴. حراج و قیمت جدا (اختیاری)"
            actions={sellable.length ? <span className="muted num">{faNum(onSale)} حراج · {faNum(ownPrices)} قیمت جدا</span> : undefined}
          >
            {!cells.length ? (
              <p className="hint">اول در بخش ۳ رنگ‌ها و سایزها را انتخاب کنید.</p>
            ) : !sellable.length ? (
              <p className="hint">هیچ رنگ و سایزی موجودی ندارد. اول موجودی را در بخش ۳ وارد کنید؛ قیمت و حراج فقط برای سایزهای موجود تعریف می‌شود.</p>
            ) : (
              <>
                <p className="hint" style={{ marginTop: 0 }}>
                  اگر همه‌ی رنگ‌ها و سایزها یک قیمت دارند و حراج نیستند، از این بخش رد شوید. سایزهای ناموجود قفل‌اند تا قیمتشان سردرگمی نسازد.
                </p>
                <div className={s.tabs} role="group" aria-label="نوع قیمت" style={{ margin: "10px 0 12px" }}>
                  <button type="button" className={s.tab} aria-pressed={priceTab === "sale"} onClick={() => setPriceTab("sale")}>
                    حراج {onSale ? `(${faNum(onSale)})` : ""}
                  </button>
                  <button type="button" className={s.tab} aria-pressed={priceTab === "price"} onClick={() => setPriceTab("price")}>
                    قیمت جدا برای رنگ یا سایز {ownPrices ? `(${faNum(ownPrices)})` : ""}
                  </button>
                </div>
                {priceTab === "sale" ? (
                  <PriceMatrix
                    key="sale"
                    id="p-bulk-sale"
                    label=""
                    colors={colorsInOrder}
                    sizes={sizesInOrder}
                    values={sales}
                    onChange={(u) => { setSales(u); setErrors((e) => ({ ...e, sale_prices: "" })); }}
                    placeholder={() => "بدون حراج"}
                    mark={(k, v) => (v == null ? null : regularOf(k) && v >= regularOf(k)! ? "bad" : "own")}
                    note={(k, v) => {
                      const r = regularOf(k);
                      return v != null && r && v < r ? `${faNum(Math.round((1 - v / r) * 100))}٪ تخفیف` : null;
                    }}
                    locked={outOfStock}
                    percentOf={(k, pct) => {
                      const r = regularOf(k);
                      // Round to a thousand so sale prices read cleanly.
                      return r ? Math.round((r * (100 - pct)) / 100 / 1000) * 1000 : null;
                    }}
                    clearLabel="حذف حراج همه"
                    hint="درصد یا قیمت را بالای جدول بنویسید و «اعمال روی همه‌ی موجودها» را بزنید، یا روی نام یک رنگ یا سایز بزنید تا فقط روی همان اعمال شود. خانه‌ی خالی یعنی حراج نیست. مشتری در سایت می‌بیند کدام رنگ و سایز تخفیف دارد."
                    error={errors.sale_prices}
                  />
                ) : (
                  <PriceMatrix
                    key="price"
                    id="p-bulk-price"
                    label=""
                    colors={colorsInOrder}
                    sizes={sizesInOrder}
                    values={prices}
                    onChange={setPrices}
                    placeholder={() => (form.price ? faNum(form.price) : "—")}
                    mark={(_, v) => (v != null ? "own" : null)}
                    locked={outOfStock}
                    clearLabel="همه به قیمت محصول"
                    hint="فقط وقتی لازم است که یک رنگ یا سایز گران‌تر یا ارزان‌تر از قیمت محصول باشد (مثلاً سایزهای بزرگ). خانه‌ی خالی یعنی همان قیمت محصول."
                  />
                )}
              </>
            )}
          </Card>
        </div>

        <div className={s.stack}>
          <Card title="قیمت">
            <div style={{ display: "grid", gap: 14 }}>
              <Field label="قیمت فروش (تومان)" error={errors.price} hint="قیمت همه‌ی رنگ‌ها و سایزها. حراج یا قیمت جدا را در بخش ۴ بگذارید.">
                <MoneyInput id="p-price" value={form.price} onChange={(v) => set("price", v)} />
              </Field>
              {can("cost.view") && (
              <Field label="قیمت خرید (تومان)" error={errors.cost_price} hint="فقط برای حساب سود؛ مشتری نمی‌بیند. اگر خالی بماند، سود این محصول در گزارش حساب نمی‌شود.">
                <MoneyInput id="p-cost" value={form.cost_price} onChange={(v) => set("cost_price", v)} placeholder="اختیاری" />
              </Field>
              )}
              {can("cost.view") && form.cost_price != null && form.price ? (
                <p className="hint" style={{ margin: 0 }}>
                  سود هر عدد با قیمت عادی: <b className="num">{faNum(form.price - form.cost_price)}</b> ({faNum(Math.round(((form.price - form.cost_price) * 100) / form.price))}٪)
                </p>
              ) : null}
            </div>
          </Card>
          <Card title="نمایش">
            <SwitchRow title="نمایش در سایت" hint="خاموش باشد، مشتری این محصول را نمی‌بیند" checked={form.is_active} onChange={(v) => set("is_active", v)} />
            <SwitchRow title="محصول ویژه" hint="در صفحه‌ی اصلی و بخش‌های ویژه می‌آید" checked={form.is_featured} onChange={(v) => set("is_featured", v)} />
          </Card>
          {!isNew && can("products.delete") && (
            <Card title="حذف محصول">
              <p className="hint" style={{ marginBottom: 12 }}>محصولی که سفارش داشته حذف نمی‌شود؛ آن را از نمایش در سایت خارج کنید.</p>
              <ConfirmButton label="حذف این محصول" onConfirm={remove} />
            </Card>
          )}
        </div>
      </div>
      {canEdit && (dirty || isNew) && (
        <div className={s.saveBar} role="status">
          <span>{isNew ? "محصول هنوز ساخته نشده" : "تغییرات ذخیره نشده"}{cells.length ? <small className="num"> · {faNum(colorsInOrder.length)} رنگ، {faNum(sizesInOrder.length)} سایز، موجودی {legacy ? "؟" : faNum(totalStock)}</small> : null}</span>
          <button type="button" className={s.btn} onClick={save} disabled={saving}>
            <Icon name="check" /> {saving ? "در حال ذخیره…" : isNew ? "ساخت محصول" : "ذخیره"}
          </button>
        </div>
      )}
      {toCrop && <PhotoCropper files={toCrop} aspect={3 / 4} outWidth={1200} onDone={onCropped} onCancel={() => setToCrop(null)} />}
    </>
  );
}
