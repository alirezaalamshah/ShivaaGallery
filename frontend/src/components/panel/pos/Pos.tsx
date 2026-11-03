"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth/AuthProvider";

import { useCan } from "../access";
import { PageHead } from "../ui";
import s from "../panel.module.css";
import { Register } from "./Register";
import { SalesDay } from "./SalesDay";
import { TillClose } from "./TillClose";

/** The shop till: ring up in-store sales and returns, see the day's sales, and close the drawer at night. */
export function Pos() {
  const router = useRouter();
  const param = useSearchParams().get("tab");
  const { me } = useAuth();
  const can = useCan();
  const sells = can("pos.sell", "pos.return");
  const closes = can("pos.close");
  // Someone who may not ring up tickets starts on the day's sales.
  const tab = param === "close" && closes ? "close" : param === "sales" || !sells ? "sales" : "till";

  return (
    <>
      <PageHead title="صندوق فروش حضوری" sub={me?.role === "staff" ? `فروشنده: ${me.name || me.username}` : "هر فروش این‌جا از همان موجودی سایت کم می‌شود."}>
        <div className={s.tabs} role="group" aria-label="صندوق">
          {sells && (
            <button type="button" className={s.tab} aria-pressed={tab === "till"} onClick={() => router.replace("/panel/pos")}>
              فاکتور جدید
            </button>
          )}
          <button type="button" className={s.tab} aria-pressed={tab === "sales"} onClick={() => router.replace("/panel/pos?tab=sales")}>
            فروش‌های روز
          </button>
          {closes && (
            <button type="button" className={s.tab} aria-pressed={tab === "close"} onClick={() => router.replace("/panel/pos?tab=close")}>
              بستن صندوق
            </button>
          )}
        </div>
      </PageHead>
      {tab === "till" ? <Register /> : tab === "sales" ? <SalesDay /> : <TillClose />}
    </>
  );
}
