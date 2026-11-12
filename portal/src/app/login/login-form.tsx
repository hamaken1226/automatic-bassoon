"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { sendLoginEmail, verifyLoginCode, type LoginState } from "./actions";

const URL_ERRORS: Record<string, string> = {
  forbidden: "このアカウントではログインできません",
  link: "リンクが無効か、期限が切れています。もう一度メールを送ってください",
  config: "Supabaseの環境変数が設定されていません（README を参照）",
};

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-accent";
const buttonClass =
  "w-full rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-60";

export function LoginForm() {
  const urlError = URL_ERRORS[useSearchParams().get("error") ?? ""];
  const initial: LoginState = { step: "email", email: "" };
  const [sent, sendAction, sending] = useActionState(sendLoginEmail, initial);
  const [verified, verifyAction, verifying] = useActionState(verifyLoginCode, initial);

  const error = sent.step === "code" ? verified.error : (sent.error ?? urlError);

  return (
    <div className="mt-4 space-y-4">
      {error && (
        <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {sent.step === "email" ? (
        <form action={sendAction} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">メールアドレス</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              inputMode="email"
              defaultValue={sent.email}
              className={inputClass}
            />
          </label>
          <button type="submit" disabled={sending} className={buttonClass}>
            {sending ? "送信中…" : "ログイン用のメールを送る"}
          </button>
        </form>
      ) : (
        <>
          <p className="text-sm">
            <span className="font-semibold">{sent.email}</span>{" "}
            にメールを送りました。メール内のリンクを開くとログインできます。
          </p>
          <form action={verifyAction} className="space-y-3 border-t border-border pt-4">
            <input type="hidden" name="email" value={sent.email} />
            <label className="block text-sm">
              <span className="mb-1 block text-muted">
                リンクを開けないときは、メールに書かれたコードを入力
              </span>
              <input
                type="text"
                name="code"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                className={`${inputClass} tracking-widest`}
              />
            </label>
            <button type="submit" disabled={verifying} className={buttonClass}>
              {verifying ? "確認中…" : "コードでログイン"}
            </button>
          </form>
          <form action={sendAction}>
            <input type="hidden" name="reset" value="1" />
            <button type="submit" className="text-sm text-muted underline">
              メールアドレスを入力し直す
            </button>
          </form>
        </>
      )}
    </div>
  );
}
