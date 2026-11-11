import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "勤怠" };

export default function Page() {
  return <ComingSoon title="勤怠" phase={3} />;
}
