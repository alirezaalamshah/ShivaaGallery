"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { type Me, useAuth } from "@/components/auth/AuthProvider";
import { call } from "@/lib/client";

export type CartLine = {
  variantId: number;
  slug: string;
  name: string;
  colorName: string;
  colorHex: string;
  size: string;
  price: number;
  image: string | null;
  qty: number;
};

/** What the server says about one line: how many can be bought and whether the line's quantity fits. */
export type LineCheck = { available: number; ok: boolean };

type Cart = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  ready: boolean;
  /** Server check of every line, keyed by variant id. Refreshed whenever the cart changes. */
  check: Record<number, LineCheck>;
  /** Lines that can't be bought as they are (sold out, or fewer left than in the cart). */
  issues: number;
  /** Lower each line to what is left, and drop what is sold out. */
  fix: () => void;
  /** Adds to the cart, never past `max` of the same item. Returns false when the cart already holds `max`. */
  add: (line: Omit<CartLine, "qty">, qty?: number, max?: number) => boolean;
  setQty: (variantId: number, qty: number) => void;
  remove: (variantId: number) => void;
  clear: () => void;
};

const GUEST_KEY = "cart:v1";
const MAX_QTY = 10;
const CartContext = createContext<Cart | null>(null);

/** Each signed-in customer has their own cart in this browser, so people sharing a device never see each other's. */
function keyFor(me: Me): string {
  if (!me.authenticated) return GUEST_KEY;
  return `${GUEST_KEY}:user:${me.phone || me.username || "me"}`;
}

function read(key: string): CartLine[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((l) => typeof l?.variantId === "number" && l.qty > 0) : [];
  } catch {
    return [];
  }
}

function write(key: string, lines: CartLine[]) {
  try {
    if (lines.length) localStorage.setItem(key, JSON.stringify(lines));
    else localStorage.removeItem(key);
  } catch {
    /* private mode or full storage: the cart still works for this visit */
  }
}

function merge(into: CartLine[], extra: CartLine[]): CartLine[] {
  const out = [...into];
  for (const line of extra) {
    const i = out.findIndex((l) => l.variantId === line.variantId);
    if (i < 0) out.unshift(line);
    else out[i] = { ...out[i], qty: Math.min(MAX_QTY, out[i].qty + line.qty) };
  }
  return out;
}

/**
 * Cart kept in the browser, one per signed-in customer plus one for guests. On sign-in the guest cart moves
 * into the customer's; on sign-out the customer's cart stays saved for them and the guest cart is shown.
 * It is sent to the server at checkout, where prices and stock are re-checked.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const { me } = useAuth();
  // The storage key and its lines change together, so one person's lines are never saved under another's key.
  const [cart, setCart] = useState<{ key: string | null; lines: CartLine[] }>({ key: null, lines: [] });
  const { key, lines } = cart;
  const ready = key !== null;
  const [check, setCheck] = useState<Record<number, LineCheck>>({});
  const setLines = useCallback((next: (cur: CartLine[]) => CartLine[]) => setCart((c) => ({ ...c, lines: next(c.lines) })), []);

  const owner = me ? keyFor(me) : null;
  useEffect(() => {
    if (!owner) return; // still asking the server who is signed in
    let next = read(owner);
    if (owner !== GUEST_KEY) {
      const guest = read(GUEST_KEY);
      if (guest.length) {
        next = merge(next, guest);
        write(owner, next);
        write(GUEST_KEY, []);
      }
    }
    setCheck({});
    setCart({ key: owner, lines: next });
  }, [owner]);

  useEffect(() => {
    if (!key) return;
    const onStorage = (e: StorageEvent) => e.key === key && setCart({ key, lines: read(key) });
    addEventListener("storage", onStorage);
    return () => removeEventListener("storage", onStorage);
  }, [key]);

  useEffect(() => {
    if (key) write(key, lines);
  }, [key, lines]);

  // Prices and stock in the browser may be old; ask the server, and take its prices.
  const shape = lines.map((l) => `${l.variantId}:${l.qty}`).join(",");
  useEffect(() => {
    if (!ready) return;
    if (!lines.length) {
      setCheck({});
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await call<{ lines: { variant: number; available: number; ok: boolean; unit_price: number }[] }>("/cart/validate", {
          method: "POST",
          body: { lines: lines.map((l) => ({ variant: l.variantId, qty: l.qty })) },
        });
        setCheck(Object.fromEntries(res.lines.map((r) => [r.variant, { available: r.available, ok: r.ok }])));
        const price = new Map(res.lines.map((r) => [r.variant, r.unit_price]));
        setLines((cur) => {
          const stale = cur.some((l) => price.get(l.variantId) && price.get(l.variantId) !== l.price);
          return stale ? cur.map((l) => ({ ...l, price: price.get(l.variantId) || l.price })) : cur;
        });
      } catch {
        /* offline: checkout checks again on the server */
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check only when the lines or quantities change
  }, [shape, ready]);

  const fix = useCallback(() => {
    setLines((cur) =>
      cur.flatMap((l) => {
        const c = check[l.variantId];
        if (!c || c.ok) return [l];
        return c.available > 0 ? [{ ...l, qty: c.available }] : [];
      }),
    );
  }, [check, setLines]);

  const add = useCallback(
    (line: Omit<CartLine, "qty">, qty = 1, max = MAX_QTY) => {
      const limit = Math.min(MAX_QTY, max);
      const have = lines.find((l) => l.variantId === line.variantId)?.qty ?? 0;
      if (have >= limit) return false;
      setLines((cur) => {
        const hit = cur.find((l) => l.variantId === line.variantId);
        if (hit) return cur.map((l) => (l === hit ? { ...l, ...line, qty: Math.min(limit, l.qty + qty) } : l));
        return [{ ...line, qty: Math.min(limit, qty) }, ...cur];
      });
      return true;
    },
    [lines, setLines],
  );
  const setQty = useCallback((variantId: number, qty: number) => {
    setLines((cur) =>
      qty <= 0 ? cur.filter((l) => l.variantId !== variantId) : cur.map((l) => (l.variantId === variantId ? { ...l, qty: Math.min(MAX_QTY, qty) } : l)),
    );
  }, [setLines]);
  const remove = useCallback((variantId: number) => setLines((cur) => cur.filter((l) => l.variantId !== variantId)), [setLines]);
  const clear = useCallback(() => setLines(() => []), [setLines]);

  const value = useMemo<Cart>(
    () => ({
      lines,
      ready,
      count: lines.reduce((n, l) => n + l.qty, 0),
      subtotal: lines.reduce((n, l) => n + l.qty * l.price, 0),
      check,
      issues: lines.filter((l) => check[l.variantId] && !check[l.variantId].ok).length,
      fix,
      add,
      setQty,
      remove,
      clear,
    }),
    [lines, ready, check, fix, add, setQty, remove, clear],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("useCart must be used inside <CartProvider>");
  return cart;
}
