"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Modal } from "@/components/ui/modal";
import { inputClass, labelClass, primaryButton, secondaryButton } from "@/components/ui/styles";
import { formatDateShort, todayJst } from "@/lib/date";
import { COLLECT_METHOD_LABEL, formatYen, outflow } from "@/lib/money";
import type { CollectMethod, Loan } from "@/lib/types";
import { must, useMoney, type MoneyStore } from "@/lib/use-money";
import { useToday } from "@/lib/use-today";
import { ErrorNote, Yen } from "../money-shared";

type View = "person" | "case";

export function LoansApp() {
  const store = useMoney();
  const today = useToday();
  const { data } = store;
  const [view, setView] = useState<View>("person");
  const [collecting, setCollecting] = useState<{ loans: Loan[]; title: string } | null>(null);

  if (!data || !today) {
    return (
      <>
        <PageHeader title="貸し" />
        <ErrorNote error={store.error} />
        <p className="text-sm text-muted">読み込み中…</p>
      </>
    );
  }

  const txById = new Map(data.txs.map((t) => [t.id, t]));
  const caseLabel = (l: Loan) => {
    const t = txById.get(l.transaction_id);
    if (!t) return "";
    const category = data.categories.find((c) => c.id === t.category_id)?.name;
    return [formatDateShort(t.date, today), t.memo || category].filter(Boolean).join(" ");
  };
  const open = data.loans.filter((l) => l.status === "open");
  const openTotal = open.reduce((sum, l) => sum + l.amount, 0);

  // 相手ごと
  const people = [...new Set(open.map((l) => l.person))]
    .map((person) => {
      const loans = open.filter((l) => l.person === person);
      return { person, loans, total: loans.reduce((s, l) => s + l.amount, 0) };
    })
    .sort((a, b) => b.total - a.total);

  // 案件（まとめ払いの記録）ごと
  const cases = [...new Set(data.loans.map((l) => l.transaction_id))]
    .map((txId) => ({ tx: txById.get(txId), loans: data.loans.filter((l) => l.transaction_id === txId) }))
    .filter((c) => c.tx)
    .sort((a, b) => b.tx!.date.localeCompare(a.tx!.date));
  const openCases = cases.filter((c) => c.loans.some((l) => l.status === "open"));

  // 回収の履歴（入金記録ごと）
  const collections = [...new Set(data.loans.filter((l) => l.collected_transaction_id).map((l) => l.collected_transaction_id!))]
    .map((id) => ({ id, tx: txById.get(id), loans: data.loans.filter((l) => l.collected_transaction_id === id) }))
    .sort((a, b) => (b.loans[0].collected_on ?? "").localeCompare(a.loans[0].collected_on ?? ""));

  const undo = (id: string, total: number) =>
    window.confirm(`この回収（${formatYen(total)}）を取り消しますか？\n入金の記録を削除し、貸しを未回収に戻します。`) &&
    store.run(async () => {
      must(
        await store.sb
          .from("loans")
          .update({ status: "open", collected_on: null, collected_method: null, collected_transaction_id: null })
          .eq("collected_transaction_id", id),
      );
      must(await store.sb.from("transactions").delete().eq("id", id));
    });

  return (
    <>
      <PageHeader title="貸し（まとめ払いの回収）" />
      <ErrorNote error={store.error} />

      <div className="mb-4 rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted">未回収の合計</p>
        <p className="text-3xl font-bold">
          <Yen value={openTotal} />
        </p>
        <p className="mt-1 text-xs text-muted">貸しは支出の記録で「まとめ払い」をオンにすると追加されます</p>
      </div>

      <div role="radiogroup" aria-label="表示" className="mb-3 inline-flex rounded-lg border border-border bg-card p-0.5 text-sm">
        {(
          [
            ["person", "相手ごと"],
            ["case", "案件ごと"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={view === key}
            onClick={() => setView(key)}
            className={`rounded-md px-3 py-1.5 ${view === key ? "bg-accent-soft font-semibold text-accent" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {open.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted">未回収の貸しはありません</p>
      ) : view === "person" ? (
        <ul className="space-y-3">
          {people.map((p) => (
            <li key={p.person} className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                <h2 className="font-semibold">
                  {p.person}
                  <Yen value={p.total} className="ml-3" />
                </h2>
                {p.loans.length > 1 && (
                  <button type="button" onClick={() => setCollecting({ loans: p.loans, title: `${p.person}から全額回収` })} className={`${secondaryButton} px-2 py-1`}>
                    まとめて回収
                  </button>
                )}
              </div>
              <ul>
                {p.loans.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 last:border-b-0">
                    <span className="min-w-0 text-sm">
                      <span className="block break-words">{caseLabel(l)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Yen value={l.amount} className="font-semibold" />
                      <button type="button" onClick={() => setCollecting({ loans: [l], title: `${p.person}から回収` })} className={`${primaryButton} px-3 py-1`}>
                        回収
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-3">
          {openCases.map(({ tx, loans }) => {
            const remaining = loans.filter((l) => l.status === "open").reduce((s, l) => s + l.amount, 0);
            return (
              <li key={tx!.id} className="rounded-xl border border-border bg-card">
                <div className="border-b border-border px-3 py-2.5">
                  <h2 className="font-semibold">{caseLabel(loans[0])}</h2>
                  <p className="text-xs text-muted">
                    全額 {formatYen(outflow(tx!))}・自分 {formatYen(tx!.amount)}・未回収 {formatYen(remaining)}
                  </p>
                </div>
                <ul>
                  {loans.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0">
                      <span>{l.person}</span>
                      <span className="flex items-center gap-2">
                        <Yen value={l.amount} className="font-semibold" />
                        {l.status === "open" ? (
                          <button type="button" onClick={() => setCollecting({ loans: [l], title: `${l.person}から回収` })} className={`${primaryButton} px-3 py-1`}>
                            回収
                          </button>
                        ) : (
                          <span className="w-14 text-center text-xs text-muted">回収済</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}

      {collections.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-muted">回収済み（{collections.length}件）</summary>
          <ul className="mt-2 rounded-xl border border-border bg-card">
            {collections.map((c) => {
              const total = c.loans.reduce((s, l) => s + l.amount, 0);
              const first = c.loans[0];
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0">
                  <span>
                    {first.collected_on && formatDateShort(first.collected_on, today)} {first.person}
                    <span className="ml-2 text-xs text-muted">{first.collected_method && COLLECT_METHOD_LABEL[first.collected_method]}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Yen value={total} />
                    <button type="button" onClick={() => undo(c.id, total)} className={`${secondaryButton} px-2 py-1 text-xs`}>
                      取り消す
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {collecting && <CollectDialog {...collecting} store={store} onClose={() => setCollecting(null)} />}
    </>
  );
}

/** 回収: 回収日と方法を選ぶ。PayPay→PayPay、振込→通常口座、現金→現金 に入金する（収入には数えない） */
function CollectDialog({ loans, title, store, onClose }: { loans: Loan[]; title: string; store: MoneyStore; onClose: () => void }) {
  const data = store.data!;
  const [date, setDate] = useState(todayJst());
  const [method, setMethod] = useState<CollectMethod>("paypay");
  const [error, setError] = useState<string | null>(null);
  const total = loans.reduce((s, l) => s + l.amount, 0);
  const placeId = data.collectPlaces[method];
  const place = data.places.find((p) => p.id === placeId);

  const save = async () => {
    if (!place) return setError("入金先の置き場所が設定されていません（設定画面で選べます）");
    const ok = await store.run(async () => {
      const tx = must<{ id: string }>(
        await store.sb
          .from("transactions")
          .insert({ type: "loan_collection", date, amount: total, place_id: place.id, memo: `${loans[0].person}から回収` })
          .select("id")
          .single(),
      );
      must(
        await store.sb
          .from("loans")
          .update({ status: "collected", collected_on: date, collected_method: method, collected_transaction_id: tx.id })
          .in(
            "id",
            loans.map((l) => l.id),
          ),
      );
    });
    if (ok) onClose();
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={secondaryButton}>
            キャンセル
          </button>
          <button type="button" onClick={save} className={primaryButton}>
            回収を記録
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorNote error={error ?? store.error} />
        <p className="text-2xl font-bold">
          <Yen value={total} />
        </p>
        <label className="block">
          <span className={labelClass}>回収日</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>
        <fieldset>
          <legend className={labelClass}>方法</legend>
          <div role="radiogroup" className="grid grid-cols-3 gap-2">
            {(Object.keys(COLLECT_METHOD_LABEL) as CollectMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={`rounded-lg border py-2.5 text-sm ${method === m ? "border-accent bg-accent-soft font-semibold text-accent" : "border-border"}`}
              >
                {COLLECT_METHOD_LABEL[m]}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="text-sm text-muted">入金先: {place?.name ?? "未設定"}（収入には数えません）</p>
      </div>
    </Modal>
  );
}
