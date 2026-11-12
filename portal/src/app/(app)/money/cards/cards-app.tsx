"use client";

import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Modal } from "@/components/ui/modal";
import { labelClass, primaryButton, secondaryButton } from "@/components/ui/styles";
import { formatDateShort } from "@/lib/date";
import { cardUsages, formatYen, outflow, parseAmount } from "@/lib/money";
import type { CardSetting } from "@/lib/types";
import { must, useMoney, type MoneyStore } from "@/lib/use-money";
import { useToday } from "@/lib/use-today";
import { cardPeriodInfos, PERIOD_STATUS_LABEL, type PeriodInfo, type PeriodStatus } from "../card-status";
import { AmountInput, ErrorNote, Yen } from "../money-shared";
import { TransactionForm } from "../transaction-form";

const STATUS_CLASS: Record<PeriodStatus, string> = {
  open: "bg-black/5 text-muted dark:bg-white/10",
  unchecked: "border border-border text-foreground",
  matched: "bg-accent-soft text-accent",
  mismatched: "border border-danger text-danger",
};

const PERIODS = 6;

export function CardsApp() {
  const store = useMoney();
  const today = useToday();
  const { data } = store;
  const [selected, setSelected] = useState<{ setting: CardSetting; end: string } | null>(null);

  if (!data || !today) {
    return (
      <>
        <PageHeader title="クレカ照合" />
        <ErrorNote error={store.error} />
        <p className="text-sm text-muted">読み込み中…</p>
      </>
    );
  }

  const placeName = (id: string | null) => data.places.find((p) => p.id === id)?.name ?? "未設定";
  const selectedInfo = selected
    ? cardPeriodInfos(selected.setting, data.statements, data.txs, today, PERIODS).find((i) => i.end === selected.end)
    : undefined;

  return (
    <>
      <PageHeader title="クレカ照合" />
      <ErrorNote error={store.error} />

      {data.cardSettings.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted">
          カードの設定がありません（設定画面で追加できます）
        </p>
      )}

      <div className="space-y-5">
        {data.cardSettings.map((s) => {
          const infos = cardPeriodInfos(s, data.statements, data.txs, today, PERIODS);
          return (
            <section key={s.id} aria-label={placeName(s.place_id)} className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 className="font-semibold">{placeName(s.place_id)}</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {s.closing_day >= 31 ? "月末" : `${s.closing_day}日`}締め・{s.payment_month_offset === 2 ? "翌々月" : "翌月"}
                  {s.payment_day}日払い
                  {s.check_day && `・毎月${s.check_day}日に照合`}・引き落とし: {placeName(s.debit_place_id)}
                  <Link href="/settings#cards" className="ml-2 text-accent underline">
                    変更
                  </Link>
                </p>
              </div>
              <ul>
                {infos.map((info) => (
                  <li key={info.end} className="border-b border-border last:border-b-0">
                    <button type="button" onClick={() => setSelected({ setting: s, end: info.end })} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">
                          {info.status === "open" ? "今の期間" : `${formatDateShort(info.due, today)} 支払い`}
                        </span>
                        <span className="block text-xs text-muted">
                          {formatDateShort(info.start, today)}〜{formatDateShort(info.end, today)}の利用
                          {info.status !== "open" && info.check && info.status === "unchecked" && `・${formatDateShort(info.check, today)}に照合`}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-right">
                          <Yen value={info.appAmount} className="block font-semibold" />
                          {info.statement?.payment_transaction_id && <span className="block text-[11px] text-muted">引き落とし記録済み</span>}
                        </span>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[info.status]}`}>
                          {PERIOD_STATUS_LABEL[info.status]}
                        </span>
                        <ChevronRight className="size-4 text-muted" aria-hidden />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {selected && selectedInfo && (
        <StatementDialog
          key={selectedInfo.end}
          setting={selected.setting}
          info={selectedInfo}
          store={store}
          today={today}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

/** 期間の詳細: 実際の請求額を入れて照合し、引き落としを記録する */
function StatementDialog({
  setting,
  info,
  store,
  today,
  onClose,
}: {
  setting: CardSetting;
  info: PeriodInfo;
  store: MoneyStore;
  today: string;
  onClose: () => void;
}) {
  const data = store.data!;
  const [actual, setActual] = useState(info.statement?.actual_amount != null ? String(info.statement.actual_amount) : "");
  const [error, setError] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<string | null>(null);
  const usages = cardUsages(data.txs, setting.place_id, info.start, info.end);
  const card = data.places.find((p) => p.id === setting.place_id);
  const debit = data.places.find((p) => p.id === setting.debit_place_id);
  const categoryName = (id: string | null) => data.categories.find((c) => c.id === id)?.name ?? "";
  const statement = info.statement;
  const diff = statement?.actual_amount != null ? statement.actual_amount - info.appAmount : null;
  const paymentTx = statement?.payment_transaction_id ? data.txs.find((t) => t.id === statement.payment_transaction_id) : undefined;

  const reconcile = async () => {
    const value = parseAmount(actual);
    if (value === null) return setError("明細の請求額を入力してください");
    setError(null);
    await store.run(async () => {
      must(
        await store.sb.from("card_statements").upsert(
          {
            place_id: setting.place_id,
            period_start: info.start,
            period_end: info.end,
            due_date: info.due,
            app_amount: info.appAmount,
            actual_amount: value,
            status: value === info.appAmount ? "matched" : "mismatched",
          },
          { onConflict: "place_id,period_end" },
        ),
      );
    });
  };

  const recordPayment = async () => {
    if (!statement || statement.actual_amount == null) return;
    if (!debit) return setError("引き落とし口座が設定されていません（設定画面で選べます）");
    if (diff !== 0 && !window.confirm(`アプリ上の金額と ${formatYen(Math.abs(diff ?? 0))} ずれています。\n明細の請求額（${formatYen(statement.actual_amount)}）で引き落としを記録しますか？`)) {
      return;
    }
    await store.run(async () => {
      const tx = must<{ id: string }>(
        await store.sb
          .from("transactions")
          .insert({
            type: "transfer",
            date: info.due,
            amount: statement.actual_amount,
            place_id: debit.id,
            to_place_id: setting.place_id,
            memo: `${card?.name ?? "カード"}の引き落とし`,
          })
          .select("id")
          .single(),
      );
      must(await store.sb.from("card_statements").update({ payment_transaction_id: tx.id }).eq("id", statement.id));
    });
  };

  return (
    <>
      <Modal title={`${card?.name ?? ""} ${info.status === "open" ? "今の期間" : `${formatDateShort(info.due, today)} 支払い`}`} onClose={onClose} className="md:max-w-2xl">
        <div className="space-y-4">
          <ErrorNote error={error ?? store.error} />
          <p className="text-sm text-muted">
            {formatDateShort(info.start, today)}〜{formatDateShort(info.end, today)}の利用・支払日 {formatDateShort(info.due, today)}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-background p-3">
              <p className="text-xs text-muted">アプリ上の請求額</p>
              <p className="text-xl font-bold">
                <Yen value={info.appAmount} />
              </p>
            </div>
            <div className="rounded-lg bg-background p-3">
              <p className="text-xs text-muted">明細の請求額</p>
              <p className="text-xl font-bold">{statement?.actual_amount != null ? <Yen value={statement.actual_amount} /> : <span className="text-muted">未入力</span>}</p>
            </div>
          </div>

          {info.status === "open" ? (
            <p className="text-sm text-muted">この期間はまだ締まっていません。締め日のあとに照合できます。</p>
          ) : (
            <>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <span className={labelClass}>明細の請求額を入力</span>
                  <AmountInput value={actual} onChange={setActual} label="明細の請求額" />
                </div>
                <button type="button" onClick={reconcile} className={primaryButton}>
                  照合
                </button>
              </div>

              {info.status === "matched" && (
                <p role="status" className="inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-2 text-sm font-semibold text-accent">
                  <Check className="size-4" aria-hidden />
                  一致しました
                </p>
              )}
              {info.status === "mismatched" && diff !== null && (
                <p role="status" className="rounded-lg border border-danger px-3 py-2 text-sm text-danger">
                  不一致: 明細のほうが {formatYen(Math.abs(diff))} {diff > 0 ? "多い" : "少ない"}です。下の利用一覧を確認し、記録漏れや金額の違いを直してください。
                </p>
              )}

              {statement?.actual_amount != null &&
                (paymentTx ? (
                  <p className="text-sm text-muted">
                    引き落としを記録済み: {formatDateShort(paymentTx.date, today)} {debit?.name} → {card?.name} {formatYen(paymentTx.amount)}
                  </p>
                ) : (
                  <button type="button" onClick={recordPayment} className={`${secondaryButton} w-full`}>
                    引き落としを記録（{debit?.name ?? "口座未設定"} → {card?.name}・{formatYen(statement.actual_amount)}・{formatDateShort(info.due, today)}）
                  </button>
                ))}
            </>
          )}

          <section aria-label="この期間の利用">
            <h3 className="mb-1 text-xs font-semibold text-muted">
              この期間の利用（{usages.length}件・タップで修正）
            </h3>
            {usages.length === 0 ? (
              <p className="text-sm text-muted">利用の記録はありません</p>
            ) : (
              <ul className="rounded-lg border border-border">
                {usages.map((t) => (
                  <li key={t.id} className="border-b border-border last:border-b-0">
                    <button type="button" onClick={() => setEditingTx(t.id)} className="flex w-full justify-between gap-2 px-3 py-2 text-left text-sm">
                      <span className="min-w-0">
                        {formatDateShort(t.date, today)} {t.type === "income" ? "返金" : categoryName(t.category_id)}
                        {t.memo && <span className="ml-1 text-muted">{t.memo}</span>}
                        {t.total_amount != null && <span className="ml-1 text-xs text-muted">（まとめ払いの全額）</span>}
                      </span>
                      <span className="shrink-0 tabular-nums">{t.type === "income" ? `−${formatYen(t.amount)}` : formatYen(outflow(t))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Modal>
      {editingTx && (
        <TransactionForm tx={data.txs.find((t) => t.id === editingTx) ?? null} store={store} onClose={() => setEditingTx(null)} />
      )}
    </>
  );
}
