// Build gate for the forecast's sensitivity contract (see sensitivityCheck.mjs).
//
// The engine's modules are written for Vite (extensionless relative imports),
// which plain Node cannot resolve, so the check is bundled with esbuild (already
// present as Vite's own dependency) into a temporary file and then run. No
// network, no extra package.
//
// Wired as the `prebuild` script in package.json, so a broken forecast shape
// fails the build instead of shipping.

import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const entry = fileURLToPath(new URL("./sensitivityCheck.mjs", import.meta.url));
const outdir = mkdtempSync(join(tmpdir(), "stackd-sensitivity-"));
const outfile = join(outdir, "check.mjs");

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

const { checkAll } = await import(pathToFileURL(outfile).href);
const failures = checkAll();

if (failures.length) {
  console.error("Sensitivity contract broken:");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

console.log("Sensitivity contract holds.");