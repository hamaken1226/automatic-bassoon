import type { Metadata } from "next";
import { Suspense } from "react";
import { NazoApp } from "./nazo-app";

export const metadata: Metadata = { title: "謎解きメモ" };

export default function Page() {
  return (
    <Suspense>
      <NazoApp />
    </Suspense>
  );
}
