"use client";

import { useState } from "react";

import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";

import { adminCall, refreshSite, useAdmin } from "./hooks";
import type { AdminColor, AdminSize, AdminSizeSystem } from "./types";
import { Card, ConfirmButton, Field, Modal, PageHead } from "./ui";
import s from "./panel.module.css";

export function Attributes() {
  const toast = useToast();
  const { data: colors, reload: reloadColors } = useAdmin<AdminColor[]>("/colors");
  const { data: systems, reload: reloadSystems } = useAdmin<AdminSizeSystem[]>("/size-systems");
  const [color, setColor] = useState<Partial<AdminColor> | null>(null);
  const [system, setSystem] = useState<{ id?: number; name: string; sizes: AdminSize[] } | null>(null);
  const [newSize, setNewSize] = useState("");

  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : "ذخیره نشد." });

  const saveColor = async () => {
    if (!color?.name?.trim() || !/^#[0-9a-f]{6}$/i.test(color.hex ?? "")) return toast({ text: "نام و رنگ را وارد کنید." });
    try {
      await adminCall(color.id ? `/colors/${color.id}` : "/colors", { method: color.id ? "PATCH" : "POST", body: { name: color.name.trim(), hex: color.hex, sort: color.sort ?? (colors?.length ?? 0) } });
      setColor(null);
      reloadColors();
      refreshSite();
    } catch (e) {
      fail(e);
    }
  };

  const saveSystem = async () => {
    if (!system?.name.trim()) return toast({ text: "نام سایزبندی را بنویسید." });
    try {
      await adminCall(system.id ? `/size-systems/${system.id}` : "/size-systems", { method: system.id ? "PUT" : "POST", body: system });
      setSystem(null);
      reloadSystems();
      refreshSite();
    } catch (e) {
      fail(e);
    }
  };

  const del = async (path: string, after: () => void) => {
    try {
      await adminCall(path, { method: "DELETE" });
      after();
    } catch (e) {
      fail(e);
    }
  };

  const moveSize = (i: number, d: -1 | 1) => {
    if (!system) return;
    const sizes = [...system.sizes];
    const j = i + d;
    if (j < 0 || j >= sizes.length) return;
    [sizes[i], sizes[j]] = [sizes[j], sizes[i]];
    setSystem({ ...system, sizes });
  };

  return (
    <>
      <PageHead title="رنگ و سایز" sub="رنگ‌ها و سایزبندی‌هایی که در محصولات انتخاب می‌کنید" />
      <div className={s.cols}>
        <Card title="رنگ‌ها" actions={<button type="button" className={`${s.btn} ${s.btnSm}`} onClick={() => setColor({ name: "", hex: "#C9A24C" })}><Icon name="plus" /> رنگ جدید</button>}>
          <div className={s.chipset}>
            {colors?.map((c) => (
              <button key={c.id} type="button" className={s.pick} onClick={() => setColor(c)}>
                <i style={{ background: c.hex }} /> {c.name}
              </button>
            ))}
          </div>
        </Card>
        <Card title="سایزبندی‌ها" actions={<button type="button" className={`${s.btn} ${s.btnSm}`} onClick={() => setSystem({ name: "", sizes: [] })}><Icon name="plus" /> سایزبندی جدید</button>}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {systems?.map((x) => (
              <li key={x.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 14 }}>
                <span style={{ flex: 1 }}>
                  <b style={{ display: "block" }}>{x.name}</b>
                  <small className="muted num">{x.sizes.map((z) => z.label).join(" · ")}</small>
                </span>
                <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => setSystem({ id: x.id, name: x.name, sizes: x.sizes })}>ویرایش</button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {color && (
        <Modal
          title={color.id ? `ویرایش رنگ «${color.name}»` : "رنگ جدید"}
          onClose={() => setColor(null)}
          footer={
            <>
              {color.id && !color.in_use && <span style={{ marginInlineEnd: "auto" }}><ConfirmButton label="حذف رنگ" onConfirm={() => del(`/colors/${color.id}`, () => { setColor(null); reloadColors(); })} /></span>}
              <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setColor(null)}>انصراف</button>
              <button type="button" className={s.btn} onClick={saveColor}>ذخیره</button>
            </>
          }
        >
          <div className={s.formGrid}>
            <Field label="نام رنگ">
              <input id="color-name" className="input" value={color.name ?? ""} onChange={(e) => setColor({ ...color, name: e.target.value })} autoFocus placeholder="مثلاً شرابی" />
            </Field>
            <Field label="رنگ">
              <span style={{ display: "flex", gap: 8 }}>
                <input id="color-pick" type="color" value={color.hex ?? "#000000"} onChange={(e) => setColor({ ...color, hex: e.target.value })} style={{ width: 56, height: 48, border: 0, background: "none", padding: 0 }} aria-label="انتخاب رنگ" />
                <input id="color-hex" className="input ltr" value={color.hex ?? ""} onChange={(e) => setColor({ ...color, hex: e.target.value })} />
              </span>
            </Field>
          </div>
          {color.in_use && <p className="hint" style={{ marginTop: 10 }}>این رنگ در محصولات استفاده شده و فقط قابل ویرایش است.</p>}
        </Modal>
      )}

      {system && (
        <Modal
          title={system.id ? `ویرایش «${system.name}»` : "سایزبندی جدید"}
          onClose={() => setSystem(null)}
          footer={
            <>
              {system.id && <span style={{ marginInlineEnd: "auto" }}><ConfirmButton label="حذف سایزبندی" onConfirm={() => del(`/size-systems/${system.id}`, () => { setSystem(null); reloadSystems(); })} /></span>}
              <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setSystem(null)}>انصراف</button>
              <button type="button" className={s.btn} onClick={saveSystem}>ذخیره</button>
            </>
          }
        >
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="نام سایزبندی" hint="مثلاً حروفی، عددی یا فری‌سایز">
              <input id="sys-name" className="input" value={system.name} onChange={(e) => setSystem({ ...system, name: e.target.value })} autoFocus />
            </Field>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>سایزها به ترتیب نمایش</div>
              <div className={s.chipset}>
                {system.sizes.map((z, i) => (
                  <span key={`${z.id ?? "n"}-${i}`} className={s.pick} style={{ paddingInline: 6 }}>
                    <button type="button" className="icon-btn" style={{ width: 26, height: 26 }} aria-label="جابه‌جایی به راست" onClick={() => moveSize(i, -1)}><Icon name="back" /></button>
                    <b className="num">{z.label}</b>
                    <button type="button" className="icon-btn" style={{ width: 26, height: 26 }} aria-label="جابه‌جایی به چپ" onClick={() => moveSize(i, 1)}><Icon name="arrow" /></button>
                    <button type="button" className="icon-btn" style={{ width: 26, height: 26 }} aria-label={`حذف ${z.label}`} onClick={() => setSystem({ ...system, sizes: system.sizes.filter((_, j) => j !== i) })}><Icon name="close" /></button>
                  </span>
                ))}
              </div>
              <form style={{ display: "flex", gap: 8, marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); if (newSize.trim()) { setSystem({ ...system, sizes: [...system.sizes, { label: newSize.trim() }] }); setNewSize(""); } }}>
                <input id="sys-new" className="input" value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder="سایز جدید، مثلاً XL یا ۴۴" />
                <button type="submit" className={`${s.btn} ${s.btnGhost}`}>افزودن</button>
              </form>
              <p className="hint" style={{ marginTop: 6 }}>سایزی که در محصولات استفاده شده قابل حذف نیست.</p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
