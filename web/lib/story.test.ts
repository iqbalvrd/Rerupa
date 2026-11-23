import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockRequest } from "./dev-mock";
import { DEV_COLLECTION_STORY_ID } from "./dev-mock-story";
import { jobPollInterval } from "./jobs";
import { Job, Lesson, Story, StoryJobResult, StoryStart, type StoryPanel } from "./schemas";
import { firstStageForRegions, stageIndexByCode } from "./stages";
import {
  hint,
  identityConfidenceLabel,
  identityLine,
  isSafeUrl,
  isSourcedFact,
  isStoryGenerating,
  panelImageLabel,
  panelView,
  rememberStory,
  rememberedStory,
  safeBackHref,
  sourceTitle,
  storyIdFromJob,
  storyStepLabel,
} from "./story";

const EXAMPLES = join(__dirname, "../../api/examples");
const lesson = Lesson.parse(JSON.parse(readFileSync(join(EXAMPLES, "lesson_detail.json"), "utf8")));
let store: Map<string, string>;

beforeEach(() => {
  vi.useRealTimers();
  store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  vi.stubGlobal("window", { localStorage: globalThis.localStorage });
  vi.stubGlobal("fetch", async (url: string) => {
    const name = url.replace("/_dev/api/", "").replace("lesson_mock.json", "lesson_detail.json");
    return new Response(readFileSync(join(EXAMPLES, name), "utf8"), { status: 200 });
  });
});

const panel = (over: Partial<StoryPanel>): StoryPanel => ({
  order_no: 1,
  narration: "n",
  kind: "generated",
  status: "ready",
  image_url: "https://x/1.webp",
  image_label: "Ilustrasi AI",
  purged: false,
  character_codes: [],
  focus_region_codes: [],
  ...over,
});

describe("panels", () => {
  it("picks image, text, pending or purged", () => {
    expect(panelView(panel({}))).toBe("image");
    expect(panelView(panel({ status: "pending", image_url: null }))).toBe("pending");
    expect(panelView(panel({ status: "text_only", image_url: null }))).toBe("text");
    expect(panelView(panel({ kind: "text", image_url: null }))).toBe("text");
    expect(panelView(panel({ purged: true, image_url: null }))).toBe("purged");
    // Ready but no URL: never an empty frame.
    expect(panelView(panel({ image_url: null }))).toBe("text");
  });

  it("never shows a picture without a label", () => {
    expect(panelImageLabel(panel({ image_label: null }))).toBe("Ilustrasi AI");
    expect(panelImageLabel(panel({ kind: "artwork_crop", image_label: null }))).toBe("Potongan karya asli");
    expect(panelImageLabel(panel({ image_label: "Potongan karya asli" }))).toBe("Potongan karya asli");
  });
});

describe("claims", () => {
  it("is a fact only with a source link", () => {
    expect(isSourcedFact({ text: "a", type: "fakta", source_urls: ["https://a.org"] })).toBe(true);
    expect(isSourcedFact({ text: "a", type: "fakta", source_urls: [] })).toBe(false);
    expect(isSourcedFact({ text: "a", type: "perkiraan", source_urls: ["https://a.org"] })).toBe(false);
  });

  it("titles a source link and only links http(s)", () => {
    const sources = [{ url: "https://a.org/x", title: "Arsip A", domain: "a.org" }];
    expect(sourceTitle("https://a.org/x", sources)).toBe("Arsip A");
    expect(sourceTitle("https://www.b.org/y", sources)).toBe("b.org");
    expect(isSafeUrl("https://a.org")).toBe(true);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("helpers", () => {
  it("finds the first stage that paints a character's regions", () => {
    expect(firstStageForRegions(lesson.stages, ["r12"])?.code).toBe("stage_6");
    expect(firstStageForRegions(lesson.stages, ["r99", "r02"])?.code).toBe("stage_3");
    expect(firstStageForRegions(lesson.stages, ["r99"])).toBeNull();
    expect(firstStageForRegions(lesson.stages, [])).toBeNull();
    expect(stageIndexByCode(lesson.stages, "stage_6")).toBe(5);
    expect(stageIndexByCode(lesson.stages, "nope")).toBeNull();
  });

  it("keeps the back link on this site", () => {
    expect(safeBackHref("/selesai")).toBe("/selesai");
    expect(safeBackHref("//evil.example")).toBe("/galeri");
    expect(safeBackHref("https://evil.example")).toBe("/galeri");
    expect(safeBackHref(null)).toBe("/galeri");
  });

  it("labels job steps and reads the story id from a finished job", () => {
    expect(storyStepLabel("panel_3")).toBe("Melukis panel 3");
    expect(storyStepLabel("sources")).toMatch(/sumber/);
    expect(storyStepLabel("anything")).toBe("Memproses");
    const base = {
      id: "6f0e3a1c-0d1b-4f5e-9a2b-3c4d5e6f7a8b",
      type: "generate_story",
      status: "succeeded" as const,
      is_final: true,
      progress: {},
      error_code: null,
      error_message: null,
      lesson_version_id: null,
      created_at: new Date().toISOString(),
      finished_at: null,
    };
    expect(storyIdFromJob({ ...base, result: { kind: "story", story_id: DEV_COLLECTION_STORY_ID } })).toBe(
      DEV_COLLECTION_STORY_ID,
    );
    expect(storyIdFromJob({ ...base, result: { kind: "unknown" } })).toBeNull();
    expect(storyIdFromJob({ ...base, is_final: false, result: null })).toBeNull();
  });

  it("polls jobs every second for 10 s, then every 2 s", () => {
    const now = Date.parse("2026-11-22T10:00:00Z");
    const at = (ms: number) => ({ created_at: new Date(now - ms).toISOString(), is_final: false });
    expect(jobPollInterval(at(3_000), now)).toBe(1_000);
    expect(jobPollInterval(at(12_000), now)).toBe(2_000);
    expect(jobPollInterval({ ...at(1_000), is_final: true }, now)).toBe(false);
  });

  it("cleans hints and remembers a story per lesson", () => {
    expect(hint("  Penangkapan   Diponegoro ")).toBe("Penangkapan Diponegoro");
    expect(hint("   ")).toBeNull();
    rememberStory("L1", { storyId: "s1" });
    expect(rememberedStory("L1")).toEqual({ storyId: "s1" });
    rememberStory("L1", null);
    expect(rememberedStory("L1")).toEqual({});
    store.set("rerupa:story:L2", "not json");
    expect(rememberedStory("L2")).toEqual({});
  });
});

describe("story schema", () => {
  it("accepts the research-agent identity and loose job result kinds", () => {
    expect(StoryJobResult.safeParse({ kind: "needs_identity", candidate: { title: "X" } }).success).toBe(true);
    expect(StoryStart.safeParse({ story_id: DEV_COLLECTION_STORY_ID, job: null }).success).toBe(true);
  });
});

describe("dev mock: storyline", () => {
  it("serves the collection story with labels and sources", async () => {
    const start = StoryStart.parse(await mockRequest("POST", `/lessons/${lesson.id}/story`, {}));
    expect(start.story_id).toBe(DEV_COLLECTION_STORY_ID);
    const story = Story.parse(await mockRequest("GET", `/stories/${start.story_id}`, undefined));
    expect(story.basis_label).toBe("Kisah bersumber");
    expect(isStoryGenerating(story)).toBe(false);
    expect(story.panels.some((p) => panelView(p) === "text")).toBe(true);
    expect(story.panels.some((p) => p.kind === "artwork_crop" && p.image_label === "Potongan karya asli")).toBe(true);
    for (const p of story.panels.filter((x) => panelView(x) === "image")) expect(p.image_label).toBeTruthy();
    expect(identityLine(story)).toContain("[Mock]");
  });

  it("hides stories when the feature is off, or the collection has none", async () => {
    store.set("rerupa:dev-mock-story", "disabled");
    await expect(mockRequest("POST", `/lessons/${lesson.id}/story`, {})).rejects.toMatchObject({ code: "feature_disabled" });
    await expect(mockRequest("GET", `/stories/${DEV_COLLECTION_STORY_ID}`, undefined)).rejects.toMatchObject({
      code: "feature_disabled",
    });
    store.set("rerupa:dev-mock-story", "none");
    await expect(mockRequest("POST", `/lessons/${lesson.id}/story`, {})).rejects.toMatchObject({
      code: "story_not_available",
    });
  });

  it("runs the research-agent job for an uploaded photo, panels appearing one by one", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const session = (await mockRequest("POST", "/sessions", {})) as { id: string };
    store.set(
      "rerupa:dev-mock-session",
      JSON.stringify({ ...JSON.parse(store.get("rerupa:dev-mock-session")!), lesson_version_id: lesson.id, lesson_origin: "free_mode" }),
    );
    expect(session.id).toBeTruthy();
    const start = StoryStart.parse(await mockRequest("POST", `/lessons/${lesson.id}/story`, { consent_ai_photo: true }));
    expect(start.job).toBeTruthy();
    const jobId = start.job!.id;

    vi.advanceTimersByTime(3_000); // storyboard done, panels drawing
    const early = StoryStart.parse(await mockRequest("POST", `/lessons/${lesson.id}/story`, { consent_ai_photo: true }));
    const mid = Story.parse(await mockRequest("GET", `/stories/${early.story_id}`, undefined));
    expect(isStoryGenerating(mid)).toBe(true);
    expect(mid.panels.some((p) => p.status === "pending")).toBe(true);
    expect(identityConfidenceLabel(mid)).toBe("Keyakinan sedang");

    vi.advanceTimersByTime(10_000);
    const job = Job.parse(await mockRequest("GET", `/jobs/${jobId}`, undefined));
    expect(storyIdFromJob(job)).toBe(early.story_id);
    const done = Story.parse(await mockRequest("GET", `/stories/${early.story_id}`, undefined));
    expect(isStoryGenerating(done)).toBe(false);
    expect(done.basis_label).toBe("Kisah bersumber");
  });
});
