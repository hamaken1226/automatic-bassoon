import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "取り組み" };

export default function Page() {
  return <ComingSoon title="取り組み" phase={3} />;
}
