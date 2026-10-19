import type { Metadata } from "next";

import { TrackView } from "@/components/orders/TrackView";

export const metadata: Metadata = { title: "پیگیری سفارش" };

export default function TrackPage() {
  return <TrackView />;
}
