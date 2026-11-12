import type { Metadata } from "next";
import { TasksApp } from "./tasks-app";

export const metadata: Metadata = { title: "タスク" };

export default function Page() {
  return <TasksApp />;
}
