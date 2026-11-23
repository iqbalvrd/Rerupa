import Link from "next/link";
import { AccountMenu } from "@/components/auth/account-menu";
import { Logo } from "@/components/brand/logo";

/** Mobile-first page frame: header, a single readable column, safe-area padding. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="pt-safe px-safe border-b">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between pb-3">
          <Link href="/" className="inline-flex min-h-(--target-size) items-center">
            <Logo priority />
          </Link>
          <AccountMenu />
        </div>
      </header>
      <main className="px-safe pb-safe mx-auto w-full max-w-3xl flex-1">{children}</main>
    </div>
  );
}
