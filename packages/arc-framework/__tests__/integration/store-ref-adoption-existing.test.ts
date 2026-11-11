/** An unindexed copy retains its established record's identity and ordinary merge basis. */
import { afterEach, expect, it, vi } from "vitest";
import { mkdir, readFile, rename, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createAdoptionFixture } from "../helpers/store/projection/adoption-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { seedProjection } from "../helpers/store/projection/seeded-projection.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { writeMetaCohort } from "../../src/lib/store/kinds/meta/writers.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { CohortReadPlacementSchema } from "../../src/lib/store/placement.js";
import { completedCohortPath } from "../../src/lib/store/lifecycle-record-path.js";
import { endProjection, startProjection } from "../../src/lib/store/projection/engine.js";
import { beginProjectionCommand, projectionProcessState } from "../../src/lib/store/projection/process-state.js";
import { gitBlobId } from "../../src/lib/store/projection/blob-id.js";
import { renderStampedFile } from "../../src/lib/store/projection/stamp.js";
import { readProjectionIndex } from "../../src/lib/store/projection/index-file.js";
import { entry } from "../helpers/inbox-harness.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import type { WriteResult } from "../../src/lib/store/write.js";
import { createStagedFile, nameAsideFile } from "../../src/lib/store/projection/aside.js";
import { withProjectionLock } from "../../src/lib/store/projection/lock.js";
import { createWriteBackPort } from "../../src/lib/store/projection/write-back.js";
import { TAKEN_IN_FOLDER } from "../../src/lib/store/projection/taken-in.js";

afterEach(() => { beginProjectionCommand(); });

it("takes in an unindexed work-item file against its existing stamped record", async () => {
  const { f, primary, folder, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const reference = recordReferences["work-item/companion"](primary.reference.owner, "research"), body = "opening\nbase\nclosing\n";
  await seed(f, reference, body);
  const path = `${folder}/research-alpha.md`, content = "opening\nhand edit\nclosing\n";
  await writeFile(join(f.root, path), renderStampedFile({ content, stamp: gitBlobId(body, "sha1") }));
  await startProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.read({ reference })).content).toBe(content);
  const disk = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing adopted-file index");
  expect(disk.index.entries[path]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
});

it("takes in an unindexed current cohort copy against the associated cohort's existing generation", async () => {
  const { f, primary, folder } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const name = SlugSchema.parse("core"), body = "# Cohort: core\n\n**Parent:** [none]\n\n**Purpose:** Coordinate work.\n\nOriginal cohort prose\n";
  const cohort = await seed(f, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name })), body);
  success(await f.store.write(update(f, primary, writeMetaCohort(primary.content, name))));
  await unlink(join(f.root, folder, "meta-alpha.md"));
  const projected = await seedProjection({ store: f.store, checkout: f.root, files: [
    { reference: primary.reference, path: `${folder}/meta-alpha.md` },
    { reference: cohort.reference, path: resolveArcPath({ kind: "cohort-document", cohort: [name], placement: { kind: "planned" } }) },
  ] });
  const path = `${folder}/cohort-core.md`, content = body.replace("Original cohort prose", "Authored copy edit");
  await writeFile(join(f.root, path), renderStampedFile({ content, stamp: gitBlobId(body, "sha1") }));
  await startProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.read({ reference: cohort.reference })).content).toBe(content);
  const listed = success(await f.store.list({ family: "cohort", kind: "cohort/document" }));
  if (listed.status !== "complete") throw new Error("Expected complete native cohort inventory");
  expect(listed.records.map(record => record.reference)).toEqual([cohort.reference]);
  const disk = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing adopted-copy index");
  expect(disk.index.entries[path]).toMatchObject({ kind: "record", reference: cohort.reference, pending: false, refused: null });
});

it("holds an unassociated cohort copy until its work unit's membership is repaired, then adopts the same bytes", async () => {
  const { f, primary, folder, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const name = SlugSchema.parse("core"), body = "# Cohort: core\n\n**Parent:** [none]\n\n**Purpose:** Coordinate work.\n\nOriginal prose\n";
  const cohort = await seed(f, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name })), body);
  const path = `${folder}/cohort-core.md`, content = body.replace("Original prose", "Authored correction");
  const bytes = renderStampedFile({ content, stamp: gitBlobId(body, "sha1") });
  await writeFile(join(f.root, path), bytes);
  const before = success(await f.store.version());
  await startProjection({ store: f.store, checkout: f.root });
  const held = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (held.kind !== "index") throw new Error("Missing unassociated-copy index");
  expect(held.index.entries[path]).toMatchObject({ kind: "ownerless", refused: {
    reason: expect.stringContaining("membership"), remedy: { text: expect.stringContaining("Cohort field") },
  } });
  expect(success(await f.store.version())).toBe(before);
  expect(await readFile(join(f.root, path), "utf8")).toBe(bytes);
  success(await f.store.write(update(f, primary, writeMetaCohort(primary.content, name))));
  await startProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.read({ reference: cohort.reference })).content).toBe(content);
  const settled = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (settled.kind !== "index") throw new Error("Missing repaired-copy index");
  expect(settled.index.entries[path]).toMatchObject({ kind: "record", reference: cohort.reference, pending: false, refused: null });
});

it.each(["companion", "inbound"])("remembers an existing %s's accepted edit through read-back failure and retries installation without resending", async kind => {
  const { f, primary, folder, projected } = await createAdoptionFixture();
  const reference = kind === "companion" ? recordReferences["work-item/companion"](primary.reference.owner, "research")
    : recordReferences["work-item/inbound"](primary.reference.owner);
  const body = kind === "companion" ? "Original prose\n" : "## Inbound\n\n";
  const original = await seed(f, reference, body);
  const path = `${folder}/${kind === "companion" ? "research-alpha.md" : "inbound-alpha.md"}`;
  const content = kind === "companion" ? "Authored correction\n"
    : `## Inbound\n\n${entry("12345678", "Concern", "Authored correction").replace(/^- _Id:_.*\n/mu, "")}\n`;
  const bytes = renderStampedFile({ content, stamp: gitBlobId(body, "sha1") });
  await writeFile(join(f.root, path), bytes);
  let accepted: WriteResult | undefined, repair: (() => Promise<void>) | undefined;
  const batch = f.store.batch.bind(f.store);
  vi.spyOn(f.store, "batch").mockImplementationOnce(async input => {
    const result = await batch(input);
    if (result.status !== "ok") throw new Error("Expected the hand edit to persist before read-back failure");
    accepted = result.result.writes[0];
    const { registry } = f.ports;
    const home = expandStoredPath(primary.reference, { registry });
    const oid = new TextDecoder().decode((await f.ports.rawExec(["rev-parse", `${home.ref}:${home.metadataPath}`],
      { objectAccess: "local-only" })).stdout).trim();
    const object = join(f.root, ".git/objects", oid.slice(0, 2), oid.slice(2));
    const heldObject = join(f.root, "temporarily-unavailable-metadata-object");
    await rename(object, heldObject);
    repair = () => rename(heldObject, object);
    return result;
  });
  await startProjection({ store: f.store, checkout: f.root });
  await endProjection({ store: f.store, checkout: f.root });
  if (accepted === undefined || repair === undefined) throw new Error("The fixture did not reach the accepted-write boundary");
  const held = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (held.kind !== "index") throw new Error("Missing accepted-file index");
  expect(held.index.entries[path]).toMatchObject({ kind: "record", reference: accepted.reference, pending: true,
    base: { blob: gitBlobId(body, "sha1"), version: original.version },
    refused: { reason: expect.stringContaining("read-back failed") }, adoption: { kind: "read-back" } });
  expect(await readFile(join(f.root, path), "utf8")).toBe(bytes);
  await repair();
  expect(success(await f.store.read({ reference })).version).toBe(accepted.version);
  const beforeRetry = success(await f.store.version());
  const pendingEntry = held.index.entries[path];
  if (pendingEntry?.kind !== "record" || pendingEntry.adoption?.kind !== "read-back" || !pendingEntry.persisted?.recording
    || pendingEntry.persisted?.takenIn.kind !== "copy") throw new Error("The accepted edit has no unfinished take-in record");
  const payload = join(projected.location.stateDir, TAKEN_IN_FOLDER, pendingEntry.persisted.takenIn.name);
  const payloadBytes = await readFile(payload);
  const external = join(f.root, "external-accepted-destination"), backup = join(f.root, "accepted-authored-directory");
  await mkdir(external);
  await writeFile(join(external, path.slice(path.lastIndexOf("/") + 1)), "external content\n");
  await rename(join(f.root, folder), backup);
  await symlink(external, join(f.root, folder), "dir");
  await startProjection({ store: f.store, checkout: f.root });
  await endProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.version())).toBe(beforeRetry);
  const excluded = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (excluded.kind !== "index") throw new Error("The linked destination lost its accepted-write index");
  expect(excluded.index.entries[path]).toMatchObject({ reference: pendingEntry.reference, base: pendingEntry.base,
    adoption: pendingEntry.adoption, persisted: pendingEntry.persisted, pending: true, refused: pendingEntry.refused });
  expect(await readFile(payload)).toEqual(payloadBytes);
  expect(await readFile(join(external, path.slice(path.lastIndexOf("/") + 1)), "utf8")).toBe("external content\n");
  await unlink(join(f.root, folder));
  await rename(backup, join(f.root, folder));
  if (kind === "inbound") {
    const entry = held.index.entries[path];
    if (entry?.kind !== "record") throw new Error("Missing accepted entry for the aside take-in");
    const copy = nameAsideFile({ path, base: entry.base.blob, role: "aside",
      writer: { pid: process.pid, processInstance: "late-buffer", processScope: "fixture" } });
    const late = bytes.replace("Authored correction", "Aside edit remains pending");
    await createStagedFile(f.root, copy, late);
    const sent = await withProjectionLock(projected.location, session => createWriteBackPort({ store: f.store,
      location: projected.location, actor: "andrew@fixture", format: "sha1", checkpoint: session.step })({
      checkout: f.root, path, copy, entry, base: { kind: "stamp", stamp: gitBlobId(body, "sha1") },
    }));
    expect(sent).toMatchObject({ status: "done", value: { answer: "pending", entry: { persisted: entry.persisted, adoption: entry.adoption } } });
    expect(success(await f.store.version())).toBe(beforeRetry);
    expect(await readFile(join(f.root, copy), "utf8")).toBe(late);
    await unlink(join(f.root, copy));
  }
  await startProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.version())).toBe(beforeRetry);
  const stored = success(await f.store.read({ reference })).content;
  expect(stored.replace(/^- _Id:_.*\n/gmu, "")).toBe(content);
  const storedId = /^- _Id:_ `([0-9a-f]{8})`/mu.exec(stored)?.[1];
  const settled = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (settled.kind !== "index") throw new Error("Missing repaired-file index");
  expect(settled.index.entries[path]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
  expect(settled.index.entries[path]).not.toHaveProperty("adoption");
  await writeFile(join(f.root, path), bytes.replace("Authored correction", "Second authored correction"));
  await startProjection({ store: f.store, checkout: f.root });
  expect(projectionProcessState().diagnostics).toEqual([]);
  const afterStaleSave = success(await f.store.read({ reference })).content;
  expect(afterStaleSave).toContain("Second authored correction");
  expect(afterStaleSave.replace("Second authored correction", "")).not.toContain("Authored correction");
  if (kind === "inbound") {
    expect(afterStaleSave.match(/^- _Id:_/gmu)).toHaveLength(1);
    expect(/^- _Id:_ `([0-9a-f]{8})`/mu.exec(afterStaleSave)?.[1]).toBe(storedId);
  }
});

it("binds an unindexed archived cohort file to its archive coordinates while its name resolves to a newer generation", async () => {
  const { f, projected } = await createAdoptionFixture();
  const name = SlugSchema.parse("core"), reference = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name }));
  const body = "# Cohort: core\n\n**Parent:** [none]\n\n**Purpose:** Coordinate old work.\n\nOriginal archived prose\n";
  const prior = await seed(f, reference, body);
  success(await f.store.write({ ...update(f, prior, body), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const archived = success(await f.store.read({ reference: prior.reference }));
  const placement = CohortReadPlacementSchema.parse(archived.placement);
  const liveBody = body.replace("Original archived prose", "New generation prose");
  const live = await seed(f, reference, liveBody);
  expect(live.reference.owner).not.toEqual(archived.reference.owner);
  expect(success(await f.store.read({ reference })).reference).toEqual(live.reference);
  const path = completedCohortPath(archived);
  const content = body.replace("Original archived prose", "Archived correction");
  const misplaced = path.replace("2026-q4", "2025-q4"), bytes = renderStampedFile({ content, stamp: gitBlobId(body, "sha1") });
  await mkdir(dirname(join(f.root, misplaced)), { recursive: true });
  await writeFile(join(f.root, misplaced), bytes);
  const before = success(await f.store.version());
  await startProjection({ store: f.store, checkout: f.root, mode: "save" });
  const held = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (held.kind !== "index") throw new Error("Missing misplaced-archive index");
  expect(held.index.entries[misplaced]).toMatchObject({ kind: "ownerless", refused: {
    reason: expect.stringContaining("No unique archived cohort"), remedy: { text: expect.stringContaining("quarter and closeout") },
  } });
  expect(success(await f.store.version())).toBe(before);
  expect(await readFile(join(f.root, misplaced), "utf8")).toBe(bytes);
  await mkdir(dirname(join(f.root, path)), { recursive: true });
  await rename(join(f.root, misplaced), join(f.root, path));
  await startProjection({ store: f.store, checkout: f.root, mode: "save" });
  expect(success(await f.store.read({ reference: archived.reference })).content).toBe(content);
  expect(success(await f.store.read({ reference: archived.reference })).placement).toEqual(placement);
  expect(success(await f.store.read({ reference: live.reference })).content).toBe(liveBody);
  const disk = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing archived cohort adoption index");
  expect(disk.index.entries[path]).toMatchObject({ kind: "record", reference: archived.reference, pending: false, refused: null });
});

it("holds a project inbox until its unique project identity is established, then adopts the same bytes into that namespace", async () => {
  const { f, projected } = await createAdoptionFixture();
  const path = ".arc/backlog/ATOMIC-INBOX.md", content = `## Inbox\n\n${entry("12345678", "Concern", "Project authored prose")}\n`;
  await writeFile(join(f.root, path), content);
  const before = success(await f.store.version());
  await startProjection({ store: f.store, checkout: f.root });
  const held = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (held.kind !== "index") throw new Error("Missing refused project-inbox index");
  expect(held.index.entries[path]).toMatchObject({ kind: "ownerless", refused: {
    reason: expect.stringMatching(/project identity/iu), remedy: { text: expect.stringContaining("identity record") },
  } });
  expect(success(await f.store.version())).toBe(before);
  expect(await readFile(join(f.root, path), "utf8")).toBe(content);
  const identity = await seed(f, recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project" })),
    JSON.stringify({ projectId: "34567890-1234-4234-8234-123456789abc" }));
  await startProjection({ store: f.store, checkout: f.root });
  const reference = recordReferences["project-inbox/inbox"](identity.reference.owner);
  expect(success(await f.store.read({ reference })).content).toBe(content);
  const disk = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing adopted project-inbox index");
  expect(disk.index.entries[path]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
});
