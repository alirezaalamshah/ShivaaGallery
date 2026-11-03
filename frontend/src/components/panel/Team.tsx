"use client";

import { useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/Toast";
import { fieldErrors } from "@/lib/client";
import { faDateTime, faNum } from "@/lib/format";

import { adminCall, useAdmin } from "./hooks";
import { Card, Empty, Field, Modal, PageHead, Switch } from "./ui";
import s from "./panel.module.css";
import t from "./Team.module.css";

type Member = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  role: "admin" | "staff";
  is_active: boolean;
  perms: string[];
  last_login: string | null;
  date_joined: string;
};

type Part = { key: string; label: string; perms: { code: string; label: string }[] };
type Template = { key: string; label: string; perms: string[] };
type TeamData = { members: Member[]; catalog: Part[]; templates: Template[]; implies: Record<string, string> };

type Draft = { username: string; first_name: string; last_name: string; password: string; perms: string[] };

/**
 * Who can sign in to the panel. Admins run everything. Every other user signs in with their own
 * username and password and sees only the parts, and does only the things, ticked for them here.
 */
export function Team() {
  const toast = useToast();
  const { me } = useAuth();
  const { data, setData, loading } = useAdmin<TeamData>("/team");
  const [edit, setEdit] = useState<Member | "new" | null>(null);

  const put = (m: Member) => setData((d) => d && { ...d, members: d.members.some((x) => x.id === m.id) ? d.members.map((x) => (x.id === m.id ? m : x)) : [...d.members, m] });

  const toggle = async (m: Member, is_active: boolean) => {
    try {
      put(await adminCall<Member>(`/team/${m.id}`, { method: "PATCH", body: { is_active } }));
      toast({ text: is_active ? "حساب فعال شد" : "حساب غیرفعال شد؛ دیگر نمی‌تواند وارد شود" });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "ذخیره نشد." });
    }
  };

  return (
    <>
      <PageHead title="کاربران و دسترسی" sub="برای هر کاربر تعیین کنید کدام بخش‌های پنل را ببیند و در هر بخش چه کارهایی بکند. مدیر به همه‌چیز دسترسی دارد.">
        <button type="button" className={s.btn} disabled={!data} onClick={() => setEdit("new")}>افزودن کاربر</button>
      </PageHead>

      <Card>
        {data?.members.length ? (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr><th>نام</th><th>نام کاربری</th><th>دسترسی</th><th>آخرین ورود</th><th>فعال</th><th /></tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.id}>
                    <td>{[m.first_name, m.last_name].filter(Boolean).join(" ") || "—"}{me?.username === m.username && <small className="muted"> (شما)</small>}</td>
                    <td dir="ltr" style={{ textAlign: "right" }}>{m.username}</td>
                    <td>
                      {m.role === "admin" ? (
                        <span className={`${s.role} ${s.roleAdmin}`}>مدیر · همه‌ی دسترسی‌ها</span>
                      ) : (
                        <PartsSummary perms={m.perms} catalog={data.catalog} />
                      )}
                    </td>
                    <td className="muted">{m.last_login ? faDateTime(m.last_login) : "هنوز وارد نشده"}</td>
                    <td>{m.role === "staff" ? <Switch checked={m.is_active} onChange={(v) => toggle(m, v)} label={`فعال بودن ${m.username}`} /> : <span className="muted">—</span>}</td>
                    <td>{m.role === "staff" && <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => setEdit(m)}>ویرایش</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && <Empty icon="user" title="کاربری نیست" />
        )}
        <p className="hint" style={{ marginTop: 14 }}>
          هر کاربر از همان صفحه‌ی ورود پنل (<span dir="ltr">/panel/login</span>) با نام کاربری و رمزش وارد می‌شود و فقط بخش‌هایی را که اجازه دارد در منو می‌بیند. برای قطع دسترسی، حساب را غیرفعال کنید؛ کارهایی که ثبت کرده حفظ می‌شوند.
        </p>
      </Card>

      {edit && data && (
        <MemberForm
          member={edit === "new" ? null : edit}
          team={data}
          onClose={() => setEdit(null)}
          onSaved={(m) => {
            put(m);
            toast({ text: edit === "new" ? "کاربر اضافه شد" : "ذخیره شد" });
            setEdit(null);
          }}
        />
      )}
    </>
  );
}

/** "صندوق فروش حضوری، موجودی انبار" — the parts of the panel this user can open. */
function PartsSummary({ perms, catalog }: { perms: string[]; catalog: Part[] }) {
  const parts = catalog.filter((p) => p.perms.some((x) => perms.includes(x.code)));
  if (!parts.length) return <span className="muted">بدون دسترسی</span>;
  return (
    <span className={t.parts}>
      {parts.map((p) => {
        const n = p.perms.filter((x) => perms.includes(x.code)).length;
        return (
          <span key={p.key} className={s.role} title={p.perms.filter((x) => perms.includes(x.code)).map((x) => x.label).join("، ")}>
            {p.label}{p.perms.length > 1 && n < p.perms.length && <small className="num"> {faNum(n)}/{faNum(p.perms.length)}</small>}
          </span>
        );
      })}
    </span>
  );
}

/** Ticking a permission brings what it builds on (the part's "view", or `implies`); unticking one drops what builds on it. */
function toggled(perms: string[], code: string, on: boolean, team: TeamData) {
  const valid = new Set(team.catalog.flatMap((p) => p.perms.map((x) => x.code)));
  const needs = (c: string) => [team.implies[c], `${c.split(".")[0]}.view`].filter((n) => n && n !== c && valid.has(n));
  const set = new Set(perms);
  if (on) {
    const queue = [code];
    while (queue.length) {
      const c = queue.pop()!;
      set.add(c);
      queue.push(...needs(c).filter((n) => !set.has(n)));
    }
  } else {
    set.delete(code);
    for (let changed = true; changed; ) {
      changed = false;
      for (const c of Array.from(set)) {
        if (needs(c).some((n) => !set.has(n))) {
          set.delete(c);
          changed = true;
        }
      }
    }
  }
  return Array.from(set).sort();
}

function MemberForm({ member, team, onClose, onSaved }: { member: Member | null; team: TeamData; onClose: () => void; onSaved: (m: Member) => void }) {
  const [form, setForm] = useState<Draft>({
    username: member?.username ?? "",
    first_name: member?.first_name ?? "",
    last_name: member?.last_name ?? "",
    password: "",
    perms: member?.perms ?? team.templates[0]?.perms ?? [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: "username" | "first_name" | "last_name" | "password") => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const has = (code: string) => form.perms.includes(code);
  const flip = (code: string, on: boolean) => setForm((f) => ({ ...f, perms: toggled(f.perms, code, on, team) }));
  const sameAs = (tpl: Template) => tpl.perms.length === form.perms.length && tpl.perms.every((c) => form.perms.includes(c));

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const body = member
        ? { first_name: form.first_name, last_name: form.last_name, perms: form.perms, ...(form.password && { password: form.password }) }
        : form;
      onSaved(await adminCall<Member>(member ? `/team/${member.id}` : "/team", { method: member ? "PATCH" : "POST", body }));
    } catch (e) {
      const f = fieldErrors(e);
      setErrors(Object.keys(f).length ? f : { form: e instanceof Error ? e.message : "ذخیره نشد." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title={member ? `ویرایش ${member.username}` : "افزودن کاربر"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={s.btn} disabled={busy} onClick={save}>{busy ? "در حال ذخیره…" : "ذخیره"}</button>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onClose}>انصراف</button>
        </>
      }
    >
      <div className={s.formGrid}>
        <Field label="نام" error={errors.first_name}>
          <input className="input" value={form.first_name} onChange={set("first_name")} autoFocus />
        </Field>
        <Field label="نام خانوادگی" error={errors.last_name}>
          <input className="input" value={form.last_name} onChange={set("last_name")} />
        </Field>
        {!member && (
          <Field label="نام کاربری" error={errors.username} hint="حروف انگلیسی و عدد، مثلاً sara">
            <input className="input ltr" autoComplete="off" autoCapitalize="none" value={form.username} onChange={set("username")} />
          </Field>
        )}
        <Field label={member ? "رمز عبور جدید" : "رمز عبور"} error={errors.password} hint={member ? "خالی بگذارید تا رمز عوض نشود" : "حداقل ۶ حرف. آن را به کاربر بدهید."} full={!!member}>
          <input className="input ltr" type="text" autoComplete="new-password" value={form.password} onChange={set("password")} />
        </Field>
      </div>

      <div className={t.head}>
        <h3>دسترسی‌ها</h3>
        <div className={t.templates} role="group" aria-label="قالب‌های آماده">
          <span className="muted">قالب آماده:</span>
          {team.templates.map((tpl) => (
            <button key={tpl.key} type="button" className="chip" aria-pressed={sameAs(tpl)} onClick={() => setForm({ ...form, perms: tpl.perms })}>{tpl.label}</button>
          ))}
          <button type="button" className="chip" aria-pressed={!form.perms.length} onClick={() => setForm({ ...form, perms: [] })}>هیچ</button>
        </div>
      </div>
      {errors.perms && <p className="err">{errors.perms}</p>}

      <div className={t.grid}>
        {team.catalog.map((part) => {
          const on = part.perms.filter((p) => has(p.code)).length;
          const all = on === part.perms.length;
          return (
            <fieldset key={part.key} className={t.part} data-on={on > 0 || undefined}>
              <legend className={t.legend}>
                <label className={t.check}>
                  <input
                    type="checkbox"
                    checked={all}
                    ref={(el) => {
                      if (el) el.indeterminate = on > 0 && !all;
                    }}
                    onChange={(e) => setForm((f) => ({ ...f, perms: part.perms.reduce((acc, p) => toggled(acc, p.code, e.target.checked, team), f.perms) }))}
                  />
                  <b>{part.label}</b>
                </label>
                {part.perms.length > 1 && <small className="muted num">{faNum(on)} از {faNum(part.perms.length)}</small>}
              </legend>
              {part.perms.length > 1 && (
                <div className={t.perms}>
                  {part.perms.map((p) => (
                    <label key={p.code} className={t.check}>
                      <input type="checkbox" checked={has(p.code)} onChange={(e) => flip(p.code, e.target.checked)} />
                      <span>{p.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>
      {errors.form && <p className="err" role="alert">{errors.form}</p>}
    </Modal>
  );
}
