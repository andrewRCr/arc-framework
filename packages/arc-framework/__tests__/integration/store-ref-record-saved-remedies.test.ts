import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { PROJECTED_RECORD_MAX_BYTES } from "../../src/lib/store/limits.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";

describe.each(["default", "separate"] as const)("saved record repair routes in %s", layout => {
  it.each((["malformed", "oversized", "unknown-format"] as const).flatMap(fault =>
    [false, true].map(archived => ({ fault, archived }))))("keeps $fault saved damage after current repair, archived: $archived", async ({ fault, archived }) => {
    const f = await createRefFixture({}, layout), owner = await seed(f, f.reference("work-item/meta"));
    const kind = fault === "oversized" ? "work-item/companion" : "review/evidence";
    const reference = RecordReferenceSchema.parse({ kind, owner: owner.reference.owner, key: "record-content" });
    const record = await seed(f, reference);
    if (archived) {
      const primary = success(await f.store.read({ reference: owner.reference }));
      success(await f.store.write({ action: "put", reference: primary.reference, expected: primary.version, content: primary.content,
        placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    }
    const current = success(await f.store.read({ reference }));
    const home = expandStoredPath(reference, { placement: current.placement }), entries = await capturedEntries(f, home.ref);
    const parent = (await f.ports.exec("git", [...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], "rev-parse", home.ref], { cwd: f.root })).stdout.trim();
    const damaged = [];
    for (const entry of entries) {
      if (fault === "unknown-format" && entry.path === home.metadataPath) {
        const text = (await f.ports.exec("git", [...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], "show", `${parent}:${home.metadataPath}`], { cwd: f.root })).stdout;
        const metadata = JSON.parse(text) as { formats: Record<string, number> };
        metadata.formats[canonicalize({ kind, key: reference.key })] = 2;
        damaged.push({ path: entry.path, content: canonicalize(metadata) });
      } else damaged.push(entry.path === home.path && fault !== "unknown-format" ? { path: entry.path,
        content: fault === "oversized" ? "x".repeat(PROJECTED_RECORD_MAX_BYTES + 1) : "{ invalid\n" } : entry);
    }
    const broken = await plantRef(f.root, home.ref, damaged, { parents: [parent], gitDir: f.gitDir }), saved = await f.settle();
    const refused = await f.store.read({ reference, asOf: saved });
    const remedy = fault === "unknown-format" ? /merge base|rebuild/iu : /saved state|historical (?:record|object|state)|readable state/iu;
    expect.soft(refused).toMatchObject({ status: "refused", refusal: { code: "record-malformed", remedy: { text: expect.stringMatching(remedy) } } });
    const listing = success(await f.store.list({ family: kind === "review/evidence" ? "review" : "work-item", asOf: saved }));
    expect.soft(listing).toMatchObject({ status: "complete", diagnostics: expect.arrayContaining([
      expect.objectContaining({ key: home.path, remedy: { text: expect.stringMatching(remedy) } }),
    ]) });
    await plantRef(f.root, home.ref, entries, { parents: [broken.tip], gitDir: f.gitDir });
    expect(success(await f.store.read({ reference })).content).toBe(record.content);
    expect(await f.store.read({ reference, asOf: saved })).toEqual(refused);
  }, 60_000);
});
