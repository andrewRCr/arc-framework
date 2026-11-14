/** Full projection and recovery over real linked worktrees and the reference backend. */
import { createErrandAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { cohortDoc } from "../../../helpers/store/cohort-rule-input.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { createKindRegistry } from "../../../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../src/lib/store/kinds/registrations.js";
import { Command } from "commander";
import { registerProjectionHooks } from "../../../../src/lib/store/projection/command-hooks.js";
import { materializeSpawnedProjection } from "../../../../src/lib/store/projection/spawn-materialization.js";
import { access, mkdtemp, mkdir, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createEngineFixture, configureEngineCheckout, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { OwnerIdentitySchema, RecordReferenceSchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { resolveWorktreeMarkerPath, writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { readProjectionConfiguration } from "../../../../src/lib/store/projection/configuration.js";
import { locateProjection } from "../../../../src/lib/store/projection/location.js";
import { bindProjectionRoot } from "../../../../src/lib/store/projection/engine-binding.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { startProjection } from "../../../../src/lib/store/projection/engine.js";
import { writeBackProjectionFiles } from "../../../../src/lib/store/projection/engine-files.js";
import { materializeProjectionRoot } from "../../../../src/lib/store/projection/materialization.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import type { ProjectionIndex } from "../../../../src/lib/store/projection/index-schema.js";
import type { ProjectionSource } from "../../../../src/lib/store/projection/record-source.js";
import { PERSONAL_NPM_IGNORE_CONTENT } from "../../../../src/lib/personal-npm-ignore.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { nameAsideFile, createStagedFile } from "../../../../src/lib/store/projection/aside.js";
import { commitProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { projectionSelectionResult } from "../../../../src/lib/store/projection/selection.js";
import { saveProjectionChanges } from "../../../../src/lib/store/projection/save-changed.js";
import { endProjection } from "../../../../src/lib/store/projection/engine.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { evidenceHeldProjectionMark, withheldProjectionMark } from "../../../../src/lib/store/projection/materialization-file.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function fixture() {
  beginProjectionCommand();
  const h = await createEngineFixture(directories, { kind: "work-item/notes", path: ".arc/active/current/notes-work-item-one.md",
    registryOverrides: { "cohort/document": { parser: createKindRegistry(PRODUCTION_REGISTRATIONS)["cohort/document"].parser } } });
  const primary = success(await h.store.read({ reference: recordReferences["work-item/meta"](h.record.reference.owner) }));
  await rm(resolveWorktreeMarkerPath(h.checkout));
  await h.exec("git", ["commit", "--allow-empty", "-m", "initial"], { cwd: h.checkout });
  const parent = await mkdtemp(join(tmpdir(), "arc-materialization-")); directories.push(parent);
  const checkout = join(parent, "target");
  await h.exec("git", ["worktree", "add", "-b", "materialized-target", checkout], { cwd: h.checkout });
  await configureEngineCheckout(checkout);
  await writeWorktreeMarker(checkout, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: new Date(0).toISOString(),
    createdFor: boundWorkUnitSubject(primary) });
  const ports = createProjectionEnginePorts(checkout);
  const location = await locateProjection(checkout, ports);
  const configuration = await readProjectionConfiguration(ports.exec, checkout);
  return { h, primary, checkout, ports, location, configuration };
}

async function materialize(target: Awaited<ReturnType<typeof fixture>>, options: { index?: ProjectionIndex | null; source?: ProjectionSource } = {}) {
  const source = options.source ?? target.h.store;
  const version = success(await source.version());
  return withProjectionLock(target.location, async session => {
    const root = await bindProjectionRoot({ ...target, store: target.h.store, actor: "andrew@fixture", history: createHistoryMemo(target.h.store), session, register: true });
    try { return await materializeProjectionRoot({ root, source, configuration: target.configuration, version, index: options.index ?? null }); }
    finally { root.checkpoint = null; }
  });
}

it("keeps incomplete materialization retryable while installing unrelated records", async () => {
  const target = await fixture();
  const first = await materialize(target);
  if (first.status !== "done") throw new Error("Initial materialization did not run");
  const personal = await seed(target.h, RecordReferenceSchema.parse({ kind: "personal/document",
    owner: { type: "person", name: "andrew" }, key: "scratch/independent.md" }), "Independent arrival.\n");
  const revised = target.h.record.content + "\nUpdated stored notes.\n";
  success(await target.h.store.write(update(target.h, target.h.record, revised)));
  const refusal = StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal", namespace: "refs/arc/project/work-items",
    condition: "Work-item inventory unavailable.", remedy: { text: "Repair the inventory and retry." } });
  const source = overrideEngineStore(target.h.store, { list: input => input.family === "work-item"
    ? Promise.resolve({ status: "refused", refusal }) : target.h.store.list(input) });
  const held = await materialize(target, { index: first.value.index, source });
  expect(held).toMatchObject({ status: "done", value: { index: { state: first.value.index.state } } });
  const notes = join(target.checkout, ".arc/active/current/notes-work-item-one.md");
  expect(parseStampedFile(await readFile(notes, "utf8")).content).toBe(target.h.record.content);
  expect(parseStampedFile(await readFile(join(target.checkout, ".arc/user/andrew/scratch/independent.md"), "utf8")).content).toBe(personal.content);
  if (held.status !== "done") throw new Error("Partial materialization did not run");
  const version = success(await target.h.store.version());
  expect(await materialize(target, { index: held.value.index })).toMatchObject({ status: "done", value: { index: { state: version } } });
  expect(parseStampedFile(await readFile(notes, "utf8")).content).toBe(revised);
  expect(success(await target.h.store.version())).toBe(version);
}, 60_000);

it("materializes a fresh linked worktree's stamped own files and scratch folder without changed marks", async () => {
  const target = await fixture();
  const version = success(await target.h.store.version());
  const result = await materialize(target);
  expect(projectionProcessState().roots.get(target.checkout)?.ready).toBe(true);
  expect(result).toMatchObject({ status: "done", value: { kind: "materialized", index: {
    state: version, projectedUnder: { identity: "andrew", claim: "work-item-one", layoutActive: "nested" },
    ignoreGuard: expect.any(Object), ignoreFiles: expect.any(Array),
  } } });
  if (result.status !== "done") throw new Error("Materialization did not run");
  for (const [path, record] of [[".arc/active/current/meta-work-item-one.md", target.primary],
    [".arc/active/current/notes-work-item-one.md", target.h.record]] as const) {
    expect(parseStampedFile(await readFile(join(target.checkout, path), "utf8"))).toMatchObject({ content: record.content,
      stamp: gitBlobId(record.content, "sha1") });
    expect(result.value.index.entries[path]).toMatchObject({ kind: "record", reference: record.reference, changed: false, pending: false });
  }
  expect((await stat(join(target.checkout, ".arc/user/andrew/scratch/work-unit/work-item-one"))).isDirectory()).toBe(true);
});

it("never creates the scratch folder through a linked ancestor", async () => {
  const target = await fixture();
  const outside = await mkdtemp(join(tmpdir(), "arc-scratch-outside-")); directories.push(outside);
  await mkdir(join(target.checkout, ".arc/user/andrew"), { recursive: true });
  await symlink(outside, join(target.checkout, ".arc/user/andrew/scratch"));
  expect(await materialize(target)).toMatchObject({ status: "done", value: { kind: "materialized" } });
  expect(await readdir(outside)).toEqual([]);
});


it.each([
  ["personal/inbox", ".arc/user/andrew/USER-INBOX.md", null],
  ["personal/working-memory", ".arc/user/andrew/WORKING-MEMORY.md", null],
  ["personal/document", ".arc/user/andrew/scratch/materialized.md", "scratch/materialized.md"],
  ["personal/session-context", ".arc/user/andrew/work-item-one/SESSION-NOTES.md", "work-item-one"],
] as const)("materializes %s through its canonical personal address", async (kind, path, key) => {
  const target = await fixture();
  const reference = RecordReferenceSchema.parse({ ...target.h.reference(kind), ...(key === null ? {} : { key }) });
  const record = await seed(target.h, reference);
  expect(await materialize(target)).toMatchObject({ status: "done", value: { kind: "materialized" } });
  expect(parseStampedFile(await readFile(join(target.checkout, path), "utf8"))).toMatchObject({ content: record.content,
    stamp: gitBlobId(record.content, "sha1") });
});


it("leaves an unmaterialized worktree retryable when its npm policy is missing and names committing that policy", async () => {
  const target = await fixture();
  const policy = join(target.checkout, ".arc/user/.npmignore");
  await rm(policy);
  const refused = await materialize(target);
  expect(refused).toMatchObject({ status: "done", value: { kind: "refused", mark: { remedy: { text: expect.stringContaining("commit") } } } });
  expect(await readProjectionIndex(target.location, true)).toMatchObject({ kind: "unusable", cause: "missing" });
  await writeFile(policy, PERSONAL_NPM_IGNORE_CONTENT);
  expect(await materialize(target)).toMatchObject({ status: "done", value: { kind: "materialized" } });
  expect(parseStampedFile(await readFile(join(target.checkout, ".arc/active/current/meta-work-item-one.md"), "utf8")).content).toBe(target.primary.content);
});


it("rebuilds an unedited file but withholds hand edits and unknown files until their deletion", async () => {
  const target = await fixture();
  expect(await materialize(target)).toMatchObject({ status: "done", value: { kind: "materialized" } });
  const notes = ".arc/active/current/notes-work-item-one.md";
  const unknown = ".arc/active/current/unclaimed.md";
  const edited = renderStampedFile({ content: target.h.record.content + "\nHand correction.\n", stamp: gitBlobId(target.h.record.content, "sha1") });
  await writeFile(join(target.checkout, notes), edited);
  await writeFile(join(target.checkout, unknown), "Unclaimed hand-written prose.\n");
  const revised = target.primary.content + "\nStore-side correction.\n";
  success(await target.h.store.write(update(target.h, target.primary, revised)));
  const version = success(await target.h.store.version());
  await rm(join(target.location.stateDir, "index"));
  const rebuilt = await materialize(target);
  // A file withheld on its record's basis at a path the rebuild lays is bound there, so whole evidence publishes the state.
  expect(rebuilt).toMatchObject({ status: "done", value: { kind: "materialized", index: { state: version, entries: {
    [notes]: { kind: "record", withheld: true, changed: true }, [unknown]: { kind: "ownerless", withheld: true },
  } } } });
  expect(await readFile(join(target.checkout, notes), "utf8")).toBe(edited);
  expect(await readFile(join(target.checkout, unknown), "utf8")).toBe("Unclaimed hand-written prose.\n");
  expect(parseStampedFile(await readFile(join(target.checkout, ".arc/active/current/meta-work-item-one.md"), "utf8")).content).toBe(revised);
  expect(success(await target.h.store.version())).toBe(version);
  if (rebuilt.status !== "done") throw new Error("Rebuild did not run");
  await rm(join(target.checkout, notes));
  await rm(join(target.checkout, unknown));
  const released = await materialize(target, { index: rebuilt.value.index });
  expect(released).toMatchObject({ status: "done", value: { index: { entries: { [notes]: { withheld: false } } } } });
  if (released.status !== "done") throw new Error("Release did not run");
  expect(released.value.index.entries[unknown]).toBeUndefined();
  expect(parseStampedFile(await readFile(join(target.checkout, notes), "utf8")).content).toBe(target.h.record.content);
});


const HELD = { notes: ".arc/active/current/notes-work-item-one.md", meta: ".arc/active/current/meta-work-item-one.md",
  unknown: ".arc/active/current/unclaimed.md", scratch: ".arc/user/andrew/scratch", arriving: ".arc/user/andrew/scratch/arriving.md" };

/** Rebuild a materialized worktree with no index while one family's listing is refused, after an optional preparation. */
async function heldRebuild(target: Awaited<ReturnType<typeof fixture>>,
  options: { prepare?: () => Promise<void>; family?: "work-item" | "personal" } = {}) {
  const family = options.family ?? "work-item";
  expect(await materialize(target)).toMatchObject({ status: "done", value: { kind: "materialized" } });
  await writeFile(join(target.checkout, HELD.unknown), "Unclaimed hand-written prose.\n");
  await options.prepare?.();
  const personal = await seed(target.h, RecordReferenceSchema.parse({ kind: "personal/document",
    owner: { type: "person", name: "andrew" }, key: "scratch/arriving.md" }), "Arriving personal note.\n");
  const version = success(await target.h.store.version());
  const refusal = StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal",
    namespace: family === "work-item" ? "refs/arc/project/work-items" : "refs/arc/user/andrew/personal",
    condition: "The inventory is unavailable.", remedy: { text: "Repair the inventory and retry." } });
  const source = overrideEngineStore(target.h.store, { list: input => input.family === family
    ? Promise.resolve({ status: "refused", refusal }) : target.h.store.list(input) });
  const published: (string | null)[] = [];
  const hooks = { afterRecheck: async () => {
    const disk = await readProjectionIndex(target.location, true, { groups: "all" });
    if (disk.kind === "index") published.push(disk.index.state);
  } };
  await rm(join(target.location.stateDir, "index"));
  const held = await materialize({ ...target, ports: { ...target.ports, hooks } }, { source });
  if (held.status !== "done") throw new Error("Held rebuild did not run");
  return { index: held.value.index, version, personal, published };
}

async function settledIndex(target: Awaited<ReturnType<typeof fixture>>): Promise<ProjectionIndex> {
  const disk = await readProjectionIndex(target.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Index disappeared");
  return disk.index;
}

it("holds files a no-index rebuild cannot place and settles them after a read-only repair", async () => {
  const target = await fixture();
  const { index, version, personal, published } = await heldRebuild(target);
  expect(published.length).toBeGreaterThan(0);
  expect(published.every(state => state === null)).toBe(true);
  expect(index.state).toBeNull();
  for (const path of [HELD.notes, HELD.meta, HELD.unknown]) {
    expect(index.entries[path]).toMatchObject({ kind: "ownerless", withheld: true, refused: evidenceHeldProjectionMark() });
  }
  expect(parseStampedFile(await readFile(join(target.checkout, HELD.arriving), "utf8")).content).toBe(personal.content);
  expect(await startProjection({ checkout: target.checkout, store: target.h.store })).toMatchObject({ kind: "ready" });
  const settled = await settledIndex(target);
  expect(settled.state).toBe(version);
  expect(settled.entries[HELD.notes]).toMatchObject({ kind: "record", withheld: false });
  expect(settled.entries[HELD.meta]).toMatchObject({ kind: "record", withheld: false });
  expect(settled.entries[HELD.unknown]).toMatchObject({ kind: "ownerless", withheld: true, refused: withheldProjectionMark() });
  expect(parseStampedFile(await readFile(join(target.checkout, HELD.notes), "utf8")).content).toBe(target.h.record.content);
  expect(success(await target.h.store.version())).toBe(version);
}, 60_000);

it("keeps the held mark through a materialization over the held index and settles the file at the next start", async () => {
  const target = await fixture();
  const { index } = await heldRebuild(target);
  const respawned = await materialize(target, { index });
  if (respawned.status !== "done") throw new Error("Materialization did not run");
  expect(respawned.value.index.entries[HELD.notes]).toMatchObject({ kind: "ownerless", withheld: true, refused: evidenceHeldProjectionMark() });
  expect(respawned.value.index.state).toBeNull();
  expect(await startProjection({ checkout: target.checkout, store: target.h.store })).toMatchObject({ kind: "ready" });
  expect((await settledIndex(target)).entries[HELD.notes]).toMatchObject({ kind: "record", withheld: false });
  expect(parseStampedFile(await readFile(join(target.checkout, HELD.notes), "utf8")).content).toBe(target.h.record.content);
}, 60_000);

it("gives held files at unplaced paths the ordinary mark once evidence is whole, though a link blocks a laid path", async () => {
  const target = await fixture();
  const outside = await mkdtemp(join(tmpdir(), "arc-scratch-outside-")); directories.push(outside);
  await heldRebuild(target, { prepare: async () => {
    await rm(join(target.checkout, HELD.scratch), { recursive: true, force: true });
    await symlink(outside, join(target.checkout, HELD.scratch));
  } });
  expect(await startProjection({ checkout: target.checkout, store: target.h.store })).toMatchObject({ kind: "ready" });
  const settled = await settledIndex(target);
  expect(settled.entries[HELD.notes]).toMatchObject({ kind: "record", withheld: false });
  expect(settled.entries[HELD.unknown]).toMatchObject({ kind: "ownerless", withheld: true, refused: withheldProjectionMark() });
  expect(settled.state).toBeNull();
  expect(await readdir(outside)).toEqual([]);
}, 60_000);

it("gives a held file the ordinary mark when a materialization over its index finds evidence whole", async () => {
  const target = await fixture();
  const { index, personal } = await heldRebuild(target, { family: "personal" });
  expect(index.entries[HELD.unknown]).toMatchObject({ kind: "ownerless", withheld: true, refused: evidenceHeldProjectionMark() });
  const respawned = await materialize(target, { index });
  if (respawned.status !== "done") throw new Error("Materialization did not run");
  expect(respawned.value.index.entries[HELD.unknown]).toMatchObject({ kind: "ownerless", withheld: true,
    refused: withheldProjectionMark() });
  expect(respawned.value.index.state).toBe(success(await target.h.store.version()));
  expect(parseStampedFile(await readFile(join(target.checkout, HELD.arriving), "utf8")).content).toBe(personal.content);
}, 60_000);

it("leaves an ordinarily withheld file untouched when a later rebuild lays a record at its path", async () => {
  const target = await fixture();
  await mkdir(join(target.checkout, HELD.scratch), { recursive: true });
  await writeFile(join(target.checkout, HELD.arriving), "Arriving personal note.\n");
  const first = await materialize(target);
  if (first.status !== "done") throw new Error("Materialization did not run");
  expect(first.value.index.entries[HELD.arriving]).toMatchObject({ kind: "ownerless", withheld: true, refused: withheldProjectionMark() });
  await seed(target.h, RecordReferenceSchema.parse({ kind: "personal/document",
    owner: { type: "person", name: "andrew" }, key: "scratch/arriving.md" }), "Arriving personal note.\n");
  await withProjectionLock(target.location, async session => {
    await commitProjectionIndex({ location: target.location, checkout: target.checkout, checkpoint: session.step,
      index: { ...first.value.index, state: null } });
  });
  expect(await startProjection({ checkout: target.checkout, store: target.h.store })).toMatchObject({ kind: "ready" });
  expect(await readFile(join(target.checkout, HELD.arriving), "utf8")).toBe("Arriving personal note.\n");
  expect((await settledIndex(target)).entries[HELD.arriving]).toMatchObject({ kind: "ownerless", withheld: true,
    refused: withheldProjectionMark() });
}, 60_000);

it("keeps an ownerless withheld file unsent at subsequent command starts and releases it after deletion", async () => {
  const target = await fixture();
  const path = ".arc/active/current/unclaimed.md";
  await mkdir(join(target.checkout, ".arc/active/current"), { recursive: true });
  await writeFile(join(target.checkout, path), "Unclaimed hand-written prose.\n");
  await materialize(target);
  const version = success(await target.h.store.version());
  expect(await startProjection({ checkout: target.checkout, store: target.h.store })).toMatchObject({ kind: "ready" });
  expect(success(await target.h.store.version())).toBe(version);
  const held = await readProjectionIndex(target.location, true, { groups: "all" });
  expect(held).toMatchObject({ kind: "index", index: { entries: { [path]: { kind: "ownerless", withheld: true } } } });
  await rm(join(target.checkout, path));
  await startProjection({ checkout: target.checkout, store: target.h.store });
  const released = await readProjectionIndex(target.location, true, { groups: "all" });
  if (released.kind !== "index") throw new Error("Index disappeared");
  expect(released.index.entries[path]).toBeUndefined();
});

it("lays a record arriving at an ordinarily withheld file's path once that file is deleted", async () => {
  const target = await fixture();
  const path = ".arc/user/andrew/scratch/arriving.md";
  await mkdir(join(target.checkout, ".arc/user/andrew/scratch"), { recursive: true });
  await writeFile(join(target.checkout, path), "Hand-written scratch note.\n");
  const first = await materialize(target);
  if (first.status !== "done") throw new Error("Materialization did not run");
  expect(first.value.index.entries[path]).toMatchObject({ kind: "ownerless", withheld: true, refused: withheldProjectionMark() });
  const personal = await seed(target.h, RecordReferenceSchema.parse({ kind: "personal/document",
    owner: { type: "person", name: "andrew" }, key: "scratch/arriving.md" }), "Arriving personal note.\n");
  const version = success(await target.h.store.version());
  expect(await startProjection({ checkout: target.checkout, store: target.h.store })).toMatchObject({ kind: "ready" });
  expect(await readFile(join(target.checkout, path), "utf8")).toBe("Hand-written scratch note.\n");
  const kept = await readProjectionIndex(target.location, true, { groups: "all" });
  if (kept.kind !== "index") throw new Error("Index disappeared");
  expect(kept.index.entries[path]).toMatchObject({ kind: "ownerless", withheld: true });
  expect(kept.index.state).not.toBe(version);
  await rm(join(target.checkout, path));
  expect(await startProjection({ checkout: target.checkout, store: target.h.store })).toMatchObject({ kind: "ready" });
  expect(parseStampedFile(await readFile(join(target.checkout, path), "utf8")).content).toBe(personal.content);
  const laid = await readProjectionIndex(target.location, true, { groups: "all" });
  if (laid.kind !== "index") throw new Error("Index disappeared");
  expect(laid.index.entries[path]).toMatchObject({ kind: "record", withheld: false });
  expect(laid.index.state).toBe(version);
}, 60_000);

it("marks a deleted bound withheld file pending when write-back observes its absence", async () => {
  const target = await fixture();
  const path = ".arc/active/current/notes-work-item-one.md";
  await mkdir(join(target.checkout, ".arc/active/current"), { recursive: true });
  await writeFile(join(target.checkout, path), "Hand correction with no trustworthy stamp.\n");
  const held = await materialize(target);
  if (held.status !== "done") throw new Error("Materialization did not run");
  expect(held.value.index.entries[path]).toMatchObject({ withheld: true });
  await rm(join(target.checkout, path));
  const result = await withProjectionLock(target.location, async session => {
    const root = await bindProjectionRoot({ ...target, store: target.h.store, actor: "andrew@fixture", history: createHistoryMemo(target.h.store), session, register: false });
    root.writable = () => true;
    try { return await writeBackProjectionFiles(root, held.value.index, []); }
    finally { root.checkpoint = null; }
  });
  expect(result).toMatchObject({ status: "done", value: { entries: { [path]: { withheld: false, pending: true, stat: null } } } });
});


it("materializes work-item companions, paired specs, inbound prose, and the project inbox at semantic paths", async () => {
  const target = await fixture();
  const owner = target.primary.reference.owner;
  const cases = [
    [recordReferences["work-item/task-list"](owner), ".arc/active/current/tasks-work-item-one.md"],
    [recordReferences["work-item/draft"](owner), ".arc/active/current/draft-work-item-one.md"],
    [recordReferences["work-item/spec"](owner), ".arc/active/current/spec-work-item-one.md"],
    [RecordReferenceSchema.parse({ kind: "work-item/companion", owner, key: "analysis" }), ".arc/active/current/analysis-work-item-one.md"],
    [RecordReferenceSchema.parse({ kind: "work-item/companion", owner, key: "spec-prd" }), ".arc/active/current/spec-work-item-one-prd.md"],
    [RecordReferenceSchema.parse({ kind: "work-item/companion", owner, key: "spec-rfc" }), ".arc/active/current/spec-work-item-one-rfc.md"],
    [recordReferences["work-item/inbound"](owner), ".arc/active/current/inbound-work-item-one.md"],
    [target.h.reference("project-inbox/inbox"), ".arc/backlog/ATOMIC-INBOX.md"],
  ] as const;
  const records = await Promise.all(cases.map(async ([reference, path]) => ({ record: await seed(target.h, reference), path })));
  await materialize(target);
  for (const { record, path } of records) expect(parseStampedFile(await readFile(join(target.checkout, path), "utf8")))
    .toMatchObject({ content: record.content, stamp: gitBlobId(record.content, "sha1") });
});


it.each(["claimed-missing", "unclaimed-unusable"] as const)("materializes %s at its first command", async scenario => {
  const target = await fixture();
  if (scenario === "unclaimed-unusable") {
    await rm(resolveWorktreeMarkerPath(target.checkout));
    await mkdir(target.location.stateDir, { recursive: true });
    await writeFile(join(target.location.stateDir, "index"), "broken index");
  }
  expect(await startProjection({ checkout: target.checkout, store: target.h.store })).toMatchObject({ kind: "ready" });
  const path = scenario === "claimed-missing" ? ".arc/active/current/meta-work-item-one.md"
    : ".arc/active/in-flight/work-item-one/meta-work-item-one.md";
  expect(parseStampedFile(await readFile(join(target.checkout, path), "utf8")).content).toBe(target.primary.content);
  expect(await readProjectionIndex(target.location, true)).toMatchObject({ kind: "index" });
});


it.each(["retained", "linked-back", "header-retained"] as const)("rebuilds with an aside copy %s without taking its bytes in", async scenario => {
  const target = await fixture();
  const first = await materialize(target);
  if (first.status !== "done") throw new Error("Materialization did not run");
  const path = ".arc/active/current/notes-work-item-one.md";
  const writer = { ...await target.ports.writer(), processInstance: "stopped-writer" };
  const copy = nameAsideFile({ path, base: gitBlobId(target.h.record.content, "sha1"), role: "aside", writer });
  const bytes = scenario === "header-retained" ? target.h.record.content : "Unsent copy holding a hand edit.\n";
  await createStagedFile(target.checkout, copy, bytes);
  if (scenario === "header-retained") {
    await withProjectionLock(target.location, async session => {
      await commitProjectionIndex({ location: target.location, checkout: target.checkout, checkpoint: session.step,
        index: { ...first.value.index, withheldCopies: [copy] } });
    });
    const header = JSON.parse(await readFile(join(target.location.stateDir, "index"), "utf8")) as { groups: Record<string, { name: string }> };
    const partition = Object.values(header.groups)[0];
    if (partition === undefined) throw new Error("Missing partition");
    await rm(join(target.location.stateDir, partition.name));
  } else await rm(join(target.location.stateDir, "index"));
  if (scenario === "linked-back") await rm(join(target.checkout, path));
  const version = success(await target.h.store.version());
  expect(await startProjection({ checkout: target.checkout, store: target.h.store })).toMatchObject({ kind: "ready" });
  expect(success(await target.h.store.version())).toBe(version);
  const rebuilt = await readProjectionIndex(target.location, true, { groups: "all" });
  if (rebuilt.kind !== "index") throw new Error("Missing rebuilt index");
  if (scenario === "linked-back") {
    expect(await readFile(join(target.checkout, path), "utf8")).toBe(bytes);
    expect(rebuilt.index.entries[path]).toMatchObject({ withheld: true, changed: true });
  } else {
    expect(await readFile(join(target.checkout, copy), "utf8")).toBe(bytes);
    expect(rebuilt.index.withheldCopies).toContain(copy);
    expect(projectionProcessState().diagnostics.some(each => each.copy === copy)).toBe(true);
  }
});


it.each(["same-identity", "missing-policy", "another-identity", "no-identity"] as const)("materializes a spawn under its own configuration: %s", async scenario => {
  const target = await fixture();
  const personal = recordReferences["personal/inbox"](OwnerIdentitySchema.parse({ type: "person", name: "bob" }));
  if (scenario === "missing-policy") await rm(join(target.checkout, ".arc/user/.npmignore"));
  if (scenario === "no-identity") {
    await target.h.exec("git", ["config", "extensions.worktreeConfig", "true"], { cwd: target.checkout });
    await target.h.exec("git", ["config", "--worktree", "arc.identity", "BAD ID"], { cwd: target.checkout });
  }
  if (scenario === "another-identity") {
    await target.h.exec("git", ["config", "extensions.worktreeConfig", "true"], { cwd: target.checkout });
    await target.h.exec("git", ["config", "--worktree", "arc.identity", "bob"], { cwd: target.checkout });
    target.h.identity("bob");
    await seed(target.h, personal);
    target.h.identity("andrew");
  }
  const output: string[] = [];
  const program = new Command("arc").exitOverride();
  program.command("spawn-probe").action(async () => { await materializeSpawnedProjection(target.checkout); output.push("spawn completed"); });
  registerProjectionHooks(program, { input: () => ({ store: target.h.store, checkout: target.h.checkout }), writeError: text => { output.push(text); } });
  await program.parseAsync(["spawn-probe"], { from: "user" });
  expect(output).toContain("spawn completed");
  const disk = await readProjectionIndex(target.location, true);
  if (scenario === "same-identity") {
    expect(disk).toMatchObject({ kind: "index", index: { ignoreGuard: expect.any(Object), ignoreFiles: expect.any(Array) } });
    expect(projectionProcessState().roots.get(target.checkout)).toMatchObject({ spawned: true, ready: true });
  } else {
    expect(disk).toMatchObject({ kind: "unusable", cause: "missing" });
    if (scenario === "missing-policy") {
      expect(output.join("\n")).toContain("commit");
      await writeFile(join(target.checkout, ".arc/user/.npmignore"), PERSONAL_NPM_IGNORE_CONTENT);
    } else if (scenario === "another-identity") target.h.identity("bob");
    else {
      expect(output).toEqual(["spawn completed"]);
      expect(await startProjection({ checkout: target.checkout, store: target.h.store })).toMatchObject({ kind: "skipped", skip: { reason: "no-identity" } });
      await target.h.exec("git", ["config", "--worktree", "arc.identity", "andrew"], { cwd: target.checkout });
    }
    expect(await startProjection({ checkout: target.checkout, store: target.h.store })).toMatchObject({ kind: "ready" });
    if (scenario === "another-identity") expect(parseStampedFile(await readFile(join(target.checkout, ".arc/user/bob/USER-INBOX.md"), "utf8")).stamp).not.toBeNull();
  }
});


it.each([false, true])("materializes a real backend Errand description with completed=%s", async completed => {
  const target = await createErrandAdoptionFixture({ completed });
  directories.push(target.f.root);
  await rm(join(target.projected.location.stateDir, "index"));
  const path = `${target.folder}/errand-alpha.md`;
  await rm(join(target.f.root, path));
  expect(await startProjection({ checkout: target.f.root, store: target.f.store })).toMatchObject({ kind: "ready" });
  expect(parseStampedFile(await readFile(join(target.f.root, path), "utf8"))).toMatchObject({ content: target.description.content,
    stamp: gitBlobId(target.description.content, "sha1") });
});

it("materializes cohort canonical documents and both copies named by its own metadata", async () => {
  const target = await fixture();
  success(await target.h.store.write(update(target.h, target.primary, makeMetaFixture("work-item-one", {
    owner: "andrew", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop", cohort: "parent/child" }))));
  const parent = await seed(target.h, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "parent" })), cohortDoc("parent").content);
  const child = await seed(target.h, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "child" })), cohortDoc("child", "parent").content);
  await materialize(target);
  for (const [path, record] of [
    [".arc/backlog/planned/parent/cohort-parent.md", parent],
    [".arc/backlog/planned/parent/child/cohort-child.md", child],
    [".arc/active/current/cohort-parent.md", parent],
    [".arc/active/current/cohort-child.md", child],
  ] as const) expect(parseStampedFile(await readFile(join(target.checkout, path), "utf8")).content).toBe(record.content);
});

it.each(["mine", "cohort", "all"])("isolates a spawned worktree's current files and exact %s in-flight view", async mode => {
  const target = await fixture();
  success(await target.h.store.write(update(target.h, target.primary, makeMetaFixture("work-item-one", {
    owner: "andrew", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop", cohort: "parent/child" }))));
  const cohorts = await Promise.all([
    seed(target.h, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "parent" })), cohortDoc("parent").content),
    seed(target.h, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "child" })), cohortDoc("child", "parent").content),
  ]);
  const ownFiles = [
    ["work-item/task-list", "tasks-work-item-one.md"],
    ["work-item/draft", "draft-work-item-one.md"],
    ["work-item/spec", "spec-work-item-one.md"],
    ["work-item/inbound", "inbound-work-item-one.md"],
  ] as const;
  await Promise.all(ownFiles.map(([kind]) => seed(target.h, recordReferences[kind](target.primary.reference.owner))));
  for (const [name, owner, cohort] of [
    ["owned-peer", "andrew", null], ["cohort-peer", "jane", "parent/child"],
    ["pinned-peer", "jane", null], ["outside-peer", "jane", null],
  ] as const) {
    const identity = OwnerIdentitySchema.parse({ type: "work-item", name });
    await seed(target.h, recordReferences["work-item/meta"](identity), makeMetaFixture(name, {
      owner, state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop", cohort }));
    await seed(target.h, recordReferences["work-item/notes"](identity), `Notes for ${name}.\n`);
  }
  await target.h.exec("git", ["config", "arc.inflightView", mode], { cwd: target.checkout });
  await target.h.exec("git", ["config", "--add", "arc.inflightPin", "pinned-peer"], { cwd: target.checkout });
  const configuration = await readProjectionConfiguration(target.ports.exec, target.checkout);
  expect(await materialize({ ...target, configuration })).toMatchObject({ status: "done", value: { kind: "materialized" } });

  const active = join(target.checkout, ".arc/active"), current = join(active, "current"), inFlight = join(active, "in-flight");
  expect((await readdir(active)).sort()).toEqual(["current", "in-flight"]);
  expect((await readdir(current)).sort()).toEqual([
    "meta-work-item-one.md", "notes-work-item-one.md", "cohort-parent.md", "cohort-child.md", ...ownFiles.map(([, name]) => name),
  ].sort());
  expect(parseStampedFile(await readFile(join(current, "notes-work-item-one.md"), "utf8")).content).toBe(target.h.record.content);
  for (const record of cohorts) expect(parseStampedFile(await readFile(join(current, `cohort-${record.reference.owner.name}.md`), "utf8")).content)
    .toBe(record.content);
  const selected = mode === "all" ? ["owned-peer", "cohort-peer", "pinned-peer", "outside-peer"]
    : [mode === "mine" ? "owned-peer" : "cohort-peer", "pinned-peer"];
  expect((await readdir(inFlight)).sort()).toEqual(selected.sort());
  for (const name of selected) expect((await readdir(join(inFlight, name))).sort()).toEqual([`meta-${name}.md`, `notes-${name}.md`]);
});


it("reports diagnostic-only records while materializing the healthy records returned beside them", async () => {
  const target = await fixture();
  const healthy = await seed(target.h, RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "healthy" } }),
    makeMetaFixture("healthy", { owner: "andrew", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }));
  target.h.plant(target.h.record.reference, "unknown-format-version");
  const listing = success(await target.h.store.list({ family: "work-item" }));
  if (listing.status !== "complete" || listing.diagnostics[0] === undefined) throw new Error("Missing listing diagnostic");
  const source = overrideEngineStore(target.h.store, { list: input => target.h.store.list({ ...input, asOf: undefined }) });
  await materialize(target, { source });
  expect(projectionProcessState().diagnostics.some(each => each.mark.reason === listing.diagnostics[0]?.condition)).toBe(true);
  await expect(readFile(join(target.checkout, ".arc/active/current/notes-work-item-one.md"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(parseStampedFile(await readFile(join(target.checkout, ".arc/active/in-flight/healthy/meta-healthy.md"), "utf8")).content).toBe(healthy.content);
  expect(parseStampedFile(await readFile(join(target.checkout, ".arc/active/current/meta-work-item-one.md"), "utf8")).content).toBe(target.primary.content);
});

it("shares one holder roster while rendering several work units entirely from its inventory", async () => {
  const target = await fixture();
  for (const name of ["second", "third"]) {
    const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } });
    const primary = await seed(target.h, reference, makeMetaFixture(name, { owner: "andrew", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }));
    await seed(target.h, recordReferences["work-item/task-list"](primary.reference.owner));
    const holder = join(target.checkout, "..", name);
    await target.h.exec("git", ["worktree", "add", "-b", `feat/${name}`, holder], { cwd: target.h.checkout });
    await writeWorktreeMarker(holder, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: new Date(0).toISOString(), createdFor: boundWorkUnitSubject(primary) });
  }
  const native = target.h.store;
  let metaReads = 0, rosters = 0;
  target.h.store = overrideEngineStore(native, { read: async input => {
    if (input.reference.kind === "work-item/meta") metaReads++;
    return native.read(input);
  } });
  const exec = target.ports.exec;
  target.ports = { ...target.ports, exec: async (command, args, options) => {
    if (args[0] === "worktree" && args[1] === "list") rosters++;
    return exec(command, args, options);
  } };
  await materialize(target);
  for (const name of ["second", "third"]) expect(await readFile(join(target.checkout, `.arc/active/in-flight/${name}/meta-${name}.md`), "utf8")).toContain("DO NOT EDIT");
  expect({ metaReads, rosters }).toEqual({ metaReads: 0, rosters: 1 });
});


it.each(["scratch/.internal/machine.md", "scratch/.DS_Store"])("leaves excluded stored and local bytes alone at %s", async key => {
  const target = await fixture();
  const record = key.includes(".internal") ? null : await seed(target.h, RecordReferenceSchema.parse({ ...target.h.reference("personal/document"), key }));
  const path = `.arc/user/andrew/${key}`;
  await mkdir(join(target.checkout, path, ".."), { recursive: true });
  await writeFile(join(target.checkout, path), "Machine-local content.\n");
  const result = await materialize(target);
  expect(await readFile(join(target.checkout, path), "utf8")).toBe("Machine-local content.\n");
  if (record !== null) expect(success(await target.h.store.read({ reference: record.reference })).content).toBe(record.content);
  if (result.status !== "done") throw new Error("Materialization did not run");
  expect(result.value.index.entries[path]).toBeUndefined();
});

it("selects every editable rebuilt Markdown file as changed until save accepts its anchor", async () => {
  const target = await fixture();
  await materialize(target);
  await rm(join(target.location.stateDir, "index"));
  await startProjection({ checkout: target.checkout, store: target.h.store });
  const selected = await projectionSelectionResult(target.h.store, target.checkout, { changed: true });
  expect(selected).toEqual({ status: "ok", result: { paths: [".arc/active/current/meta-work-item-one.md", ".arc/active/current/notes-work-item-one.md"] } });
  await endProjection({ checkout: target.checkout, store: target.h.store });
  expect(await saveProjectionChanges(target.h.store)).toMatchObject({ status: "ok" });
  expect(await projectionSelectionResult(target.h.store, target.checkout, { changed: true })).toEqual({ status: "ok", result: { paths: [] } });
});


it.each(["unbound", "before-flip"] as const)("leaves a spawn dark when its materialize port is %s", async scenario => {
  const target = await fixture();
  if (scenario === "unbound") await materializeSpawnedProjection(target.checkout);
  else {
    const store = overrideEngineStore(target.h.store, { capabilities: { ...target.h.store.capabilities, stateOffBranch: false } });
    const program = new Command("arc").exitOverride();
    program.command("spawn-probe").action(() => materializeSpawnedProjection(target.checkout));
    registerProjectionHooks(program, { input: () => ({ store, checkout: target.h.checkout }), writeError: () => undefined });
    await program.parseAsync(["spawn-probe"], { from: "user" });
  }
  expect(await readProjectionIndex(target.location, true)).toMatchObject({ kind: "unusable", cause: "missing" });
  expect(projectionProcessState().diagnostics).toEqual([]);
  expect(projectionProcessState().roots.size).toBe(0);
});

it("leaves a later spawn dark after its command's materialize port expires", async () => {
  const target = await fixture();
  const program = new Command("arc").exitOverride();
  program.command("probe").action(() => undefined);
  registerProjectionHooks(program, { input: () => ({ store: target.h.store, checkout: target.h.checkout }), writeError: () => undefined });
  await program.parseAsync(["probe"], { from: "user" });
  await materializeSpawnedProjection(target.checkout);
  expect(await readProjectionIndex(target.location, true)).toMatchObject({ kind: "unusable", cause: "missing" });
  expect(projectionProcessState().roots.has(target.checkout)).toBe(false);
});


it("advances an existing index's state after laying a full newer inventory", async () => {
  const target = await fixture();
  const first = await materialize(target);
  if (first.status !== "done") throw new Error("Materialization did not run");
  const changed = target.h.record.content + "\nNew stored note.\n";
  success(await target.h.store.write(update(target.h, target.h.record, changed)));
  const version = success(await target.h.store.version());
  const result = await materialize(target, { index: first.value.index });
  expect(result).toMatchObject({ status: "done", value: { index: { state: version } } });
  expect(parseStampedFile(await readFile(join(target.checkout, ".arc/active/current/notes-work-item-one.md"), "utf8")).content).toBe(changed);
});


it("advances its state past a stored record whose path names an excluded side file it never lays", async () => {
  const target = await fixture();
  const side = await seed(target.h, RecordReferenceSchema.parse({ kind: "personal/document",
    owner: { type: "person", name: "andrew" }, key: "scratch/notes.md~" }), "An editor backup stored as a record.\n");
  const version = success(await target.h.store.version());
  expect(await materialize(target)).toMatchObject({ status: "done", value: { index: { state: version } } });
  await expect(access(join(target.checkout, ".arc/user/andrew/scratch/notes.md~"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(success(await target.h.store.read({ reference: side.reference })).content).toBe(side.content);
});

it("settles copies from both materializations when a spawn binds its root twice", async () => {
  const target = await fixture();
  const path = ".arc/active/current/notes-work-item-one.md";
  await mkdir(join(target.checkout, path, ".."), { recursive: true });
  await writeFile(join(target.checkout, path), renderStampedFile({ content: target.h.record.content, stamp: gitBlobId(target.h.record.content, "sha1") }));
  let firstCopy: string | undefined;
  const program = new Command("arc").exitOverride();
  program.command("spawn-probe").action(async () => {
    await materializeSpawnedProjection(target.checkout);
    firstCopy = projectionProcessState().roots.get(target.checkout)?.copies[0]?.copy;
    expect(firstCopy).toBeDefined();
    await materializeSpawnedProjection(target.checkout);
  });
  registerProjectionHooks(program, { input: () => ({ store: target.h.store, checkout: target.h.checkout }), writeError: () => undefined });
  await program.parseAsync(["spawn-probe"], { from: "user" });
  if (firstCopy === undefined) throw new Error("Missing first replacement copy");
  await expect(readFile(join(target.checkout, firstCopy))).rejects.toMatchObject({ code: "ENOENT" });
});
