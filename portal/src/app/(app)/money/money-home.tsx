"use client";

import { ChevronRight, Plus, TrainFront } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { primaryButton, secondaryButton } from "@/components/ui/styles";
import { formatDateShort } from "@/lib/date";
import { balances, monthTotals, netWorth, PLACE_KIND_LABEL } from "@/lib/money";
import { useMoney } from "@/lib/use-money";
import { useToday } from "@/lib/use-today";
import { cardPeriodInfos, nextPayment, PERIOD_STATUS_LABEL } from "./card-status";
import { ErrorNote, Yen } from "./money-shared";
import { TransactionForm, type TxPreset } from "./transaction-form";

export function MoneyHome() {
  const store = useMoney();
  const today = useToday();
  const [form, setForm] = useState<TxPreset | null>(null);
  const { data } = store;

  if (!data || !today) {
    return (
      <>
        <PageHeader title="お金" />
        <ErrorNote error={store.error} />
        <p className="text-sm text-muted">読み込み中…</p>
      </>
    );
  }

  const month = today.slice(0, 7);
  const totals = monthTotals(data.txs, month);
  const bal = balances(data.places, data.txs, today);
  const openLoans = data.loans.filter((l) => l.status === "open").reduce((sum, l) => sum + l.amount, 0);

  return (
    <>
      <PageHeader title="お金" />
      <ErrorNote error={store.error} />

      <div className="mb-5 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setForm({ type: "expense" })} className={`${primaryButton} inline-flex h-12 items-center justify-center gap-1.5 text-base`}>
          <Plus className="size-5" aria-hidden />
          記録する
        </button>
        <button type="button" onClick={() => setForm({ type: "expense", suica: true })} className={`${secondaryButton} inline-flex h-12 items-center justify-center gap-1.5 text-base`}>
          <TrainFront className="size-5" aria-hidden />
          Suicaチャージ
        </button>
      </div>

      <section aria-label="今月" className="mb-5 grid grid-cols-3 gap-2">
        {[
          ["今月の収入", totals.income],
          ["今月の支出", totals.expense],
          ["差額", totals.diff],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="text-lg font-bold md:text-2xl">
              <Yen value={value as number} />
            </p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-label="置き場所" className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">置き場所</h2>
            <p className="text-sm">
              <span className="text-muted">合計 </span>
              <Yen value={netWorth(data.places, data.txs, today)} className="font-bold" />
            </p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {data.places.map((p) => {
                const value = bal.get(p.id) ?? 0;
                return (
                  <tr key={p.id} className="border-t border-border">
                    <th scope="row" className="py-2 text-left font-normal">
                      {p.name}
                      <span className="ml-2 text-xs text-muted">{p.kind === "credit" ? "未払い" : PLACE_KIND_LABEL[p.kind]}</span>
                    </th>
                    <td className="py-2 text-right font-semibold">{p.kind === "credit" ? <Yen value={-value} /> : <Yen value={value} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <div className="space-y-4">
          <Link href="/money/loans" className="block rounded-xl border border-border bg-card p-4 hover:border-accent">
            <span className="flex items-center justify-between text-sm font-semibold">
              未回収の貸し
              <ChevronRight className="size-4 text-muted" aria-hidden />
            </span>
            <span className="mt-1 block text-2xl font-bold">
              <Yen value={openLoans} />
            </span>
          </Link>
          <Link href="/money/cards" className="block rounded-xl border border-border bg-card p-4 hover:border-accent">
            <span className="flex items-center justify-between text-sm font-semibold">
              クレカの支払い
              <ChevronRight className="size-4 text-muted" aria-hidden />
            </span>
            <ul className="mt-1 space-y-1 text-sm">
              {data.cardSettings.map((s) => {
                const place = data.places.find((p) => p.id === s.place_id);
                const next = nextPayment(cardPeriodInfos(s, data.statements, data.txs, today, 2), today);
                return (
                  <li key={s.id} className="flex flex-wrap justify-between gap-x-2">
                    <span>{place?.name}</span>
                    {next ? (
                      <span>
                        {formatDateShort(next.due, today)} <Yen value={next.statement?.actual_amount ?? next.appAmount} />
                        <span className={`ml-2 text-xs ${next.status === "matched" ? "text-accent" : next.status === "mismatched" ? "text-danger" : "text-muted"}`}>
                          {PERIOD_STATUS_LABEL[next.status]}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted">支払い予定なし</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Link>
          <Link href="/money/transactions" className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-sm font-semibold hover:border-accent">
            記録一覧
            <ChevronRight className="size-4 text-muted" aria-hidden />
          </Link>
        </div>
      </div>

      {form && <TransactionForm tx={null} preset={form} store={store} onClose={() => setForm(null)} />}
    </>
  );
}
