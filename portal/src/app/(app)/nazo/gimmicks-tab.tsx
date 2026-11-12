"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { dangerButton, inputClass, labelClass, primaryButton, secondaryButton } from "@/components/ui/styles";
import { getSupabase } from "@/lib/supabase/client";
import type { NazoGimmick } from "@/lib/types";
import { ErrorNote, Linkified, matches, SearchBox } from "./shared";

/** ギミックアイデア: タイトルとメモだけ */
export function GimmicksTab() {
  const sb = getSupabase();
  const [items, setItems] = useState<NazoGimmick[] | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<NazoGimmick | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await sb.from("nazo_gimmicks").select("*").order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setItems(data as NazoGimmick[]);
  };
  useEffect(() => {
    Promise.resolve().then(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = (items ?? []).filter((g) => matches(search, g.title, g.memo));

  return (
    <>
      <ErrorNote error={error} />
      <div className="mb-4 flex gap-2">
        <div className="flex-1">
          <SearchBox value={search} onChange={setSearch} placeholder="タイトル・メモで検索" />
        </div>
        <button type="button" onClick={() => setEditing("new")} className={`${primaryButton} inline-flex shrink-0 items-center gap-1`}>
          <Plus className="size-4" aria-hidden />
          追加
        </button>
      </div>
      {items === null ? (
        <p className="text-sm text-muted">読み込み中…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted">
          {items.length === 0 ? "ギミックのアイデアはまだありません" : "一致するアイデアはありません"}
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {visible.map((g) => (
            <li key={g.id}>
              <button type="button" onClick={() => setEditing(g)} className="block h-full w-full rounded-xl border border-border bg-card p-3 text-left hover:border-accent">
                <h3 className="break-words font-semibold">{g.title}</h3>
                {g.memo && (
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                    <Linkified text={g.memo} />
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <GimmickEditor
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function GimmickEditor({ item, onClose, onSaved }: { item: NazoGimmick | null; onClose: () => void; onSaved: () => void }) {
  const sb = getSupabase();
  const [title, setTitle] = useState(item?.title ?? "");
  const [memo, setMemo] = useState(item?.memo ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) return setError("タイトルを入力してください");
    const values = { title: title.trim(), memo };
    const { error } = item ? await sb.from("nazo_gimmicks").update(values).eq("id", item.id) : await sb.from("nazo_gimmicks").insert(values);
    if (error) return setError(error.message);
    onSaved();
  };
  const remove = async () => {
    if (!item || !window.confirm(`「${item.title}」を削除しますか？`)) return;
    const { error } = await sb.from("nazo_gimmicks").delete().eq("id", item.id);
    if (error) return setError(error.message);
    onSaved();
  };

  return (
    <Modal
      title={item ? "ギミックアイデア" : "ギミックアイデアを追加"}
      onClose={onClose}
      footer={
        <>
          {item && (
            <button type="button" onClick={remove} className={dangerButton}>
              削除
            </button>
          )}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={secondaryButton}>
            キャンセル
          </button>
          <button type="button" onClick={save} className={primaryButton}>
            保存
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorNote error={error} />
        <label className="block">
          <span className={labelClass}>タイトル</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>メモ</span>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} className={`${inputClass} [field-sizing:content] min-h-32`} />
        </label>
      </div>
    </Modal>
  );
}
