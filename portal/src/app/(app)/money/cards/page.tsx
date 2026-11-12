import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "クレカ照合" };

export default function Page() {
  return <ComingSoon title="クレカ照合" phase={4} />;
}
