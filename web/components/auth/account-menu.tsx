"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut, useAuth } from "@/lib/auth";

/**
 * Login status for page headers: "Masuk" for guests; email, admin link, and "Keluar" when signed in.
 *
 * `pillClassName` renders the items as bare links/buttons with that class (and no wrapper), so they
 * sit inside a header that has its own button look, such as the landing page's pills.
 */
export function AccountMenu({ pillClassName }: { pillClassName?: string }) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [leaving, setLeaving] = useState(false);

  if (auth.status === "loading") return pillClassName ? null : <span className="h-9 w-16" aria-hidden="true" />;

  if (auth.status === "signedOut") {
    const back = pathname && pathname !== "/" && pathname !== "/masuk" && pathname !== "/daftar";
    const href = `/masuk${back ? `?next=${encodeURIComponent(pathname)}` : ""}`;
    if (pillClassName) {
      return (
        <Link href={href} className={pillClassName}>
          Masuk
        </Link>
      );
    }
    return (
      <Button asChild variant="outline" className="h-9 px-3">
        <Link href={href}>Masuk</Link>
      </Button>
    );
  }

  async function leave() {
    setLeaving(true);
    await signOut(queryClient);
    setLeaving(false);
    router.push("/");
  }

  const isAdmin = auth.user.role === "admin";
  const leaveLabel = leaving ? "Keluar…" : "Keluar";

  if (pillClassName) {
    return (
      <>
        {isAdmin && (
          <Link href="/admin" className={pillClassName}>
            Admin
          </Link>
        )}
        <button
          type="button"
          className={pillClassName}
          onClick={leave}
          disabled={leaving}
          title={`Masuk sebagai ${auth.user.email}`}
        >
          {leaveLabel}
        </button>
      </>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground hidden max-w-[14rem] truncate text-sm sm:inline" title={auth.user.email}>
        {auth.user.email}
      </span>
      {isAdmin && (
        <Button asChild variant="ghost" className="h-9 px-2.5">
          <Link href="/admin">
            <ShieldCheck aria-hidden="true" />
            Admin
          </Link>
        </Button>
      )}
      <Button variant="ghost" className="h-9 px-2.5" onClick={leave} disabled={leaving} title={`Masuk sebagai ${auth.user.email}`}>
        <LogOut aria-hidden="true" />
        {leaveLabel}
      </Button>
    </div>
  );
}
