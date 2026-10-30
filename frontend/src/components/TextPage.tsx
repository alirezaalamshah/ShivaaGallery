/** A plain page of text written in the panel: blank lines split paragraphs, and a line starting with "# " is a heading. */
export function TextPage({ title, latin, lead, text, children }: { title: string; latin?: string; lead?: React.ReactNode; text?: string; children?: React.ReactNode }) {
  return (
    <article className="wrap" style={{ paddingBlock: "28px 64px", maxWidth: 760, lineHeight: 2.1 }}>
      {latin && <span className="latin" style={{ fontSize: 11, color: "var(--accent-ink)" }}>{latin}</span>}
      <h1 className="page-title">{title}</h1>
      {lead && <p style={{ color: "var(--muted)" }}>{lead}</p>}
      {text
        ?.split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, i) => (line.startsWith("# ") ? <h2 key={i} style={{ fontSize: 17, marginTop: 28 }}>{line.slice(2)}</h2> : <p key={i}>{line}</p>))}
      {children}
    </article>
  );
}
