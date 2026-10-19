/** Browser-side API calls through the same-origin /api proxy, with the session cookie and CSRF token. */

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: Record<string, unknown> | null,
  ) {
    super(errorText(data) || `خطای ${status}`);
  }
}

function cookie(name: string) {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.split("=")[1];
}

async function csrfToken() {
  let token = cookie("csrftoken");
  if (!token) {
    await fetch("/api/auth/csrf", { credentials: "same-origin" });
    token = cookie("csrftoken");
  }
  return token ?? "";
}

type Options = { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown; form?: FormData };

export async function call<T = unknown>(path: string, { method = "GET", body, form }: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") headers["X-CSRFToken"] = await csrfToken();
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, { detail: "اتصال برقرار نشد. اینترنت را بررسی کن و دوباره امتحان کن." });
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

/** The most useful human message inside a DRF error payload. */
export function errorText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  if (typeof d.detail === "string") return d.detail;
  for (const value of Object.values(d)) {
    if (typeof value === "string") return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    if (value && typeof value === "object") {
      const nested = errorText(value);
      if (nested) return nested;
    }
  }
  return "";
}

/** Field → first message, for showing errors next to inputs. */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError) || !e.data) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(e.data)) {
    if (Array.isArray(v) && typeof v[0] === "string") out[k] = v[0];
    else if (typeof v === "string" && k !== "detail") out[k] = v;
  }
  return out;
}
