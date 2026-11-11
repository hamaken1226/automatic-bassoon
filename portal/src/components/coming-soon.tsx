import { PageHeader } from "./page-header";

/** まだ実装していない機能のページに置く仮の表示 */
export function ComingSoon({
  title,
  phase,
  description,
}: {
  title: string;
  phase: number;
  description?: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted">
        この機能は準備中です（フェーズ{phase}で実装します）
      </div>
    </>
  );
}
