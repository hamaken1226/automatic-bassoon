import { Suspense } from "react";
import { MoneyNav } from "./money-nav";

export default function MoneyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense>
        <MoneyNav />
      </Suspense>
      {children}
    </>
  );
}
