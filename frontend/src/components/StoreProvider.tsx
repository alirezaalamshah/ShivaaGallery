"use client";

import { createContext, useContext } from "react";

import type { Store } from "@/lib/types";

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ store, children }: { store: Store; children: React.ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <StoreProvider>");
  return store;
}
