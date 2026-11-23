"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, Frame, ImageUp, Square, Sun } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { api, isApiError, newIdempotencyKey } from "@/lib/api";
import { DEFAULT_CROP, WHOLE_PHOTO, toScope, type Box } from "@/lib/crop";
import { DEV_MOCK_API } from "@/lib/dev-mock";
import { LESSON_JOB_STEPS, jobOutcome, jobStepLabel, useJob } from "@/lib/jobs";
import { withSession } from "@/lib/session-store";
import cp from "@/components/checkpoint/checkpoint.module.css";
import { CropBox } from "./crop-box";
import { PhotoFrame } from "./photo-frame";
import styles from "./upload.module.css";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

type Photo = { file: File; url: string; width: number; height: number };
type Phase = "choose" | "frame" | "waiting" | "result";

/**
 * Mode bebas (PRD §6, FR02; API.md "Alur unggah mode bebas"): photograph or
 * pick a painting, choose one figure to practise (`scope`), decide on sending
 * the photo to AI, then wait while the tutorial is made.
 */
export function UploadView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("choose");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [mode, setMode] = useState<"crop" | "whole">("crop");
  const [box, setBox] = useState<Box>(DEFAULT_CROP);
  const [consent, setConsent] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submission = useRef<{ sig: string; key: string } | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [phase]);
  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  const job = useJob(jobId);
  const outcome = jobOutcome(job.data);

  // Tutorial ready: the API has attached it to the session. Go prepare the table.
  useEffect(() => {
    if (outcome === "succeeded") {
      void queryClient.invalidateQueries({ queryKey: ["session"] });
      const t = setTimeout(() => router.push("/persiapan"), 900);
      return () => clearTimeout(t);
    }
    if (outcome === "needs_retake" || outcome === "failed") setPhase("result");
  }, [outcome, queryClient, router]);

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (!TYPES.includes(file.type)) {
      setError("File tidak didukung. Pakai JPG, PNG, atau WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Foto terlalu besar. Maksimal 10 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      URL.revokeObjectURL(url);
      setError("Foto ini tidak bisa dibuka. Coba foto lain.");
      return;
    }
    setPhoto({ file, url, width: img.naturalWidth, height: img.naturalHeight });
    setMode("crop");
    setBox(DEFAULT_CROP);
    setPhase("frame");
  }

  async function submit() {
    if (!photo || busy) return;
    const scope = toScope(mode === "whole" ? WHOLE_PHOTO : box);
    // Same photo + area + consent → same Idempotency-Key (a safe retry); otherwise a new one.
    const sig = [photo.file.name, photo.file.size, consent, JSON.stringify(scope)].join("|");
    if (submission.current?.sig !== sig) submission.current = { sig, key: newIdempotencyKey() };
    const key = submission.current.key;
    setBusy(true);
    setError(null);
    try {
      const created = await withSession(() =>
        api.generateLesson({ file: photo.file, consentAiPhoto: consent, scope, idempotencyKey: key }),
      );
      setJobId(created.id);
      setPhase("waiting");
    } catch (err) {
      setError(
        isApiError(err, "quota_exceeded")
          ? "Batas 3 tutorial untuk sesi ini sudah tercapai. Pilih karya dari galeri untuk berlatih."
          : isApiError(err)
            ? err.message
            : "Foto belum terkirim. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  const backToFrame = () => {
    setJobId(null);
    setPhase(photo ? "frame" : "choose");
  };
  const restart = () => {
    setJobId(null);
    setPhoto(null);
    setPhase("choose");
  };

  return (
    <div className={cp.page}>
      <header className={cp.topbar}>
        <Link href="/galeri" className={cp.back}>
          <ArrowLeft aria-hidden="true" className="size-5" />
          Galeri
        </Link>
        <Logo className="h-6 w-auto" />
      </header>

      <main className={cp.main}>
        {DEV_MOCK_API && <span className={cp.devBadge}>Mock (dev): tutorial contoh, foto tidak dianalisis</span>}

        {phase === "choose" && (
          <>
            <header>
              <h1 ref={titleRef} tabIndex={-1} className={cp.title}>
                Foto lukisanmu
              </h1>
              <p className={cp.lead}>
                Rerupa memecah foto karya menjadi tahapan melukis: sketsa, bidang warna, lalu detail.
              </p>
            </header>
            <section className={cp.card} aria-labelledby="photo-tips">
              <h2 id="photo-tips" className={cp.sectionTitle}>
                Foto yang paling mudah dipecah
              </h2>
              <ul className={cp.tips}>
                <li>
                  <Frame aria-hidden="true" className={`${cp.tipIcon} size-4`} />
                  <span>Karya lukis atau gambar, terlihat utuh, tegak lurus dari depan.</span>
                </li>
                <li>
                  <Sun aria-hidden="true" className={`${cp.tipIcon} size-4`} />
                  <span>Cahaya rata, tanpa pantulan kaca atau silau.</span>
                </li>
                <li>
                  <Square aria-hidden="true" className={`${cp.tipIcon} size-4`} />
                  <span>Lukisan yang penuh tokoh lebih mudah dilatih per bagian. Kamu bisa memotongnya setelah ini.</span>
                </li>
              </ul>
            </section>
            <div className={cp.pickers}>
              <label className={`${cp.picker} ${cp.pickerPrimary}`}>
                <Camera aria-hidden="true" className="size-5" /> Ambil foto
                <input type="file" accept={TYPES.join(",")} capture="environment" onChange={choose} />
              </label>
              <label className={`${cp.picker} ${cp.pickerSecondary}`}>
                <ImageUp aria-hidden="true" className="size-5" /> Pilih dari galeri HP
                <input type="file" accept={TYPES.join(",")} onChange={choose} />
              </label>
            </div>
            <p className={cp.muted}>JPG, PNG, atau WebP, maksimal 10 MB. Lokasi dan data foto dihapus sebelum disimpan.</p>
            {error && (
              <p className={cp.error} role="alert">
                {error}
              </p>
            )}
          </>
        )}

        {phase === "frame" && photo && (
          <>
            <header>
              <h1 ref={titleRef} tabIndex={-1} className={cp.title}>
                Pilih bagian yang dilatih
              </h1>
              <p className={cp.lead}>Untuk pemula, satu figur atau satu bagian lebih mudah diikuti daripada seluruh lukisan.</p>
            </header>
            <fieldset className={styles.modes}>
              <legend>Area latihan</legend>
              <label className={styles.mode}>
                <input type="radio" name="mode" value="crop" checked={mode === "crop"} onChange={() => setMode("crop")} />
                <span>
                  <span className={styles.modeTitle}>Satu bagian</span>
                  Dianjurkan
                </span>
              </label>
              <label className={styles.mode}>
                <input type="radio" name="mode" value="whole" checked={mode === "whole"} onChange={() => setMode("whole")} />
                <span>
                  <span className={styles.modeTitle}>Seluruh foto</span>
                  Untuk karya sederhana
                </span>
              </label>
            </fieldset>
            {mode === "crop" ? (
              <CropBox src={photo.url} width={photo.width} height={photo.height} box={box} onChange={setBox} />
            ) : (
              <PhotoFrame>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="Foto karyamu" className={styles.cropPhoto} width={photo.width} height={photo.height} />
              </PhotoFrame>
            )}
            <label className={`${cp.card} ${cp.consent}`}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                <strong>Kirim foto ke AI untuk menulis instruksi tiap tahap.</strong>{" "}
                <span className={cp.muted}>
                  Tidak wajib. Tanpa izin ini, tutorial tetap dibuat dengan teks templat. Foto dihapus otomatis dalam 24 jam.
                </span>
              </span>
            </label>
          </>
        )}

        {phase === "waiting" && (
          <Making step={job.data?.progress.step} done={outcome === "succeeded"} photo={photo} titleRef={titleRef} />
        )}

        {phase === "result" && (
          <>
            <h1 ref={titleRef} tabIndex={-1} className={cp.title}>
              {outcome === "needs_retake" ? "Perlu foto lain" : "Tutorial belum jadi"}
            </h1>
            <p className={cp.retake} role="alert">
              <AlertTriangle aria-hidden="true" className="size-5 flex-none" />
              <span>
                {job.data?.error_message ??
                  (outcome === "needs_retake"
                    ? "Foto ini belum bisa dipecah menjadi tahapan."
                    : "Terjadi kesalahan saat membuat tutorial.")}
              </span>
            </p>
            {job.data?.error_code === "worker_timeout" && <p className={cp.muted}>Kesempatanmu tidak berkurang.</p>}
          </>
        )}
      </main>

      <div className={cp.actionBar}>
        {phase === "choose" && (
          <Link className={cp.secondary} href="/galeri">
            Pilih karya dari galeri saja
          </Link>
        )}
        {phase === "frame" && (
          <>
            <button type="button" className={cp.primary} onClick={submit} disabled={busy}>
              {busy ? "Mengirim…" : "Buat tutorial"}
            </button>
            <button type="button" className={cp.secondary} onClick={restart}>
              Ganti foto
            </button>
          </>
        )}
        {phase === "waiting" && (
          <>
            <p className={cp.note}>Biasanya 10 sampai 30 detik. Jangan tutup halaman ini.</p>
            <button type="button" className={cp.secondary} onClick={backToFrame} disabled={outcome === "succeeded"}>
              Batal
            </button>
          </>
        )}
        {phase === "result" && (
          <>
            {outcome === "needs_retake" ? (
              <button type="button" className={cp.primary} onClick={restart}>
                <Camera aria-hidden="true" className="size-5" /> Foto lain
              </button>
            ) : (
              <button
                type="button"
                className={cp.primary}
                onClick={() => {
                  submission.current = null; // a failed job needs a fresh request
                  backToFrame();
                }}
              >
                Coba lagi
              </button>
            )}
            <Link className={cp.secondary} href="/galeri">
              Pilih dari galeri koleksi
            </Link>
          </>
        )}
        {error && phase !== "choose" && (
          <p className={cp.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function Making({
  step,
  done,
  photo,
  titleRef,
}: {
  step: string | undefined;
  done: boolean;
  photo: Photo | null;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const index = done ? LESSON_JOB_STEPS.length : step ? LESSON_JOB_STEPS.indexOf(step as (typeof LESSON_JOB_STEPS)[number]) : -1;
  return (
    <>
      <header>
        <h1 ref={titleRef} tabIndex={-1} className={cp.title}>
          Membuat tutorial
        </h1>
        <p className={cp.lead}>Fotomu sedang dipecah menjadi garis, bidang warna, dan tahapan.</p>
      </header>
      {photo && (
        <PhotoFrame maxHeight="30dvh">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="" className={styles.cropPhoto} width={photo.width} height={photo.height} />
        </PhotoFrame>
      )}
      <section className={cp.card}>
        <label htmlFor="lesson-progress" className={cp.visuallyHidden}>
          Kemajuan pembuatan tutorial
        </label>
        <progress id="lesson-progress" className={cp.progress} max={LESSON_JOB_STEPS.length} value={Math.max(0, index)} />
        <ol className={cp.stepList}>
          {LESSON_JOB_STEPS.map((s, i) => (
            <li key={s} data-state={i < index ? "done" : i === index ? "active" : "todo"}>
              {i < index ? <CheckCircle2 aria-hidden="true" className="size-4" /> : <span aria-hidden="true">•</span>}
              {jobStepLabel(s)}
            </li>
          ))}
        </ol>
        <p className="sr-only" role="status">
          {done ? "Tutorial siap." : jobStepLabel(step)}
        </p>
      </section>
      {done && (
        <p className={styles.success}>
          <CheckCircle2 aria-hidden="true" className="size-5" /> Tutorial siap. Menyiapkan meja…
        </p>
      )}
    </>
  );
}
