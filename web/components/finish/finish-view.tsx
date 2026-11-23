"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  CheckCircle2,
  Circle,
  CircleDot,
  ImagePlus,
  Landmark,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { StoryEntry } from "@/components/story/story-entry";
import { api, isApiError } from "@/lib/api";
import { artworkByline, useArtworks } from "@/lib/artworks";
import { isValidReflection, summarize, type FinishSummary } from "@/lib/finish";
import type { Lesson, Progress, Reflection } from "@/lib/schemas";
import { endSession, useSessionStore } from "@/lib/session-store";
import { parseRegionsSvg } from "@/lib/stages";
import styles from "./finish.module.css";

/**
 * Selesai (PRD FR14, F10, §326): what the user did, one culture reflection,
 * other practices, and deleting the session. Never framed as a certificate.
 *
 * Unlike the practice room, this page never creates a session: with none
 * stored there is nothing to summarize.
 */
export function FinishView() {
  const queryClient = useQueryClient();
  const sessionId = useSessionStore((s) => s.sessionId);
  const [hydrated, setHydrated] = useState(false);
  const [deleted, setDeleted] = useState(false);

  // The store rehydrates from localStorage after the first client render.
  useEffect(() => {
    if (useSessionStore.persist.hasHydrated()) setHydrated(true);
    return useSessionStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  const session = useQuery({
    queryKey: ["session", "finish", sessionId],
    queryFn: ({ signal }) => api.getSession(sessionId!, signal),
    enabled: hydrated && Boolean(sessionId) && !deleted,
    retry: (count, err) => !isApiError(err, "session_required") && !isApiError(err, "not_found") && count < 2,
  });
  const lessonId = session.data?.lesson_version_id ?? null;
  const lesson = useQuery({
    queryKey: ["lesson", lessonId, session.data?.palette_id ?? null],
    queryFn: ({ signal }) => api.getLesson(lessonId!, { paletteId: session.data?.palette_id ?? undefined, signal }),
    enabled: Boolean(lessonId) && !deleted,
    staleTime: 20 * 60_000,
  });
  const progress = useQuery({
    queryKey: ["progress", sessionId, lessonId],
    queryFn: ({ signal }) => api.getProgress(sessionId!, signal),
    enabled: Boolean(sessionId && lessonId) && !deleted,
  });

  if (deleted) {
    return (
      <Shell>
        <Message title="Sesi sudah dihapus" body="Progres, foto unggahan, dan foto checkpoint dari sesi ini sudah dihapus dari server.">
          <Link className={styles.primary} href="/galeri">
            <Landmark aria-hidden="true" className="size-5" /> Ke galeri
          </Link>
          <Link className={styles.secondary} href="/unggah">
            <ImagePlus aria-hidden="true" className="size-5" /> Foto lukisanmu
          </Link>
        </Message>
      </Shell>
    );
  }

  const gone =
    (hydrated && !sessionId) ||
    isApiError(session.error, "session_required") ||
    isApiError(session.error, "not_found") ||
    (session.isSuccess && !lessonId);
  if (gone) {
    return (
      <Shell>
        <Message title="Belum ada latihan" body="Pilih karya di galeri atau foto lukisanmu untuk mulai latihan.">
          <Link className={styles.primary} href="/galeri">
            <Landmark aria-hidden="true" className="size-5" /> Ke galeri
          </Link>
          <Link className={styles.secondary} href="/unggah">
            <ImagePlus aria-hidden="true" className="size-5" /> Foto lukisanmu
          </Link>
        </Message>
      </Shell>
    );
  }

  const err = session.error ?? lesson.error ?? progress.error;
  if (err) {
    return (
      <Shell>
        <Message title="Rangkuman belum bisa dimuat" body={err.message || "Coba lagi."}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              void session.refetch();
              void lesson.refetch();
              void progress.refetch();
            }}
          >
            Coba lagi
          </button>
          <Link className={styles.secondary} href="/latihan">
            Ke ruang latihan
          </Link>
        </Message>
      </Shell>
    );
  }

  if (!lesson.data || !progress.data || !sessionId) {
    return (
      <Shell>
        <p className={styles.loading} role="status">
          Menyiapkan rangkuman…
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <Finish
        lesson={lesson.data}
        progress={progress.data}
        onDeleted={() => {
          queryClient.removeQueries({ queryKey: ["session"] });
          queryClient.removeQueries({ queryKey: ["progress"] });
          setDeleted(true);
        }}
      />
    </Shell>
  );
}

function Finish({ lesson, progress, onDeleted }: { lesson: Lesson; progress: Progress; onDeleted: () => void }) {
  const summary = summarize(lesson, progress);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const reflection = isValidReflection(lesson.reflection) ? lesson.reflection : null;

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <main className={styles.main}>
      <section className={styles.hero} aria-labelledby="finish-title">
        <FinalPreview lesson={lesson} />
        <div className={styles.heroText}>
          <p className={styles.kicker}>{summary.allDone ? "Latihan selesai" : "Rangkuman sementara"}</p>
          <h1 id="finish-title" ref={titleRef} tabIndex={-1} className={styles.title}>
            {summary.allDone ? "Kamu sudah sampai tahap akhir" : `${summary.completed} dari ${summary.total} tahap selesai`}
          </h1>
          <p className={styles.lead}>
            {summary.allDone
              ? "Bandingkan lukisanmu dengan panduan di samping. Bagian yang belum mirip bisa diulang kapan saja."
              : "Beberapa tahap belum ditandai selesai. Kamu bisa kembali dan melanjutkannya."}
          </p>
          {summary.firstOpen && (
            <Link className={styles.primary} href="/latihan">
              Lanjutkan tahap {summary.firstOpen.order}
            </Link>
          )}
        </div>
      </section>

      <StageSummaryCard lesson={lesson} summary={summary} />

      {reflection && <ReflectionCard reflection={reflection} lesson={lesson} />}

      <StoryEntry lesson={lesson} />

      <OtherPractice currentArtworkId={lesson.artwork_id} />

      <DeleteSession onDeleted={onDeleted} />
    </main>
  );
}

/** The guide's end state: every colour region plus the line art, no numbers. */
function FinalPreview({ lesson }: { lesson: Lesson }) {
  const W = lesson.image_width;
  const H = lesson.image_height;
  const regionsLayer = lesson.layers.find((l) => l.kind === "regions");
  const lineart = lesson.layers.find((l) => l.kind === "lineart");
  const paths = useQuery({
    queryKey: ["regions-svg", regionsLayer?.url],
    enabled: Boolean(regionsLayer?.url),
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const res = await fetch(regionsLayer!.url!, { signal });
      if (!res.ok) throw new Error(`regions.svg ${res.status}`);
      return parseRegionsSvg(await res.text(), new DOMParser());
    },
    retry: 1,
  });
  const purged = !regionsLayer?.url;

  return (
    <figure className={styles.preview}>
      <div className={styles.frame}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Hasil akhir panduan: semua bidang warna dan garis bantu">
          <rect width={W} height={H} fill="#fffdf8" />
          {paths.data
            ? lesson.regions.map((r) => {
                const d = paths.data.get(r.code);
                return d ? <path key={r.code} d={d} fill={r.hex} stroke={r.hex} strokeWidth={1} fillRule="evenodd" /> : null;
              })
            : regionsLayer?.url && <image href={regionsLayer.url} width={W} height={H} preserveAspectRatio="none" />}
          {lineart?.url && <image href={lineart.url} width={W} height={H} preserveAspectRatio="none" />}
        </svg>
      </div>
      <figcaption className={styles.caption}>{purged ? "Foto sudah dihapus otomatis" : "Hasil akhir panduan"}</figcaption>
    </figure>
  );
}

function StageSummaryCard({ lesson, summary }: { lesson: Lesson; summary: FinishSummary }) {
  return (
    <section className={styles.card} aria-labelledby="summary-title">
      <h2 id="summary-title" className={styles.sectionTitle}>
        Yang sudah kamu latih
      </h2>
      {lesson.skill_goal && <p className={styles.muted}>{lesson.skill_goal}</p>}
      <ol className={styles.stageList}>
        {summary.stages.map((s) => (
          <li key={s.code} className={styles.stageRow} data-status={s.status}>
            {s.status === "completed" ? (
              <CheckCircle2 aria-hidden="true" className={styles.stageIcon} />
            ) : s.status === "viewed" ? (
              <CircleDot aria-hidden="true" className={styles.stageIcon} />
            ) : (
              <Circle aria-hidden="true" className={styles.stageIcon} />
            )}
            <span className={styles.stageText}>
              <span className={styles.stageName}>
                {s.order}. {s.title}
              </span>
              <span className={styles.stageMeta}>
                {s.status === "completed" ? "Selesai" : s.status === "viewed" ? "Sudah dilihat, belum selesai" : "Belum dibuka"}
                {s.isCheckpoint &&
                  (s.feedbackCount > 0 ? (
                    <span className={styles.badge}>
                      <Camera aria-hidden="true" className="size-3" /> Foto dicek
                    </span>
                  ) : (
                    s.status === "completed" && <span className={styles.badgeMuted}>Foto dilewati</span>
                  ))}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <p className={styles.note}>Ini rangkuman latihanmu, bukan penilaian atau sertifikat kemampuan melukis.</p>
    </section>
  );
}

function ReflectionCard({ reflection, lesson }: { reflection: Reflection; lesson: Lesson }) {
  const [choice, setChoice] = useState<number | null>(null);
  const [answered, setAnswered] = useState<number | null>(null);
  const name = useId();
  const resultRef = useRef<HTMLDivElement>(null);
  const correct = answered !== null && answered === reflection.correct_option;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (choice === null || answered !== null) return;
    setAnswered(choice);
    void api.trackEvent("reflection_answered", {
      lesson_version_id: lesson.id,
      origin: lesson.origin,
      correct: choice === reflection.correct_option,
    });
    requestAnimationFrame(() => resultRef.current?.focus());
  }

  return (
    <section className={styles.card} aria-labelledby="reflection-title">
      <h2 id="reflection-title" className={styles.sectionTitle}>
        Refleksi budaya
      </h2>
      <form onSubmit={submit}>
        <fieldset className={styles.fieldset} disabled={answered !== null}>
          <legend className={styles.question}>{reflection.question}</legend>
          <div className={styles.options}>
            {reflection.options.map((opt, i) => {
              const state =
                answered === null ? undefined : i === reflection.correct_option ? "correct" : i === answered ? "wrong" : undefined;
              return (
                <label key={i} className={styles.option} data-state={state}>
                  <input
                    type="radio"
                    name={name}
                    value={i}
                    checked={choice === i}
                    onChange={() => setChoice(i)}
                  />
                  <span>{opt}</span>
                  {state === "correct" && <CheckCircle2 aria-label="Jawaban benar" className="ms-auto size-5 flex-none" />}
                  {state === "wrong" && <XCircle aria-label="Jawabanmu" className="ms-auto size-5 flex-none" />}
                </label>
              );
            })}
          </div>
        </fieldset>
        {answered === null ? (
          <button type="submit" className={styles.primary} disabled={choice === null}>
            Jawab
          </button>
        ) : (
          <div ref={resultRef} tabIndex={-1} className={styles.result} data-correct={correct} role="status">
            <p className={styles.resultTitle}>{correct ? "Tepat." : "Belum tepat."}</p>
            <p>
              Jawabannya: <strong>{reflection.options[reflection.correct_option]}</strong>
            </p>
          </div>
        )}
      </form>
      {reflection.source ? (
        <p className={styles.source}>
          <span className={`${styles.tag} ${styles.tagFact}`}>
            <BadgeCheck aria-hidden="true" className="size-3" /> Fakta
          </span>
          Sumber:{" "}
          {reflection.source.url ? (
            <a href={reflection.source.url} target="_blank" rel="noreferrer noopener">
              {reflection.source.title}
            </a>
          ) : (
            reflection.source.title
          )}
        </p>
      ) : (
        <p className={styles.source}>
          <span className={`${styles.tag} ${styles.tagEstimate}`}>
            <Sparkles aria-hidden="true" className="size-3" /> Perkiraan AI
          </span>
          Belum ada sumber untuk pertanyaan ini.
        </p>
      )}
    </section>
  );
}

function OtherPractice({ currentArtworkId }: { currentArtworkId: string | null }) {
  const artworks = useArtworks();
  const others = (artworks.data ?? []).filter((a) => a.id !== currentArtworkId && a.lesson_version_id).slice(0, 3);

  return (
    <section className={styles.card} aria-labelledby="other-title">
      <h2 id="other-title" className={styles.sectionTitle}>
        Latihan lain
      </h2>
      {others.length > 0 && (
        <ul className={styles.others}>
          {others.map((a) => (
            <li key={a.id}>
              <Link href={`/karya/${encodeURIComponent(a.slug)}`} className={styles.other}>
                {a.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URLs, sizes vary
                  <img src={a.thumbnail_url} alt="" className={styles.otherThumb} loading="lazy" decoding="async" />
                ) : (
                  <span className={styles.otherThumb} aria-hidden="true" />
                )}
                <span className={styles.otherText}>
                  <span className={styles.otherTitle}>{a.title}</span>
                  <span className={styles.muted}>{artworkByline(a)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.row}>
        <Link className={styles.secondary} href="/galeri">
          <Landmark aria-hidden="true" className="size-5" /> Ke galeri
        </Link>
        <Link className={styles.secondary} href="/unggah">
          <ImagePlus aria-hidden="true" className="size-5" /> Foto lukisanmu
        </Link>
      </div>
    </section>
  );
}

function DeleteSession({ onDeleted }: { onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await endSession();
      onDeleted();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Sesi belum terhapus. Coba lagi.");
      setBusy(false);
    }
  }

  return (
    <section className={`${styles.card} ${styles.danger}`} aria-labelledby="delete-title">
      <h2 id="delete-title" className={styles.sectionTitle}>
        Hapus sesi
      </h2>
      <p className={styles.muted}>
        Progres latihan, foto unggahan, dan foto checkpoint langsung dihapus dari server. Tanpa ini pun, foto terhapus otomatis
        dalam 24 jam.
      </p>
      {!confirming ? (
        <button type="button" className={styles.dangerButton} onClick={() => setConfirming(true)}>
          <Trash2 aria-hidden="true" className="size-5" /> Hapus sesi ini
        </button>
      ) : (
        <div className={styles.confirm} role="group" aria-label="Konfirmasi hapus sesi">
          <p className={styles.confirmText}>Yakin? Ini tidak bisa dibatalkan.</p>
          <div className={styles.row}>
            <button ref={confirmRef} type="button" className={styles.dangerSolid} onClick={remove} disabled={busy}>
              {busy ? "Menghapus…" : "Ya, hapus"}
            </button>
            <button type="button" className={styles.secondary} onClick={() => setConfirming(false)} disabled={busy}>
              Batal
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/latihan" className={styles.back}>
          <ArrowLeft aria-hidden="true" className="size-5" />
          Ruang latihan
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
      <div className={styles.row}>{children}</div>
    </div>
  );
}
