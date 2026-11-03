/** Page numbers for a pager: five around the current page, plus the first and last, with null for a gap ("…"). */
export function pageWindow(current: number, pages: number, size = 5): (number | null)[] {
  if (pages <= size + 2) return Array.from({ length: pages }, (_, i) => i + 1);
  const end = Math.min(pages, Math.max(current - Math.floor(size / 2), 1) + size - 1);
  const start = end - size + 1;
  const out: (number | null)[] = [];
  if (start > 1) out.push(1);
  if (start > 2) out.push(start === 3 ? 2 : null);
  for (let n = start; n <= end; n++) out.push(n);
  if (end < pages - 1) out.push(end === pages - 2 ? pages - 1 : null);
  if (end < pages) out.push(pages);
  return out;
}
