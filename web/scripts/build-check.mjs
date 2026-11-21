// Production build into .next-check, so a running `npm run dev` (which serves
// from .next) is never disturbed. Next rewrites next-env.d.ts to point at the
// build's type folder; point it back at .next afterwards so editor and
// `npm run typecheck` keep using the dev server's route types.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const result = spawnSync("npx", ["next", "build", "--turbopack"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, NEXT_DIST_DIR: ".next-check" },
});

const envFile = path.join(root, "next-env.d.ts");
try {
  writeFileSync(envFile, readFileSync(envFile, "utf8").replaceAll(".next-check/types", ".next/types"));
} catch {
  // next-env.d.ts missing: nothing to restore
}

process.exit(result.status ?? 1);
