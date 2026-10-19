import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { api } from "@/lib/api";
import { faNum } from "@/lib/format";

export const metadata: Metadata = { title: "قوانین مرجوعی" };

export default async function ReturnsPage() {
  const { returns } = await api.store();
  if (!returns.enabled) notFound();
  return (
    <article className="wrap" style={{ paddingBlock: "28px 64px", maxWidth: 760 }}>
      <h1 className="page-title">قوانین مرجوعی</h1>
      <p style={{ color: "var(--muted)" }}>
        مهلت: <b className="num">{faNum(returns.days)} روز</b> پس از تحویل ·{" "}
        {returns.type === "exchange" ? "فقط تعویض سایز" : "تعویض یا بازگشت وجه"}
      </p>
      {returns.policy.split(/\n+/).filter(Boolean).map((para, i) => (
        <p key={i}>{para}</p>
      ))}
    </article>
  );
}
