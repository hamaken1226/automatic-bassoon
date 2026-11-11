import Link from "next/link";
import { Suspense } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { SideNav } from "@/components/side-nav";
import { SignOutButton } from "@/components/sign-out-button";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh md:flex">
      {/* PC: 左のサイドメニュー */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-card p-3 md:flex">
        <Link href="/" className="mb-3 px-3 py-2 text-base font-bold">
          自己管理ポータル
        </Link>
        <div className="flex-1 overflow-y-auto">
          <Suspense>
            <SideNav />
          </Suspense>
        </div>
        <div className="border-t border-border pt-2">
          <SignOutButton />
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-8 md:pt-8 md:pb-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>

      {/* スマホ: 下部メニュー */}
      <Suspense>
        <BottomNav signOutSlot={<SignOutButton />} />
      </Suspense>
    </div>
  );
}
