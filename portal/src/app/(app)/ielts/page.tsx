import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "IELTS" };

export default function Page() {
  return <ComingSoon title="IELTS" phase={5} />;
}
