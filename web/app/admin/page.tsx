import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { AdminView } from "@/components/admin/admin-view";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <AppShell>
      <AdminView />
    </AppShell>
  );
}
