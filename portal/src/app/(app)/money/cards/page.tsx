import type { Metadata } from "next";
import { CardsApp } from "./cards-app";

export const metadata: Metadata = { title: "クレカ照合" };

export default function Page() {
  return <CardsApp />;
}
