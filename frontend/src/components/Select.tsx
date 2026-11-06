"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/Icon";

import styles from "./Select.module.css";

export type SelectOption = { value: string | number; label: string };

const SEARCH_FROM = 9;

/** Arabic and Persian keyboards spell ی and ک differently, and آ, ئ and half-spaces are easy to miss. */
const fold = (text: string) => text.replace(/[يئ]/g, "ی").replace(/ك/g, "ک").replace(/[آأ]/g, "ا").replace(/[\s‌]/g, "").toLowerCase();

/**
 * The site's dropdown: a list under the field on wide screens, a sheet from the bottom on phones,
 * and a search box once the list is long. Hands back the chosen value as a string, as a native
 * select would. `fit` sizes the field to its longest option, for toolbars where it sits beside others.
 */
export function Select({ value, options, onChange, id, label, placeholder = "انتخاب کنید", disabled = false, invalid = false, fit = false, compact = false, searchable, className = "" }: {
  value: string | number | null | undefined;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  fit?: boolean;
  compact?: boolean;
  /** Left out, the search box appears once the list is long. */
  searchable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = options.find((o) => String(o.value) === String(value ?? ""));

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        className={`${compact ? styles.compact : "input"} ${styles.field} ${fit ? styles.fit : ""} ${className}`}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className={styles.value}>
          <span className={`${styles.label} ${current ? "" : styles.empty}`}>{current?.label ?? placeholder}</span>
          {fit && options.map((o) => <span key={o.value} className={styles.sizer} aria-hidden>{o.label}</span>)}
        </span>
        <Icon name="chev" className={styles.chev} />
      </button>
      {open && (
        <List
          anchor={trigger}
          id={listId}
          title={label}
          options={options}
          selected={current?.value}
          searchable={searchable ?? options.length >= SEARCH_FROM}
          onPick={(v) => {
            close();
            if (String(v) !== String(value ?? "")) onChange(String(v));
          }}
          onClose={close}
        />
      )}
    </>
  );
}

function List({ anchor, id, title, options, selected, searchable, onPick, onClose }: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  id: string;
  title?: string;
  options: readonly SelectOption[];
  selected?: string | number;
  searchable: boolean;
  onPick: (value: string | number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const sheet = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => {
    const needle = fold(q);
    return needle ? options.filter((o) => fold(o.label).includes(needle)) : options;
  }, [options, q]);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === selected)));
  const optionId = (i: number) => `${id}-${i}`;

  // Fixed to the viewport so a scrolling dialog cannot clip it; opens upward when there is no room below.
  // On phones these numbers are ignored: the sheet sits on the bottom edge.
  useLayoutEffect(() => {
    const el = sheet.current!;
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      if (!a) return;
      const width = Math.min(Math.max(a.width, 200), innerWidth - 16);
      const room = innerHeight - a.bottom - 14;
      const up = room < Math.min(el.offsetHeight, 220) && a.top > room;
      el.style.setProperty("--width", `${width}px`);
      el.style.setProperty("--left", `${Math.max(8, Math.min(a.right - width, innerWidth - width - 8))}px`);
      el.style.setProperty("--top", up ? "auto" : `${a.bottom + 6}px`);
      el.style.setProperty("--bottom", up ? `${innerHeight - a.top + 6}px` : "auto");
      el.style.setProperty("--height", `${Math.max(160, (up ? a.top : room) - 14)}px`);
    };
    place();
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, [anchor]);

  // A phone keyboard covers the sheet without resizing the page, so it is lifted by hand.
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const lift = () => sheet.current?.style.setProperty("--keyboard", `${Math.max(0, innerHeight - view.height - view.offsetTop)}px`);
    view.addEventListener("resize", lift);
    return () => view.removeEventListener("resize", lift);
  }, []);

  // A phone keeps its keyboard down until the customer taps the search box.
  useEffect(() => {
    if (searchable && matchMedia("(hover: hover)").matches) search.current?.focus({ preventScroll: true });
    else list.current?.focus({ preventScroll: true });
  }, [searchable]);

  useLayoutEffect(() => {
    list.current?.querySelector(`[id="${optionId(active)}"]`)?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, shown]);

  // As a native dropdown does, it lets go when the page moves under it. Not on phones, where it covers the page.
  useEffect(() => {
    const wide = matchMedia("(min-width: 700px)");
    const onScroll = (e: Event) => {
      if (wide.matches && !sheet.current?.contains(e.target as Node)) onClose();
    };
    addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => removeEventListener("scroll", onScroll, { capture: true });
  }, [onClose]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      // Stops here, so Escape closes the list and not the dialog around it.
      e.stopPropagation();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (shown.length) setActive((i) => (i + (e.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length);
    } else if (e.key === "Home" || e.key === "End") {
      if (e.target === search.current) return;
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : Math.max(0, shown.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[active]) onPick(shown[active].value);
    }
  };

  return createPortal(
    <div className={styles.layer} onKeyDown={onKey}>
      <div className={styles.scrim} onClick={onClose} />
      <div ref={sheet} className={styles.sheet}>
        <div className={styles.sheetHead}>
          <b>{title}</b>
          <button type="button" className="icon-btn" aria-label="بستن" onClick={onClose}><Icon name="close" /></button>
        </div>
        {searchable && (
          <label className={styles.search}>
            <Icon name="search" />
            <input
              ref={search}
              value={q}
              placeholder="جست‌وجو…"
              aria-label="جست‌وجو در فهرست"
              aria-controls={id}
              aria-activedescendant={shown.length ? optionId(active) : undefined}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
            />
          </label>
        )}
        <div ref={list} id={id} className={styles.list} role="listbox" aria-label={title} tabIndex={-1} aria-activedescendant={shown.length ? optionId(active) : undefined}>
          {shown.map((o, i) => (
            <button
              key={o.value}
              id={optionId(i)}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={o.value === selected}
              data-active={i === active || undefined}
              className={styles.option}
              onClick={() => onPick(o.value)}
              onMouseMove={() => i !== active && setActive(i)}
            >
              <span>{o.label}</span>
              {o.value === selected && <Icon name="check" />}
            </button>
          ))}
          {!shown.length && <p className={styles.none}>چیزی پیدا نشد.</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
