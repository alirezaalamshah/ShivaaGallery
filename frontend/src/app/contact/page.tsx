import type { Metadata } from "next";

import { Icon } from "@/components/Icon";
import { TextPage } from "@/components/TextPage";
import { api } from "@/lib/api";
import { toFaDigits } from "@/lib/format";
import { SocialLogo } from "@/components/SocialLogo";
import { socialColor, socialHandle } from "@/lib/socials";

export const metadata: Metadata = { title: "تماس با ما" };

const row: React.CSSProperties = { display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 0", borderBottom: "1px solid var(--line)" };

export default async function ContactPage() {
  const store = await api.store();
  return (
    <TextPage title="تماس با ما" latin="Contact" lead="برای پرسش درباره‌ی سایز، موجودی یا سفارش، از یکی از این راه‌ها با ما در ارتباط باشید.">
      <div style={{ marginTop: 12 }}>
        {store.phone && (
          <div style={row}>
            <Icon name="phone" />
            <span>موبایل: <a href={`tel:${store.phone}`} className="num" dir="ltr">{toFaDigits(store.phone)}</a></span>
          </div>
        )}
        {store.landline && (
          <div style={row}>
            <Icon name="phone" />
            <span>تلفن فروشگاه: <a href={`tel:${store.landline}`} className="num" dir="ltr">{toFaDigits(store.landline)}</a></span>
          </div>
        )}
        {store.socials.map((x) => (
          <div key={`${x.network}-${x.handle}`} style={row}>
            <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, flex: "none", borderRadius: 9, color: "#fff", background: socialColor(x.network) }}>
              <SocialLogo network={x.network} size={18} />
            </span>
            <span>{x.label}: <a href={x.url} target="_blank" rel="noopener noreferrer" dir="ltr">{socialHandle(x.network, x.handle)}</a></span>
          </div>
        ))}
        {(store.address || store.city) && (
          <div style={row}>
            <Icon name="pin" />
            <span>آدرس فروشگاه حضوری: {store.address || store.city}</span>
          </div>
        )}
        {store.working_hours && (
          <div style={row}>
            <Icon name="clock" />
            <span>ساعت کاری: {store.working_hours}</span>
          </div>
        )}
      </div>
    </TextPage>
  );
}
