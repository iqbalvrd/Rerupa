"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, Sparkles } from "lucide-react";
import { api, isApiError, newIdempotencyKey } from "@/lib/api";
import { jobOutcome, useJob } from "@/lib/jobs";
import type { Lesson } from "@/lib/schemas";
import { withSession } from "@/lib/session-store";
import {
  hint,
  isStoryUnavailable,
  rememberStory,
  rememberedStory,
  storyIdFromJob,
  storyStepLabel,
  useCollectionStory,
  useStoryFeature,
} from "@/lib/story";
import styles from "./story-entry.module.css";

const BACK = encodeURIComponent("/selesai");

/**
 * "Kisah di balik karya" on Selesai. Collection lessons link to their reviewed
 * story; a lesson from an uploaded photo offers the research-agent flow
 * (optional title / artist / origin, optional photo consent → job → story).
 * Renders nothing when the server does not offer stories.
 */
export function StoryEntry({ lesson }: { lesson: Lesson }) {
  return lesson.origin === "collection" ? <CollectionEntry lesson={lesson} /> : <FreeEntry lesson={lesson} />;
}

function CollectionEntry({ lesson }: { lesson: Lesson }) {
  const story = useCollectionStory(lesson.id);
  if (!story.data) return null; // loading, unavailable, or an error: no button rather than a broken one
  return (
    <section className={styles.card} aria-labelledby="story-entry-title">
      <Heading />
      <p className={styles.muted}>Kisah karya yang barusan kamu lukis, dalam beberapa panel bergambar.</p>
      <Link className={styles.primary} href={`/cerita/${story.data}?kembali=${BACK}`}>
        <BookOpen aria-hidden="true" className="size-5" /> Baca kisahnya
      </Link>
    </section>
  );
}

type Phase = { kind: "form" } | { kind: "waiting"; jobId: string } | { kind: "ready"; storyId: string };

function FreeEntry({ lesson }: { lesson: Lesson }) {
  const feature = useStoryFeature();
  const router = useRouter();
  const ids = useId();
  const [hidden, setHidden] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [origin, setOrigin] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  // A story or job from an earlier visit to this page.
  useEffect(() => {
    const saved = rememberedStory(lesson.id);
    if (saved.storyId) setPhase({ kind: "ready", storyId: saved.storyId });
    else if (saved.jobId) setPhase({ kind: "waiting", jobId: saved.jobId });
  }, [lesson.id]);

  const job = useJob(phase.kind === "waiting" ? phase.jobId : null);
  const outcome = jobOutcome(job.data);
  const finishedId = storyIdFromJob(job.data);

  useEffect(() => {
    if (phase.kind !== "waiting") return;
    if (finishedId) {
      rememberStory(lesson.id, { storyId: finishedId });
      router.push(`/cerita/${finishedId}?kembali=${BACK}`);
    } else if (outcome === "failed" || outcome === "needs_retake" || (outcome === "succeeded" && !finishedId)) {
      rememberStory(lesson.id, null);
      setError(job.data?.error_message ?? "Kisahnya belum berhasil dibuat. Coba lagi sebentar lagi.");
      setPhase({ kind: "form" });
    } else if (isApiError(job.error, "not_found") || isApiError(job.error, "session_required")) {
      rememberStory(lesson.id, null);
      setPhase({ kind: "form" });
    }
  }, [phase, finishedId, outcome, job.data, job.error, lesson.id, router]);

  useEffect(() => {
    if (phase.kind === "waiting") statusRef.current?.focus();
  }, [phase.kind]);

  // Once panels are being drawn the story exists: asking again returns its id
  // (200), so the user can watch the panels appear instead of waiting here.
  const step = job.data?.progress.step;
  const peeked = useRef<string | null>(null);
  useEffect(() => {
    if (phase.kind !== "waiting" || !step?.startsWith("panel_") || peeked.current === phase.jobId) return;
    const key = keyRef.current?.key;
    if (!key) return; // resumed from an earlier visit: wait for the job instead
    peeked.current = phase.jobId;
    const body = JSON.parse(keyRef.current!.sig) as Parameters<typeof api.startStory>[1];
    api
      .startStory(lesson.id, body, key)
      .then((out) => {
        if (!out.story_id) return;
        rememberStory(lesson.id, { storyId: out.story_id });
        router.push(`/cerita/${out.story_id}?kembali=${BACK}`);
      })
      .catch(() => {}); // the job poll still finishes the flow
  }, [phase, step, lesson.id, router]);

  if (hidden || feature.data !== true) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const body = {
      title_hint: hint(title),
      artist_hint: hint(artist),
      origin_hint: hint(origin),
      consent_ai_photo: consent,
    };
    // Same answers → same Idempotency-Key (a safe retry); changed answers → a new one.
    const sig = JSON.stringify(body);
    if (keyRef.current?.sig !== sig) keyRef.current = { sig, key: newIdempotencyKey() };
    const key = keyRef.current.key;

    setSubmitting(true);
    setError(null);
    try {
      const out = await withSession(() => api.startStory(lesson.id, body, key));
      if (out.story_id) {
        rememberStory(lesson.id, { storyId: out.story_id });
        router.push(`/cerita/${out.story_id}?kembali=${BACK}`);
        return;
      }
      if (out.job) {
        rememberStory(lesson.id, { jobId: out.job.id });
        setPhase({ kind: "waiting", jobId: out.job.id });
      }
    } catch (err) {
      if (isStoryUnavailable(err)) {
        setHidden(true);
        return;
      }
      setError(
        isApiError(err, "story_quota_exceeded")
          ? "Batas pembuatan kisah untuk tutorial ini sudah tercapai."
          : isApiError(err)
            ? err.message
            : "Kisahnya belum bisa dibuat. Coba lagi.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (phase.kind === "ready") {
    return (
      <section className={styles.card} aria-labelledby="story-entry-title">
        <Heading />
        <p className={styles.muted}>Kisah dari foto karyamu sudah dibuat.</p>
        <Link className={styles.primary} href={`/cerita/${phase.storyId}?kembali=${BACK}`}>
          <BookOpen aria-hidden="true" className="size-5" /> Buka kisahmu
        </Link>
      </section>
    );
  }

  if (phase.kind === "waiting") {
    return (
      <section className={styles.card} aria-labelledby="story-entry-title" aria-busy="true">
        <Heading />
        <p ref={statusRef} tabIndex={-1} className={styles.status} role="status">
          <Sparkles aria-hidden="true" className="size-4" />
          {storyStepLabel(job.data?.progress.step)}…
        </p>
        <p className={styles.muted}>Biasanya kurang dari satu menit. Kamu boleh tetap di halaman ini.</p>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="story-entry-title">
      <Heading />
      <p className={styles.muted}>
        Kami susun kisah karyamu dalam beberapa panel. Kalau tahu judul, seniman, atau asalnya, isi saja. Semua boleh
        dikosongkan.
      </p>
      <form className={styles.form} onSubmit={submit} aria-labelledby="story-entry-title" noValidate>
        <fieldset className={styles.fieldset}>
          <legend className="sr-only">Info karya (opsional)</legend>
          <div className={styles.field}>
            <label htmlFor={`${ids}-title`}>Judul karya (opsional)</label>
            <input
              id={`${ids}-title`}
              name="title_hint"
              type="text"
              maxLength={160}
              autoComplete="off"
              enterKeyHint="next"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor={`${ids}-artist`}>Seniman (opsional)</label>
            <input
              id={`${ids}-artist`}
              name="artist_hint"
              type="text"
              maxLength={120}
              autoComplete="off"
              enterKeyHint="next"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor={`${ids}-origin`}>Asal daerah (opsional)</label>
            <input
              id={`${ids}-origin`}
              name="origin_hint"
              type="text"
              maxLength={120}
              autoComplete="off"
              enterKeyHint="done"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            />
          </div>
        </fieldset>
        <label className={styles.consent}>
          <input
            type="checkbox"
            name="consent_ai_photo"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-describedby={`${ids}-consent-note`}
          />
          <span>
            <strong>Izinkan AI melihat fotomu untuk mengenali karyanya.</strong>{" "}
            <span id={`${ids}-consent-note`} className={styles.muted}>
              Tidak wajib. Tanpa izin ini, kisah disusun dari isianmu saja, atau jadi tafsiran AI.
            </span>
          </span>
        </label>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={styles.primary} disabled={submitting}>
          <BookOpen aria-hidden="true" className="size-5" />
          {submitting ? "Mengirim…" : "Buat kisahnya"}
        </button>
      </form>
    </section>
  );
}

function Heading() {
  return (
    <h2 id="story-entry-title" className={styles.title}>
      Kisah di balik karya
    </h2>
  );
}
