/** File adoption binds established cohort generations and preserves ordinary fixed-record creation. */
import { afterEach, expect, it, vi } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createAdoptionFixture } from "../helpers/store/projection/adoption-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { OwnerIdentitySchema, recordReferences, sameReference } from "../../src/lib/store/identity.js";
import { startProjection } from "../../src/lib/store/projection/engine.js";
import { beginProjectionCommand } from "../../src/lib/store/projection/process-state.js";
import { readProjectionIndex } from "../../src/lib/store/projection/index-file.js";
import { parseStampedFile } from "../../src/lib/store/projection/stamp.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { checkProjectionRemoval } from "../../src/lib/store/projection/removal-check.js";

afterEach(() => { vi.resetAllMocks(); beginProjectionCommand(); });

it("preserves a dropped cohort document until its cohort exists, then adopts the same bytes into that generation", async () => {
  const { f, projected } = await createAdoptionFixture();
  const reference = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "core" }));
  const path = ".arc/backlog/planned/core/cohort-core.md";
  const content = "# Cohort: core\n\n**Parent:** [none]\n\n**Purpose:** Coordinate work.\n\nAuthored cohort prose\n";
  await mkdir(dirname(join(f.root, path)), { recursive: true });
  await writeFile(join(f.root, path), content);
  const before = success(await f.store.version());
  const checked = await checkProjectionRemoval(f.root, { store: f.store, identity: SlugSchema.parse("andrew") });
  expect(checked).toMatchObject({ kind: "would-refuse" });
  await startProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.version())).toBe(before);
  expect(await f.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(await readFile(join(f.root, path), "utf8")).toBe(content);
  const refused = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (refused.kind !== "index") throw new Error("Missing cohort admission index");
  expect(refused.index.entries[path]).toMatchObject({ kind: "ownerless", refused: {
    reason: expect.stringMatching(/existing live cohort/iu),
    remedy: { text: expect.stringMatching(/restore.*cohort|existing cohort.*canonical/iu) },
  } });
  expect(checked).toMatchObject({ remedy: refused.index.entries[path]?.refused?.remedy });
  const established = await seed(f, reference, content.replace("Authored cohort prose", "Stored cohort prose"));
  expect(await checkProjectionRemoval(f.root, { store: f.store, identity: SlugSchema.parse("andrew") })).toEqual({ kind: "passes" });
  await startProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.read({ reference: established.reference })).content).toBe(content);
  const listing = success(await f.store.list({ family: "cohort", kind: "cohort/document" }));
  if (listing.status !== "complete") throw new Error("Expected complete cohort inventory");
  expect(listing.records.map(record => record.reference)).toEqual([established.reference]);
  const repaired = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (repaired.kind !== "index") throw new Error("Missing repaired cohort index");
  expect(repaired.index.entries[path]).toMatchObject({ kind: "record", reference: established.reference,
    pending: false, refused: null });
  expect(parseStampedFile(await readFile(join(f.root, path), "utf8")).content).toBe(content);
});

it("refuses when an established cohort disappears before attachment and adopts after its authority is restored", async () => {
  const { f, projected } = await createAdoptionFixture();
  const reference = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "core" }));
  const content = "# Cohort: core\n\n**Parent:** [none]\n\n**Purpose:** Coordinate work.\n\nAuthored correction\n";
  const original = await seed(f, reference, content.replace("Authored correction", "Original cohort prose"));
  const path = ".arc/backlog/planned/core/cohort-core.md";
  await mkdir(dirname(join(f.root, path)), { recursive: true });
  await writeFile(join(f.root, path), content);
  const read = f.store.read.bind(f.store);
  let removed = false;
  vi.spyOn(f.store, "read").mockImplementation(async input => {
    const result = await read(input);
    if (!removed && result.status === "ok" && sameReference(result.result.reference, original.reference)) {
      removed = true;
      success(await f.store.write({ action: "remove", reference: original.reference, expected: result.result.version,
        provenance: { verb: "cohort", lifecycleAction: "remove" } }));
    }
    return result;
  });
  expect(await startProjection({ store: f.store, checkout: f.root })).toMatchObject({ kind: "ready" });
  expect(removed).toBe(true);
  const absent = await read({ reference: original.reference });
  if (absent.status !== "refused") throw new Error("The real cohort removal did not establish absence");
  expect(absent.refusal.code).toBe("not-found");
  expect(await readFile(join(f.root, path), "utf8")).toBe(content);
  const refused = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (refused.kind !== "index") throw new Error("Missing removed-cohort admission index");
  expect(refused.index.entries[path]).toMatchObject({ kind: "ownerless", refused: {
    reason: absent.refusal.condition, remedy: absent.refusal.remedy,
  } });
  const restored = await seed(f, reference, content.replace("Authored correction", "Restored cohort prose"));
  await startProjection({ store: f.store, checkout: f.root });
  expect(success(await read({ reference: restored.reference })).content).toBe(content);
  const repaired = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (repaired.kind !== "index") throw new Error("Missing restored-cohort admission index");
  expect(repaired.index.entries[path]).toMatchObject({ kind: "record", reference: restored.reference,
    pending: false, refused: null });
});

it("creates a missing fixed personal record through ordinary file adoption", async () => {
  const { f, projected } = await createAdoptionFixture();
  const reference = recordReferences["personal/working-memory"](OwnerIdentitySchema.parse({ type: "person", name: "andrew" }));
  const path = ".arc/user/andrew/WORKING-MEMORY.md";
  const content = "# Working Memory\n\nAuthored personal introduction.\n\n## Memories\n\n";
  expect(await f.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  await mkdir(dirname(join(f.root, path)), { recursive: true });
  await writeFile(join(f.root, path), content);
  expect(await checkProjectionRemoval(f.root, { store: f.store, identity: SlugSchema.parse("andrew") })).toEqual({ kind: "passes" });
  await startProjection({ store: f.store, checkout: f.root });
  const stored = success(await f.store.read({ reference }));
  expect(stored.content).toBe(content);
  expect(stored.reference).toEqual(reference);
  const disk = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing personal record adoption index");
  expect(disk.index.entries[path]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
  expect(parseStampedFile(await readFile(join(f.root, path), "utf8")).content).toBe(content);
});
