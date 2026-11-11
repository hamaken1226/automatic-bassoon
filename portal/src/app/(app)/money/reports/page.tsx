import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "推移・レポート" };

export default function Page() {
  return <ComingSoon title="推移・レポート" phase={4} />;
}
