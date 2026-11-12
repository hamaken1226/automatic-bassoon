import type { Metadata } from "next";
import { Suspense } from "react";
import { InitiativeApp } from "./initiative-app";

export const metadata: Metadata = { title: "取り組み" };

export default function Page() {
  return (
    <Suspense>
      <InitiativeApp />
    </Suspense>
  );
}
