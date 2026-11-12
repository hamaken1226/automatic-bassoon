import type { Metadata } from "next";
import { AttendanceApp } from "./attendance-app";

export const metadata: Metadata = { title: "勤怠" };

export default function Page() {
  return <AttendanceApp />;
}
