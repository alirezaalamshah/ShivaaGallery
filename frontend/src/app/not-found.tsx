import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap" style={{ paddingBlock: "72px", textAlign: "center", display: "grid", gap: 12, justifyItems: "center" }}>
      <span className="latin" style={{ color: "var(--accent-ink)", fontSize: 12 }}>404</span>
      <h1 className="page-title">این صفحه پیدا نشد</h1>
      <p style={{ color: "var(--muted)", margin: 0 }}>ممکن است محصول برداشته شده باشد یا آدرس اشتباه باشد.</p>
      <Link href="/shop" className="btn btn-ink" style={{ marginTop: 12 }}>
        دیدن محصولات
      </Link>
    </div>
  );
}
