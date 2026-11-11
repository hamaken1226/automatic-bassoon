import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "謎解きメモ" };

export default function Page() {
  return <ComingSoon title="謎解きメモ" phase={5} />;
}
