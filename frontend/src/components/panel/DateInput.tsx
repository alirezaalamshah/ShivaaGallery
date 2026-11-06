"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/Icon";
import { Select } from "@/components/Select";
import { faDate, faNum, toFaDigits } from "@/lib/format";
import { J_MONTHS, J_WEEKDAYS, fromJalali, jalaliMonthLength, toJalali, weekdayIndex } from "@/lib/jalali";

import { isoDay } from "./dates";
import s from "./DateInput.module.css";

const dayOf = (v: string) => new Date(`${v}T12:00:00`);
const pad = (n: number) => String(n).padStart(2, "0");

type DateProps = {
  id?: string;
  /** YYYY-MM-DD (Gregorian, as the API takes it), or "" for none. */
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  clearable?: boolean;
  label?: string;
  invalid?: boolean;
  style?: React.CSSProperties;
};

/** A day field that shows and picks Persian dates, in the panel's own style instead of the browser's Gregorian calendar. */
export function DateInput({ id, value, onChange, min, max, placeholder = "انتخاب تاریخ", clearable = false, label, invalid, style }: DateProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={anchor}
        id={id}
        type="button"
        className={`input ${s.field}`}
        style={style}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-invalid={invalid || undefined}
        onClick={() => setOpen(!open)}
      >
        <Icon name="calendar" />
        <span className={value ? undefined : s.placeholder}>{value ? faDate(`${value}T12:00:00`) : placeholder}</span>
      </button>
      {open && (
        <Calendar
          anchor={anchor}
          value={value}
          min={min}
          max={max}
          clearable={clearable}
          onPick={(v) => {
            onChange(v);
            setOpen(false);
            anchor.current?.focus();
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

type View = "days" | "months" | "years";

function Calendar({ anchor, value, min, max, clearable, onPick, onClose }: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  value: string;
  min?: string;
  max?: string;
  clearable: boolean;
  onPick: (v: string) => void;
  onClose: () => void;
}) {
  const today = isoDay(new Date());
  const start = toJalali(dayOf(value || (max && today > max ? max : min && today < min ? min : today)));
  const [cursor, setCursor] = useState({ y: start.y, m: start.m });
  const [view, setView] = useState<View>("days");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const pop = useRef<HTMLDivElement>(null);

  const allowed = (day: string) => (!min || day >= min) && (!max || day <= max);

  // Fixed to the viewport so a scrolling modal doesn't clip it; opens upward when there is no room below.
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const p = pop.current;
      if (!a || !p) return;
      const w = p.offsetWidth;
      const h = p.offsetHeight;
      const left = Math.max(8, Math.min(a.right - w, innerWidth - w - 8));
      const below = a.bottom + 6;
      const top = below + h > innerHeight - 8 && a.top - h - 6 > 8 ? a.top - h - 6 : below;
      setPos({ top, left });
    };
    place();
    addEventListener("resize", place);
    addEventListener("scroll", place, true);
    return () => {
      removeEventListener("resize", place);
      removeEventListener("scroll", place, true);
    };
  }, [anchor, view]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    // Captured first, so Escape closes only the calendar and not the modal around it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
      anchor.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      removeEventListener("keydown", onKey, true);
    };
  }, [anchor, onClose]);

  useEffect(() => {
    const p = pop.current;
    (p?.querySelector<HTMLButtonElement>("[aria-pressed=true]:enabled") ?? p?.querySelector<HTMLButtonElement>("[data-today]:enabled"))?.focus();
  }, [view]);

  const shiftMonth = (by: number) => {
    const n = cursor.y * 12 + cursor.m - 1 + by;
    setCursor({ y: Math.floor(n / 12), m: (n % 12) + 1 });
  };

  let body: React.ReactNode;
  let head: React.ReactNode;
  if (view === "days") {
    const first = fromJalali({ y: cursor.y, m: cursor.m, d: 1 });
    const lead = weekdayIndex(first);
    const length = jalaliMonthLength(cursor.y, cursor.m);
    head = (
      <>
        <button type="button" onClick={() => setView("months")}>{J_MONTHS[cursor.m - 1]}</button>
        <button type="button" className="num" onClick={() => setView("years")}>{toFaDigits(cursor.y)}</button>
      </>
    );
    body = (
      <>
        <div className={s.week} aria-hidden="true">
          {J_WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
        </div>
        {/* Always six rows, so the calendar keeps its size while paging through months. */}
        <div className={s.days}>
          {Array.from({ length: 42 }, (_, i) => {
            const d = i - lead + 1;
            if (d < 1 || d > length) return <span key={i} />;
            const day = isoDay(fromJalali({ y: cursor.y, m: cursor.m, d }));
            return (
              <button
                key={i}
                type="button"
                className={s.day}
                data-friday={i % 7 === 6 || undefined}
                data-today={day === today || undefined}
                aria-pressed={day === value}
                aria-label={faDate(`${day}T12:00:00`)}
                disabled={!allowed(day)}
                onClick={() => onPick(day)}
              >
                {faNum(d)}
              </button>
            );
          })}
        </div>
      </>
    );
  } else if (view === "months") {
    head = <button type="button" className="num" onClick={() => setView("years")}>{toFaDigits(cursor.y)}</button>;
    body = (
      <div className={s.grid}>
        {J_MONTHS.map((name, i) => (
          <button key={name} type="button" className={s.cell} aria-pressed={cursor.m === i + 1} onClick={() => { setCursor({ ...cursor, m: i + 1 }); setView("days"); }}>
            {name}
          </button>
        ))}
      </div>
    );
  } else {
    const from = cursor.y - (cursor.y % 12);
    head = <span className="num">{toFaDigits(from)} – {toFaDigits(from + 11)}</span>;
    body = (
      <div className={s.grid}>
        {Array.from({ length: 12 }, (_, i) => from + i).map((y) => (
          <button key={y} type="button" className={`${s.cell} num`} aria-pressed={cursor.y === y} onClick={() => { setCursor({ ...cursor, y }); setView("months"); }}>
            {toFaDigits(y)}
          </button>
        ))}
      </div>
    );
  }
  const step = view === "days" ? 1 : view === "months" ? 12 : 144;

  return createPortal(
    <div ref={pop} className={s.pop} role="dialog" aria-label="انتخاب تاریخ" style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}>
      <div className={s.head}>
        <button type="button" className={`${s.nav} ${s.flip}`} aria-label="قبلی" onClick={() => shiftMonth(-step)}>
          <Icon name="chev" />
        </button>
        <div className={s.title}>{head}</div>
        <button type="button" className={s.nav} aria-label="بعدی" onClick={() => shiftMonth(step)}>
          <Icon name="chev" />
        </button>
      </div>
      {body}
      <div className={s.foot}>
        <button type="button" disabled={!allowed(today)} onClick={() => onPick(today)}>امروز</button>
        {clearable && value && <button type="button" onClick={() => onPick("")}>پاک کردن</button>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * A moment (day and time) as an ISO string in the browser's time zone, or null for none.
 * `defaultTime` is used when a day is picked before any time, e.g. "23:59" for an end.
 */
export function DateTimeInput({ id, value, onChange, defaultTime = "00:00", label }: {
  id?: string;
  value: string | null;
  onChange: (v: string | null) => void;
  defaultTime?: string;
  label?: string;
}) {
  const at = value ? new Date(value) : null;
  const [dh, dm] = defaultTime.split(":").map(Number);
  const hour = at ? at.getHours() : dh;
  const minute = at ? at.getMinutes() : dm;
  const emit = (day: string, h: number, m: number) => onChange(new Date(`${day}T${pad(h)}:${pad(m)}:00`).toISOString());
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);
  if (!minutes.includes(minute)) minutes.push(minute);
  minutes.sort((a, b) => a - b);

  return (
    <span className={s.dateTime}>
      <DateInput id={id} label={label} value={at ? isoDay(at) : ""} clearable onChange={(day) => (day ? emit(day, hour, minute) : onChange(null))} />
      <span className={s.time} dir="ltr">
        <Select label="ساعت" searchable={false} value={hour} options={Array.from({ length: 24 }, (_, h) => ({ value: h, label: toFaDigits(pad(h)) }))} disabled={!at} className="num" onChange={(v) => at && emit(isoDay(at), Number(v), minute)} />
        <b>:</b>
        <Select label="دقیقه" searchable={false} value={minute} options={minutes.map((m) => ({ value: m, label: toFaDigits(pad(m)) }))} disabled={!at} className="num" onChange={(v) => at && emit(isoDay(at), hour, Number(v))} />
      </span>
    </span>
  );
}
