import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "メモ" };

export default function Page() {
  return <ComingSoon title="メモ" phase={2} />;
}
