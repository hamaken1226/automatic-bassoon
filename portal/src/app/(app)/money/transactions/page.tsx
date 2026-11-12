import type { Metadata } from "next";
import { TransactionsApp } from "./transactions-app";

export const metadata: Metadata = { title: "記録一覧" };

export default function Page() {
  return <TransactionsApp />;
}
