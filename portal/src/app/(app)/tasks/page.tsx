import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "タスク" };

export default function Page() {
  return <ComingSoon title="タスク" phase={2} />;
}
