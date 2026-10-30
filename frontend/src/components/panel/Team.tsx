"use client";

import { useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/Toast";
import { fieldErrors } from "@/lib/client";
import { faDateTime } from "@/lib/format";

import { adminCall, useAdmin } from "./hooks";
import { Card, Empty, Field, Modal, PageHead, Switch } from "./ui";
import s from "./panel.module.css";

type Member = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  role: "admin" | "seller";
  is_active: boolean;
  last_login: string | null;
  date_joined: string;
};

type Draft = { username: string; first_name: string; last_name: string; password: string };

/**
 * Who can sign in to the panel. Admins run everything. Sellers sign in with their own
 * username and password and see only the till, where they record in-store sales.
 */
export function Team() {
  const toast = useToast();
  const { me } = useAuth();
  const { data, setData, loading } = useAdmin<Member[]>("/team");
  const [edit, setEdit] = useState<Member | "new" | null>(null);

  const toggle = async (m: Member, is_active: boolean) => {
    try {
      const fresh = await adminCall<Member>(`/team/${m.id}`, { method: "PATCH", body: { is_active } });
      setData((d) => d && d.map((x) => (x.id === m.id ? fresh : x)));
      toast({ text: is_active ? "حساب فعال شد" : "حساب غیرفعال شد؛ دیگر نمی‌تواند وارد شود" });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "ذخیره نشد." });
    }
  };

  return (
    <>
      <PageHead title="کاربران و دسترسی" sub="فروشنده فقط صندوق فروش حضوری را می‌بیند و به سفارش‌ها، محصولات، گزارش‌ها و تنظیمات دسترسی ندارد.">
        <button type="button" className={s.btn} onClick={() => setEdit("new")}>افزودن فروشنده</button>
      </PageHead>

      <Card>
        {data?.length ? (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr><th>نام</th><th>نام کاربری</th><th>نقش</th><th>آخرین ورود</th><th>فعال</th><th /></tr>
              </thead>
              <tbody>
                {data.map((m) => (
                  <tr key={m.id}>
                    <td>{[m.first_name, m.last_name].filter(Boolean).join(" ") || "—"}{me?.username === m.username && <small className="muted"> (شما)</small>}</td>
                    <td dir="ltr" style={{ textAlign: "right" }}>{m.username}</td>
                    <td><span className={`${s.role} ${m.role === "admin" ? s.roleAdmin : ""}`}>{m.role === "admin" ? "مدیر" : "فروشنده"}</span></td>
                    <td className="muted">{m.last_login ? faDateTime(m.last_login) : "هنوز وارد نشده"}</td>
                    <td>{m.role === "seller" ? <Switch checked={m.is_active} onChange={(v) => toggle(m, v)} label={`فعال بودن ${m.username}`} /> : <span className="muted">—</span>}</td>
                    <td>{m.role === "seller" && <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => setEdit(m)}>ویرایش</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && <Empty icon="user" title="کاربری نیست" />
        )}
        <p className="hint" style={{ marginTop: 14 }}>
          فروشنده از همان صفحه‌ی ورود پنل (<span dir="ltr">/panel/login</span>) با نام کاربری و رمزش وارد می‌شود. برای قطع دسترسی، حساب را غیرفعال کنید؛ فروش‌هایی که ثبت کرده حفظ می‌شوند.
        </p>
      </Card>

      {edit && (
        <MemberForm
          member={edit === "new" ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={(m) => {
            setData((d) => (d ? (d.some((x) => x.id === m.id) ? d.map((x) => (x.id === m.id ? m : x)) : [...d, m]) : [m]));
            toast({ text: edit === "new" ? "فروشنده اضافه شد" : "ذخیره شد" });
            setEdit(null);
          }}
        />
      )}
    </>
  );
}

function MemberForm({ member, onClose, onSaved }: { member: Member | null; onClose: () => void; onSaved: (m: Member) => void }) {
  const [form, setForm] = useState<Draft>({ username: member?.username ?? "", first_name: member?.first_name ?? "", last_name: member?.last_name ?? "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const body = member
        ? { first_name: form.first_name, last_name: form.last_name, ...(form.password && { password: form.password }) }
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
      title={member ? `ویرایش ${member.username}` : "افزودن فروشنده"}
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
          <Field label="نام کاربری" error={errors.username} hint="حروف انگلیسی و عدد، مثلاً sara" full>
            <input className="input ltr" autoComplete="off" autoCapitalize="none" value={form.username} onChange={set("username")} />
          </Field>
        )}
        <Field label={member ? "رمز عبور جدید" : "رمز عبور"} error={errors.password} hint={member ? "خالی بگذارید تا رمز عوض نشود" : "حداقل ۶ حرف. آن را به فروشنده بدهید."} full>
          <input className="input ltr" type="text" autoComplete="new-password" value={form.password} onChange={set("password")} />
        </Field>
      </div>
      {errors.form && <p className="err" role="alert">{errors.form}</p>}
    </Modal>
  );
}
