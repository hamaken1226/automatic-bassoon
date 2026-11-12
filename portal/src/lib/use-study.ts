"use client";

import { useCallback, useEffect, useState } from "react";
import { ensureStudySeed, loadKinds, loadStudyData, type StudyData } from "./study";
import { getSupabase } from "./supabase/client";
import type { AttendanceKind } from "./types";

/** 取り組み・科目・教材・計画・曲・バンド練習・勤怠の種類を読み込んで持つ */
export function useStudy() {
  const sb = getSupabase();
  const [data, setData] = useState<StudyData | null>(null);
  const [kinds, setKinds] = useState<AttendanceKind[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  const reload = useCallback(async () => {
    try {
      const [d, k] = await Promise.all([loadStudyData(sb), loadKinds(sb)]);
      setData(d);
      setKinds(k);
    } catch (e) {
      fail(e);
    }
  }, [sb, fail]);

  useEffect(() => {
    ensureStudySeed(sb)
      .catch(fail)
      .then(() => reload());
  }, [sb, reload, fail]);

  /** DB操作を実行し、成功したら読み込み直す。失敗したらエラーを表示して false を返す */
  const mutate = useCallback(
    async (fn: () => PromiseLike<{ error: { message: string } | null } | void>): Promise<boolean> => {
      try {
        const res = await fn();
        if (res && res.error) throw new Error(res.error.message);
        setError(null);
        await reload();
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },
    [reload, fail],
  );

  return { sb, data, kinds, setKinds, error, setError, reload, mutate };
}

export type StudyStore = ReturnType<typeof useStudy>;
