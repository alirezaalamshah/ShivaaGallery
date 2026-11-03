"use client";

import { useCallback } from "react";

import { useAuth, type Me } from "@/components/auth/AuthProvider";

/** Everything at the till; any one of them opens it. Mirrors `TILL` in backend/apps/pos/views.py. */
export const TILL = ["pos.sell", "pos.discount", "pos.discount_any", "pos.return", "pos.return_any", "pos.all_sales", "pos.void", "pos.close", "pos.close_past"];

// Which permission opens each part of the panel (any one of the codes). The longest matching prefix wins.
// "admin" means only the admin. The server checks the same again on every request.
const ROUTES: [string, string[] | "admin"][] = [
  ["/panel/pos", TILL],
  ["/panel/orders", ["orders.view"]],
  ["/panel/returns", ["returns.view"]],
  ["/panel/stock", ["stock.view"]],
  ["/panel/inventory", ["stock.history"]],
  ["/panel/customers", ["customers.view"]],
  ["/panel/reviews", ["reviews.view"]],
  ["/panel/reports", ["reports.view"]],
  ["/panel/expenses", ["expenses.view"]],
  ["/panel/products/new", ["products.edit"]],
  ["/panel/products", ["products.view"]],
  ["/panel/categories", ["categories.manage"]],
  ["/panel/attributes", ["attributes.manage"]],
  ["/panel/home", ["home.manage"]],
  ["/panel/shipping", ["shipping.manage"]],
  ["/panel/discounts", ["discounts.manage"]],
  ["/panel/team", "admin"],
  ["/panel/settings", ["settings.manage"]],
];

export const isPanelUser = (me: Me | null) => !!me?.authenticated && (me.role === "admin" || me.role === "staff");

export function holds(me: Me | null, ...codes: string[]) {
  if (!isPanelUser(me)) return false;
  if (me!.role === "admin") return true;
  return codes.some((c) => me!.perms?.includes(c));
}

export function canOpen(me: Me | null, path: string) {
  if (!isPanelUser(me)) return false;
  if (path === "/panel") return holds(me, "dashboard.view");
  const rule = ROUTES.filter(([prefix]) => path === prefix || path.startsWith(`${prefix}/`)).sort((a, b) => b[0].length - a[0].length)[0];
  if (!rule) return me!.role === "admin";
  return rule[1] === "admin" ? me!.role === "admin" : holds(me, ...rule[1]);
}

/** The first page this user may open, in menu order, or null when they may open none. */
export function homeOf(me: Me | null, menu: string[]) {
  return menu.find((href) => canOpen(me, href)) ?? null;
}

/** `can("orders.manage")`: whether the signed-in user holds any of the codes. */
export function useCan() {
  const { me } = useAuth();
  return useCallback((...codes: string[]) => holds(me, ...codes), [me]);
}
