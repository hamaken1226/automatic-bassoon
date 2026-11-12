"use client";

import { ChevronLeft, ChevronRight, Plus, TrainFront, Users } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { iconButton, inputClass, primaryButton, secondaryButton } from "@/components/ui/styles";
import { formatDateShort } from "@/lib/date";
import { formatYen, monthTotals, outflow, shiftMonth, TX_TYPE_LABEL } from "@/lib/money";
import type { MoneyTx, TxType } from "@/lib/types";
import { useMoney } from "@/lib/use-money";
import { useToday } from "@/lib/use-today";
import { ErrorNote, Yen } from "../money-shared";
import { TransactionForm, type TxPreset } from "../transaction-form";

type Filter = "all" | TxType;

export function TransactionsApp() {
  const store = useMoney();
  const today = useToday();
  const { data } = store;
  const [month, setMonth] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<Filter>("all");
  const [placeFilter, setPlaceFilter] = useState("");
  const [editing, setEditing] = useState<MoneyTx | null>(null);
  const [adding, setAdding] = useState<TxPreset | null>(null);

  if (!data || !today) {
    return (
      <>
        <PageHeader title="記録一覧" />
        <ErrorNote error={store.error} />
        <p className="text-sm text-muted">読み込み中…</p>
      </>
    );
  }

  const shownMonth = month ?? today.slice(0, 7);
  const placeName = (id: string | null) => data.places.find((p) => p.id === id)?.name ?? "";
  const categoryName = (id: string | null) => data.categories.find((c) => c.id === id)?.name;
  const list = data.txs.filter(
    (t) =>
      t.date.startsWith(shownMonth) &&
      (typeFilter === "all" || t.type === typeFilter) &&
      (!placeFilter || t.place_id === placeFilter || t.to_place_id === placeFilter),
  );
  const totals = monthTotals(data.txs, shownMonth);
  const loanTxIds = new Set(data.loans.map((l) => l.transaction_id));

  // 日ごとにまとめる（新しい順）
  const days: { date: string; txs: MoneyTx[] }[] = [];
  for (const t of list) {
    const last = days[days.length - 1];
    if (last?.date === t.date) last.txs.push(t);
    else days.push({ date: t.date, txs: [t] });
  }

  const describe = (t: MoneyTx) => {
    switch (t.type) {
      case "transfer":
        return `${placeName(t.place_id)} → ${placeName(t.to_place_id)}`;
      case "loan_collection":
        return `貸しの回収（${placeName(t.place_id)}）`;
      case "adjustment":
        return `調整（${placeName(t.place_id)}）`;
      default:
        return `${categoryName(t.category_id) ?? "カテゴリなし"}・${placeName(t.place_id)}`;
    }
  };

  const amountView = (t: MoneyTx) => {
    if (t.type === "expense") return <span className="tabular-nums">−{formatYen(t.amount)}</span>;
    if (t.type === "income") return <span className="tabular-nums text-accent">+{formatYen(t.amount)}</span>;
    if (t.type === "adjustment") return <Yen value={t.amount} signed />;
    return <span className="tabular-nums text-muted">{formatYen(t.amount)}</span>;
  };

  const monthLabel = `${Number(shownMonth.slice(0, 4))}年${Number(shownMonth.slice(5, 7))}月`;

  return (
    <>
      <PageHeader title="記録一覧" />
      <ErrorNote error={store.error} />

      <div className="mb-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setAdding({ type: "expense" })} className={`${primaryButton} inline-flex items-center justify-center gap-1`}>
          <Plus className="size-4" aria-hidden />
          記録する
        </button>
        <button type="button" onClick={() => setAdding({ type: "expense", suica: true })} className={`${secondaryButton} inline-flex items-center justify-center gap-1.5`}>
          <TrainFront className="size-4" aria-hidden />
          Suicaチャージ
        </button>
      </div>

      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" aria-label="前の月" className={iconButton} onClick={() => setMonth(shiftMonth(shownMonth, -1))}>
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <h2 className="font-semibold">{monthLabel}</h2>
        <button type="button" aria-label="次の月" className={iconButton} onClick={() => setMonth(shiftMonth(shownMonth, 1))}>
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>

      <dl className="mb-4 grid grid-cols-4 gap-2 rounded-xl border border-border bg-card p-3 text-center text-sm">
        {[
          ["収入", totals.income],
          ["支出", totals.expense],
          ["差額", totals.diff],
          ["調整", totals.adjustment],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="font-semibold">
              <Yen value={value as number} />
            </dd>
          </div>
        ))}
      </dl>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <select aria-label="種類で絞り込み" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as Filter)} className={inputClass}>
          <option value="all">すべての種類</option>
          {(Object.keys(TX_TYPE_LABEL) as TxType[]).map((t) => (
            <option key={t} value={t}>
              {TX_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select aria-label="置き場所で絞り込み" value={placeFilter} onChange={(e) => setPlaceFilter(e.target.value)} className={inputClass}>
          <option value="">すべての置き場所</option>
          {data.places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {days.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted">この月の記録はありません</p>
      ) : (
        <div className="space-y-3">
          {days.map((d) => (
            <div key={d.date}>
              <h3 className="mb-1 text-sm font-semibold">{d.date === today ? "今日" : formatDateShort(d.date, today)}</h3>
              <ul className="rounded-xl border border-border bg-card">
                {d.txs.map((t) => (
                  <li key={t.id} className="border-b border-border last:border-b-0">
                    <button type="button" onClick={() => setEditing(t)} className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left">
                      <span className="min-w-0">
                        <span className="block text-sm">
                          <span className="mr-1.5 rounded bg-black/5 px-1.5 py-0.5 text-xs text-muted dark:bg-white/10">{TX_TYPE_LABEL[t.type]}</span>
                          {describe(t)}
                        </span>
                        {(t.memo || t.total_amount != null) && (
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                            {t.total_amount != null && loanTxIds.has(t.id) && (
                              <span className="inline-flex items-center gap-1">
                                <Users className="size-3.5" aria-hidden />
                                まとめ払い 全額{formatYen(outflow(t))}
                              </span>
                            )}
                            {t.memo && <span className="break-words">{t.memo}</span>}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-semibold">{amountView(t)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {(editing || adding) && (
        <TransactionForm
          key={editing?.id ?? "new"}
          tx={editing}
          preset={adding ?? undefined}
          store={store}
          onClose={() => {
            setEditing(null);
            setAdding(null);
          }}
        />
      )}
    </>
  );
}
