import type { Metadata } from "next";
import { Suspense } from "react";
import { IeltsApp } from "./ielts-app";

export const metadata: Metadata = { title: "IELTS" };

export default function Page() {
  return (
    <Suspense>
      <IeltsApp />
    </Suspense>
  );
}
