// Each network's own color, for the small square behind its icon.
const COLORS: Record<string, string> = {
  instagram: "linear-gradient(135deg, #f9ce34, #ee2a7b 55%, #6228d7)",
  telegram: "#229ed9", whatsapp: "#1fa855", bale: "#2bb3a3", rubika: "linear-gradient(135deg, #f2295b, #7b3fe4)",
  eitaa: "#ef7d00", soroush: "#2c6fe0", igap: "#0aa3a3", aparat: "#df0f50", youtube: "#e62117", tiktok: "#111",
  pinterest: "#e60023", facebook: "#1877f2", x: "#111", linkedin: "#0a66c2",
};

export const socialColor = (network: string) => COLORS[network] ?? "var(--accent)";

/** What the link invites people to do. */
export const socialAction = (network: string, label: string) =>
  network === "whatsapp" ? "در واتس‌اپ به ما پیام بده" : `ما را در ${label} دنبال کن`;

/** "@shiva" for an ID, the bare address for a full link, the number for WhatsApp. */
export const socialHandle = (network: string, handle: string) =>
  handle.startsWith("https://") ? handle.replace(/^https:\/\/(www\.)?/, "") : network === "whatsapp" ? handle : `@${handle}`;
