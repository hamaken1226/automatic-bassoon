import type { Metadata } from "next";
import { Suspense } from "react";
import { NotesApp } from "./notes-app";

export const metadata: Metadata = { title: "メモ" };

export default function Page() {
  return (
    <Suspense>
      <NotesApp />
    </Suspense>
  );
}
