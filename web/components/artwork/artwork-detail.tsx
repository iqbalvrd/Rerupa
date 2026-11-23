"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type RefObject } from "react";
import { navigateBackToGallery } from "@/lib/view-transition";
import { Archive, ArrowLeft, BadgeCheck, BookOpen, Brush, ExternalLink, Landmark, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { FramedArt } from "@/components/gallery/framed-art";
import { Button } from "@/components/ui/button";
import { isApiError } from "@/lib/api";
import {
  GALLERY_SOURCE,
  artworkByline,
  licenseLabel,
  useArtwork,
  useCollectionLesson,
  type GalleryArtworkDetail,
} from "@/lib/artworks";
import type { CultureClaim, Lesson } from "@/lib/schemas";
import { switchLesson } from "@/lib/session-store";
import { useCollectionStory } from "@/lib/story";
import styles from "./artwork-detail.module.css";

/**
 * Artwork page (PRD §12 "Detail karya"). The painting under a warm spotlight
 * in a darkened room, then the museum label as four cards that settle in:
 * Label (identity), Cerita (culture: fact with source vs AI estimate),
 * Latihanmu (what you will paint) and Asal-usul (sources, licence). One action:
 * start practising.
 */
export function ArtworkDetailView({ slug, overlay = false }: { slug: string; overlay?: boolean }) {
  const artwork = useArtwork(slug);
  const lesson = useCollectionLesson(artwork.data?.lesson_version_id);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const router = useRouter();

  // Walk back: the frame flies back to its place on the gallery wall. Opened on
  // top of the gallery, "back" just closes this layer; otherwise go to /galeri.
  const goBack = useCallback(
    () => navigateBackToGallery(slug, () => (overlay ? router.back() : router.push("/galeri"))),
    [slug, overlay, router],
  );
  const onBack = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    goBack();
  };

  // Escape closes the layer, like any full-screen view on top of the gallery.
  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, goBack]);

  // After the walk-up transition (or a plain load), focus the title so keyboard
  // and screen reader users start at the new page's context.
  useEffect(() => {
    if (artwork.isSuccess) headingRef.current?.focus({ preventScroll: true });
  }, [artwork.isSuccess]);

  return (
    <div
      className={overlay ? `${styles.page} ${styles.overlay}` : styles.page}
      {...(overlay ? { role: "dialog", "aria-modal": true, "aria-labelledby": "card-label-title" } : {})}
    >
      <header className={styles.topbar}>
        <Link href="/galeri" className={styles.back} onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-5" />
          Galeri
        </Link>
        <span className={styles.logoPlate}>
          <Logo className="h-5 w-auto" />
        </span>
      </header>

      {artwork.isPending && (
        <section className={styles.stage} aria-busy="true" aria-label="Memuat karya">
          <div className={styles.skeleton} />
        </section>
      )}
      {artwork.isError && (
        <ErrorState notFound={isApiError(artwork.error, "not_found")} onRetry={() => artwork.refetch()} />
      )}
      {artwork.isSuccess && (
        <>
          <title>{`${artwork.data.title} · Rerupa`}</title>
          <Stage artwork={artwork.data} />
          <Cards artwork={artwork.data} lesson={lesson.data} lessonLoading={lesson.isLoading} headingRef={headingRef} />
          <StartBar artwork={artwork.data} />
        </>
      )}
    </div>
  );
}

function Stage({ artwork }: { artwork: GalleryArtworkDetail }) {
  const src = artwork.image_url ?? artwork.thumbnail_url;
  return (
    <section className={styles.stage} aria-label="Karya">
      <span className={styles.lamp} aria-hidden="true" />
      <span className={styles.cone} aria-hidden="true" />
      <span className={styles.pool} aria-hidden="true" />
      {src ? (
        <FramedArt
          className={styles.painting}
          src={src}
          alt={`${artwork.title}, ${artworkByline(artwork)}`}
          width={artwork.width}
          height={artwork.height}
          priority
          hero
          maxWidth="min(calc(100vw - 3rem - 2 * var(--frame-w)), 34rem)"
          maxHeight="min(38dvh, 30rem)"
        />
      ) : (
        <p>Gambar karya belum tersedia.</p>
      )}
    </section>
  );
}

function Cards({
  artwork,
  lesson,
  lessonLoading,
  headingRef,
}: {
  artwork: GalleryArtworkDetail;
  lesson: Lesson | undefined;
  lessonLoading: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  // Artwork-level claims from the published lesson; dev fixtures carry the team's claims.
  const claims = (lesson?.culture_claims ?? artwork.claims ?? []).filter((c) => !c.stage_code);
  // The reviewed storyline (P1). null = not offered (feature off / not reviewed): no button.
  const story = useCollectionStory(artwork.lesson_version_id);
  const cards = [
    <LabelCard key="label" artwork={artwork} headingRef={headingRef} />,
    <StoryCard
      key="story"
      claims={claims}
      loading={lessonLoading}
      published={Boolean(artwork.lesson_version_id)}
      storyHref={story.data ? `/cerita/${story.data}?kembali=${encodeURIComponent(`/karya/${artwork.slug}`)}` : null}
    />,
    <PracticeCard key="practice" artwork={artwork} lesson={lesson} />,
    <ArchiveCard key="archive" artwork={artwork} />,
  ];
  return (
    <ol className={styles.deck} aria-label="Tentang karya ini. Geser untuk kartu lain." tabIndex={0}>
      {cards.map((card, i) => (
        <li key={i} className={styles.deckItem} style={{ "--sibling-index": i + 1 } as CSSProperties}>
          {card}
        </li>
      ))}
    </ol>
  );
}

function LabelCard({
  artwork,
  headingRef,
}: {
  artwork: GalleryArtworkDetail;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const origin = [artwork.tradition, artwork.region_origin].filter(Boolean).join(" · ");
  return (
    <article className={`${styles.card} ${styles.cardLabel}`} aria-labelledby="card-label-title">
      <span className={styles.kicker}>
        <Landmark aria-hidden="true" className="size-3.5" /> Label
      </span>
      <div className={styles.cardBody}>
        <h1 id="card-label-title" ref={headingRef} tabIndex={-1} className={styles.cardTitle}>
          {artwork.title}
        </h1>
        <p className="mt-1">{artwork.artist ?? "Seniman tidak diketahui"}</p>
        {origin && <p className={`${styles.small} ${styles.soft}`}>{origin}</p>}
        <div className={styles.chips}>
          <span className={styles.chip}>{licenseLabel(artwork.license)}</span>
          {GALLERY_SOURCE === "fixtures" && <span className={styles.chip}>Data contoh (dev)</span>}
        </div>
      </div>
    </article>
  );
}

function StoryCard({
  claims,
  loading,
  published,
  storyHref,
}: {
  claims: CultureClaim[];
  loading: boolean;
  published: boolean;
  storyHref: string | null;
}) {
  return (
    <article className={`${styles.card} ${styles.cardStory}`} aria-labelledby="card-story-title" aria-busy={loading}>
      <span className={styles.kicker}>
        <BookOpen aria-hidden="true" className="size-3.5" /> Cerita
      </span>
      <h2 id="card-story-title" className={styles.cardTitle}>
        Di balik karya
      </h2>
      <div className={styles.cardBody}>
        {loading ? (
          <p className={`${styles.small} ${styles.soft}`}>Memuat…</p>
        ) : claims.length > 0 ? (
          <ul className={styles.claims}>
            {claims.map((claim, i) => (
              <Claim key={i} claim={claim} />
            ))}
          </ul>
        ) : (
          <p className={`${styles.small} ${styles.soft} mt-2`}>
            {published
              ? "Belum ada cerita yang terverifikasi untuk karya ini."
              : "Cerita karya ini tampil setelah materinya diterbitkan dan ditinjau."}
          </p>
        )}
        {storyHref && (
          <Link href={storyHref} className={styles.storyLink}>
            <BookOpen aria-hidden="true" className="size-4" />
            Baca kisah bergambarnya
          </Link>
        )}
      </div>
    </article>
  );
}

function Claim({ claim }: { claim: CultureClaim }) {
  const isFact = claim.type === "fakta" && claim.sources.length > 0;
  return (
    <li>
      <span className={`${styles.tag} ${isFact ? styles.tagFact : styles.tagEstimate}`}>
        {isFact ? <BadgeCheck aria-hidden="true" className="size-3" /> : <Sparkles aria-hidden="true" className="size-3" />}
        {isFact ? "Fakta" : "Perkiraan AI"}
      </span>
      <p className={styles.small}>{claim.text}</p>
      {isFact && (
        <p className={styles.claimSource}>
          Sumber:{" "}
          {claim.sources.map((s, i) => (
            <span key={s.code}>
              {i > 0 && ", "}
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title}
                  <span className="sr-only"> (membuka tab baru)</span>
                </a>
              ) : (
                s.title
              )}
            </span>
          ))}
        </p>
      )}
    </li>
  );
}

function PracticeCard({ artwork, lesson }: { artwork: GalleryArtworkDetail; lesson: Lesson | undefined }) {
  return (
    <article className={`${styles.card} ${styles.cardPractice}`} aria-labelledby="card-practice-title">
      <span className={styles.kicker}>
        <Brush aria-hidden="true" className="size-3.5" /> Latihanmu
      </span>
      <h2 id="card-practice-title" className={styles.cardTitle}>
        Yang akan kamu lukis
      </h2>
      <span className={styles.brush} aria-hidden="true" />
      <div className={styles.cardBody}>
        <dl className={styles.facts}>
          <div>
            <dt>Bagian karya</dt>
            <dd>{artwork.adaptation_scope ?? "Seluruh karya"}</dd>
          </div>
          {lesson?.skill_goal && (
            <div>
              <dt>Tujuan</dt>
              <dd>{lesson.skill_goal}</dd>
            </div>
          )}
          {lesson && (
            <div>
              <dt>Tahapan</dt>
              <dd>
                {lesson.stages.length} tahap, dari sketsa sampai detail
                {lesson.use_shading ? ", dengan latihan terang-gelap" : ", warna bidang datar"}
              </dd>
            </div>
          )}
          <div>
            <dt>Medium</dt>
            <dd>Cat akrilik · level pemula</dd>
          </div>
        </dl>
        {!lesson && (
          <p className={`${styles.small} ${styles.soft} mt-3`}>Jumlah tahap tampil setelah materinya diterbitkan.</p>
        )}
      </div>
    </article>
  );
}

function ArchiveCard({ artwork }: { artwork: GalleryArtworkDetail }) {
  return (
    <article className={`${styles.card} ${styles.cardArchive}`} aria-labelledby="card-archive-title">
      <span className={styles.stamp} aria-hidden="true">
        {licenseLabel(artwork.license)}
      </span>
      <span className={styles.kicker}>
        <Archive aria-hidden="true" className="size-3.5" /> Asal-usul
      </span>
      <h2 id="card-archive-title" className={styles.cardTitle}>
        Sumber &amp; lisensi
      </h2>
      <div className={styles.cardBody}>
        {artwork.license_note && <p className={`${styles.small} mt-2`}>{artwork.license_note}</p>}
        {artwork.sources.length > 0 ? (
          <ul className={styles.sources}>
            {artwork.sources.map((s) => (
              <li key={s.code}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.title}
                    <ExternalLink aria-hidden="true" className="ms-1 inline size-3 align-baseline" />
                    <span className="sr-only"> (membuka tab baru)</span>
                  </a>
                ) : (
                  <span className="font-semibold">{s.title}</span>
                )}
                {s.publisher && <span className={styles.soft}> · {s.publisher}</span>}
                {s.claim_note && <p className={styles.soft}>Untuk: {s.claim_note}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className={`${styles.small} ${styles.soft} mt-2`}>Belum ada sumber tercatat.</p>
        )}
      </div>
    </article>
  );
}

function StartBar({ artwork }: { artwork: GalleryArtworkDetail }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lessonId = artwork.lesson_version_id;

  async function start() {
    if (!lessonId || starting) return;
    setStarting(true);
    setError(null);
    try {
      await switchLesson(queryClient, lessonId);
      router.push(`/persiapan?karya=${encodeURIComponent(artwork.slug)}`);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Latihan belum bisa dimulai. Coba lagi.");
      setStarting(false);
    }
  }

  return (
    <div className={styles.actionBar}>
      <button
        type="button"
        className={styles.startButton}
        onClick={start}
        disabled={!lessonId || starting}
        aria-describedby="start-note"
      >
        {starting ? "Menyiapkan…" : "Mulai latihan"}
      </button>
      {error ? (
        <p id="start-note" className={styles.actionError} role="alert">
          {error}
        </p>
      ) : !lessonId ? (
        <p id="start-note" className={styles.actionNote}>
          Materi ini belum siap dilatih. Pilih karya lain atau foto lukisanmu.
        </p>
      ) : (
        <p id="start-note" className={styles.actionNote}>
          Berikutnya: pilih palet cat dan ukuran bidang.
        </p>
      )}
    </div>
  );
}

function ErrorState({ notFound, onRetry }: { notFound: boolean; onRetry: () => void }) {
  return (
    <main className={styles.message}>
      <h1>{notFound ? "Karya tidak ditemukan" : "Karya belum bisa dimuat"}</h1>
      <p>{notFound ? "Mungkin tautannya salah atau karya ini belum diterbitkan." : "Periksa koneksi, lalu coba lagi."}</p>
      <div className="flex flex-wrap gap-3">
        {!notFound && (
          <Button onClick={onRetry} size="lg">
            Coba lagi
          </Button>
        )}
        <Button asChild variant="secondary" size="lg">
          <Link href="/galeri">Kembali ke galeri</Link>
        </Button>
      </div>
    </main>
  );
}
