"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut, useAuth } from "@/lib/auth";

/** Login status for page headers: "Masuk" for guests; email, admin link, and "Keluar" when signed in. */
export function AccountMenu() {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [leaving, setLeaving] = useState(false);

  if (auth.status === "loading") return <span className="h-9 w-16" aria-hidden="true" />;

  if (auth.status === "signedOut") {
    const next = pathname && pathname !== "/masuk" && pathname !== "/daftar" ? `?next=${encodeURIComponent(pathname)}` : "";
    return (
      <Button asChild variant="outline" className="h-9 px-3">
        <Link href={`/masuk${next}`}>Masuk</Link>
      </Button>
    );
  }

  async function leave() {
    setLeaving(true);
    await signOut(queryClient);
    setLeaving(false);
    router.push("/");
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground hidden max-w-[14rem] truncate text-sm sm:inline" title={auth.user.email}>
        {auth.user.email}
      </span>
      {auth.user.role === "admin" && (
        <Button asChild variant="ghost" className="h-9 px-2.5">
          <Link href="/admin">
            <ShieldCheck aria-hidden="true" />
            Admin
          </Link>
        </Button>
      )}
      <Button variant="ghost" className="h-9 px-2.5" onClick={leave} disabled={leaving}>
        <LogOut aria-hidden="true" />
        {leaving ? "Keluar…" : "Keluar"}
      </Button>
    </div>
  );
}
