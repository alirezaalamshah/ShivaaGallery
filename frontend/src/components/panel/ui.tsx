"use client";

import { useEffect } from "react";

import { Icon, type IconName } from "@/components/Icon";
import { faNum, toEnDigits } from "@/lib/format";
import { pageWindow } from "@/lib/paging";

import s from "./panel.module.css";

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className={s.head}>
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className={s.actions}>{children}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`${s.card} ${className}`}>
      {(title || actions) && (
        <div className={s.cardHead}>
          {title && <h2>{title}</h2>}
          {actions && <div className={s.actions}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={s.switch} disabled={disabled} onClick={() => onChange(!checked)} />;
}

export function SwitchRow({ title, hint, checked, onChange }: { title: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={s.switchRow}>
      <span>
        <b>{title}</b>
        {hint && <small>{hint}</small>}
      </span>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div className={s.scrim} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`${s.modal} ${wide ? s.modalWide : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className={s.modalHead}>
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="بستن" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {children}
        {footer && <div className={s.modalFoot}>{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon = "grid", title, children }: { icon?: IconName; title: string; children?: React.ReactNode }) {
  return (
    <div className={s.empty}>
      <Icon name={icon} />
      <b>{title}</b>
      {children}
    </div>
  );
}

/** Amount input that shows Persian digits with thousand separators but stores a plain number. */
export function MoneyInput({ id, value, onChange, placeholder }: { id: string; value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return (
    <input
      id={id}
      className="input ltr num"
      inputMode="numeric"
      placeholder={placeholder}
      value={value == null ? "" : faNum(value)}
      onChange={(e) => {
        const raw = toEnDigits(e.target.value).replace(/\D/g, "");
        onChange(raw ? Number(raw) : null);
      }}
    />
  );
}

export function Field({ label, error, hint, children, full = false }: { label: string; error?: string; hint?: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`field ${full ? s.full : ""}`}>
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="err">{error}</span>}
    </label>
  );
}

/** Inline confirmation (the browser's confirm() dialog is easy to dismiss by accident). */
export function ConfirmButton({ label, confirmLabel = "مطمئنی؟ حذف شود", onConfirm, small = false }: { label: string; confirmLabel?: string; onConfirm: () => void; small?: boolean }) {
  return (
    <details style={{ position: "relative", display: "inline-block" }}>
      <summary className={`${s.btn} ${s.btnDanger} ${small ? s.btnSm : ""}`} style={{ listStyle: "none" }}>
        {label}
      </summary>
      <div style={{ position: "absolute", insetInlineStart: 0, top: "calc(100% + 6px)", zIndex: 5, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: 10, boxShadow: "0 20px 40px -20px rgb(0 0 0 / .35)", whiteSpace: "nowrap" }}>
        <button type="button" className={`${s.btn} ${s.btnDanger} ${s.btnSm}`} onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; onConfirm(); }}>
          {confirmLabel}
        </button>
      </div>
    </details>
  );
}

/** Previous / next with page numbers around the current page. Jumps back to the top of the list on change. */
export function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  if (pages <= 1) return null;
  const go = (n: number) => {
    onChange(n);
    scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <nav className={s.pager} aria-label="صفحه‌ها">
      <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={page <= 1} onClick={() => go(page - 1)}>قبلی</button>
      {pageWindow(page, pages).map((n, i) =>
        n === null ? (
          <span key={`gap-${i}`} className={s.pagerGap}>…</span>
        ) : (
          <button key={n} type="button" className={`${s.pagerNum} num`} aria-current={n === page ? "page" : undefined} onClick={() => go(n)}>
            {faNum(n)}
          </button>
        ),
      )}
      <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={page >= pages} onClick={() => go(page + 1)}>بعدی</button>
    </nav>
  );
}

export { s as panelStyles };
