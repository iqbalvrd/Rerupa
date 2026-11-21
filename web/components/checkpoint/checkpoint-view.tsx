"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, Hand, ImageUp, Square, Sun } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { api, isApiError, newIdempotencyKey } from "@/lib/api";
import { fullPhotoCorners, submissionSignature, toCornersPayload, type Point } from "@/lib/corners";
import { DEV_MOCK_API } from "@/lib/dev-mock";
import { FEEDBACK_JOB_STEPS, jobOutcome, jobStepLabel, useJob } from "@/lib/jobs";
import type { Checkpoint, Lesson, Stage, Suggestion } from "@/lib/schemas";
import { ensureSession } from "@/lib/session-store";
import { regionNumber } from "@/lib/stages";
import { CornerPicker } from "./corner-picker";
import styles from "./checkpoint.module.css";

type Photo = { file: File; url: string; width: number; height: number };
type Phase = "guide" | "corners" | "waiting" | "result";

const STEP_LABELS = ["Panduan", "Foto", "Sudut", "Hasil"];

/**
 * Checkpoint (PRD §10, FR10–FR11; API.md "Alur checkpoint"): photograph the
 * progress, tap the 4 corners of the grid area, then read up to two
 * suggestions measured against the stage's guide, or retake the photo.
 */
export function CheckpointView() {
  const stageCode = useSearchParams().get("tahap");
  const session = useQuery({ queryKey: ["session"], queryFn: () => ensureSession(), staleTime: 60_000 });
  const sessionId = session.data?.id;
  const lessonId = session.data?.lesson_version_id ?? null;
  const paletteId = session.data?.palette_id ?? null;
  const lesson = useQuery({
    queryKey: ["lesson", lessonId, paletteId],
    queryFn: ({ signal }) => api.getLesson(lessonId!, { paletteId: paletteId ?? undefined, signal }),
    enabled: Boolean(lessonId),
    staleTime: 20 * 60_000,
  });
  const progress = useQuery({
    queryKey: ["progress", sessionId],
    queryFn: ({ signal }) => api.getProgress(sessionId!, signal),
    enabled: Boolean(sessionId && lessonId),
  });

  const stage = lesson.data?.stages.find((s) => s.code === stageCode);
  if (session.isError || lesson.isError) {
    return (
      <Shell>
        <Message title="Checkpoint belum bisa dimuat" body={(session.error ?? lesson.error)?.message ?? "Coba lagi."} />
      </Shell>
    );
  }
  if (!lesson.data || !sessionId) {
    return (
      <Shell>
        <p className={styles.main} role="status">
          Menyiapkan…
        </p>
      </Shell>
    );
  }
  if (!stage || !stage.is_checkpoint) {
    return (
      <Shell>
        <Message title="Tahap ini tidak meminta foto" body="Kembali ke ruang latihan dan lanjutkan tahapnya." />
      </Shell>
    );
  }
  const feedbackCount = progress.data?.stages.find((s) => s.code === stage.code)?.feedback_count ?? 0;
  return <CheckpointFlow lesson={lesson.data} stage={stage} sessionId={sessionId} feedbackCount={feedbackCount} />;
}

function CheckpointFlow({
  lesson,
  stage,
  sessionId,
  feedbackCount,
}: {
  lesson: Lesson;
  stage: Stage;
  sessionId: string;
  feedbackCount: number;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("guide");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [consent, setConsent] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submission = useRef<{ sig: string; key: string } | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Each phase starts at its heading, for keyboard and screen reader users.
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [phase]);

  // Release the photo's object URL when it is replaced or the page closes.
  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  const job = useJob(jobId);
  const outcome = jobOutcome(job.data);
  const result = useQuery({
    queryKey: ["checkpoint", sessionId, jobId],
    queryFn: ({ signal }) => api.getCheckpoint(sessionId, jobId!, signal),
    enabled: Boolean(jobId) && (outcome === "succeeded" || outcome === "needs_retake"),
  });

  useEffect(() => {
    if (job.data?.is_final) {
      setPhase("result");
      void queryClient.invalidateQueries({ queryKey: ["progress", sessionId] });
    }
  }, [job.data?.is_final, queryClient, sessionId]);

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    setError(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      URL.revokeObjectURL(url);
      setError("Foto ini tidak bisa dibuka. Pakai JPG, PNG, atau WebP.");
      return;
    }
    setPhoto({ file, url, width: img.naturalWidth, height: img.naturalHeight });
    setPoints([]);
    setPhase("corners");
  }

  async function submit() {
    if (!photo || busy) return;
    if (points.length !== 4) {
      setError("Ketuk keempat sudut area grid dulu.");
      return;
    }
    // Same photo + corners + consent → same Idempotency-Key (safe retry); anything else → a new one.
    const sig = submissionSignature(photo.file.name, photo.file.size, points, consent);
    if (submission.current?.sig !== sig) submission.current = { sig, key: newIdempotencyKey() };
    setBusy(true);
    setError(null);
    try {
      const created = await api.createCheckpoint(sessionId, {
        file: photo.file,
        stageCode: stage.code,
        corners: toCornersPayload(points),
        consentAiPhoto: consent,
        idempotencyKey: submission.current.key,
      });
      setJobId(created.id);
      setPhase("waiting");
    } catch (err) {
      setError(
        isApiError(err, "checkpoint_quota_exceeded")
          ? "Kesempatan feedback untuk tahap ini sudah habis. Lanjutkan ke tahap berikutnya."
          : isApiError(err)
            ? err.message
            : "Foto belum terkirim. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  const retakePhoto = () => {
    setJobId(null);
    setPoints([]);
    setPhase("guide");
  };
  const retapCorners = () => {
    setJobId(null);
    setPhase("corners");
  };

  async function completeAndContinue() {
    setBusy(true);
    try {
      await api.updateProgress(sessionId, { stage_code: stage.code, status: "completed" });
      void queryClient.invalidateQueries({ queryKey: ["progress", sessionId] });
      router.push("/latihan");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Belum tersimpan. Coba lagi.");
      setBusy(false);
    }
  }

  const stepIndex = phase === "guide" ? (photo ? 1 : 0) : phase === "corners" ? 2 : 3;

  return (
    <Shell label={`Checkpoint · ${stage.title}`}>
      <main className={styles.main}>
        <ol className={styles.steps} aria-label="Langkah checkpoint">
          {STEP_LABELS.map((label, i) => (
            <li key={label} aria-current={i === stepIndex ? "step" : undefined}>
              <span className={styles.stepDot}>{i + 1}</span> {label}
            </li>
          ))}
        </ol>
        {DEV_MOCK_API && (
          <span className={styles.devBadge}>Mock (dev): hasil contoh dari api/examples, foto tidak dianalisis</span>
        )}

        {phase === "guide" && (
          <Guide lesson={lesson} stage={stage} titleRef={titleRef} onChoose={choose} error={error} />
        )}

        {phase === "corners" && photo && (
          <>
            <header>
              <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
                Ketuk 4 sudut grid
              </h1>
              <p className={styles.lead}>Ketuk keempat sudut area grid di fotomu, urutan bebas. Geser titiknya kalau kurang pas.</p>
            </header>
            <CornerPicker src={photo.url} natural={{ width: photo.width, height: photo.height }} points={points} onChange={setPoints} />
            <div className={styles.cornerStatus}>
              <span className={styles.muted} aria-live="polite">
                {points.length} dari 4 sudut
              </span>
              <span className="flex gap-2">
                <button type="button" className={styles.linkButton} onClick={() => setPoints([])} disabled={points.length === 0}>
                  Ulangi
                </button>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setPoints(fullPhotoCorners(photo.width, photo.height))}
                >
                  Pakai seluruh foto
                </button>
              </span>
            </div>
            <label className={`${styles.card} ${styles.consent}`}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                <strong>Kirim foto ke AI untuk saran yang lebih jelas.</strong>{" "}
                <span className={styles.muted}>
                  Tidak wajib. Tanpa izin ini, saran tetap dibuat dari pengukuran dengan kalimat templat. Foto dihapus otomatis
                  dalam 24 jam.
                </span>
              </span>
            </label>
          </>
        )}

        {phase === "waiting" && <Waiting stepLabel={job.data?.progress.step} titleRef={titleRef} />}

        {phase === "result" && (
          <Result
            lesson={lesson}
            stage={stage}
            outcome={outcome}
            checkpoint={result.data}
            loading={result.isLoading}
            errorMessage={job.data?.error_message ?? null}
            titleRef={titleRef}
          />
        )}
      </main>

      <div className={styles.actionBar}>
        {phase === "corners" && (
          <>
            <button type="button" className={styles.primary} onClick={submit} disabled={busy}>
              {busy ? "Mengirim…" : "Kirim untuk dicek"}
            </button>
            <button type="button" className={styles.secondary} onClick={retakePhoto}>
              Ganti foto
            </button>
          </>
        )}
        {phase === "guide" && (
          <Link className={styles.secondary} href="/latihan">
            Lewati checkpoint, kembali ke latihan
          </Link>
        )}
        {phase === "waiting" && <p className={styles.note}>Biasanya selesai dalam beberapa detik. Jangan tutup halaman ini.</p>}
        {phase === "result" && outcome === "succeeded" && (
          <>
            <button type="button" className={styles.primary} onClick={completeAndContinue} disabled={busy}>
              Tandai selesai &amp; lanjut
            </button>
            {feedbackCount < 2 && (
              <button type="button" className={styles.secondary} onClick={retakePhoto}>
                Perbaiki dulu, lalu foto lagi
              </button>
            )}
          </>
        )}
        {phase === "result" && outcome === "needs_retake" && (
          <>
            <button type="button" className={styles.primary} onClick={retakePhoto}>
              <Camera aria-hidden="true" className="size-5" /> Foto ulang
            </button>
            {result.data?.retake_code === "alignment_failed" && (
              <button type="button" className={styles.secondary} onClick={retapCorners}>
                Ketuk ulang sudut
              </button>
            )}
          </>
        )}
        {phase === "result" && outcome === "failed" && (
          <>
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                submission.current = null; // a failed job needs a fresh request, not the same one
                setJobId(null);
                setPhase("corners");
              }}
            >
              Coba lagi
            </button>
            <Link className={styles.secondary} href="/latihan">
              Kembali ke latihan
            </Link>
          </>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </Shell>
  );
}

function Guide({
  lesson,
  stage,
  titleRef,
  onChoose,
  error,
}: {
  lesson: Lesson;
  stage: Stage;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  onChoose: (e: ChangeEvent<HTMLInputElement>) => void;
  error: string | null;
}) {
  const layer = (kind: string) => lesson.layers.find((l) => l.kind === kind)?.url;
  return (
    <>
      <header>
        <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
          Foto hasilmu
        </h1>
        <p className={styles.lead}>Rerupa membandingkan fotomu dengan panduan tahap ini, lalu memberi paling banyak dua saran.</p>
      </header>

      <section className={`${styles.card} ${styles.target}`} aria-label="Yang dibandingkan">
        <svg className={styles.targetSvg} viewBox={`0 0 ${lesson.image_width} ${lesson.image_height}`} aria-hidden="true">
          <rect width={lesson.image_width} height={lesson.image_height} fill="#fffdf8" />
          {layer("sketch") && <image href={layer("sketch")!} width={lesson.image_width} height={lesson.image_height} preserveAspectRatio="none" />}
          {layer("grid") && <image href={layer("grid")!} width={lesson.image_width} height={lesson.image_height} preserveAspectRatio="none" opacity={0.7} />}
        </svg>
        <div>
          <p className="font-semibold">{stage.title}</p>
          <p className={styles.muted}>Fotomu dibandingkan dengan panduan ini: posisi, ukuran bentuk besar, dan bagian yang belum tergambar.</p>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="tips-title">
        <h2 id="tips-title" className={styles.sectionTitle}>
          Supaya foto bisa dibaca
        </h2>
        <ul className={styles.tips}>
          <li>
            <Square aria-hidden="true" className={`${styles.tipIcon} size-4`} />
            <span>Seluruh bidang dan garis grid terlihat di foto.</span>
          </li>
          <li>
            <Sun aria-hidden="true" className={`${styles.tipIcon} size-4`} />
            <span>Cahaya rata, tidak silau, tidak terlalu gelap.</span>
          </li>
          <li>
            <Hand aria-hidden="true" className={`${styles.tipIcon} size-4`} />
            <span>Tanpa bayangan tangan atau HP di atas bidang.</span>
          </li>
          <li>
            <Camera aria-hidden="true" className={`${styles.tipIcon} size-4`} />
            <span>Foto tegak lurus dari atas, sedekat mungkin tapi bidang tetap utuh.</span>
          </li>
        </ul>
      </section>

      <div className={styles.pickers}>
        {/* capture opens the rear camera on phones, only after this tap. */}
        <label className={`${styles.picker} ${styles.pickerPrimary}`}>
          <Camera aria-hidden="true" className="size-5" /> Ambil foto
          <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={onChoose} />
        </label>
        <label className={`${styles.picker} ${styles.pickerSecondary}`}>
          <ImageUp aria-hidden="true" className="size-5" /> Pilih dari galeri
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onChoose} />
        </label>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function Waiting({ stepLabel, titleRef }: { stepLabel: string | undefined; titleRef: React.RefObject<HTMLHeadingElement | null> }) {
  const index = stepLabel ? FEEDBACK_JOB_STEPS.indexOf(stepLabel as (typeof FEEDBACK_JOB_STEPS)[number]) : -1;
  return (
    <>
      <header>
        <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
          Mengecek fotomu
        </h1>
      </header>
      <section className={styles.card}>
        <label htmlFor="feedback-progress" className={styles.visuallyHidden}>
          Kemajuan pengecekan
        </label>
        <progress id="feedback-progress" className={styles.progress} max={FEEDBACK_JOB_STEPS.length} value={Math.max(0, index)} />
        <ol className={styles.stepList}>
          {FEEDBACK_JOB_STEPS.map((step, i) => (
            <li key={step} data-state={i < index ? "done" : i === index ? "active" : "todo"}>
              {i < index ? <CheckCircle2 aria-hidden="true" className="size-4" /> : <span aria-hidden="true">•</span>}
              {jobStepLabel(step)}
            </li>
          ))}
        </ol>
        <p className="sr-only" role="status">
          {jobStepLabel(stepLabel)}
        </p>
      </section>
    </>
  );
}

function suggestionWhere(s: Suggestion): string {
  if (s.region_code === "sketch") return "Seluruh sketsa";
  if (s.region_code === "main") return "Objek utama";
  return `Bidang nomor ${regionNumber(s.region_code)}`;
}

function Result({
  lesson,
  stage,
  outcome,
  checkpoint,
  loading,
  errorMessage,
  titleRef,
}: {
  lesson: Lesson;
  stage: Stage;
  outcome: ReturnType<typeof jobOutcome>;
  checkpoint: Checkpoint | undefined;
  loading: boolean;
  errorMessage: string | null;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const [showGuide, setShowGuide] = useState(true);
  const reported = useRef(false);
  useEffect(() => {
    if (outcome === "succeeded" && checkpoint && !reported.current) {
      reported.current = true;
      void api.trackEvent("feedback_shown", { stage_order: stage.order_no });
    }
  }, [outcome, checkpoint, stage.order_no]);

  if (outcome === "failed") {
    return (
      <>
        <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
          Pengecekan gagal
        </h1>
        <p className={styles.retake}>
          <AlertTriangle aria-hidden="true" className="size-5 flex-none" />
          <span>{errorMessage ?? "Terjadi kesalahan saat mengecek foto. Coba lagi, kesempatanmu tidak berkurang."}</span>
        </p>
      </>
    );
  }
  if (loading || !checkpoint) {
    return (
      <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
        Memuat hasil…
      </h1>
    );
  }
  if (checkpoint.needs_retake) {
    return (
      <>
        <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
          Perlu foto ulang
        </h1>
        <p className={styles.retake} role="alert">
          <AlertTriangle aria-hidden="true" className="size-5 flex-none" />
          <span>{checkpoint.retake_message ?? "Foto belum bisa dibandingkan dengan panduan."}</span>
        </p>
        <p className={styles.muted}>Foto ulang tidak mengurangi kesempatan feedback-mu.</p>
      </>
    );
  }

  const W = lesson.image_width;
  const H = lesson.image_height;
  const layer = (kind: string) => lesson.layers.find((l) => l.kind === kind)?.url;
  const marker = Math.max(W, H) * 0.03;
  return (
    <>
      <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
        Hasil checkpoint
      </h1>
      <section className={styles.card} aria-label="Fotomu dibandingkan dengan panduan">
        <svg className={styles.compare} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Foto progresmu yang sudah diluruskan, dengan panduan di atasnya dan penanda saran">
          <rect width={W} height={H} fill="#fffdf8" />
          {checkpoint.photo_url && <image href={checkpoint.photo_url} width={W} height={H} preserveAspectRatio="none" />}
          {showGuide && layer("sketch") && (
            <image href={layer("sketch")!} width={W} height={H} preserveAspectRatio="none" opacity={0.6} />
          )}
          {checkpoint.suggestions.map((s, i) =>
            s.bbox ? (
              <g key={i}>
                <rect x={s.bbox[0]} y={s.bbox[1]} width={s.bbox[2]} height={s.bbox[3]} fill="none" stroke="#fff" strokeWidth={marker * 0.25} />
                <rect
                  x={s.bbox[0]}
                  y={s.bbox[1]}
                  width={s.bbox[2]}
                  height={s.bbox[3]}
                  fill="none"
                  stroke="#b4261a"
                  strokeWidth={marker * 0.14}
                  strokeDasharray={`${marker * 0.5} ${marker * 0.35}`}
                />
                <circle cx={s.bbox[0]} cy={s.bbox[1]} r={marker * 0.75} fill="#b4261a" stroke="#fff" strokeWidth={marker * 0.12} />
                <text x={s.bbox[0]} y={s.bbox[1]} textAnchor="middle" dominantBaseline="central" fontSize={marker * 0.85} fontWeight={800} fill="#fff">
                  {i + 1}
                </text>
              </g>
            ) : null,
          )}
        </svg>
        {!checkpoint.photo_url && <p className={`${styles.muted} mt-2`}>Foto sudah dihapus otomatis. Saran tetap tersimpan.</p>}
        <div className={styles.overlayToggles}>
          <button type="button" className={styles.toggle} aria-pressed={showGuide} onClick={() => setShowGuide((v) => !v)}>
            Tampilkan panduan sketsa
          </button>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="advice-title">
        <h2 id="advice-title" className={styles.sectionTitle}>
          Saran
        </h2>
        {checkpoint.summary && <p className={styles.summary}>{checkpoint.summary}</p>}
        {checkpoint.suggestions.length > 0 ? (
          <ol className={styles.suggestions}>
            {checkpoint.suggestions.map((s, i) => (
              <li key={i} className={styles.suggestion}>
                <span className={styles.suggestionNumber} aria-hidden="true">
                  {i + 1}
                </span>
                <span className={styles.where}>{suggestionWhere(s)}</span>
                <span>{s.observation}</span>
                <span className={styles.doAction}>{s.action}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.allGood}>
            <CheckCircle2 aria-hidden="true" className="size-5 flex-none" />
            <span>Bentuk besar sudah sesuai panduan. Lanjutkan ke tahap berikutnya.</span>
          </p>
        )}
        <div className={styles.badges}>
          {checkpoint.generated_automatically && <span className={styles.badge}>Dibuat otomatis</span>}
          {checkpoint.text_source === "template" && <span className={styles.badge}>Kalimat templat</span>}
        </div>
        <p className={styles.scopeNote}>
          Yang dinilai: posisi, ukuran bentuk besar, dan bagian yang belum tergambar atau terisi. Bukan rona halus atau teknik
          sapuan.
        </p>
      </section>
    </>
  );
}

function Shell({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/latihan" className={styles.back}>
          <ArrowLeft aria-hidden="true" className="size-5" />
          Latihan
        </Link>
        {label ? <span className={styles.topLabel}>{label}</span> : <Logo className="h-6 w-auto" />}
      </header>
      {children}
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.main}>
      <h1 className={styles.title}>{title}</h1>
      <p>{body}</p>
      <div>
        <Button asChild size="lg">
          <Link href="/latihan">Kembali ke latihan</Link>
        </Button>
      </div>
    </div>
  );
}
