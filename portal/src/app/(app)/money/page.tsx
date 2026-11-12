import type { Metadata } from "next";
import { MoneyHome } from "./money-home";

export const metadata: Metadata = { title: "お金" };

export default function Page() {
  return <MoneyHome />;
}
