"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { iconButton, inputClass, labelClass, secondaryButton } from "@/components/ui/styles";
import { COLLECT_METHOD_LABEL, parseAmount, PLACE_KIND_LABEL } from "@/lib/money";
import type { CardSetting, CollectMethod, MoneyCategory } from "@/lib/types";
import { COLLECT_PLACES_KEY, must, useMoney, type MoneyStore } from "@/lib/use-money";
import { ErrorNote } from "../money/money-shared";

const sectionClass = "rounded-xl border border-border bg-card p-4";

/** お金の設定: 置き場所・カテゴリ・クレカ・貸しの回収先 */
export function MoneySettings() {
  const store = useMoney();
  const { data } = store;
  if (!data) return <p className="text-sm text-muted">読み込み中…</p>;
  return (
    <div className="space-y-4">
      <ErrorNote error={store.error} />
      <Places store={store} />
      <Categories store={store} />
      <Cards store={store} />
      <CollectPlaces store={store} />
    </div>
  );
}

function Places({ store }: { store: MoneyStore }) {
  const data = store.data!;
  const update = (id: string, patch: Record<string, unknown>) =>
    store.run(async () => {
      must(await store.sb.from("money_places").update(patch).eq("id", id));
    });
  return (
    <section aria-label="置き場所" className={sectionClass}>
      <h3 className="font-semibold">置き場所</h3>
      <p className="mb-3 text-xs text-muted">名前と初期残高（クレジットカードは初期の未払い額）を設定できます</p>
      <ul className="space-y-2">
        {data.places.map((p) => (
          <li key={p.id} className="grid grid-cols-[1fr_8.5rem] items-end gap-2 sm:grid-cols-[1fr_7rem_9rem]">
            <label className="block">
              <span className={labelClass}>名前</span>
              <input
                key={p.name}
                defaultValue={p.name}
                aria-label="置き場所の名前"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== p.name) update(p.id, { name: v });
                  else e.target.value = p.name;
                }}
                className={inputClass}
              />
            </label>
            <span className="hidden pb-2.5 text-sm text-muted sm:block">{PLACE_KIND_LABEL[p.kind]}</span>
            <label className="block">
              <span className={labelClass}>{p.kind === "credit" ? "初期の未払い額" : "初期残高"}</span>
              <input
                key={p.initial_balance}
                inputMode="numeric"
                aria-label={`${p.name}の初期残高`}
                defaultValue={String(p.initial_balance)}
                onBlur={(e) => {
                  const v = parseAmount(e.target.value, true);
                  if (v === null) e.target.value = String(p.initial_balance);
                  else if (v !== p.initial_balance) update(p.id, { initial_balance: v });
                }}
                className={`${inputClass} text-right`}
              />
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Categories({ store }: { store: MoneyStore }) {
  const data = store.data!;
  const [names, setNames] = useState<Record<string, string>>({});
  const list = (direction: MoneyCategory["direction"]) => data.categories.filter((c) => c.direction === direction);
  const message = (e: { message: string; code?: string }) => (e.code === "23505" ? "同じ名前のカテゴリがすでにあります" : e.message);

  const add = async (direction: MoneyCategory["direction"]) => {
    const name = (names[direction] ?? "").trim();
    if (!name) return;
    const ok = await store.run(async () => {
      const { error } = await store.sb.from("money_categories").insert({ name, direction, sort_order: list(direction).length });
      if (error) throw new Error(message(error));
    });
    if (ok) setNames({ ...names, [direction]: "" });
  };

  return (
    <section aria-label="カテゴリ" className={sectionClass}>
      <h3 className="mb-3 font-semibold">カテゴリ</h3>
      <div className="grid gap-4 md:grid-cols-2">
        {(["expense", "income"] as const).map((direction) => (
          <div key={direction}>
            <h4 className={labelClass}>{direction === "expense" ? "支出" : "収入"}</h4>
            <ul className="space-y-1.5">
              {list(direction).map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <input
                    key={c.name}
                    aria-label="カテゴリ名"
                    defaultValue={c.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== c.name)
                        store.run(async () => {
                          const { error } = await store.sb.from("money_categories").update({ name: v }).eq("id", c.id);
                          if (error) throw new Error(message(error));
                        });
                      else e.target.value = c.name;
                    }}
                    className={`${inputClass} py-1.5`}
                  />
                  <button
                    type="button"
                    aria-label={`カテゴリ「${c.name}」を削除`}
                    className={iconButton}
                    onClick={() =>
                      window.confirm(`カテゴリ「${c.name}」を削除しますか？\nこのカテゴリの記録は「カテゴリなし」になります。`) &&
                      store.run(async () => {
                        must(await store.sb.from("money_categories").delete().eq("id", c.id));
                      })
                    }
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                add(direction);
              }}
              className="mt-2 flex gap-2"
            >
              <input
                aria-label={`${direction === "expense" ? "支出" : "収入"}のカテゴリを追加`}
                placeholder="カテゴリを追加"
                value={names[direction] ?? ""}
                onChange={(e) => setNames({ ...names, [direction]: e.target.value })}
                className={`${inputClass} py-1.5`}
              />
              <button type="submit" disabled={!(names[direction] ?? "").trim()} className={`${secondaryButton} inline-flex shrink-0 items-center gap-1`}>
                <Plus className="size-4" aria-hidden />
                追加
              </button>
            </form>
          </div>
        ))}
      </div>
    </section>
  );
}

function Cards({ store }: { store: MoneyStore }) {
  const data = store.data!;
  const cards = data.places.filter((p) => p.kind === "credit");
  const banks = data.places.filter((p) => p.kind !== "credit");
  const update = (setting: CardSetting | undefined, placeId: string, patch: Partial<CardSetting>) =>
    store.run(async () => {
      if (setting) must(await store.sb.from("card_settings").update(patch).eq("id", setting.id));
      else
        must(
          await store.sb
            .from("card_settings")
            .insert({ place_id: placeId, closing_day: 31, payment_day: 27, payment_month_offset: 1, debit_place_id: banks[0]?.id ?? null, ...patch }),
        );
    });
  const daySelect = (label: string, value: number | null, onChange: (v: number | null) => void, allowNone = false) => (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} className={inputClass}>
        {allowNone && <option value="">なし</option>}
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {d === 31 && label === "締め日" ? "末日" : `${d}日`}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section id="cards" aria-label="クレジットカード" className={`${sectionClass} scroll-mt-4`}>
      <h3 className="font-semibold">クレジットカード</h3>
      <p className="mb-3 text-xs text-muted">明細と同じ締め日・支払日にしてください（ずれると照合が毎回「不一致」になります）</p>
      <div className="space-y-4">
        {cards.map((card) => {
          const s = data.cardSettings.find((x) => x.place_id === card.id);
          return (
            <div key={card.id} className="rounded-lg border border-border p-3">
              <h4 className="mb-2 text-sm font-semibold">{card.name}</h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {daySelect("締め日", s?.closing_day ?? 31, (v) => update(s, card.id, { closing_day: v ?? 31 }))}
                <label className="block">
                  <span className={labelClass}>支払月</span>
                  <select
                    value={s?.payment_month_offset ?? 1}
                    onChange={(e) => update(s, card.id, { payment_month_offset: Number(e.target.value) })}
                    className={inputClass}
                  >
                    <option value={1}>翌月</option>
                    <option value={2}>翌々月</option>
                  </select>
                </label>
                {daySelect("支払日", s?.payment_day ?? 27, (v) => update(s, card.id, { payment_day: v ?? 27 }))}
                {daySelect("照合する日", s?.check_day ?? null, (v) => update(s, card.id, { check_day: v }), true)}
                <label className="col-span-2 block sm:col-span-1">
                  <span className={labelClass}>引き落とし口座</span>
                  <select
                    value={s?.debit_place_id ?? ""}
                    onChange={(e) => update(s, card.id, { debit_place_id: e.target.value || null })}
                    className={inputClass}
                  >
                    <option value="">未設定</option>
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CollectPlaces({ store }: { store: MoneyStore }) {
  const data = store.data!;
  const assets = data.places.filter((p) => p.kind !== "credit");
  const save = (method: CollectMethod, placeId: string) =>
    store.run(async () => {
      must(
        await store.sb
          .from("settings")
          .upsert({ key: COLLECT_PLACES_KEY, value: { ...data.collectPlaces, [method]: placeId } }, { onConflict: "user_id,key" }),
      );
    });
  return (
    <section aria-label="貸しの回収先" className={sectionClass}>
      <h3 className="font-semibold">貸しの回収先</h3>
      <p className="mb-3 text-xs text-muted">回収したお金が入る置き場所（回収は収入には数えません）</p>
      <div className="grid grid-cols-3 gap-3">
        {(Object.keys(COLLECT_METHOD_LABEL) as CollectMethod[]).map((m) => (
          <label key={m} className="block">
            <span className={labelClass}>{COLLECT_METHOD_LABEL[m]}</span>
            <select value={data.collectPlaces[m] ?? ""} onChange={(e) => save(m, e.target.value)} className={inputClass}>
              <option value="">未設定</option>
              {assets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </section>
  );
}

