import type { Metadata } from "next";
import { ReportsApp } from "./reports-app";

export const metadata: Metadata = { title: "推移・レポート" };

export default function Page() {
  return <ReportsApp />;
}
