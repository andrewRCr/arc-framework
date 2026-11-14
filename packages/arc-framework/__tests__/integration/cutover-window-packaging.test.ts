/** The cutover window tools remain repository-only across every publication channel. */
import { readdir, readFile } from "node:fs/promises";
import { join, matchesGlob, resolve } from "node:path";
import { expect, it } from "vitest";
import { referenceBundleInputs, type ReferenceMetafile } from "../helpers/store/ship-guard.js";

const packageRoot = resolve(import.meta.dirname, "../..");
const family = "src/scripts/cutover-window";

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

it("excludes the tools from bundle inputs, published files, and the install recipe", async () => {
  const metadata = JSON.parse(await readFile(join(packageRoot, "dist/metafile-esm.json"), "utf8")) as ReferenceMetafile;
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as { files: string[] };
  const recipe: unknown = JSON.parse(await readFile(join(packageRoot, "init-recipe.json"), "utf8"));
  const members = (await readdir(join(packageRoot, family), { recursive: true })).map(path => `${family}/${path}`);
  const prefixes = [".", "src", "src/scripts", family, ...members];
  const published = manifest.files.filter(pattern => prefixes.some(path =>
    matchesGlob(path, pattern.replace(/^\.\//u, "").replace(/\/$/u, ""))));
  expect({
    bundle: referenceBundleInputs(metadata, packageRoot, join(packageRoot, family)),
    published,
    recipe: strings(recipe).filter(value => value.includes("scripts/cutover-window")),
  }).toEqual({ bundle: [], published: [], recipe: [] });
});
