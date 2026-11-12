import type { Metadata } from "next";
import { LoansApp } from "./loans-app";

export const metadata: Metadata = { title: "貸し" };

export default function Page() {
  return <LoansApp />;
}
