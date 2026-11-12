import type { Metadata } from "next";
import { CheckApp } from "./check-app";

export const metadata: Metadata = { title: "月次チェック" };

export default function Page() {
  return <CheckApp />;
}
