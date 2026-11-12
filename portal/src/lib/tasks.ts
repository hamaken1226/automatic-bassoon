import type { SupabaseClient } from "@supabase/supabase-js";
import { todayJst } from "./date";
import { nextDueDate } from "./recurrence";
import type { TaskWithDetails } from "./types";

export const TASK_SELECT = "*, subtasks(*), task_recurrences(*)";

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/**
 * タスクを完了にする。定期タスクなら次の回を作って返す。
 * （1つの繰り返し設定につき未完了は常に1つ。次の回は完了したときにだけ作る）
 */
export async function completeTask(
  sb: SupabaseClient,
  task: TaskWithDetails,
): Promise<{ completed: TaskWithDetails; next: TaskWithDetails | null }> {
  const completedAt = new Date().toISOString();
  check(
    await sb.from("tasks").update({ status: "done", completed_at: completedAt }).eq("id", task.id),
  );
  const completed: TaskWithDetails = { ...task, status: "done", completed_at: completedAt };

  const rule = task.task_recurrences;
  if (!rule || !rule.active) return { completed, next: null };

  const today = todayJst();
  const created = check(
    await sb
      .from("tasks")
      .insert({
        title: task.title,
        body: task.body,
        category_id: task.category_id,
        link_target: task.link_target,
        recurrence_id: rule.id,
        due_date: nextDueDate(rule, task.due_date ?? today, today),
      })
      .select("id")
      .single(),
  ) as { id: string };

  if (task.subtasks.length > 0) {
    check(
      await sb.from("subtasks").insert(
        task.subtasks.map((s) => ({
          task_id: created.id,
          title: s.title,
          sort_order: s.sort_order,
        })),
      ),
    );
  }
  const next = check(
    await sb.from("tasks").select(TASK_SELECT).eq("id", created.id).single(),
  ) as TaskWithDetails;
  return { completed, next };
}

/**
 * 完了を取り消す。定期タスクで次の回がすでに作られている場合は、
 * 未完了が2つにならないよう次の回を削除する（removedId で返す）。
 */
export async function reopenTask(
  sb: SupabaseClient,
  task: TaskWithDetails,
): Promise<{ reopened: TaskWithDetails; removedId: string | null }> {
  let removedId: string | null = null;
  if (task.recurrence_id) {
    const open = check(
      await sb
        .from("tasks")
        .select("id")
        .eq("recurrence_id", task.recurrence_id)
        .eq("status", "open"),
    ) as { id: string }[];
    if (open.length > 0) {
      removedId = open[0].id;
      check(await sb.from("tasks").delete().eq("id", removedId));
    }
  }
  check(await sb.from("tasks").update({ status: "open", completed_at: null }).eq("id", task.id));
  return { reopened: { ...task, status: "open", completed_at: null }, removedId };
}

/** 定期タスクに、すでに作られた次の回（未完了）があるか */
export async function hasOpenSibling(sb: SupabaseClient, task: TaskWithDetails): Promise<boolean> {
  if (!task.recurrence_id) return false;
  const open = check(
    await sb
      .from("tasks")
      .select("id")
      .eq("recurrence_id", task.recurrence_id)
      .eq("status", "open")
      .neq("id", task.id),
  ) as { id: string }[];
  return open.length > 0;
}

/**
 * 機能リンクが付いた未完了タスクをすべて完了にする。
 * （例: 月次チェックを完了したとき、リンク「月次チェック」のタスクを自動で完了にする）
 */
export async function completeTasksLinkedTo(sb: SupabaseClient, linkTarget: string): Promise<number> {
  const tasks = check(
    await sb.from("tasks").select(TASK_SELECT).eq("status", "open").eq("link_target", linkTarget),
  ) as TaskWithDetails[];
  for (const task of tasks) await completeTask(sb, task);
  return tasks.length;
}
