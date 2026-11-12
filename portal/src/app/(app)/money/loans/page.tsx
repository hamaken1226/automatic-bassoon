import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "貸し（まとめ払いの回収）" };

export default function Page() {
  return <ComingSoon title="貸し（まとめ払いの回収）" phase={4} />;
}
