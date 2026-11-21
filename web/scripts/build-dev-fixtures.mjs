// Build dev-only gallery fixtures from ../content/artworks (team content).
// Output: public/_dev/artworks.json + public/_dev/artworks/<slug>.webp (gitignored).
// Use while the API has no published artworks: NEXT_PUBLIC_GALLERY_SOURCE=fixtures.
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const contentDir = path.resolve(root, "../content/artworks");
const outDir = path.join(root, "public/_dev");
await mkdir(path.join(outDir, "artworks"), { recursive: true });

/** Stable UUID-shaped id from the slug, so fixture ids pass the same schema as API ids. */
function fakeUuid(slug) {
  const h = createHash("sha1").update(slug).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const cards = [];
for (const slug of (await readdir(contentDir)).sort()) {
  let meta;
  try {
    meta = JSON.parse(await readFile(path.join(contentDir, slug, "meta.json"), "utf8"));
  } catch {
    continue;
  }
  const out = path.join(outDir, "artworks", `${slug}.webp`);
  const info = await sharp(path.join(contentDir, slug, meta.image ?? "image.jpg"))
    .rotate()
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(out);
  const card = {
    id: fakeUuid(slug),
    slug,
    title: meta.title,
    artist: meta.artist ?? null,
    tradition: meta.tradition ?? null,
    region_origin: meta.region_origin ?? null,
    license: meta.license,
    license_note: meta.license_note ?? null,
    thumbnail_url: `/_dev/artworks/${slug}.webp`,
    lesson_version_id: null,
    width: info.width,
    height: info.height,
  };
  cards.push(card);
  // Same shape as GET /artworks/{slug}, plus the team's claims (dev only), in
  // the shape of lesson.culture_claims so the page can show them before import.
  const sourceByCode = new Map((meta.sources ?? []).map((s) => [s.code, s]));
  const claims = (meta.claims ?? []).map((c) => ({
    stage_code: null,
    text: c.text,
    type: c.type,
    sources: (c.source_codes ?? [])
      .map((code) => sourceByCode.get(code))
      .filter(Boolean)
      .map((s) => ({ code: s.code, title: s.title, url: s.url ?? null })),
  }));
  const detail = {
    claims,
    ...card,
    image_url: card.thumbnail_url,
    adaptation_scope: meta.adaptation_scope ?? null,
    sources: (meta.sources ?? []).map((s) => ({
      code: s.code,
      title: s.title,
      publisher: s.publisher ?? null,
      url: s.url ?? null,
      claim_note: s.claim_note ?? null,
    })),
  };
  await writeFile(path.join(outDir, "artworks", `${slug}.json`), JSON.stringify(detail, null, 2));
  console.log(`${slug}: ${info.width}x${info.height}, ${Math.round(info.size / 1024)} KB`);
}

await writeFile(path.join(outDir, "artworks.json"), JSON.stringify(cards, null, 2));

// The backend's response examples, served to the dev API mock (NEXT_PUBLIC_API_MOCK=1).
const examplesDir = path.resolve(root, "../api/examples");
await mkdir(path.join(outDir, "api"), { recursive: true });
for (const file of (await readdir(examplesDir)).filter((f) => f.endsWith(".json"))) {
  await writeFile(path.join(outDir, "api", file), await readFile(path.join(examplesDir, file)));
}
console.log("copied api/examples to public/_dev/api/");
console.log(`wrote ${cards.length} fixtures to public/_dev/`);
