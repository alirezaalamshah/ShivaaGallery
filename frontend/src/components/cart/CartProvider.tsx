"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

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

type Cart = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  ready: boolean;
  add: (line: Omit<CartLine, "qty">, qty?: number) => void;
  setQty: (variantId: number, qty: number) => void;
  remove: (variantId: number) => void;
  clear: () => void;
};

const KEY = "cart:v1";
const MAX_QTY = 10;
const CartContext = createContext<Cart | null>(null);

function read(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((l) => typeof l?.variantId === "number" && l.qty > 0) : [];
  } catch {
    return [];
  }
}

/** Guest cart kept in the browser; it is sent to the server at checkout, where prices and stock are re-checked. */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLines(read());
    setReady(true);
    const onStorage = (e: StorageEvent) => e.key === KEY && setLines(read());
    addEventListener("storage", onStorage);
    return () => removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      /* private mode or full storage: the cart still works for this visit */
    }
  }, [lines, ready]);

  const add = useCallback((line: Omit<CartLine, "qty">, qty = 1) => {
    setLines((cur) => {
      const hit = cur.find((l) => l.variantId === line.variantId);
      if (hit) return cur.map((l) => (l === hit ? { ...l, ...line, qty: Math.min(MAX_QTY, l.qty + qty) } : l));
      return [{ ...line, qty: Math.min(MAX_QTY, qty) }, ...cur];
    });
  }, []);
  const setQty = useCallback((variantId: number, qty: number) => {
    setLines((cur) =>
      qty <= 0 ? cur.filter((l) => l.variantId !== variantId) : cur.map((l) => (l.variantId === variantId ? { ...l, qty: Math.min(MAX_QTY, qty) } : l)),
    );
  }, []);
  const remove = useCallback((variantId: number) => setLines((cur) => cur.filter((l) => l.variantId !== variantId)), []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<Cart>(
    () => ({
      lines,
      ready,
      count: lines.reduce((n, l) => n + l.qty, 0),
      subtotal: lines.reduce((n, l) => n + l.qty * l.price, 0),
      add,
      setQty,
      remove,
      clear,
    }),
    [lines, ready, add, setQty, remove, clear],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("useCart must be used inside <CartProvider>");
  return cart;
}
