/** Archive adoption binds exact generations and isolates repairable ownership failures. */
import { afterEach, expect, it } from "vitest";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createAdoptionFixture, createErrandAdoptionFixture } from "../helpers/store/projection/adoption-fixture.js";
import { seedProjection } from "../helpers/store/projection/seeded-projection.js";
import { startProjection } from "../../src/lib/store/projection/engine.js";
import { beginProjectionCommand } from "../../src/lib/store/projection/process-state.js";
import { readProjectionIndex } from "../../src/lib/store/projection/index-file.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

afterEach(() => { beginProjectionCommand(); });

it.each(["active", "completed"] as const)("adopts an older archive despite a newer %s namesake and no indexed metadata", async location => {
  const { f, primary, folder } = await createAdoptionFixture({ placement: {
    kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3"),
  } });
  const created = success(await f.store.write({ action: "put", expected: null, provenance: testProvenance,
    reference: recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "alpha" })),
    content:
    makeMetaFixture("alpha", { state: location === "active" ? "Active" : "Shipped", owner: "andrew", workClass: "Light",
      priority: "P1", currentWorkflow: location === "active" ? "process-task-loop" : null }),
    placement: location === "active" ? { kind: "active" } : { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
  const newer = success(await f.store.read({ reference: created.reference }));
  await rm(join(f.root, `${folder}/meta-alpha.md`));
  const projected = await seedProjection({ store: f.store, checkout: f.root, files: [] });
  const path = `${folder}/correction.txt`, content = "Correction for the older generation\n";
  await writeFile(join(f.root, path), content);
  await startProjection({ store: f.store, checkout: f.root, mode: "save" });
  const reference = recordReferences["work-item/companion"](primary.reference.owner, "correction.txt");
  expect(success(await f.store.read({ reference }))).toMatchObject({ reference, content });
  expect(await f.store.read({ reference: recordReferences["work-item/companion"](newer.reference.owner, "correction.txt") }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  const disk = await readProjectionIndex(projected.location, true);
  if (disk.kind !== "index") throw new Error("Missing archive index");
  expect(disk.index.entries[path]).toMatchObject({ kind: "record", reference });
});

it.each([{ completed: true }, { own: false }, {}])("adopts an unindexed Errand description at %j beside an independent edit", async input => {
  const { f, description, folder, projected } = await createErrandAdoptionFixture({ ...input, unindexed: true });
  const path = `${folder}/errand-alpha.md`, content = "## Description\n\nA preserved correction.\n";
  await writeFile(join(f.root, path), content);
  const scratch = ".arc/user/andrew/scratch/independent.txt";
  await mkdir(join(f.root, ".arc/user/andrew/scratch"), { recursive: true });
  await writeFile(join(f.root, scratch), "Independent input\n");
  await expect(startProjection({ store: f.store, checkout: f.root, mode: "save" })).resolves.toBeDefined();
  expect(success(await f.store.read({ reference: description.reference })).content).toBe(content);
  const independent = recordReferences["personal/document"](OwnerIdentitySchema.parse({ type: "person", name: "andrew" }), "scratch/independent.txt");
  expect(success(await f.store.read({ reference: independent })).content).toBe("Independent input\n");
  expect(await readFile(join(f.root, path), "utf8")).toContain("A preserved correction.");
  const disk = await readProjectionIndex(projected.location, true);
  if (disk.kind !== "index") throw new Error("Missing Errand index");
  expect(disk.index.entries[path]).toMatchObject({ kind: "record", reference: description.reference, refused: null });
});

it("keeps a misplaced completed Errand repair local and adopts the same bytes after moving it", async () => {
  const { f, description, folder, projected } = await createErrandAdoptionFixture({ completed: true, unindexed: true });
  const correct = `${folder}/errand-alpha.md`, wrong = ".arc/completed/2026-q3/errand-alpha.md";
  await mkdir(join(f.root, ".arc/completed/2026-q3"), { recursive: true });
  const content = "## Description\n\nCorrection waiting for its proper quarter.\n";
  await writeFile(join(f.root, correct), content);
  await rename(join(f.root, correct), join(f.root, wrong));
  const scratch = ".arc/user/andrew/scratch/independent.txt";
  await mkdir(join(f.root, ".arc/user/andrew/scratch"), { recursive: true });
  await writeFile(join(f.root, scratch), "Independent input\n");
  await startProjection({ store: f.store, checkout: f.root, mode: "save" });
  const held = await readProjectionIndex(projected.location, true);
  if (held.kind !== "index") throw new Error("Missing refused index");
  expect(held.index.entries[wrong]).toMatchObject({ kind: "ownerless", refused: {
    reason: expect.stringContaining("No unique Errand"), remedy: { text: expect.stringContaining("retry") },
  } });
  expect(await readFile(join(f.root, wrong), "utf8")).toBe(content);
  const independent = recordReferences["personal/document"](OwnerIdentitySchema.parse({ type: "person", name: "andrew" }), "scratch/independent.txt");
  expect(success(await f.store.read({ reference: independent })).content).toBe("Independent input\n");
  await rename(join(f.root, wrong), join(f.root, correct));
  await startProjection({ store: f.store, checkout: f.root, mode: "save" });
  expect(success(await f.store.read({ reference: description.reference })).content).toBe(content);
});

it("refuses ambiguous completed Errand generations while saving independent input", async () => {
  const { f, primary, folder, projected } = await createErrandAdoptionFixture({ completed: true, unindexed: true });
  success(await f.store.write({ action: "put", expected: null, provenance: testProvenance,
    reference: recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "alpha" })),
    content: primary.content.replace("a".repeat(32), "b".repeat(32)),
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
  const path = `${folder}/errand-alpha.md`, content = "## Description\n\nPreserve this ambiguous correction.\n";
  await writeFile(join(f.root, path), content);
  await mkdir(join(f.root, ".arc/user/andrew/scratch"), { recursive: true });
  await writeFile(join(f.root, ".arc/user/andrew/scratch/independent.txt"), "Independent input\n");
  await startProjection({ store: f.store, checkout: f.root, mode: "save" });
  const held = await readProjectionIndex(projected.location, true);
  if (held.kind !== "index") throw new Error("Missing ambiguous index");
  expect(held.index.entries[path]).toMatchObject({ kind: "ownerless", refused: {
    reason: expect.stringContaining("No unique Errand"), remedy: { text: expect.stringContaining("retry") },
  } });
  expect(await readFile(join(f.root, path), "utf8")).toBe(content);
  const independent = recordReferences["personal/document"](OwnerIdentitySchema.parse({ type: "person", name: "andrew" }), "scratch/independent.txt");
  expect(success(await f.store.read({ reference: independent })).content).toBe("Independent input\n");
});
