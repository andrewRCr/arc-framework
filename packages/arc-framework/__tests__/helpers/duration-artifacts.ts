/** Filesystem preparation and writer merging for handed test-duration artifacts. */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, sep } from "node:path";
import { mergeTestDurations } from "./merge-test-durations.js";

/**
 * Preserve restored tier files and supply empty files for cache misses.
 * @param directory - Handed duration directory
 * @returns After all three tier inputs exist
 */
export function prepareDurationInputs(directory: string): void {
  mkdirSync(directory, { recursive: true });
  for (const tier of ["unit", "integration", "e2e"]) {
    const path = join(directory, `${tier}.json`);
    if (!existsSync(path)) writeFileSync(path, "");
  }
}

/**
 * Merge downloaded shard artifacts into the duration cache directory.
 * @param input - Artifact download root
 * @param output - Directory receiving one native results file per tier
 * @returns After disjoint native files are persisted
 */
export function mergeDurationArtifacts(input: string, output: string): void {
  const documents = readdirSync(input, { recursive: true, encoding: "utf8" }).filter((path) => basename(path) === "results.json")
    .sort().map((path) => {
      const tier = /^duration-results-(unit|integration|e2e)-\d+$/u.exec(path.split(sep)[0] ?? "")?.[1];
      if (tier === undefined) throw new Error(`Unrecognized duration artifact: ${path}`);
      return { tier, content: readFileSync(join(input, path), "utf8") };
    });
  const merged = mergeTestDurations(documents);
  mkdirSync(output, { recursive: true });
  for (const [tier, content] of Object.entries(merged)) writeFileSync(join(output, `${tier}.json`), content);
}
