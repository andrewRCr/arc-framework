/** The seeded projection helper over the reference backend, in a real temporary repository. */
import { readFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { checkChange, PROJECTION_REFERENCE, readReference, recordCleanStat } from "../../../../src/lib/store/projection/change-detection.js";
import { commitProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

describe("a seeded projection", () => {
  it("lays stamped files whose stats hash once before a clean observation is recorded", async () => {
    const fixture = createReferenceFixture();
    const markdown = fixture.reference("cohort/document", "one");
    const text = fixture.reference("cohort/document", "two");
    for (const [reference, content] of [[markdown, "# Cohort: one\n\nBody.\n"], [text, "plain: text\n"]] as const) {
      const written = await fixture.store.write({
        action: "put", reference, content, expected: null, provenance: { verb: "save", lifecycleAction: "save" },
      });
      if (written.status !== "ok") throw new Error("the fixture write was refused");
    }
    const paths = { md: ".arc/backlog/planned/one/cohort-one.md", txt: ".arc/user/andrew/scratch/two.txt" };
    const seeded = await seedProjection({
      store: fixture.store, files: [{ reference: markdown, path: paths.md }, { reference: text, path: paths.txt }],
    });
    directories.push(seeded.checkout);
    expect(Object.keys(seeded.index.entries).sort()).toEqual([paths.md, paths.txt].sort());

    const markdownEntry = seeded.index.entries[paths.md];
    if (markdownEntry?.kind !== "record") throw new Error("expected the Markdown file's record entry");
    expect(parseStampedFile(await readFile(join(seeded.checkout, paths.md), "utf8")))
      .toMatchObject({ stamp: markdownEntry.base.blob, content: "# Cohort: one\n\nBody.\n" });
    expect(await readFile(join(seeded.checkout, paths.txt), "utf8")).toBe("plain: text\n");

    const later = new Date(Date.now() + 2_000);
    await utimes(join(seeded.checkout, PROJECTION_REFERENCE), later, later);
    const reference = await readReference(seeded.checkout);
    const reads: string[] = [];
    let observed = seeded.index;
    for (const [path, entry] of Object.entries(seeded.index.entries)) {
      if (entry.kind !== "record") throw new Error("expected record entries");
      const verdict = await checkChange(
        { path: join(seeded.checkout, path), recorded: entry.stat, written: entry.written, reference, format: "sha1" },
        async (target) => { reads.push(target); return readFile(target); },
      );
      expect(verdict.status).toBe("hashed-clean");
      if (verdict.status !== "hashed-clean") throw new Error("Expected an initial clean hash");
      observed = recordCleanStat(observed, path, verdict.stat);
    }
    expect(reads.sort()).toEqual(Object.values(paths).map(path => join(seeded.checkout, path)).sort());
    const clean = await commitProjectionIndex({ location: seeded.location, checkout: seeded.checkout, index: observed });
    await utimes(join(seeded.checkout, PROJECTION_REFERENCE), later, later);
    for (const [path, entry] of Object.entries(clean.entries)) {
      if (entry.kind !== "record") throw new Error("Expected a record entry");
      expect(await checkChange({ path: join(seeded.checkout, path), recorded: entry.stat, written: entry.written,
        reference: await readReference(seeded.checkout), format: "sha1" }, async () => {
        throw new Error("A recorded clean stat must not read the file");
      })).toMatchObject({ status: "clean" });
    }
  });
});
