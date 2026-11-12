"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { fetchAll } from "./study";
import { getSupabase } from "./supabase/client";
import type { CardSetting, CardStatement, CollectMethod, Loan, MoneyCategory, MoneyPlace, MoneyTx } from "./types";

export type MoneyData = {
  places: MoneyPlace[];
  categories: MoneyCategory[];
  cardSettings: CardSetting[];
  statements: CardStatement[];
  txs: MoneyTx[];
  loans: Loan[];
  /** 貸しの回収方法ごとの入金先 */
  collectPlaces: Partial<Record<CollectMethod, string>>;
};

export const COLLECT_PLACES_KEY = "loan_collect_places";
const SEED_KEY = "seed_money_v1";

type Res = { data: unknown; error: { message: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** 初めて使うときに、置き場所・カテゴリ・クレカの設定を1回だけ作る */
let seeding: Promise<void> | null = null;

function ensureMoneySeed(sb: SupabaseClient): Promise<void> {
  // 同じ画面の複数の部品から呼ばれても、作成が終わるまで全員が待つ
  seeding ??= createMoneySeed(sb).catch((e) => {
    seeding = null;
    throw e;
  });
  return seeding;
}

async function createMoneySeed(sb: SupabaseClient): Promise<void> {
  if (check<unknown[]>(await sb.from("settings").select("id").eq("key", SEED_KEY)).length > 0) return;
  const flag = await sb.from("settings").insert({ key: SEED_KEY, value: true });
  if (flag.error) return; // 別の画面が作成中

  const places = check<{ id: string; name: string }[]>(
    await sb
      .from("money_places")
      .insert([
        { name: "通常口座", kind: "bank", sort_order: 0 },
        { name: "貯金口座", kind: "bank", sort_order: 1 },
        { name: "現金", kind: "cash", sort_order: 2 },
        { name: "PayPay", kind: "emoney", sort_order: 3 },
        { name: "楽天カード", kind: "credit", sort_order: 4 },
        { name: "セゾンカード", kind: "credit", sort_order: 5 },
      ])
      .select("id, name"),
  );
  const id = (name: string) => places.find((p) => p.name === name)!.id;

  // 締め日・支払日は一般的な設定（設定画面で変更できる）。照合する日は楽天1日、セゾン8日
  check(
    await sb.from("card_settings").insert([
      { place_id: id("楽天カード"), closing_day: 31, payment_day: 27, payment_month_offset: 1, debit_place_id: id("通常口座"), check_day: 1 },
      { place_id: id("セゾンカード"), closing_day: 10, payment_day: 4, payment_month_offset: 1, debit_place_id: id("通常口座"), check_day: 8 },
    ]),
  );
  const expense = ["食費", "日用品", "交通費", "交際費", "趣味", "勉強", "住居", "通信", "医療", "衣類", "その他"];
  check(
    await sb.from("money_categories").insert([
      ...expense.map((name, i) => ({ name, direction: "expense", sort_order: i })),
      ...["給与", "その他"].map((name, i) => ({ name, direction: "income", sort_order: i })),
    ]),
  );
  check(
    await sb.from("settings").insert({
      key: COLLECT_PLACES_KEY,
      value: { paypay: id("PayPay"), bank: id("通常口座"), cash: id("現金") },
    }),
  );
}

async function loadMoney(sb: SupabaseClient): Promise<MoneyData> {
  const [places, categories, cardSettings, statements, collect] = await Promise.all([
    sb.from("money_places").select("*").order("sort_order").order("created_at"),
    sb.from("money_categories").select("*").order("sort_order").order("created_at"),
    sb.from("card_settings").select("*"),
    sb.from("card_statements").select("*").order("period_end", { ascending: false }),
    sb.from("settings").select("value").eq("key", COLLECT_PLACES_KEY),
  ]);
  const [txs, loans] = await Promise.all([
    fetchAll<MoneyTx>((from, to) =>
      sb.from("transactions").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }).range(from, to),
    ),
    fetchAll<Loan>((from, to) => sb.from("loans").select("*").order("created_at").range(from, to)),
  ]);
  return {
    places: check(places),
    categories: check(categories),
    cardSettings: check(cardSettings),
    statements: check(statements),
    txs,
    loans,
    collectPlaces: (check<{ value: MoneyData["collectPlaces"] }[]>(collect)[0]?.value ?? {}),
  };
}

/** お金のデータを読み込んで持つ */
export function useMoney() {
  const sb = getSupabase();
  const [data, setData] = useState<MoneyData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);

  const reload = useCallback(async () => {
    try {
      setData(await loadMoney(sb));
    } catch (e) {
      fail(e);
    }
  }, [sb, fail]);

  useEffect(() => {
    ensureMoneySeed(sb)
      .catch(fail)
      .then(() => reload());
  }, [sb, reload, fail]);

  /** 失敗したら例外を投げるDB操作をまとめて実行し、読み込み直す */
  const run = useCallback(
    async (fn: () => Promise<void>): Promise<boolean> => {
      try {
        await fn();
        setError(null);
        await reload();
        return true;
      } catch (e) {
        fail(e);
        await reload();
        return false;
      }
    },
    [reload, fail],
  );

  return { sb, data, error, setError, reload, run };
}

export type MoneyStore = ReturnType<typeof useMoney>;

/** Supabaseの結果をチェックして、データを返す（エラーなら例外） */
export function must<T = unknown>(res: Res): T {
  return check<T>(res);
}
