/** Only one actual working materialization can aggregate review source coverage. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { importFixture } from "../helpers/store/import-fixture.js";
import { resolveGitCommonDir } from "../../src/lib/git/exec.js";
import { resolveCandidateRecordRelativePath } from "../../src/lib/work-unit/candidate-record-store.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import type { ReviewMappingInput, ReviewMappingResult } from "../../src/lib/store/ports.js";

const first = "arc/review-gate/materializations/first/";
const second = "arc/review-gate/materializations/second/";
const files = ["arc/review-gate/evidence/held.json", `${first}source.json`, `${first}nested/payload.bin`, `${second}source.json`];

function exactListing(input: ReviewMappingInput): ReviewMappingResult["listing"] {
  const entry = (source: string) => ({ source, outcome: "left-behind" as const, reason: "Finished legacy source", records: [] });
  return [...input.gate.map(file => entry(file.path)), ...input.candidates.flatMap(candidate => {
    const owner = input.workItems.find(item => item.uid === candidate.workItem)!;
    const path = resolveCandidateRecordRelativePath(owner.slug);
    return [...(candidate.current === null ? [] : [entry(path)]), ...candidate.versions.map(version => entry(`${path}@${version.commit}`)),
      ...(candidate.boundary === null ? [] : [entry(resolveArcPath({ kind: "integration-boundary-record", slug: SlugSchema.parse(owner.slug) }))])];
  })];
}

describe.each(["default", "separate"] as const)("review folder coverage in %s", layout => {
  it.each(["arc/review-gate/", "arc/review-gate/evidence/", "arc/review-gate/materializations/", `${first}nested/`])(
    "refuses aggregate %s and accepts exact facts plus individual materializations after correction", async folder => {
      const h = await importFixture(layout);
      const common = await resolveGitCommonDir(h.git, h.root);
      for (const path of files) {
        await mkdir(dirname(join(common, path)), { recursive: true });
        await writeFile(join(common, path), "Opaque retained bytes\n");
      }
      let repaired = false;
      h.ports.reviewMapping = input => {
        let listing = exactListing(input);
        const folders = repaired ? [first, second] : [folder];
        for (const source of folders) {
          listing = listing.filter(item => !item.source.startsWith(source));
          listing.push({ source, outcome: "left-behind", reason: "Working materialization", records: [] });
        }
        return { records: [], listing };
      };
      expect(await h.migrate(true)).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
        expect.objectContaining({ condition: `Review mapping lists an unknown or invalid source: ${folder}.`, remedy: { text: expect.stringContaining("Correct the review mapping") } }),
      ]) } });
      expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
      expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
      for (const path of files) expect(await readFile(join(common, path), "utf8")).toBe("Opaque retained bytes\n");
      repaired = true;
      expect(await h.migrate()).toMatchObject({ status: "ok" });
    }, 60_000,
  );
});
