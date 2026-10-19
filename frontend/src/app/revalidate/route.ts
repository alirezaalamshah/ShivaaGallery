import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

/** The admin panel calls this after a change so the storefront shows it right away. Staff only. */
export async function POST(request: NextRequest) {
  const res = await fetch(`${API_URL}/auth/me/`, {
    headers: { cookie: request.headers.get("cookie") ?? "" },
    cache: "no-store",
  });
  const me = res.ok ? await res.json() : null;
  if (!me?.is_staff) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  revalidatePath("/", "layout");
  return NextResponse.json({ revalidated: true });
}
