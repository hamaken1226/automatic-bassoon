import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "記録一覧" };

export default function Page() {
  return <ComingSoon title="記録一覧" phase={4} />;
}
