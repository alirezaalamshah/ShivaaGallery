"use client";

import Image from "next/image";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { Select } from "@/components/Select";
import { useToast } from "@/components/Toast";
import { fieldErrors } from "@/lib/client";
import { faNum } from "@/lib/format";

import { adminCall, refreshSite, useAdmin } from "./hooks";
import { PhotoCropper } from "./PhotoCropper";
import { categoryOptions } from "./Products";
import type { AdminCategory, AdminSizeSystem } from "./types";
import { Card, ConfirmButton, Empty, Field, Modal, PageHead, Switch, SwitchRow } from "./ui";
import s from "./panel.module.css";

type Draft = Omit<AdminCategory, "id" | "slug" | "product_count" | "image"> & { id?: number; image?: string | null; file?: File | null };

const blank: Draft = { parent: null, name: "", description: "", size_system: null, size_guide: {}, sort: 0, is_active: true, file: null };

export function Categories() {
  const toast = useToast();
  const { data: cats, reload } = useAdmin<AdminCategory[]>("/categories");
  const { data: systems } = useAdmin<AdminSizeSystem[]>("/size-systems");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toCrop, setToCrop] = useState<File[] | null>(null);

  const rows = cats ? categoryOptions(cats).map((o) => ({ ...cats.find((c) => c.id === o.id)!, depth: o.label.split(" › ").length - 1 })) : [];
  const byId = (id: number | null) => cats?.find((c) => c.id === id);

  /** The nearest category up the tree (itself included) that sets the given field. */
  const source = (c: AdminCategory, has: (x: AdminCategory) => boolean) => {
    let node: AdminCategory | undefined = c;
    while (node && !has(node)) node = byId(node.parent);
    return node;
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("name", draft.name);
      fd.append("description", draft.description);
      fd.append("parent", draft.parent ? String(draft.parent) : "");
      fd.append("size_system", draft.size_system ? String(draft.size_system) : "");
      fd.append("size_guide", JSON.stringify(cleanGuide(draft.size_guide)));
      fd.append("sort", String(draft.sort));
      fd.append("is_active", String(draft.is_active));
      if (draft.file) fd.append("image", draft.file);
      await adminCall(draft.id ? `/categories/${draft.id}` : "/categories", { method: draft.id ? "PATCH" : "POST", form: fd });
      setDraft(null);
      reload();
      refreshSite();
      toast({ text: "دسته ذخیره شد" });
    } catch (e) {
      setErrors(fieldErrors(e));
      toast({ text: e instanceof Error ? e.message : "ذخیره نشد." });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await adminCall(`/categories/${id}`, { method: "DELETE" });
      setDraft(null);
      reload();
      refreshSite();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "حذف نشد." });
    }
  };

  const toggle = async (c: AdminCategory, v: boolean) => {
    await adminCall(`/categories/${c.id}`, { method: "PATCH", body: { is_active: v } });
    reload();
    refreshSite();
  };

  return (
    <>
      <PageHead title="دسته‌ها" sub="دسته‌ها و زیردسته‌ها، سایزبندی و جدول سایز هر دسته">
        <button type="button" className={s.btn} onClick={() => { setErrors({}); setDraft({ ...blank }); }}><Icon name="plus" /> دسته‌ی جدید</button>
      </PageHead>
      <Card>
        {rows.length ? (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>دسته</th><th>سایزبندی</th><th>جدول سایز</th><th>محصولات</th><th>ترتیب</th><th>فعال</th><th /></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className={c.depth > 0 ? s.childRow : undefined}>
                    <td>
                      <span className={s.nameCell}>
                        <span className={s.thumb} style={{ width: 40, height: 40, borderRadius: "50%", position: "relative", background: "var(--band)" }}>
                          {c.image && <Image src={c.image} alt="" fill sizes="40px" style={{ objectFit: "cover" }} />}
                        </span>
                        <span>
                          <b>{c.name}</b>
                          {c.depth > 0 && <small>زیرمجموعه‌ی {byId(c.parent)?.name}</small>}
                        </span>
                      </span>
                    </td>
                    <td className={s.cellStack}>
                      {(() => {
                        const from = source(c, (x) => !!x.size_system);
                        const name = systems?.find((x) => x.id === from?.size_system)?.name;
                        if (!name) return <span className="muted">—</span>;
                        return <>{name}{from!.id !== c.id && <small>از {from!.name}</small>}</>;
                      })()}
                    </td>
                    <td className={s.cellStack}>
                      {(() => {
                        const from = source(c, (x) => !!x.size_guide?.rows?.length);
                        if (!from) return <span className="muted">—</span>;
                        return <>{faNum(from.size_guide.rows!.length)} ردیف{from.id !== c.id && <small>از {from.name}</small>}</>;
                      })()}
                    </td>
                    <td className="num">{faNum(c.product_count)}</td>
                    <td className="num">{faNum(c.sort)}</td>
                    <td><Switch checked={c.is_active} onChange={(v) => toggle(c, v)} label={`فعال بودن ${c.name}`} /></td>
                    <td><button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => { setErrors({}); setDraft({ ...c, file: null }); }}>ویرایش</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="filter" title="هنوز دسته‌ای نساخته‌اید" />
        )}
      </Card>

      {draft && (
        <Modal
          title={draft.id ? `ویرایش «${draft.name}»` : "دسته‌ی جدید"}
          onClose={() => setDraft(null)}
          wide
          footer={
            <>
              {draft.id && <span style={{ marginInlineEnd: "auto" }}><ConfirmButton label="حذف دسته" onConfirm={() => remove(draft.id!)} /></span>}
              <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setDraft(null)}>انصراف</button>
              <button type="button" className={s.btn} onClick={save} disabled={saving}>{saving ? "در حال ذخیره…" : "ذخیره"}</button>
            </>
          }
        >
          <div className={s.formGrid}>
            <Field label="نام دسته" error={errors.name}>
              <input id="c-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
            </Field>
            <Field label="زیرمجموعه‌ی" error={errors.parent}>
              <Select id="c-parent" label="زیرمجموعه‌ی کدام دسته" value={draft.parent ?? ""} options={[{ value: "", label: "— دسته‌ی اصلی —" }, ...(cats ? categoryOptions(cats).filter((o) => o.id !== draft.id).map((o) => ({ value: o.id, label: o.label })) : [])]} onChange={(v) => setDraft({ ...draft, parent: v ? Number(v) : null })} />
            </Field>
            <Field label="سایزبندی" hint="خالی یعنی از دسته‌ی بالاتر گرفته شود">
              <Select id="c-system" label="سایزبندی" value={draft.size_system ?? ""} options={[{ value: "", label: "از دسته‌ی بالاتر" }, ...(systems?.map((x) => ({ value: x.id, label: `${x.name} (${x.sizes.map((z) => z.label).join("، ")})` })) ?? [])]} onChange={(v) => setDraft({ ...draft, size_system: v ? Number(v) : null })} />
            </Field>
            <Field label="ترتیب نمایش" hint="عدد کوچک‌تر اول می‌آید">
              <input id="c-sort" className="input ltr num" inputMode="numeric" value={draft.sort} onChange={(e) => setDraft({ ...draft, sort: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            </Field>
            <Field label="توضیح کوتاه (اختیاری)" full>
              <input id="c-desc" className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
            <Field label="عکس دسته" hint="اگر عکسی نگذارید، عکس یکی از محصولات همین دسته نشان داده می‌شود." full>
              <input id="c-image" type="file" accept="image/*" className="input" onChange={(e) => { const f = e.target.files?.[0]; if (f) setToCrop([f]); e.target.value = ""; }} />
              {draft.file && <span className="hint">عکس جدید آماده است و با ذخیره آپلود می‌شود.</span>}
            </Field>
            <div className={s.full}>
              <SwitchRow title="فعال" hint="دسته‌ی غیرفعال در سایت دیده نمی‌شود" checked={draft.is_active} onChange={(v) => setDraft({ ...draft, is_active: v })} />
            </div>
            <div className={s.full}>
              <div className="label" style={{ marginBottom: 8 }}>جدول سایز (کنار انتخاب سایز به مشتری نشان داده می‌شود)</div>
              <GuideEditor value={draft.size_guide} onChange={(g) => setDraft({ ...draft, size_guide: g })} />
              {errors.size_guide && <p className="err">{errors.size_guide}</p>}
            </div>
          </div>
        </Modal>
      )}
      {toCrop && draft && (
        <PhotoCropper files={toCrop} aspect={3 / 4} outWidth={900} onCancel={() => setToCrop(null)} onDone={(out) => { setToCrop(null); if (out[0]) setDraft({ ...draft, file: out[0] }); }} />
      )}
    </>
  );
}

function cleanGuide(g: Draft["size_guide"]) {
  if (!g.columns?.length || !g.rows?.length) return {};
  return { columns: g.columns, rows: g.rows.filter((r) => r.some((c) => c.trim())), ...(g.note ? { note: g.note } : {}) };
}

/** Spreadsheet-like editor for a size table: add/remove columns and rows, type in cells. */
function GuideEditor({ value, onChange }: { value: Draft["size_guide"]; onChange: (g: Draft["size_guide"]) => void }) {
  const columns = value.columns?.length ? value.columns : [];
  const rows = value.rows ?? [];
  if (!columns.length) {
    return (
      <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => onChange({ columns: ["سایز", "دور سینه", "دور کمر", "دور باسن"], rows: [["S", "", "", ""]], note: "اندازه‌ها به سانتی‌متر است." })}>
        <Icon name="plus" /> ساخت جدول سایز
      </button>
    );
  }
  const setCell = (r: number, c: number, v: string) => onChange({ ...value, rows: rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  const setCol = (c: number, v: string) => onChange({ ...value, columns: columns.map((x, j) => (j === c ? v : x)) });
  const cell = { minHeight: 36, padding: "4px 8px", fontSize: 13, width: "100%", minWidth: 80 } as const;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ overflowX: "auto" }}>
        <table className={s.matrix}>
          <thead>
            <tr>
              {columns.map((col, c) => (
                <th key={c}>
                  <input aria-label={`عنوان ستون ${c + 1}`} className="input" style={{ ...cell, fontWeight: 700 }} value={col} onChange={(e) => setCol(c, e.target.value)} />
                </th>
              ))}
              <th>
                <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => onChange({ ...value, columns: [...columns, ""], rows: rows.map((r) => [...r, ""]) })}>+ ستون</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((v, c) => (
                  <td key={c}><input aria-label={`ردیف ${r + 1} ستون ${c + 1}`} className="input num" style={cell} value={v} onChange={(e) => setCell(r, c, e.target.value)} /></td>
                ))}
                <td><button type="button" className="icon-btn" aria-label="حذف ردیف" onClick={() => onChange({ ...value, rows: rows.filter((_, i) => i !== r) })}><Icon name="trash" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => onChange({ ...value, rows: [...rows, columns.map(() => "")] })}>+ ردیف</button>
        {columns.length > 1 && <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => onChange({ ...value, columns: columns.slice(0, -1), rows: rows.map((r) => r.slice(0, -1)) })}>حذف ستون آخر</button>}
        <input aria-label="توضیح زیر جدول" className="input" style={{ ...cell, flex: 1 }} placeholder="توضیح زیر جدول، مثلاً «اندازه‌ها به سانتی‌متر است»" value={value.note ?? ""} onChange={(e) => onChange({ ...value, note: e.target.value })} />
        <button type="button" className={`${s.btn} ${s.btnDanger} ${s.btnSm}`} onClick={() => onChange({})}>حذف جدول</button>
      </div>
    </div>
  );
}
