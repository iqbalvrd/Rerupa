"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { api, isApiError } from "@/lib/api";
import { useArtwork } from "@/lib/artworks";
import { DEV_MOCK_API } from "@/lib/dev-mock";
import type { CanvasSize, Lesson, Palette } from "@/lib/schemas";
import { ensureSession, withSession } from "@/lib/session-store";
import styles from "./preparation.module.css";

/** Physical canvas sizes in cm (portrait). */
const CANVAS_SIZES: { id: CanvasSize; label: string; w: number; h: number }[] = [
  { id: "A4", label: "A4", w: 21, h: 29.7 },
  { id: "A3", label: "A3", w: 29.7, h: 42 },
  { id: "30x40", label: "30 × 40", w: 30, h: 40 },
];

function formatCm(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 1 });
}

/**
 * Persiapan (PRD §12, FR05): choose the canvas size and paint palette, see
 * what to lay out on the table, then start practising. Choices are saved to
 * the guest session (PATCH /sessions/{id}).
 */
export function PreparationView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const slug = useSearchParams().get("karya");
  const headingRef = useRef<HTMLHeadingElement>(null);

  const session = useQuery({ queryKey: ["session"], queryFn: () => ensureSession(), staleTime: 60_000 });
  const lessonId = session.data?.lesson_version_id ?? null;
  const lesson = useQuery({
    queryKey: ["lesson", lessonId],
    queryFn: ({ signal }) => api.getLesson(lessonId!, { signal }),
    enabled: Boolean(lessonId),
    staleTime: 50 * 60_000,
  });
  const palettes = useQuery({ queryKey: ["palettes"], queryFn: ({ signal }) => api.listPalettes(signal), staleTime: 10 * 60_000 });
  const artwork = useArtwork(slug ?? "");
  const showArtwork = Boolean(slug) && artwork.isSuccess;

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const backHref = slug ? `/karya/${slug}` : "/galeri";

  if (session.isError) {
    return (
      <Shell backHref={backHref}>
        <Message title="Sesi belum bisa dimulai" body={session.error.message}>
          <Button size="lg" onClick={() => session.refetch()}>
            Coba lagi
          </Button>
        </Message>
      </Shell>
    );
  }
  if (session.isSuccess && !lessonId) {
    return (
      <Shell backHref="/galeri">
        <Message title="Pilih materi dulu" body="Sesi ini belum punya materi latihan. Pilih karya di galeri atau foto lukisanmu.">
          <Button asChild size="lg">
            <Link href="/galeri">Ke galeri</Link>
          </Button>
        </Message>
      </Shell>
    );
  }

  const loading = session.isPending || lesson.isPending || palettes.isPending;
  return (
    <Shell backHref={backHref}>
      <main className={styles.main} aria-busy={loading}>
        <ol className={styles.steps} aria-label="Langkah">
          <li aria-current="step">
            <span className={styles.stepDot}>1</span> Persiapan
          </li>
          <li>
            <span className={styles.stepDot}>2</span> Latihan
          </li>
        </ol>

        <header className={styles.hero}>
          {showArtwork && artwork.data.thumbnail_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.thumb} src={artwork.data.thumbnail_url} alt="" width={72} height={72} />
          )}
          <div>
            <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
              Siapkan alatmu
            </h1>
            <p className={styles.subtitle}>
              {showArtwork ? artwork.data.title : "Pilih ukuran bidang dan palet sebelum mulai."}
            </p>
          </div>
        </header>
        {DEV_MOCK_API && <span className={styles.devBadge}>Mock API (dev): pilihan tersimpan di browser ini saja</span>}

        {loading ? (
          <p className={styles.subtitle}>Menyiapkan meja…</p>
        ) : lesson.isError || palettes.isError ? (
          <Message
            title="Persiapan belum bisa dimuat"
            body={(lesson.error ?? palettes.error)?.message ?? "Coba lagi."}
          >
            <Button
              size="lg"
              onClick={() => {
                void lesson.refetch();
                void palettes.refetch();
              }}
            >
              Coba lagi
            </Button>
          </Message>
        ) : (
          lesson.data &&
          palettes.data && (
            <PreparationForm
              lesson={lesson.data}
              palettes={palettes.data}
              initialSize={session.data?.canvas_size ?? null}
              initialPalette={session.data?.palette_id ?? null}
              onSaved={(paletteId) => {
                // Colour suggestions depend on the palette: refetch them for practice.
                void queryClient.invalidateQueries({ queryKey: ["lesson", lessonId] });
                void queryClient.invalidateQueries({ queryKey: ["session"] });
                router.push(`/latihan?palet=${paletteId}`);
              }}
            />
          )
        )}
      </main>
    </Shell>
  );
}

function PreparationForm({
  lesson,
  palettes,
  initialSize,
  initialPalette,
  onSaved,
}: {
  lesson: Lesson;
  palettes: Palette[];
  initialSize: CanvasSize | null;
  initialPalette: string | null;
  onSaved: (paletteId: string) => void;
}) {
  const [size, setSize] = useState<CanvasSize>(initialSize ?? "A4");
  const [paletteId, setPaletteId] = useState<string>(
    initialPalette ?? lesson.palette_id ?? palettes[0]?.id ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<Set<string>>(() => new Set());

  const landscape = lesson.image_width > lesson.image_height;
  const grid = lesson.layers.find((l) => l.kind === "grid")?.meta as { cols?: number; rows?: number } | undefined;
  const palette = palettes.find((p) => p.id === paletteId);

  // What to lay out on the table: tools named in the lesson's stages, plus the canvas.
  const tools = useMemo(() => {
    const seen = new Map<string, string>();
    for (const stage of lesson.stages) for (const t of stage.tools) seen.set(t.toLowerCase(), t);
    return [...seen.values()];
  }, [lesson.stages]);
  const sizeInfo = CANVAS_SIZES.find((s) => s.id === size)!;
  const checklist = [
    `Bidang lukis ${sizeInfo.label} (${formatCm(landscape ? sizeInfo.h : sizeInfo.w)} × ${formatCm(landscape ? sizeInfo.w : sizeInfo.h)} cm)`,
    ...tools,
  ];
  const total = checklist.length + (palette?.paints.length ?? 0);

  const toggle = (key: string) =>
    setReady((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving || !paletteId) return;
    setSaving(true);
    setError(null);
    try {
      await withSession((id) => api.updateSession(id, { canvas_size: size, palette_id: paletteId }));
      onSaved(paletteId);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Pilihan belum tersimpan. Coba lagi.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} aria-labelledby="prep-form-title" className="contents">
      <h2 id="prep-form-title" className="sr-only">
        Pilihan persiapan
      </h2>

      <fieldset className={styles.section}>
        <legend className={styles.legend}>Ukuran bidang</legend>
        <p className={styles.hint}>
          Gambar panduan dibagi grid {grid?.cols ?? "?"} × {grid?.rows ?? "?"} kotak. Salin grid yang sama tipis-tipis
          dengan pensil di bidangmu.
        </p>
        <div className={styles.sizes}>
          {CANVAS_SIZES.map((s) => {
            const w = landscape ? s.h : s.w;
            const h = landscape ? s.w : s.h;
            return (
              <label key={s.id} className={styles.sizeOption}>
                <input type="radio" name="canvas_size" value={s.id} checked={size === s.id} onChange={() => setSize(s.id)} />
                <span
                  className={styles.paper}
                  aria-hidden="true"
                  style={{ "--w": w, "--h": h, "--cols": grid?.cols ?? 4, "--rows": grid?.rows ?? 6 } as CSSProperties}
                />
                <span className={styles.sizeName}>{s.label}</span>
                <span className={styles.sizeDims}>
                  {formatCm(w)} × {formatCm(h)} cm
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.legend}>Palet cat</legend>
        <p className={styles.hint}>Resep campuran warna di tiap tahap dihitung dari cat di palet ini.</p>
        <div className={styles.palettes}>
          {palettes.map((p) => (
            <label key={p.id} className={styles.paletteOption}>
              <input type="radio" name="palette_id" value={p.id} checked={paletteId === p.id} onChange={() => setPaletteId(p.id)} />
              <span className={styles.paletteName}>{p.name}</span>
              <span className={styles.paletteMeta}>
                {p.brand} · {p.series} · {p.paints.length} warna
              </span>
              <ul className={styles.swatches} aria-label={`Warna di ${p.name}`}>
                {p.paints.map((paint) => (
                  <li key={paint.id} className={styles.swatch} style={{ background: paint.hex }} title={paint.name}>
                    <span className="sr-only">{paint.name}</span>
                  </li>
                ))}
              </ul>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.legend}>Siapkan di meja</legend>
        <p className={styles.hint}>Centang yang sudah siap. Daftar ini hanya untuk membantumu, tidak disimpan.</p>
        <ul className={styles.checklist}>
          {checklist.map((item) => (
            <li key={item}>
              <label className={styles.checkItem}>
                <input type="checkbox" checked={ready.has(item)} onChange={() => toggle(item)} />
                <span className={styles.checkText}>{item}</span>
              </label>
            </li>
          ))}
          {palette?.paints.map((paint) => (
            <li key={paint.id}>
              <label className={styles.checkItem}>
                <input type="checkbox" checked={ready.has(paint.id)} onChange={() => toggle(paint.id)} />
                <span className={styles.dot} style={{ background: paint.hex }} aria-hidden="true" />
                <span className={styles.checkText}>Cat {paint.name}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className={styles.progressNote} role="status">
          {ready.size} dari {total} siap
        </p>
      </fieldset>

      <div className={styles.actionBar}>
        <button type="submit" className={styles.submit} disabled={saving} aria-describedby="prep-note">
          {saving ? "Menyimpan…" : "Mulai latihan"}
        </button>
        {error ? (
          <p id="prep-note" className={styles.error} role="alert">
            {error}
          </p>
        ) : (
          <p id="prep-note" className={styles.note}>
            {lesson.stages.length} tahap · {sizeInfo.label} · {palette?.name ?? "pilih palet"}
          </p>
        )}
      </div>
    </form>
  );
}

function Shell({ backHref, children }: { backHref: string; children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href={backHref} className={styles.back}>
          <ArrowLeft aria-hidden="true" className="size-5" />
          Kembali
        </Link>
        <Logo className="h-6 w-auto" />
      </header>
      {children}
    </div>
  );
}

function Message({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className={styles.message}>
      <h1>{title}</h1>
      <p>{body}</p>
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}
