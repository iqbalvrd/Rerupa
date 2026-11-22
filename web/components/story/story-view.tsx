"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BadgeCheck, BookOpen, ExternalLink, ImageOff, Sparkles, UserRound } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { api, isApiError } from "@/lib/api";
import type { Lesson, Story, StoryCharacter, StoryClaim, StoryPanel } from "@/lib/schemas";
import { withSession } from "@/lib/session-store";
import { firstStageForRegions } from "@/lib/stages";
import {
  basisIsSourced,
  identityConfidenceLabel,
  identityLine,
  isSafeUrl,
  isSourcedFact,
  isStoryGenerating,
  isStoryUnavailable,
  panelImageLabel,
  panelView,
  safeBackHref,
  sourceTitle,
  useStory,
} from "@/lib/story";
import styles from "./story.module.css";

/**
 * "Kisah di balik karya" (P1). The basis label sits above everything, every
 * picture carries its own label, and a claim is a fact only with a source
 * link. Panels appear one by one while the story is still being drawn.
 */
export function StoryView({ id }: { id: string }) {
  const story = useStory(id);
  const back = safeBackHref(useSearchParams().get("kembali"));

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href={back} className={styles.back}>
          <ArrowLeft aria-hidden="true" className="size-5" />
          Kembali
        </Link>
        <Logo className="h-5 w-auto" />
      </header>

      {story.isPending && (
        <p className={styles.loading} role="status">
          Membuka kisah…
        </p>
      )}
      {story.isError && (
        <Message
          level={1}
          title={
            isStoryUnavailable(story.error) || isApiError(story.error, "not_found")
              ? "Kisah ini belum tersedia"
              : "Kisah belum bisa dimuat"
          }
          body={
            isStoryUnavailable(story.error) || isApiError(story.error, "not_found")
              ? "Mungkin tautannya salah, atau kisahnya sudah dihapus bersama sesimu."
              : (story.error.message ?? "Periksa koneksi, lalu coba lagi.")
          }
        >
          {!isStoryUnavailable(story.error) && !isApiError(story.error, "not_found") && (
            <button type="button" className={styles.primary} onClick={() => story.refetch()}>
              Coba lagi
            </button>
          )}
          <Link className={styles.secondary} href={back}>
            Kembali
          </Link>
        </Message>
      )}
      {story.isSuccess && <StoryBody story={story.data} />}
    </div>
  );
}

function StoryBody({ story }: { story: Story }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const generating = isStoryGenerating(story);
  const lesson = useQuery({
    queryKey: ["lesson", story.lesson_version_id, null],
    queryFn: ({ signal }) => api.getLesson(story.lesson_version_id, { signal }),
    staleTime: 20 * 60_000,
    enabled: story.characters.length > 0,
  });

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    void api.trackEvent("story_opened", { lesson_version_id: story.lesson_version_id });
  }, [story.lesson_version_id]);

  const sourced = basisIsSourced(story.story_basis);
  const confidence = identityConfidenceLabel(story);
  const who = identityLine(story);
  const done = story.panels.filter((p) => p.status !== "pending").length;

  return (
    <main className={styles.main}>
      <title>{`${story.title ?? "Kisah di balik karya"} · Rerupa`}</title>
      <section className={styles.hero} aria-labelledby="story-title">
        <p className={styles.basis} data-sourced={sourced}>
          {sourced ? <BadgeCheck aria-hidden="true" className="size-4" /> : <Sparkles aria-hidden="true" className="size-4" />}
          {story.basis_label}
        </p>
        <p className={styles.basisNote}>{story.basis_note}</p>
        <p className={styles.kicker}>
          <BookOpen aria-hidden="true" className="size-3.5" /> Kisah di balik karya
        </p>
        <h1 id="story-title" ref={titleRef} tabIndex={-1} className={styles.title}>
          {story.title ?? "Kisah di balik karya"}
        </h1>
        {who && <p className={styles.identity}>{who}</p>}
        {confidence && (
          <p className={styles.confidence}>
            <span className={styles.confidenceBadge} data-level={story.identity.confidence}>
              {confidence}
            </span>
            {story.identity.reason && <span className={styles.soft}> {story.identity.reason}</span>}
          </p>
        )}
        {story.summary && <p className={styles.lead}>{story.summary}</p>}
      </section>

      {story.status === "failed" ? (
        <Message title="Kisah gagal dibuat" body="Kisahnya belum bisa disusun kali ini. Latihanmu tetap bisa dilanjutkan." />
      ) : (
        <>
          {generating && story.panels.length > 0 && (
            <div className={styles.progress}>
              <label htmlFor="story-progress">
                Melukis panel {Math.min(done + 1, story.panels.length)} dari {story.panels.length}…
              </label>
              <progress id="story-progress" max={story.panels.length} value={done} />
            </div>
          )}
          {generating && story.panels.length === 0 && (
            <p className={styles.loading} role="status">
              Menyusun alur kisah…
            </p>
          )}
          <ol className={styles.panels} aria-label="Panel kisah">
            {story.panels.map((panel) => (
              <Panel key={panel.order_no} panel={panel} story={story} lesson={lesson.data} />
            ))}
          </ol>
        </>
      )}

      {story.characters.length > 0 && <Characters story={story} lesson={lesson.data} />}
      {story.claims.length > 0 && <Claims story={story} />}
      {story.sources.length > 0 && <Sources story={story} />}
    </main>
  );
}

function Panel({ panel, story, lesson }: { panel: StoryPanel; story: Story; lesson: Lesson | undefined }) {
  const view = panelView(panel);
  const label = panelImageLabel(panel);
  const cast = story.characters.filter((c) => panel.character_codes.includes(c.code));
  return (
    <li className={styles.panel} data-view={view}>
      <figure className={styles.figure}>
        {view === "image" && (
          <div className={styles.frame}>
            {/* Plain <img>: panel URLs are signed per request (see gallery). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={panel.image_url!}
              alt={`Panel ${panel.order_no}: ${label}`}
              loading={panel.order_no > 2 ? "lazy" : "eager"}
              decoding="async"
            />
            <span className={styles.imageLabel} data-kind={panel.kind}>
              {label}
            </span>
          </div>
        )}
        {view === "pending" && (
          <div className={`${styles.frame} ${styles.pending}`}>
            <span className={styles.pendingText}>Sedang dilukis…</span>
          </div>
        )}
        {view === "purged" && (
          <p className={styles.purged}>
            <ImageOff aria-hidden="true" className="size-4" />
            Gambar panel ini sudah dihapus otomatis setelah 24 jam. Ceritanya tetap ada.
          </p>
        )}
        <figcaption className={styles.caption}>
          <span className={styles.panelNo} aria-hidden="true">
            {panel.order_no}
          </span>
          <span className="sr-only">Panel {panel.order_no}. </span>
          {view === "pending" && !panel.narration ? "Narasi menyusul." : panel.narration}
        </figcaption>
        {cast.length > 0 && (
          <div className={styles.cast}>
            {cast.map((c) => (
              <CharacterButton key={c.code} character={c} story={story} lesson={lesson} compact />
            ))}
          </div>
        )}
      </figure>
    </li>
  );
}

function Characters({ story, lesson }: { story: Story; lesson: Lesson | undefined }) {
  return (
    <section className={styles.card} aria-labelledby="story-characters">
      <h2 id="story-characters" className={styles.sectionTitle}>
        Tokoh dalam karya
      </h2>
      <p className={styles.soft}>Ketuk tokoh untuk membuka tahap tempat kamu melukisnya.</p>
      <ul className={styles.characters}>
        {story.characters.map((c) => (
          <li key={c.code}>
            <CharacterButton character={c} story={story} lesson={lesson} />
            <p className={styles.small}>{c.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Jump to the first stage that paints this figure, in the story's own lesson. */
function CharacterButton({
  character,
  story,
  lesson,
  compact = false,
}: {
  character: StoryCharacter;
  story: Story;
  lesson: Lesson | undefined;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stage = lesson ? firstStageForRegions(lesson.stages, character.region_codes) : null;

  async function open() {
    if (!stage || busy) return;
    setBusy(true);
    setError(null);
    try {
      await withSession(async (sessionId) => {
        const session = await api.getSession(sessionId);
        if (session.lesson_version_id !== story.lesson_version_id) {
          await api.updateSession(sessionId, { lesson_version_id: story.lesson_version_id });
        }
      });
      router.push(`/latihan?tahap=${encodeURIComponent(stage.code)}`);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Tahapnya belum bisa dibuka. Coba lagi.");
      setBusy(false);
    }
  }

  if (!stage) {
    // No stage paints this figure (or the lesson is still loading): a name, not a button.
    return (
      <span className={compact ? styles.chipStatic : styles.characterName}>
        <UserRound aria-hidden="true" className="size-3.5" /> {character.name}
      </span>
    );
  }
  return (
    <>
      <button type="button" className={compact ? styles.chip : styles.characterButton} onClick={open} disabled={busy}>
        <UserRound aria-hidden="true" className="size-3.5" /> {character.name}
        <span className={compact ? "sr-only" : styles.stageHint}>
          {busy ? " · membuka…" : ` · tahap ${stage.order_no}`}
        </span>
      </button>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </>
  );
}

function Claims({ story }: { story: Story }) {
  return (
    <section className={styles.card} aria-labelledby="story-claims">
      <h2 id="story-claims" className={styles.sectionTitle}>
        Fakta &amp; perkiraan
      </h2>
      <ul className={styles.claims}>
        {story.claims.map((claim, i) => (
          <Claim key={i} claim={claim} story={story} />
        ))}
      </ul>
    </section>
  );
}

function Claim({ claim, story }: { claim: StoryClaim; story: Story }) {
  const fact = isSourcedFact(claim);
  const links = claim.source_urls.filter(isSafeUrl);
  return (
    <li>
      <span className={`${styles.tag} ${fact ? styles.tagFact : styles.tagEstimate}`}>
        {fact ? <BadgeCheck aria-hidden="true" className="size-3" /> : <Sparkles aria-hidden="true" className="size-3" />}
        {fact ? "Fakta" : "Perkiraan"}
      </span>
      <p className={styles.small}>{claim.text}</p>
      {fact && links.length > 0 && (
        <p className={styles.claimSource}>
          Sumber:{" "}
          {links.map((url, i) => (
            <span key={url}>
              {i > 0 && ", "}
              <a href={url} target="_blank" rel="noopener noreferrer">
                {sourceTitle(url, story.sources)}
                <span className="sr-only"> (membuka tab baru)</span>
              </a>
            </span>
          ))}
        </p>
      )}
    </li>
  );
}

function Sources({ story }: { story: Story }) {
  return (
    <section className={styles.card} aria-labelledby="story-sources">
      <h2 id="story-sources" className={styles.sectionTitle}>
        Sumber
      </h2>
      <ul className={styles.sources}>
        {story.sources.filter((s) => isSafeUrl(s.url)).map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.title || s.domain}
              <ExternalLink aria-hidden="true" className="ms-1 inline size-3 align-baseline" />
              <span className="sr-only"> (membuka tab baru)</span>
            </a>
            <span className={styles.soft}> · {s.domain}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Message({
  title,
  body,
  children,
  level = 2,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className={styles.message}>
      <Heading className={styles.sectionTitle}>{title}</Heading>
      <p>{body}</p>
      {children && <div className={styles.row}>{children}</div>}
    </div>
  );
}
