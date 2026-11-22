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

// ── Synthetic lesson for the practice screen (dev mock only) ────────────────
// api/examples/lesson_detail.json is a trimmed real lesson whose layer URLs are
// placeholders. Build simple shape layers (no artwork pixels) from its region
// boxes so the stage canvas can be developed. Labelled `_mock` everywhere.
const lesson = JSON.parse(await readFile(path.join(examplesDir, "lesson_detail.json"), "utf8"));
const W = lesson.image_width;
const H = lesson.image_height;
const known = new Map(lesson.regions.map((r) => [r.code, r]));
const referenced = [...new Set(lesson.stages.flatMap((s) => s.new_region_codes))];
const muted = ["#8F7F6E", "#A89A86", "#6F6A73", "#B3A48D", "#7D8A86", "#9C8576", "#8A7D8F"];
referenced.forEach((code, i) => {
  if (known.has(code)) return;
  const cols = 3;
  const cw = W / cols;
  const ch = H / 4;
  const col = i % cols;
  const row = 1 + Math.floor(i / cols) % 3;
  const bbox = [Math.round(col * cw + cw * 0.12), Math.round(row * ch + ch * 0.1), Math.round(cw * 0.76), Math.round(ch * 0.8)];
  known.set(code, {
    code,
    hex: muted[i % muted.length],
    area_pct: 3,
    bbox,
    centroid: [Math.round(bbox[0] + bbox[2] / 2), Math.round(bbox[1] + bbox[3] / 2)],
    is_main_object: false,
    is_background: false,
    value_level: null,
    label: null,
  });
});
const regions = [...known.values()];
const blob = ([x, y, w, h]) => {
  // A soft blob inside the box: an ellipse drawn with two arcs.
  const rx = w / 2;
  const ry = h / 2;
  const cx = x + rx;
  const cy = y + ry;
  return `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${2 * rx},0 a${rx},${ry} 0 1,0 ${-2 * rx},0 Z`;
};
const svg = (body, layer) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" data-layer="${layer}">${body}</svg>`;
const byArea = regions.toSorted((a, b) => b.bbox[2] * b.bbox[3] - a.bbox[2] * a.bbox[3]);
const layersDir = path.join(outDir, "api", "layers");
await mkdir(layersDir, { recursive: true });
const { cols = 4, rows = 6 } = lesson.layers.find((l) => l.kind === "grid")?.meta ?? {};
const gridLines = [
  ...Array.from({ length: cols - 1 }, (_, i) => `<line x1="${((i + 1) * W) / cols}" y1="0" x2="${((i + 1) * W) / cols}" y2="${H}"/>`),
  ...Array.from({ length: rows - 1 }, (_, i) => `<line x1="0" y1="${((i + 1) * H) / rows}" x2="${W}" y2="${((i + 1) * H) / rows}"/>`),
].join("");
await writeFile(path.join(layersDir, "grid.svg"), svg(`<g stroke="#4A6FA5" stroke-width="2" opacity="0.6">${gridLines}</g>`, "grid"));
await writeFile(
  path.join(layersDir, "regions.svg"),
  svg(byArea.map((r) => `<path id="${r.code}" data-code="${r.code}" fill="${r.hex}" stroke="${r.hex}" stroke-width="1" d="${blob(r.bbox)}"/>`).join(""), "regions"),
);
await writeFile(
  path.join(layersDir, "sketch.svg"),
  svg(byArea.map((r) => `<path fill="none" stroke="#1E1E1E" stroke-width="2" d="${blob(r.bbox)}"/>`).join(""), "sketch"),
);
await writeFile(
  path.join(layersDir, "lineart.svg"),
  svg(byArea.map((r) => `<path fill="none" stroke="#111" stroke-width="1.2" stroke-dasharray="6 4" d="${blob(r.bbox)}"/>`).join(""), "lineart"),
);
const layerUrl = {
  grid: "/_dev/api/layers/grid.svg",
  sketch: "/_dev/api/layers/sketch.svg",
  regions: "/_dev/api/layers/regions.svg",
  lineart: "/_dev/api/layers/lineart.svg",
  original_photo: "/_dev/artworks/lukisan-kain-bali-goteborg.webp",
};
const mockLesson = {
  ...lesson,
  _mock: true,
  regions,
  layers: lesson.layers.map((l) => ({ ...l, url: layerUrl[l.kind] ?? null, meta: { ...l.meta, _mock: true } })),
  // Placeholder so the Selesai page's reflection can be built. Not a culture
  // fact: the text says so, and there is no source (renders as "Perkiraan AI").
  reflection: lesson.reflection ?? {
    question: "[Mock dev] Contoh pertanyaan refleksi, bukan fakta. Pilih jawaban kedua.",
    options: ["Jawaban contoh A", "Jawaban contoh B", "Jawaban contoh C"],
    correct_option: 1,
    source: null,
  },
};
await writeFile(path.join(outDir, "api", "lesson_mock.json"), JSON.stringify(mockLesson, null, 2));
console.log(`wrote synthetic lesson (${regions.length} regions) to public/_dev/api/`);
console.log(`wrote ${cards.length} fixtures to public/_dev/`);
