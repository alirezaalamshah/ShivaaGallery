"use client";

import { useCallback, useEffect, useState } from "react";

import { call } from "@/lib/client";

/** Load an admin API resource and keep it in state. */
export function useAdmin<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!path);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await call<T>(`/admin${path}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "دریافت اطلاعات ممکن نشد.");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, setData, error, loading, reload };
}

/** Ask the storefront to drop its cached pages so the change shows at once. */
export async function refreshSite() {
  try {
    await fetch("/revalidate", { method: "POST", credentials: "same-origin" });
  } catch {
    /* the storefront refreshes on its own within a few minutes */
  }
}

export const adminCall = <T = unknown>(path: string, options?: Parameters<typeof call>[1]) => call<T>(`/admin${path}`, options);
