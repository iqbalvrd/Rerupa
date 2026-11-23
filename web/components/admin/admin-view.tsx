"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, isApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AdminContent, PublishStatus, Role, UsageBucket } from "@/lib/schemas";

const TABS = [
  { id: "materi", label: "Materi & cerita" },
  { id: "ai", label: "Pemakaian AI" },
  { id: "pengguna", label: "Pengguna" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const STATUS_LABEL: Record<string, string> = {
  draft: "Draf",
  in_review: "Ditinjau",
  published: "Terbit",
  archived: "Diarsipkan",
};
const STATUSES: PublishStatus[] = ["draft", "in_review", "published", "archived"];

/**
 * Admin page: review/publish collection content, AI usage, users and roles.
 * The page hides itself from non-admins, but the API is what enforces it (403 admin_required).
 */
export function AdminView() {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("materi");

  if (auth.status === "loading") return <Note>Memeriksa akun…</Note>;
  if (auth.status === "signedOut") {
    return (
      <Note>
        Halaman ini khusus admin.{" "}
        <Link href="/masuk?next=%2Fadmin" className="text-primary underline">
          Masuk
        </Link>
      </Note>
    );
  }
  if (auth.user.role !== "admin") return <Note>Halaman ini khusus admin.</Note>;

  return (
    <div className="py-6">
      <h1 className="font-heading text-2xl">Admin</h1>
      <div role="tablist" aria-label="Bagian admin" className="mt-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className="aria-selected:border-primary aria-selected:text-foreground text-muted-foreground -mb-px min-h-11 shrink-0 border-b-2 border-transparent px-3 text-sm font-medium"
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-4">
        {tab === "materi" && <ContentPanel />}
        {tab === "ai" && <UsagePanel />}
        {tab === "pengguna" && <UsersPanel myId={auth.user.id} />}
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground py-16 text-center" role="status">
      {children}
    </p>
  );
}

function ErrorNote({ error }: { error: unknown }) {
  return (
    <p className="text-destructive py-4 text-sm" role="alert">
      {isApiError(error) ? error.message : "Data belum bisa dimuat."}
    </p>
  );
}

// ── Materi & cerita ───────────────────────────────────────────────────────

function ContentPanel() {
  const queryClient = useQueryClient();
  const content = useQuery({ queryKey: ["admin", "content"], queryFn: ({ signal }) => api.adminContent(signal) });
  const [error, setError] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: (v: { kind: "artworks" | "lessons" | "stories"; id: string; status: PublishStatus }) =>
      api.adminSetStatus(v.kind, v.id, v.status),
    onMutate: () => setError(null),
    onError: (err) => setError(isApiError(err) ? err.message : "Status belum bisa diubah."),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "content"] });
      void queryClient.invalidateQueries({ queryKey: ["artworks"] });
    },
  });

  if (content.isPending) return <Note>Memuat materi…</Note>;
  if (content.isError) return <ErrorNote error={content.error} />;
  if (content.data.length === 0) return <Note>Belum ada materi koleksi.</Note>;

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      {content.data.map((a) => (
        <ArtworkRow key={a.id} artwork={a} busy={change.isPending} onChange={(kind, id, status) => change.mutate({ kind, id, status })} />
      ))}
    </div>
  );
}

function ArtworkRow({
  artwork,
  busy,
  onChange,
}: {
  artwork: AdminContent;
  busy: boolean;
  onChange: (kind: "artworks" | "lessons" | "stories", id: string, status: PublishStatus) => void;
}) {
  return (
    <article className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-medium">{artwork.title}</h2>
          <p className="text-muted-foreground text-xs">
            {artwork.slug} · lisensi {artwork.license}
          </p>
        </div>
        <StatusSelect label={`Status karya ${artwork.title}`} value={artwork.status} disabled={busy} onChange={(s) => onChange("artworks", artwork.id, s)} />
      </div>
      {(artwork.lessons.length > 0 || artwork.stories.length > 0) && (
        <ul className="mt-2 flex flex-col gap-1.5 border-t pt-2 text-sm">
          {artwork.lessons.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2">
              <span>Tutorial versi {l.version}</span>
              <StatusSelect label={`Status tutorial versi ${l.version}`} value={l.status} disabled={busy} onChange={(s) => onChange("lessons", l.id, s)} />
            </li>
          ))}
          {artwork.stories.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                Cerita: {s.title ?? "tanpa judul"} <span className="text-muted-foreground">({s.status})</span>
              </span>
              <StatusSelect label={`Status cerita ${s.title ?? ""}`} value={s.review_status} disabled={busy} onChange={(v) => onChange("stories", s.id, v)} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function StatusSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (status: PublishStatus) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as PublishStatus)}
      className="border-input bg-background h-9 rounded-md border px-2 text-sm"
    >
      {!STATUSES.includes(value as PublishStatus) && <option value={value}>{value}</option>}
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

// ── Pemakaian AI ──────────────────────────────────────────────────────────

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const num = (n: number) => n.toLocaleString("id-ID");

function UsagePanel() {
  const [days, setDays] = useState(7);
  const usage = useQuery({ queryKey: ["admin", "ai-usage", days], queryFn: ({ signal }) => api.adminAiUsage(days, signal) });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1" role="group" aria-label="Rentang waktu">
        {[1, 7, 30].map((d) => (
          <Button key={d} variant={d === days ? "default" : "outline"} className="h-9" onClick={() => setDays(d)} aria-pressed={d === days}>
            {d === 1 ? "24 jam" : `${d} hari`}
          </Button>
        ))}
      </div>
      {usage.isPending ? (
        <Note>Memuat pemakaian…</Note>
      ) : usage.isError ? (
        <ErrorNote error={usage.error} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Biaya" value={usd(usage.data.total.cost_usd)} />
            <Stat label="Panggilan" value={num(usage.data.total.calls)} />
            <Stat label="Gagal" value={num(usage.data.total.failures)} />
            <Stat label="Gambar" value={num(usage.data.total.image_count)} />
          </dl>
          <UsageTable title="Per hari" rows={usage.data.by_day} />
          <UsageTable title="Per tugas" rows={usage.data.by_task} />
          <UsageTable title="Per model" rows={usage.data.by_model} />
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function UsageTable({ title, rows }: { title: string; rows: UsageBucket[] }) {
  return (
    <section>
      <h2 className="mb-1.5 text-sm font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Belum ada pemakaian.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-2 py-1.5 font-medium"> </th>
                <th className="px-2 py-1.5 text-right font-medium">Panggilan</th>
                <th className="px-2 py-1.5 text-right font-medium">Token masuk/keluar</th>
                <th className="px-2 py-1.5 text-right font-medium">Biaya</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t">
                  <td className="px-2 py-1.5 break-all">{r.key}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {num(r.calls)}
                    {r.failures > 0 && <span className="text-destructive"> ({r.failures} gagal)</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {num(r.input_tokens)}/{num(r.output_tokens)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{usd(r.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Pengguna ──────────────────────────────────────────────────────────────

function UsersPanel({ myId }: { myId: string }) {
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: ({ signal }) => api.adminUsers(signal) });
  const [error, setError] = useState<string | null>(null);
  const setRole = useMutation({
    mutationFn: (v: { id: string; role: Role }) => api.adminSetRole(v.id, v.role),
    onMutate: () => setError(null),
    onError: (err) => setError(isApiError(err) ? err.message : "Peran belum bisa diubah."),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  if (users.isPending) return <Note>Memuat pengguna…</Note>;
  if (users.isError) return <ErrorNote error={users.error} />;

  return (
    <div>
      <p className="text-muted-foreground mb-2 text-sm">{num(users.data.length)} akun</p>
      {error && (
        <p className="text-destructive mb-2 text-sm" role="alert">
          {error}
        </p>
      )}
      <ul className="divide-y rounded-lg border">
        {users.data.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm">{u.email}</p>
              <p className="text-muted-foreground text-xs">Daftar {new Date(u.created_at).toLocaleDateString("id-ID")}</p>
            </div>
            {u.id === myId ? (
              <span className="text-muted-foreground text-sm">Admin (kamu)</span>
            ) : (
              <select
                aria-label={`Peran ${u.email}`}
                value={u.role}
                disabled={setRole.isPending}
                onChange={(e) => setRole.mutate({ id: u.id, role: e.target.value as Role })}
                className="border-input bg-background h-9 rounded-md border px-2 text-sm"
              >
                <option value="user">Pengguna</option>
                <option value="admin">Admin</option>
              </select>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
