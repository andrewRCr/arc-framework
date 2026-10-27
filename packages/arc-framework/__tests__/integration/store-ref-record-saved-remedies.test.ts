import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { seed, success, testProvenance } from "../helpers/store/suite-tools.js";
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

it.each((["default", "separate"] as const).flatMap(layout => (["content", "owner-map"] as const).map(fault => ({ layout, fault }))))(
  "keeps saved lineage $fault remedies historical after current repair in $layout", async ({ layout, fault }) => {
  const f = await createRefFixture({}, layout);
  const reference = RecordReferenceSchema.parse({ kind: fault === "content" ? "lineage/conflict-record" : "lineage/transition",
    owner: { type: "work-item", name: "saved-origin", uid: "abcdef12-1234-4234-8234-123456789abc" },
    ...fault === "content" ? { key: "lineage-clash" } : {} });
  const content = f.content(reference);
  success(await f.store.write({ action: "put", reference, expected: null, content, provenance: testProvenance }));
  const home = expandStoredPath(reference), entries = await capturedEntries(f, home.ref);
  const args = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
  const parent = (await f.ports.exec("git", [...args, "rev-parse", home.ref], { cwd: f.root })).stdout.trim();
  const metadata = JSON.parse((await f.ports.exec("git", [...args, "show", `${parent}:${home.metadataPath}`], { cwd: f.root })).stdout) as { lineage?: Record<string, string> };
  delete metadata.lineage;
  const damaged = entries.map(entry => fault === "content" && entry.path === home.path ? { path: entry.path, content: "{ invalid" }
    : fault === "owner-map" && entry.path === home.metadataPath ? { path: entry.path, content: canonicalize(metadata) } : entry);
  const broken = await plantRef(f.root, home.ref, damaged, { parents: [parent], gitDir: f.gitDir });
  const saved = await f.settle(), refused = await f.store.read({ reference, asOf: saved });
  expect.soft(refused).toMatchObject({ status: "refused", refusal: { code: "record-malformed",
    remedy: { text: expect.stringMatching(/readable saved state|current state|historical/iu) } } });
  expect(await f.store.read({ reference })).toMatchObject({ status: "refused", refusal: { remedy: { text: expect.stringContaining("Repair") } } });
  await plantRef(f.root, home.ref, entries, { parents: [broken.tip], gitDir: f.gitDir });
  expect(success(await f.store.read({ reference })).content).toBe(content);
  expect(await f.store.read({ reference, asOf: saved })).toEqual(refused);
  expect(success(await f.store.read({ reference, asOf: await f.settle() })).content).toBe(content);
}, 60_000);
