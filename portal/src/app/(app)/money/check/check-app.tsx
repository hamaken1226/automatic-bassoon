"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { inputClass, labelClass, primaryButton, secondaryButton } from "@/components/ui/styles";
import { formatDateShort } from "@/lib/date";
import { balances, formatYen, parseAmount } from "@/lib/money";
import { completeTasksLinkedTo } from "@/lib/tasks";
import type { BalanceCheck } from "@/lib/types";
import { must, useMoney } from "@/lib/use-money";
import { useToday } from "@/lib/use-today";
import { AmountInput, ErrorNote, Yen } from "../money-shared";
import { TransactionForm, type TxPreset } from "../transaction-form";

/** 「比べる」を押した時点のアプリ上の残高（履歴にはこの値を残す） */
type Snapshot = { date: string; app: Map<string, number>; actual: Map<string, number> };

export function CheckApp() {
  const store = useMoney();
  const today = useToday();
  const { data, sb } = store;
  const [date, setDate] = useState<string | null>(null);
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [form, setForm] = useState<TxPreset | null>(null);
  const [history, setHistory] = useState<BalanceCheck[] | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { setError } = store;

  const loadHistory = useCallback(async () => {
    const { data: rows, error } = await sb
      .from("balance_checks")
      .select("*, balance_check_items(*)")
      .order("checked_on", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setHistory(rows as BalanceCheck[]);
  }, [sb, setError]);

  useEffect(() => {
    Promise.resolve().then(loadHistory);
  }, [loadHistory]);

  if (!data || !today) {
    return (
      <>
        <PageHeader title="月次チェック" />
        <ErrorNote error={store.error} />
        <p className="text-sm text-muted">読み込み中…</p>
      </>
    );
  }

  const checkDate = date ?? today;
  // クレカは支払日の照合で確認するので対象外。Suicaは置き場所として持たない
  const targets = data.places.filter((p) => p.kind !== "credit");
  const live = balances(data.places, data.txs, snapshot?.date ?? checkDate);
  const placeName = (id: string) => data.places.find((p) => p.id === id)?.name ?? "（削除された置き場所）";

  const compare = () => {
    const actual = new Map<string, number>();
    for (const p of targets) {
      const v = parseAmount(actuals[p.id] ?? "");
      if (v === null) return setError(`「${p.name}」の実際の残高を入力してください`);
      actual.set(p.id, v);
    }
    setError(null);
    setResult(null);
    setSnapshot({ date: checkDate, app: new Map(targets.map((p) => [p.id, live.get(p.id) ?? 0])), actual });
  };

  const adjust = (placeId: string, diff: number) =>
    store.run(async () => {
      must(
        await sb.from("transactions").insert({
          type: "adjustment",
          date: snapshot!.date,
          amount: diff,
          place_id: placeId,
          memo: "月次チェックの調整",
        }),
      );
    });

  const complete = async () => {
    if (!snapshot) return;
    const remaining = targets.filter((p) => (snapshot.actual.get(p.id) ?? 0) !== (live.get(p.id) ?? 0));
    if (remaining.length > 0 && !window.confirm(`${remaining.map((p) => p.name).join("、")}に差額が残っています。このまま完了しますか？`)) {
      return;
    }
    setBusy(true);
    let linked = 0;
    const ok = await store.run(async () => {
      const check = must<{ id: string }>(await sb.from("balance_checks").insert({ checked_on: snapshot.date }).select("id").single());
      must(
        await sb.from("balance_check_items").insert(
          targets.map((p) => {
            const app = snapshot.app.get(p.id) ?? 0;
            const actual = snapshot.actual.get(p.id) ?? 0;
            return { balance_check_id: check.id, place_id: p.id, app_balance: app, actual_balance: actual, diff: actual - app };
          }),
        ),
      );
      // 機能リンク「月次チェック」の付いた未完了タスクを完了にする
      linked = await completeTasksLinkedTo(sb, "money_check");
    });
    setBusy(false);
    if (ok) {
      setSnapshot(null);
      setActuals({});
      setResult(linked > 0 ? `月次チェックを完了しました。タスク${linked}件を完了にしました。` : "月次チェックを完了しました。");
      await loadHistory();
    }
  };

  return (
    <>
      <PageHeader title="月次チェック" description="各置き場所の実際の残高を入れて、アプリ上の残高と突き合わせます" />
      <ErrorNote error={store.error} />
      {result && (
        <p role="status" className="mb-4 inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-2 text-sm font-semibold text-accent">
          <Check className="size-4" aria-hidden />
          {result}
        </p>
      )}

      <section aria-label="残高の入力" className="rounded-xl border border-border bg-card p-4">
        <label className="mb-4 block max-w-48">
          <span className={labelClass}>チェックする日</span>
          <input type="date" value={checkDate} disabled={!!snapshot} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 text-left font-semibold">置き場所</th>
                <th className="py-1 text-right font-semibold">アプリ上</th>
                <th className="py-1 pl-3 text-right font-semibold">実際の残高</th>
                {snapshot && <th className="py-1 text-right font-semibold">差額</th>}
              </tr>
            </thead>
            <tbody>
              {targets.map((p) => {
                const app = snapshot ? (snapshot.app.get(p.id) ?? 0) : (live.get(p.id) ?? 0);
                const actual = snapshot?.actual.get(p.id);
                const remaining = actual !== undefined ? actual - (live.get(p.id) ?? 0) : null;
                return (
                  <tr key={p.id} className="border-t border-border align-top">
                    <th scope="row" className="py-2.5 text-left font-normal">
                      {p.name}
                    </th>
                    <td className="py-2.5 text-right">
                      <Yen value={app} />
                    </td>
                    <td className="py-1.5 pl-3">
                      {snapshot ? (
                        <span className="block py-1 text-right">
                          <Yen value={actual ?? 0} />
                        </span>
                      ) : (
                        <div className="ml-auto w-36">
                          <AmountInput
                            label={`${p.name}の実際の残高`}
                            value={actuals[p.id] ?? ""}
                            onChange={(v) => setActuals({ ...actuals, [p.id]: v })}
                          />
                        </div>
                      )}
                    </td>
                    {snapshot && (
                      <td className="py-2.5 text-right">
                        {actual! - app === 0 ? (
                          <span className="text-accent">一致</span>
                        ) : (
                          <>
                            <Yen value={actual! - app} signed className="font-semibold" />
                            {remaining === 0 ? (
                              <span className="block text-xs text-accent">解消済み</span>
                            ) : (
                              <span className="mt-1 flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setForm({
                                      type: remaining! < 0 ? "expense" : "income",
                                      place_id: p.id,
                                      date: snapshot.date,
                                      amount: Math.abs(remaining!),
                                    })
                                  }
                                  className={`${secondaryButton} px-2 py-1 text-xs`}
                                >
                                  記録漏れを追加
                                </button>
                                <button type="button" onClick={() => adjust(p.id, remaining!)} className={`${secondaryButton} px-2 py-1 text-xs`}>
                                  調整で合わせる
                                </button>
                              </span>
                            )}
                            {remaining !== 0 && remaining !== actual! - app && (
                              <span className="block text-xs text-muted">残り {formatYen(remaining!)}</span>
                            )}
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">クレジットカードは支払日の照合で確認するので対象外です</p>

        <div className="mt-4 flex justify-end gap-2">
          {snapshot ? (
            <>
              <button type="button" onClick={() => setSnapshot(null)} className={secondaryButton}>
                入力に戻る
              </button>
              <button type="button" onClick={complete} disabled={busy} className={primaryButton}>
                チェックを完了
              </button>
            </>
          ) : (
            <button type="button" onClick={compare} className={primaryButton}>
              比べる
            </button>
          )}
        </div>
      </section>

      <section aria-label="チェックの履歴" className="mt-6">
        <h2 className="mb-1.5 text-sm font-semibold text-muted">履歴</h2>
        {history === null ? (
          <p className="text-sm text-muted">読み込み中…</p>
        ) : history.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-5 text-center text-sm text-muted">まだチェックしていません</p>
        ) : (
          <ul className="space-y-2">
            {history.map((h) => {
              const totalDiff = h.balance_check_items.reduce((s, i) => s + i.diff, 0);
              return (
                <li key={h.id}>
                  <details className="rounded-xl border border-border bg-card">
                    <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-sm">
                      <span className="font-semibold">{formatDateShort(h.checked_on, today)}</span>
                      <span>
                        {totalDiff === 0 && h.balance_check_items.every((i) => i.diff === 0) ? (
                          <span className="text-accent">すべて一致</span>
                        ) : (
                          <>
                            差額 <Yen value={totalDiff} signed />
                          </>
                        )}
                      </span>
                    </summary>
                    <table className="w-full border-t border-border text-sm">
                      <thead className="text-xs text-muted">
                        <tr>
                          <th className="px-3 py-1 text-left font-semibold">置き場所</th>
                          <th className="px-3 py-1 text-right font-semibold">アプリ上</th>
                          <th className="px-3 py-1 text-right font-semibold">実際</th>
                          <th className="px-3 py-1 text-right font-semibold">差額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {h.balance_check_items.map((i) => (
                          <tr key={i.id} className="border-t border-border">
                            <td className="px-3 py-1.5">{placeName(i.place_id)}</td>
                            <td className="px-3 py-1.5 text-right">
                              <Yen value={i.app_balance} />
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <Yen value={i.actual_balance} />
                            </td>
                            <td className="px-3 py-1.5 text-right">{i.diff === 0 ? "—" : <Yen value={i.diff} signed />}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {form && <TransactionForm tx={null} preset={form} store={store} onClose={() => setForm(null)} />}
    </>
  );
}
