"use client";

import { Plus, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { dangerButton, iconButton, inputClass, labelClass, primaryButton, secondaryButton } from "@/components/ui/styles";
import { todayJst } from "@/lib/date";
import { formatYen, parseAmount, splitError, TX_TYPE_LABEL } from "@/lib/money";
import type { MoneyTx, TxType } from "@/lib/types";
import { must, type MoneyStore } from "@/lib/use-money";
import { AmountInput, ErrorNote } from "./money-shared";

export type TxPreset = Partial<Pick<MoneyTx, "type" | "date" | "amount" | "place_id" | "to_place_id" | "category_id" | "memo">> & {
  suica?: boolean;
};

type LoanDraft = { id?: string; person: string; amount: string; collected: boolean };

const LAST_PLACE_KEY = "money:last-place";

function lastPlace(type: TxType): string | undefined {
  try {
    return (JSON.parse(localStorage.getItem(LAST_PLACE_KEY) ?? "{}") as Record<string, string>)[type];
  } catch {
    return undefined;
  }
}

function rememberPlace(type: TxType, placeId: string) {
  try {
    const map = JSON.parse(localStorage.getItem(LAST_PLACE_KEY) ?? "{}") as Record<string, string>;
    localStorage.setItem(LAST_PLACE_KEY, JSON.stringify({ ...map, [type]: placeId }));
  } catch {
    // 保存できなくても続ける
  }
}

/**
 * 支出・収入・振替の記録と編集。よく使う項目（金額・置き場所・カテゴリ）を上に置く。
 * Suicaチャージは「交通費」の支出として記録する。
 */
export function TransactionForm({
  tx,
  preset,
  store,
  onClose,
}: {
  tx: MoneyTx | null;
  preset?: TxPreset;
  store: MoneyStore;
  onClose: () => void;
}) {
  const data = store.data!;
  const existingLoans = tx ? data.loans.filter((l) => l.transaction_id === tx.id) : [];
  const initialType: TxType = tx?.type ?? preset?.type ?? "expense";
  const suica = tx?.is_suica_charge ?? preset?.suica ?? false;
  const assetPlaces = data.places.filter((p) => p.kind !== "credit");
  const defaultPlace = (type: TxType) => {
    const remembered = lastPlace(type);
    if (remembered && data.places.some((p) => p.id === remembered)) return remembered;
    return (type === "income" ? assetPlaces[0] : data.places[0])?.id ?? "";
  };

  const [type, setType] = useState<TxType>(initialType);
  const [amount, setAmount] = useState(
    tx ? String(tx.total_amount ?? tx.amount) : preset?.amount !== undefined ? String(preset.amount) : "",
  );
  const [date, setDate] = useState(tx?.date ?? preset?.date ?? todayJst());
  const [placeId, setPlaceId] = useState(tx?.place_id ?? preset?.place_id ?? defaultPlace(initialType));
  const [toPlaceId, setToPlaceId] = useState(tx?.to_place_id ?? preset?.to_place_id ?? "");
  const [categoryId, setCategoryId] = useState(
    tx?.category_id ?? preset?.category_id ?? (suica ? (data.categories.find((c) => c.direction === "expense" && c.name === "交通費")?.id ?? "") : ""),
  );
  const [memo, setMemo] = useState(tx?.memo ?? preset?.memo ?? (suica ? "Suicaチャージ" : ""));
  const [split, setSplit] = useState(existingLoans.length > 0);
  const [share, setShare] = useState(tx?.total_amount != null ? String(tx.amount) : "");
  const [loans, setLoans] = useState<LoanDraft[]>(
    existingLoans.length > 0
      ? existingLoans.map((l) => ({ id: l.id, person: l.person, amount: String(l.amount), collected: l.status === "collected" }))
      : [{ person: "", amount: "", collected: false }],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const people = useMemo(() => [...new Set(data.loans.map((l) => l.person))].sort((a, b) => a.localeCompare(b, "ja")), [data.loans]);
  const categories = data.categories.filter((c) => c.direction === (type === "income" ? "income" : "expense"));
  const total = parseAmount(amount, type === "adjustment");

  // 自分の負担分の目安（全額 − 貸しの合計）
  const lentSum = loans.reduce((sum, l) => sum + (parseAmount(l.amount) ?? 0), 0);
  const changeType = (next: TxType) => {
    setType(next);
    setCategoryId("");
    if (!tx) setPlaceId(defaultPlace(next));
  };

  const save = async () => {
    if (total === null || (type !== "adjustment" && total <= 0)) return setError("金額を正しく入力してください");
    if (!placeId) return setError("置き場所を選んでください");
    if (!date) return setError("日付を入力してください");
    if (type === "transfer" && (!toPlaceId || toPlaceId === placeId)) return setError("移動先を、移動元と違う置き場所から選んでください");

    let myAmount = total;
    let totalAmount: number | null = null;
    let loanRows: { id?: string; person: string; amount: number; collected: boolean }[] = [];
    if (type === "expense" && split) {
      const shareValue = parseAmount(share === "" ? "0" : share);
      if (shareValue === null) return setError("自分の負担分を正しく入力してください");
      loanRows = loans
        .filter((l) => l.collected || l.person.trim() || l.amount.trim())
        .map((l) => ({ id: l.id, person: l.person.trim(), amount: parseAmount(l.amount) ?? 0, collected: l.collected }));
      const message = splitError(total, shareValue, loanRows);
      if (message) return setError(message);
      myAmount = shareValue;
      totalAmount = total;
    }

    setBusy(true);
    setError(null);
    rememberPlace(type, placeId);
    const ok = await store.run(async () => {
      const { sb } = store;
      const values = {
        type,
        date,
        amount: myAmount,
        total_amount: totalAmount,
        place_id: placeId,
        to_place_id: type === "transfer" ? toPlaceId : null,
        category_id: type === "expense" || type === "income" ? categoryId || null : null,
        memo: memo.trim(),
        is_suica_charge: type === "expense" && suica,
      };
      let txId = tx?.id;
      if (txId) must(await sb.from("transactions").update(values).eq("id", txId));
      else txId = must<{ id: string }>(await sb.from("transactions").insert(values).select("id").single()).id;

      // 貸しの同期（回収済みのものは変えない）
      const keep = new Set(loanRows.filter((l) => l.id).map((l) => l.id));
      const removed = existingLoans.filter((l) => l.status === "open" && !keep.has(l.id)).map((l) => l.id);
      if (removed.length > 0) must(await sb.from("loans").delete().in("id", removed));
      for (const l of loanRows) {
        if (l.collected) continue;
        if (l.id) must(await sb.from("loans").update({ person: l.person, amount: l.amount }).eq("id", l.id));
        else must(await sb.from("loans").insert({ transaction_id: txId, person: l.person, amount: l.amount }));
      }
    });
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!tx) return;
    const collected = existingLoans.filter((l) => l.status === "collected");
    const message =
      collected.length > 0
        ? "この記録を削除しますか？\n貸しも削除されます。回収済みの分の入金記録は残ります。"
        : existingLoans.length > 0
          ? "この記録を削除しますか？\n貸しも削除されます。"
          : "この記録を削除しますか？";
    if (!window.confirm(message)) return;
    const ok = await store.run(async () => {
      must(await store.sb.from("transactions").delete().eq("id", tx.id));
    });
    if (ok) onClose();
  };

  const placeSelect = (label: string, value: string, onChange: (v: string) => void, options = data.places) => (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {!value && <option value="">選んでください</option>}
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );

  const title = suica
    ? "Suicaチャージ"
    : tx
      ? `${TX_TYPE_LABEL[tx.type]}を編集`
      : "記録を追加";
  const canChangeType = !suica && (!tx || tx.type === "expense" || tx.type === "income" || tx.type === "transfer");

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          {tx && (
            <button type="button" onClick={remove} className={`${dangerButton} inline-flex items-center gap-1.5`}>
              <Trash2 className="size-4" aria-hidden />
              削除
            </button>
          )}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={secondaryButton}>
            キャンセル
          </button>
          <button type="button" onClick={save} disabled={busy} className={primaryButton}>
            {busy ? "保存中…" : "保存"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorNote error={error ?? store.error} />

        {canChangeType && (
          <div role="radiogroup" aria-label="記録の種類" className="grid grid-cols-3 rounded-lg border border-border p-0.5 text-sm">
            {(["expense", "income", "transfer"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => changeType(t)}
                disabled={!!tx && existingLoans.length > 0 && t !== "expense"}
                className={`rounded-md py-2 ${type === t ? "bg-accent-soft font-semibold text-accent" : "text-muted"} disabled:opacity-40`}
              >
                {TX_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        )}

        <div>
          <span className={labelClass}>
            {type === "expense" && split ? "支払った全額" : type === "adjustment" ? "金額（減らすときはマイナス）" : "金額"}
          </span>
          <AmountInput value={amount} onChange={setAmount} label="金額" large autoFocus={!tx} allowNegative={type === "adjustment"} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {type === "transfer" ? (
            <>
              {placeSelect("移動元", placeId, setPlaceId)}
              {placeSelect("移動先", toPlaceId, setToPlaceId)}
            </>
          ) : (
            placeSelect(
              suica ? "チャージ元" : type === "income" ? "入った置き場所" : type === "expense" ? "支払った置き場所" : "置き場所",
              placeId,
              setPlaceId,
            )
          )}
          <label className={`block ${type === "transfer" ? "col-span-2" : ""}`}>
            <span className={labelClass}>日付</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </label>
        </div>

        {(type === "expense" || type === "income") && !suica && (
          <fieldset>
            <legend className={labelClass}>カテゴリ</legend>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={categoryId === c.id}
                  onClick={() => setCategoryId(categoryId === c.id ? "" : c.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    categoryId === c.id ? "border-accent bg-accent text-accent-foreground" : "border-border"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <label className="block">
          <span className={labelClass}>メモ</span>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputClass} />
        </label>

        {type === "expense" && !suica && (
          <section aria-label="まとめ払い" className="rounded-lg border border-border p-3">
            <label className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-semibold">
                <Users className="size-4" aria-hidden />
                まとめ払い（立て替え）
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={split}
                disabled={existingLoans.some((l) => l.status === "collected")}
                onChange={(e) => setSplit(e.target.checked)}
                className="size-5 accent-accent"
              />
            </label>
            {split && (
              <div className="mt-3 space-y-3">
                <div>
                  <span className={labelClass}>
                    自分の負担分
                    {total !== null && total > 0 && (
                      <button type="button" className="ml-2 font-normal text-accent underline" onClick={() => setShare(String(Math.max(0, total - lentSum)))}>
                        残り（{formatYen(Math.max(0, total - lentSum))}）を入れる
                      </button>
                    )}
                  </span>
                  <AmountInput value={share} onChange={setShare} label="自分の負担分" />
                </div>
                <div>
                  <span className={labelClass}>貸した相手と金額</span>
                  <datalist id="loan-people">
                    {people.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                  <ul className="space-y-2">
                    {loans.map((l, i) => (
                      <li key={l.id ?? `new-${i}`} className="flex items-center gap-2">
                        <input
                          aria-label="貸した相手"
                          list="loan-people"
                          placeholder="名前"
                          value={l.person}
                          disabled={l.collected}
                          onChange={(e) => setLoans(loans.map((x, j) => (j === i ? { ...x, person: e.target.value } : x)))}
                          className={`${inputClass} min-w-0 flex-1`}
                        />
                        <div className="w-32 shrink-0">
                          <AmountInput
                            value={l.amount}
                            label="貸した金額"
                            onChange={(v) => !l.collected && setLoans(loans.map((x, j) => (j === i ? { ...x, amount: v } : x)))}
                          />
                        </div>
                        {l.collected ? (
                          <span className="w-9 shrink-0 text-center text-xs text-muted">回収済</span>
                        ) : (
                          <button
                            type="button"
                            aria-label="この相手を外す"
                            className={iconButton}
                            onClick={() => setLoans(loans.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setLoans([...loans, { person: "", amount: "", collected: false }])}
                    className={`${secondaryButton} mt-2 inline-flex items-center gap-1 px-2 py-1`}
                  >
                    <Plus className="size-4" aria-hidden />
                    相手を追加
                  </button>
                </div>
                {total !== null && (
                  <p className="text-xs text-muted">
                    全額 {formatYen(total)} ＝ 自分 {formatYen(parseAmount(share || "0") ?? 0)} ＋ 貸し {formatYen(lentSum)}
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
