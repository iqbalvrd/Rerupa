"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Sparkles,
  ZoomIn,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { api, isApiError } from "@/lib/api";
import { DEV_MOCK_API } from "@/lib/dev-mock";
import type { Lesson, Progress, RegionColor, Stage } from "@/lib/schemas";
import { ensureSession } from "@/lib/session-store";
import {
  LAYER_LABELS,
  availableLayers,
  defaultVisibility,
  initialStageIndex,
  isGeneratedText,
  regionColorsFor,
  regionNumber,
  regionsUpTo,
  type LayerKey,
} from "@/lib/stages";
import { StageCanvas, type StageCanvasHandle } from "./stage-canvas";
import styles from "./practice.module.css";

/**
 * Ruang latihan (PRD §12, FR06–FR09, FR18; CLAUDE.md M4). Loads the session's
 * lesson and progress, then shows one stage at a time.
 */
export function PracticeView() {
  const paletteParam = useSearchParams().get("palet");
  const queryClient = useQueryClient();

  const session = useQuery({ queryKey: ["session"], queryFn: () => ensureSession(), staleTime: 60_000 });
  const sessionId = session.data?.id;
  const lessonId = session.data?.lesson_version_id ?? null;
  const paletteId = paletteParam ?? session.data?.palette_id ?? undefined;

  const lesson = useQuery({
    queryKey: ["lesson", lessonId, paletteId ?? null],
    queryFn: ({ signal }) => api.getLesson(lessonId!, { paletteId, signal }),
    enabled: Boolean(lessonId),
    // Layer URLs are signed for 30 minutes: refresh well before they expire.
    staleTime: 20 * 60_000,
    refetchInterval: 25 * 60_000,
  });
  const progress = useQuery({
    queryKey: ["progress", sessionId],
    queryFn: ({ signal }) => api.getProgress(sessionId!, signal),
    enabled: Boolean(sessionId && lessonId),
  });

  if (session.isError || lesson.isError || progress.isError) {
    const err = session.error ?? lesson.error ?? progress.error;
    const noLesson = isApiError(err, "lesson_required");
    return (
      <Shell>
        <Message
          title={noLesson ? "Pilih materi dulu" : "Latihan belum bisa dimuat"}
          body={noLesson ? "Sesi ini belum punya materi latihan." : (err?.message ?? "Coba lagi.")}
        >
          {!noLesson && (
            <Button
              size="lg"
              onClick={() => {
                void session.refetch();
                void lesson.refetch();
                void progress.refetch();
              }}
            >
              Coba lagi
            </Button>
          )}
          <Button asChild variant="secondary" size="lg">
            <Link href="/galeri">Ke galeri</Link>
          </Button>
        </Message>
      </Shell>
    );
  }
  if (session.isSuccess && !lessonId) {
    return (
      <Shell>
        <Message title="Pilih materi dulu" body="Sesi ini belum punya materi latihan. Pilih karya di galeri atau foto lukisanmu.">
          <Button asChild size="lg">
            <Link href="/galeri">Ke galeri</Link>
          </Button>
        </Message>
      </Shell>
    );
  }
  if (!lesson.data || !progress.data || !sessionId) {
    return (
      <Shell>
        <p className={styles.message} role="status">
          Menyiapkan papan…
        </p>
      </Shell>
    );
  }
  return (
    <Practice
      key={lesson.data.id}
      lesson={lesson.data}
      progress={progress.data}
      sessionId={sessionId}
      onProgress={(p) => queryClient.setQueryData(["progress", sessionId], p)}
      onLayerError={() => void lesson.refetch()}
    />
  );
}

function Practice({
  lesson,
  progress,
  sessionId,
  onProgress,
  onLayerError,
}: {
  lesson: Lesson;
  progress: Progress;
  sessionId: string;
  onProgress: (p: Progress) => void;
  onLayerError: () => void;
}) {
  const router = useRouter();
  const stages = lesson.stages;
  const [index, setIndex] = useState(() => initialStageIndex(stages.length, progress.current_stage_order));
  const [overrides, setOverrides] = useState<{ index: number; layers: Partial<Record<LayerKey, boolean>> }>({
    index,
    layers: {},
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<StageCanvasHandle>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const stage = stages[index];
  const available = useMemo(() => availableLayers(lesson), [lesson]);
  const layerOverrides = overrides.index === index ? overrides.layers : {};
  const visible = { ...defaultVisibility(stage, available), ...layerOverrides };
  const painted = useMemo(() => regionsUpTo(stages, index), [stages, index]);
  const statusOf = (code: string) => progress.stages.find((s) => s.code === code)?.status ?? "not_started";
  const done = statusOf(stage.code) === "completed";
  const isLast = index === stages.length - 1;
  const purged = lesson.layers.some((l) => l.purged);

  // Opening a stage marks it viewed. Viewing never completes it (FR08).
  useEffect(() => {
    api
      .updateProgress(sessionId, { stage_code: stage.code, status: "viewed" })
      .then(onProgress)
      .catch(() => {});
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Moving between stages: start the new stage at its title, and fit the board again.
    titleRef.current?.focus({ preventScroll: true });
    canvas.current?.reset();
  }, [stage.code, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void api.trackEvent("lesson_viewed", { lesson_version_id: lesson.id, origin: lesson.origin });
  }, [lesson.id, lesson.origin]);

  const go = (next: number) => setIndex(Math.max(0, Math.min(stages.length - 1, next)));

  const toggleLayer = (key: LayerKey) => {
    const on = !visible[key];
    setOverrides({ index, layers: { ...layerOverrides, [key]: on } });
    if (key === "original_photo" && on) {
      void api.trackEvent("original_photo_opened", { stage_order: stage.order_no });
    }
  };

  async function complete() {
    if (saving) return;
    if (done) {
      if (isLast) router.push("/selesai");
      else go(index + 1);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onProgress(await api.updateProgress(sessionId, { stage_code: stage.code, status: "completed" }));
      if (isLast) router.push("/selesai");
      else go(index + 1);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Belum tersimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  const sliderStyle = {
    "--slider-progress": `${stages.length > 1 ? (index / (stages.length - 1)) * 100 : 100}%`,
  } as CSSProperties;

  return (
    <Shell stageLabel={`Tahap ${index + 1} dari ${stages.length}`}>
      <div className={styles.layout}>
        <div className={styles.boardArea}>
          <div className={styles.board}>
            {DEV_MOCK_API && <span className={styles.boardNote}>Mock (dev): bentuk sintetis, bukan karya asli</span>}
            {!DEV_MOCK_API && purged && <span className={styles.boardNote}>Foto sudah dihapus otomatis</span>}
            <StageCanvas
              ref={canvas}
              lesson={lesson}
              stage={stage}
              painted={painted}
              visible={visible}
              onLayerError={onLayerError}
            />
            <div className={styles.zoomBar}>
              {stage.focus_bbox && (
                <button type="button" className={styles.zoomButton} onClick={() => canvas.current?.zoomToFocus()}>
                  <ZoomIn aria-hidden="true" className="size-4" /> Zoom ke area ini
                </button>
              )}
              <button type="button" className={styles.zoomButton} onClick={() => canvas.current?.reset()} aria-label="Lihat seluruh panduan">
                <Maximize aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>

          <ul className={styles.toggles} aria-label="Lapisan panduan">
            {available.map((key) => {
              const layer = lesson.layers.find((l) => l.kind === key);
              const gone = Boolean(layer?.purged || !layer?.url);
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={styles.toggle}
                    aria-pressed={visible[key]}
                    disabled={gone}
                    title={gone ? "Foto sudah dihapus otomatis" : undefined}
                    onClick={() => toggleLayer(key)}
                  >
                    {visible[key] && <CheckCircle2 aria-hidden="true" className="size-3.5" />}
                    {LAYER_LABELS[key]}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <main className={styles.panel}>
          <div className={styles.sliderRow}>
            <label htmlFor="stage-slider" className={styles.sliderLabel}>
              <span>Tahap</span>
              <span aria-hidden="true">
                {index + 1} / {stages.length}
              </span>
            </label>
            <input
              id="stage-slider"
              type="range"
              className={styles.slider}
              style={sliderStyle}
              min={1}
              max={stages.length}
              step={1}
              value={index + 1}
              aria-valuetext={`Tahap ${index + 1} dari ${stages.length}: ${stage.title}`}
              onChange={(e) => go(Number(e.target.value) - 1)}
            />
            <ol className={styles.ticks} aria-hidden="true">
              {stages.map((s) => (
                <li key={s.code} className={styles.tick} data-status={statusOf(s.code)} />
              ))}
            </ol>
          </div>

          <StagePanel lesson={lesson} stage={stage} titleRef={titleRef} done={done} />
        </main>
      </div>

      <div className={styles.bottomBar}>
        <button type="button" className={styles.navButton} onClick={() => go(index - 1)} disabled={index === 0} aria-label="Tahap sebelumnya">
          <ChevronLeft aria-hidden="true" />
        </button>
        <div className={styles.actions}>
          {stage.is_checkpoint && !done ? (
            <>
              <Link className={styles.primary} href={`/checkpoint?tahap=${encodeURIComponent(stage.code)}`}>
                <Camera aria-hidden="true" className="size-5" /> Foto hasilmu
              </Link>
              <button type="button" className={styles.secondary} onClick={complete} disabled={saving}>
                Lewati foto, tandai selesai
              </button>
            </>
          ) : (
            <button type="button" className={styles.primary} data-done={done} onClick={complete} disabled={saving}>
              {saving ? "Menyimpan…" : done ? (isLast ? "Selesai · lihat rangkuman" : "Sudah selesai · lanjut") : "Tandai selesai"}
            </button>
          )}
          {error ? (
            <p className={styles.barError} role="alert">
              {error}
            </p>
          ) : (
            <p className={styles.barNote}>
              {progress.completed_count} dari {progress.stage_count} tahap selesai
            </p>
          )}
        </div>
        <button
          type="button"
          className={styles.navButton}
          onClick={() => go(index + 1)}
          disabled={isLast}
          aria-label="Tahap berikutnya (tanpa menandai selesai)"
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </Shell>
  );
}

function StagePanel({
  lesson,
  stage,
  titleRef,
  done,
}: {
  lesson: Lesson;
  stage: Stage;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  done: boolean;
}) {
  const recipes = regionColorsFor(stage, lesson.region_colors);
  const claims = lesson.culture_claims.filter((c) => c.stage_code === stage.code);
  const missing = stage.new_region_codes.filter((code) => !recipes.some((r) => r.region_code === code));

  return (
    <>
      <section className={styles.card} aria-labelledby="stage-title">
        <p className={styles.kicker}>
          Tahap {stage.order_no}
          {stage.is_checkpoint ? " · checkpoint" : ""}
          {done ? " · selesai" : ""}
        </p>
        <h1 id="stage-title" ref={titleRef} tabIndex={-1} className={styles.stageTitle}>
          {stage.title}
        </h1>
        <p className={styles.action}>{stage.action}</p>
        {stage.tools.length > 0 && (
          <div className={styles.meta} aria-label="Alat">
            {stage.tools.map((t) => (
              <span key={t} className={styles.chip}>
                {t}
              </span>
            ))}
          </div>
        )}
        <p className={styles.doneWhen}>
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 flex-none" />
          <span>
            <strong>Selesai kalau</strong> {stage.done_when}
          </span>
        </p>
        {stage.common_mistakes.length > 0 && (
          <details className={`${styles.details} mt-3`}>
            <summary>Kesalahan yang sering terjadi</summary>
            <ul>
              {stage.common_mistakes.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </details>
        )}
        {isGeneratedText(lesson, stage) && <span className={styles.autoLabel}>Teks dibuat otomatis</span>}
      </section>

      {stage.new_region_codes.length > 0 && (
        <section className={styles.card} aria-labelledby="recipes-title">
          <h2 id="recipes-title" className={styles.sectionTitle}>
            Warna di tahap ini
          </h2>
          <div className={styles.recipes}>
            {recipes.map((rc) => (
              <Recipe key={rc.region_code} rc={rc} stage={stage} />
            ))}
          </div>
          {missing.length > 0 && (
            <p className={`${styles.muted} mt-2`}>
              Bidang nomor {missing.map(regionNumber).join(", ")}: lihat warnanya langsung di panduan atau foto asli.
            </p>
          )}
        </section>
      )}

      {claims.length > 0 && (
        <section className={styles.card} aria-labelledby="claims-title">
          <h2 id="claims-title" className={styles.sectionTitle}>
            Tentang bagian ini
          </h2>
          <ul className={styles.claims}>
            {claims.map((c, i) => {
              const fact = c.type === "fakta" && c.sources.length > 0;
              return (
                <li key={i}>
                  <span className={`${styles.claimTag} ${fact ? styles.tagFact : styles.tagEstimate}`}>
                    {fact ? <BadgeCheck aria-hidden="true" className="size-3" /> : <Sparkles aria-hidden="true" className="size-3" />}
                    {fact ? "Fakta" : "Perkiraan AI"}
                  </span>
                  <p>{c.text}</p>
                  {fact && <p className={styles.muted}>Sumber: {c.sources.map((s) => s.title).join(", ")}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

function Recipe({ rc, stage }: { rc: RegionColor; stage: Stage }) {
  const reported = useRef(false);
  return (
    <details
      className={styles.recipe}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && !reported.current) {
          reported.current = true;
          void api.trackEvent("recipe_opened", { stage_order: stage.order_no });
        }
      }}
    >
      <summary>
        <span className={styles.recipeNumber} aria-label={`Bidang nomor ${regionNumber(rc.region_code)}`}>
          {regionNumber(rc.region_code)}
        </span>
        <span className={styles.swatchPair} aria-hidden="true">
          {rc.mixed_hex && <span className={styles.swatchBig} style={{ background: rc.mixed_hex }} />}
        </span>
        <span className={styles.recipeLabel}>
          {rc.components.length > 0 ? rc.components.map((c) => c.name.split(" (")[0]).join(" + ") : "Tanpa resep"}
        </span>
        <span className={styles.reach} data-reach={rc.reachability}>
          {rc.label}
        </span>
      </summary>
      <div className={styles.recipeBody}>
        {rc.components.length > 0 && (
          <ul className={styles.components} aria-label="Campuran">
            {rc.components.map((c) => (
              <li key={c.paint_code}>
                <span className={styles.paintDot} style={{ background: c.hex }} aria-hidden="true" />
                <span className={styles.parts}>
                  {c.parts} bagian
                </span>
                <span>{c.name}</span>
              </li>
            ))}
          </ul>
        )}
        {rc.mixed_hex && (
          <p className={styles.swatchLegend}>
            <span>
              <span className={styles.swatchSmall} style={{ background: rc.mixed_hex }} aria-hidden="true" /> Perkiraan hasil campuran
            </span>
          </p>
        )}
        {rc.explanation && <p>{rc.explanation}</p>}
        {rc.tips.length > 0 && (
          <ul className="list-disc ps-5">
            {rc.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function Shell({ stageLabel, children }: { stageLabel?: string; children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/persiapan" className={styles.back}>
          <ArrowLeft aria-hidden="true" className="size-5" />
          Persiapan
        </Link>
        {stageLabel ? <span className={styles.stageCount}>{stageLabel}</span> : <Logo className="h-6 w-auto" />}
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
