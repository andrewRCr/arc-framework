/** Adoption uses the file-holding checkout's exact claim and lifecycle location. */
import { afterEach, expect, it } from "vitest";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createAdoptionFixture, createErrandAdoptionFixture } from "../helpers/store/projection/adoption-fixture.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { startProjection } from "../../src/lib/store/projection/engine.js";
import { beginProjectionCommand } from "../../src/lib/store/projection/process-state.js";
import { readProjectionIndex } from "../../src/lib/store/projection/index-file.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { entry } from "../helpers/inbox-harness.js";

afterEach(() => { beginProjectionCommand(); });

it("adopts new prose into the work item claimed by the current checkout", async () => {
  const { f, primary, folder, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  expect(folder).toBe(".arc/active/current");
  const path = `${folder}/diagram.svg`, content = "<svg>authored content</svg>\n";
  await writeFile(join(f.root, path), content);
  await startProjection({ store: f.store, checkout: f.root });
  const reference = recordReferences["work-item/companion"](primary.reference.owner, "diagram.svg");
  expect(await f.store.read({ reference })).toMatchObject({ status: "ok", result: { reference, content } });
  const disk = await readProjectionIndex(projected.location, true);
  if (disk.kind !== "index") throw new Error("Missing adoption index");
  expect(disk.index.entries[path]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
});

it.each(["nested", "flat"] as const)("uses the %s own folder and repairs a misplaced top-level file by moving it", async ownLayout => {
  const { f, primary, folder, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout });
  const path = ".arc/active/loose.txt", content = "Keep the authored prose while its location is repaired\n";
  await writeFile(join(f.root, path), content);
  const before = success(await f.store.version());
  await startProjection({ store: f.store, checkout: f.root });
  let adopted = path;
  if (ownLayout === "nested") {
    const held = await readProjectionIndex(projected.location, true);
    if (held.kind !== "index") throw new Error("Missing refused index");
    expect(held.index.entries[path]).toMatchObject({ kind: "ownerless", refused: { remedy: { text: expect.stringContaining("current/") } } });
    expect(success(await f.store.version())).toBe(before);
    expect(await readFile(join(f.root, path), "utf8")).toBe(content);
    adopted = `${folder}/loose.txt`;
    await rename(join(f.root, path), join(f.root, adopted));
    await startProjection({ store: f.store, checkout: f.root });
  }
  const reference = recordReferences["work-item/companion"](primary.reference.owner, "loose.txt");
  expect(success(await f.store.read({ reference })).content).toBe(content);
  const disk = await readProjectionIndex(projected.location, true);
  if (disk.kind !== "index") throw new Error("Missing adoption index");
  expect(disk.index.entries[adopted]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
  if (adopted !== path) expect(disk.index.entries[path]).toBeUndefined();
});

it("refuses another owner's new in-flight prose and adopts the same bytes after ownership repair", async () => {
  const { f, primary, folder, projected } = await createAdoptionFixture({ placement: { kind: "active" }, owner: "bob" });
  expect(folder).toBe(".arc/active/in-flight/alpha");
  const path = `${folder}/extra.txt`, content = "The same prose waits for its owning identity\n";
  await writeFile(join(f.root, path), content);
  const before = success(await f.store.version());
  await startProjection({ store: f.store, checkout: f.root });
  const held = await readProjectionIndex(projected.location, true);
  if (held.kind !== "index") throw new Error("Missing refused index");
  expect(held.index.entries[path]).toMatchObject({ kind: "ownerless", refused: {
    reason: expect.stringContaining("bob"), remedy: { text: expect.stringContaining("bob") },
  } });
  expect(success(await f.store.version())).toBe(before);
  expect(await readFile(join(f.root, path), "utf8")).toBe(content);
  success(await f.store.write({ ...update(f, primary, primary.content.replace("`bob`", "`andrew`")),
    provenance: { verb: "handover", lifecycleAction: "handover" } }));
  await startProjection({ store: f.store, checkout: f.root });
  const reference = recordReferences["work-item/companion"](primary.reference.owner, "extra.txt");
  expect(success(await f.store.read({ reference })).content).toBe(content);
  const disk = await readProjectionIndex(projected.location, true);
  if (disk.kind !== "index") throw new Error("Missing repaired index");
  expect(disk.index.entries[path]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
});

it("adopts an archived owner's new companion at save without changing its archive placement", async () => {
  const { f, primary, folder, projected } = await createAdoptionFixture({ placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  const path = `${folder}/diagram.svg`, content = "<svg>archived correction</svg>\n";
  await writeFile(join(f.root, path), content);
  await startProjection({ store: f.store, checkout: f.root, mode: "save" });
  const reference = recordReferences["work-item/companion"](primary.reference.owner, "diagram.svg");
  expect(await f.store.read({ reference })).toMatchObject({ status: "ok", result: { reference, content } });
  expect(success(await f.store.read({ reference: primary.reference })).placement).toEqual(primary.placement);
  const disk = await readProjectionIndex(projected.location, true);
  if (disk.kind !== "index") throw new Error("Missing archived adoption index");
  expect(disk.index.entries[path]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
});

it("leaves loose personal prose ownerless and adopts it after moving the same bytes into scratch", async () => {
  const { f, projected } = await createAdoptionFixture();
  const path = ".arc/user/andrew/unfiled.md", content = "Personal authored prose\n";
  await mkdir(dirname(join(f.root, path)), { recursive: true });
  await writeFile(join(f.root, path), content);
  const before = success(await f.store.version());
  await startProjection({ store: f.store, checkout: f.root });
  const held = await readProjectionIndex(projected.location, true);
  if (held.kind !== "index") throw new Error("Missing ownerless index");
  expect(held.index.entries[path]).toMatchObject({ kind: "ownerless", refused: { remedy: { text: expect.stringContaining("scratch/") } } });
  expect(success(await f.store.version())).toBe(before);
  expect(await readFile(join(f.root, path), "utf8")).toBe(content);
  const adopted = ".arc/user/andrew/scratch/nested/unfiled.md";
  await mkdir(dirname(join(f.root, adopted)), { recursive: true });
  await rename(join(f.root, path), join(f.root, adopted));
  await startProjection({ store: f.store, checkout: f.root });
  const reference = recordReferences["personal/document"](OwnerIdentitySchema.parse({ type: "person", name: "andrew" }), "scratch/nested/unfiled.md");
  expect(success(await f.store.read({ reference })).content).toBe(content);
  const disk = await readProjectionIndex(projected.location, true);
  if (disk.kind !== "index") throw new Error("Missing scratch adoption index");
  expect(disk.index.entries[path]).toBeUndefined();
  expect(disk.index.entries[adopted]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
});

it("refuses an ended current claim instead of adopting into its live namesake, then resumes after claim repair", async () => {
  const { f, primary, projected } = await createAdoptionFixture({ ownLayout: "nested",
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  const live = await seed(f, recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "alpha" })),
    makeMetaFixture("alpha", { state: "Active", owner: "andrew", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }),
    { kind: "active" });
  expect(live.reference.owner).not.toEqual(primary.reference.owner);
  const path = ".arc/active/current/generation.txt", content = "Preserve this edit until its claim is repaired\n";
  await mkdir(dirname(join(f.root, path)), { recursive: true });
  await writeFile(join(f.root, path), content);
  const before = success(await f.store.version());
  await startProjection({ store: f.store, checkout: f.root });
  const held = await readProjectionIndex(projected.location, true);
  if (held.kind !== "index") throw new Error("Missing refused index");
  expect(held.index.entries[path]).toMatchObject({ kind: "ownerless", refused: { reason: expect.stringContaining("no active, bound") } });
  expect(success(await f.store.version())).toBe(before);
  expect(await readFile(join(f.root, path), "utf8")).toBe(content);
  await writeWorktreeMarker(f.root, { spawnedByArc: false, spawningIdentity: "andrew", createdAt: new Date(0).toISOString(),
    createdFor: boundWorkUnitSubject(live) });
  await startProjection({ store: f.store, checkout: f.root });
  const reference = recordReferences["work-item/companion"](live.reference.owner, "generation.txt");
  expect(success(await f.store.read({ reference })).content).toBe(content);
  expect(await f.store.read({ reference: recordReferences["work-item/companion"](primary.reference.owner, "generation.txt") }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  const disk = await readProjectionIndex(projected.location, true);
  if (disk.kind !== "index") throw new Error("Missing repaired index");
  expect(disk.index.entries[path]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
});

it("adopts a new inbound list into an Errand through its exact ready checkout claim", async () => {
  const { f, primary, folder, projected } = await createErrandAdoptionFixture();
  expect(folder).toBe(".arc/active/current");
  const path = `${folder}/inbound-alpha.md`, content = `## Inbound\n\n${entry("12345678", "Concern", "Additional Errand input")}\n`;
  await writeFile(join(f.root, path), content);
  await startProjection({ store: f.store, checkout: f.root });
  const reference = recordReferences["work-item/inbound"](primary.reference.owner);
  expect(await f.store.read({ reference })).toMatchObject({ status: "ok", result: { reference, content } });
  const disk = await readProjectionIndex(projected.location, true);
  if (disk.kind !== "index") throw new Error("Missing Errand adoption index");
  expect(disk.index.entries[path]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
});
