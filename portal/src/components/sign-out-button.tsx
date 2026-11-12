import { LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";

export function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-accent-soft hover:text-foreground ${className}`}
      >
        <LogOut className="size-4 shrink-0" aria-hidden />
        ログアウト
      </button>
    </form>
  );
}
