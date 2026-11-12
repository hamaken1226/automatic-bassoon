import type { Metadata } from "next";
import { StudyApp } from "./study-app";

export const metadata: Metadata = { title: "勉強・練習スケジュール" };

export default function Page() {
  return <StudyApp />;
}
