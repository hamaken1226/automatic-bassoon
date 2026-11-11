import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { SignOutButton } from "@/components/sign-out-button";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "設定" };

async function Account() {
  const user = await requireUser();
  return <p className="text-sm">{user.email}</p>;
}

export default function Page() {
  return (
    <>
      <PageHeader title="設定" />
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-muted">ログイン中のアカウント</h2>
        <Suspense fallback={<p className="text-sm text-muted">読み込み中…</p>}>
          <Account />
        </Suspense>
        <div className="mt-3 max-w-40 rounded-lg border border-border">
          <SignOutButton />
        </div>
      </section>
      <p className="mt-4 text-sm text-muted">
        各機能の設定項目は、その機能を実装するフェーズで追加します。
      </p>
    </>
  );
}
