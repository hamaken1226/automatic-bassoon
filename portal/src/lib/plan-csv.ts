import { parseCsv } from "./csv";

export const PLAN_CSV_HEADER = ["試験", "科目", "教材", "内容", "開始ページ", "終了ページ", "開始日", "終了日"];

export type PlanCsvRow = {
  line: number; // CSV上の行番号（見出しを1行目とする）
  exam: string;
  subject: string;
  material: string;
  content: string;
  start_page: number;
  end_page: number;
  start_date: string;
  end_date: string;
  errors: string[];
  notes: string[]; // 「新規作成されます」など
  duplicate: boolean; // 同じ計画がすでに登録されている
};

/** 登録済みのデータ（名前で突き合わせる） */
export type PlanCsvContext = {
  exams: {
    name: string;
    subjects: { name: string; materials: string[] }[];
  }[];
  /** 既存の計画を planKey() で表したもの */
  existingKeys: Set<string>;
};

export function planKey(p: {
  exam: string;
  subject: string;
  material: string;
  content: string;
  start_page: number;
  end_page: number;
  start_date: string;
  end_date: string;
}): string {
  return [p.exam, p.subject, p.material, p.content, p.start_page, p.end_page, p.start_date, p.end_date].join("\u0001");
}

/** 「2026-11-15」または Excel が書き換えた「2026/11/15」を YYYY-MM-DD にする。不正なら null */
export function normalizeDate(value: string): string | null {
  const m = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parsePage(value: string): number | null {
  const v = value.trim();
  return /^\d+$/.test(v) ? Number(v) : null;
}

/** CSVを読み、行ごとにチェックする */
export function checkPlanCsv(text: string, ctx: PlanCsvContext): { rows: PlanCsvRow[]; fileError: string | null } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], fileError: "CSVにデータがありません" };

  // 1行目が見出しなら飛ばす
  const hasHeader = table[0][0]?.trim() === PLAN_CSV_HEADER[0];
  const body = hasHeader ? table.slice(1) : table;
  if (body.length === 0) return { rows: [], fileError: "見出しの下にデータがありません" };

  const seen = new Set<string>();
  const rows = body.map((cells, i): PlanCsvRow => {
    const get = (n: number) => (cells[n] ?? "").trim();
    const errors: string[] = [];
    const notes: string[] = [];
    const [exam, subject, material, content] = [get(0), get(1), get(2), get(3)];
    const startPage = parsePage(get(4));
    const endPage = parsePage(get(5));
    const startDate = normalizeDate(get(6));
    const endDate = normalizeDate(get(7));

    if (cells.length < PLAN_CSV_HEADER.length) errors.push(`列が足りません（${PLAN_CSV_HEADER.length}列必要）`);
    if (!exam) errors.push("試験が空です");
    if (!subject) errors.push("科目が空です");
    if (!material) errors.push("教材が空です");
    if (startPage === null) errors.push("開始ページが数字ではありません");
    if (endPage === null) errors.push("終了ページが数字ではありません");
    if (startPage !== null && endPage !== null && startPage > endPage) errors.push("開始ページが終了ページより後です");
    if (!startDate) errors.push("開始日の形式が不正です（例: 2026-11-15）");
    if (!endDate) errors.push("終了日の形式が不正です（例: 2026-11-20）");
    if (startDate && endDate && startDate > endDate) errors.push("開始日が終了日より後です");

    const examInfo = ctx.exams.find((e) => e.name === exam);
    if (exam && !examInfo) {
      errors.push(`試験「${exam}」は登録されていません`);
    } else if (examInfo && subject && material) {
      const subjectInfo = examInfo.subjects.find((s) => s.name === subject);
      if (!subjectInfo) notes.push(`科目「${subject}」は新規作成されます`);
      if (!subjectInfo?.materials.includes(material)) notes.push(`教材「${material}」は新規作成されます`);
    }

    const row: PlanCsvRow = {
      line: i + (hasHeader ? 2 : 1),
      exam,
      subject,
      material,
      content,
      start_page: startPage ?? 0,
      end_page: endPage ?? 0,
      start_date: startDate ?? "",
      end_date: endDate ?? "",
      errors,
      notes,
      duplicate: false,
    };
    if (errors.length === 0) {
      const key = planKey(row);
      if (seen.has(key)) row.errors.push("同じ内容の行がCSV内にあります");
      else if (ctx.existingKeys.has(key)) row.duplicate = true;
      seen.add(key);
    }
    return row;
  });
  return { rows, fileError: null };
}
