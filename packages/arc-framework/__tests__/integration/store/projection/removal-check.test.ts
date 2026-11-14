/** Retirement feasibility reads the target checkout without granting mutation authority. */
import { access, link, mkdir, mkdtemp, readFile, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, onTestFinished } from "vitest";
import { ArchiveQuarterSchema, SlugSchema } from "../../../../src/lib/kernel/index.js";
import { checkProjectionRemoval } from "../../../../src/lib/store/projection/removal-check.js";
import { persistProjectionRemoval } from "../../../../src/lib/store/projection/removal-persist.js";
import { releaseProjectionRemoval } from "../../../../src/lib/store/projection/removal-release.js";
import { PROJECTION_INDEX_FILE, readProjectionIndex, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { PROJECTION_LOCK_FILE, withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { resolveWorktreeMarkerPath, writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { writeMetaOwner } from "../../../../src/lib/store/kinds/meta/writers.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { configureEngineCheckout, createEngineFixture, initializeEngineCheckout, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { createMarkerFixture } from "../../../helpers/store/projection/marker-fixture.js";
import { createWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { createRefFixture } from "../../../helpers/store/ref-fixture.js";
import { createKindRegistry } from "../../../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../src/lib/store/kinds/registrations.js";
import type { ProjectionIndex, RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import { checkSerializationRules } from "../../../../src/lib/store/serialization.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { stageRecordFile } from "../../../../src/lib/store/projection/staging.js";
import { createRecordRenderer } from "../../../../src/lib/store/projection/record-render.js";
import { guardReplacement } from "../../../../src/lib/store/projection/replace-guard.js";
import { readReference } from "../../../../src/lib/store/projection/change-detection.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";
import { recordWriteBack, TAKEN_IN_FOLDER } from "../../../../src/lib/store/projection/taken-in.js";
import { projectionEntryForRecord } from "../../../../src/lib/store/projection/materialization-file.js";
import { prepareWriteBack } from "../../../../src/lib/store/projection/write-back.js";
import { swapBatch } from "../../../../src/lib/store/projection/swap.js";
import { createStagedFile, nameAsideFile, parseAsideFile } from "../../../../src/lib/store/projection/aside.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function targetCheckout(path?: string) {
  beginProjectionCommand();
  const h = await createEngineFixture(directories, { path, registryOverrides: { "work-item/meta": { parser: META_REGISTRATION.parser } } });
  await h.exec("git", ["commit", "--allow-empty", "-m", "initial"], { cwd: h.checkout });
  const parent = await mkdtemp(join(tmpdir(), "arc-projection-removal-")); directories.push(parent);
  const checkout = join(parent, "target");
  await h.exec("git", ["worktree", "add", "-b", "target", checkout], { cwd: h.checkout });
  const projected = await seedProjection({ store: h.store, checkout, files: [{ path: h.path, reference: h.record.reference }] });
  await configureEngineCheckout(checkout);
  const primary = await seed(h, h.reference("work-item/meta", "target"), makeMetaFixture("work-item-target", {
    owner: "andrew", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop",
  }));
  await writeWorktreeMarker(checkout, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-11-11T00:00:00Z",
    createdFor: boundWorkUnitSubject(primary) });
  return { h, ...projected, primary, context: { store: h.store, identity: SlugSchema.parse("andrew"), ports: h.ports } };
}

async function foreignMetadata(target: Awaited<ReturnType<typeof targetCheckout>>) {
  const foreign = await seed(target.h, target.h.reference("work-item/meta", "foreign"), makeMetaFixture("work-item-foreign", {
    owner: "andrew", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop",
  }));
  const path = ".arc/active/in-flight/meta-work-item-foreign.md";
  await rm(join(target.checkout, target.h.path));
  const projected = await seedProjection({ store: target.h.store, checkout: target.checkout, files: [
    { path: target.h.path, reference: target.h.record.reference }, { path, reference: foreign.reference },
  ] });
  const entry = projected.index.entries[path];
  if (entry?.kind !== "record") throw new Error("Missing protected fixture entry");
  return { foreign, path, entry, original: await readFile(join(target.checkout, path)) };
}

async function unfinishedRecording() {
  const target = await targetCheckout();
  const initial = { checkout: target.checkout, store: target.h.store, ports: target.h.ports, mode: "save" as const };
  expect(await startProjection(initial)).toMatchObject({ kind: "ready" });
  await endProjection(initial);
  const entry = target.index.entries[target.h.path];
  if (entry?.kind !== "record") throw new Error("Missing fixture entry");
  await writeFile(join(target.checkout, target.h.path), renderStampedFile({ content: "Accepted input awaiting its recording.\n", stamp: entry.base.blob }));
  const refusing = createRefusingStore(target.h.store);
  let blocked = true;
  const store = overrideEngineStore(refusing.store, { batch: async input => {
    const result = await target.h.store.batch(input);
    if (blocked && result.status === "ok") refusing.refuse("read", { code: "state-unresolvable", class: "recoverable", historyRefs: [],
      condition: "Read-back is temporarily unavailable.", remedy: { text: "Repair the read-back and retry arc save." } });
    return result;
  } });
  const command = { ...initial, store };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  expect(await readProjectionIndex(target.location, true, { groups: "all" })).toMatchObject({ kind: "index", index: {
    entries: { [target.h.path]: { persisted: { recording: true } } },
  } });
  return { target, command, repair: () => { blocked = false; refusing.refuse("read", null); } };
}

async function pendingAdoption() {
  const target = await targetCheckout();
  const command = { checkout: target.checkout, store: target.h.store, ports: target.h.ports, mode: "save" as const };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  const path = ".arc/user/andrew/scratch/pending-adoption.md";
  await writeFile(join(target.checkout, path), "Accepted prose awaiting its stamped installation.\n");
  const ignores = await readFile(join(target.checkout, ".gitignore"));
  await writeFile(join(target.checkout, ".gitignore"), "");
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  const disk = await readProjectionIndex(target.location, true, { groups: "all" });
  const entry = disk.kind === "index" ? disk.index.entries[path] : undefined;
  if (entry?.kind !== "record") throw new Error("Missing accepted adoption");
  expect(entry.adoption?.kind).toBe("read-back");
  expect(entry.persisted?.recording).not.toBe(true);
  return { target, command, path, ignores };
}

async function interruptedCopy(extension: "md" | "txt" = "md") {
  const target = await targetCheckout(`.arc/user/andrew/scratch/one.${extension}`);
  const entry = target.index.entries[target.h.path];
  if (entry?.kind !== "record") throw new Error("Missing copy fixture entry");
  success(await target.h.store.write(update(target.h, target.h.record, "opening\nrefreshed\nclosing\n")));
  return interruptedReplacement(target, target.index, entry);
}

async function interruptedReplacement(target: Awaited<ReturnType<typeof targetCheckout>>, index: ProjectionIndex, entry: RecordEntry) {
  const record = success(await target.h.store.read({ reference: entry.reference }));
  const renderer = createRecordRenderer({ store: target.h.store });
  const writer = { pid: process.pid, processInstance: "interrupted-swap", processScope: "removal-copy-tests" };
  const takeIn = async (request: import("../../../../src/lib/store/projection/take-in-port.js").TakeInRequest) => ({ answer: "deferred" as const, entry: request.entry });
  const staged = success(await stageRecordFile({ checkout: target.checkout, path: target.h.path, record,
    replacing: entry.base.blob, writer, format: "sha1", renderer }));
  const replace = await guardReplacement({ checkout: target.checkout, path: target.h.path, entry, staged,
    reference: await readReference(target.checkout), format: "sha1", store: target.h.store, writer, renderer, takeIn });
  if (replace.kind !== "replace") throw new Error("Copy fixture replacement refused");
  const stop = new Error("stop after copy move");
  await expect(swapBatch({ checkout: target.checkout, location: target.location, index,
    files: [{ path: target.h.path, replace }], writer, format: "sha1", readBack: false, takeIn,
    hooks: { afterMove: async () => { throw stop; } } })).rejects.toBe(stop);
  const disk = await readProjectionIndex(target.location, true, { groups: "all" });
  const current = disk.kind === "index" ? disk.index.entries[target.h.path] : undefined;
  if (current?.kind !== "record" || current.copies[0] === undefined) throw new Error("No interrupted swap copy");
  return { target, entry: current, copy: current.copies[0], staged };
}

async function retainedInput(extension: "md" | "txt") {
  const target = await targetCheckout(`.arc/user/andrew/scratch/one.${extension}`);
  const entry = target.index.entries[target.h.path];
  if (entry?.kind !== "record") throw new Error("No retained input fixture entry");
  const takenIn = "opening\naccepted\nclosing\n";
  success(await target.h.store.write(update(target.h, target.h.record, takenIn)));
  const accepted = success(await target.h.store.read({ reference: entry.reference }));
  success(await target.h.store.write(update(target.h, accepted, `${takenIn}concurrent\n`)));
  const current = success(await target.h.store.read({ reference: entry.reference }));
  const recorded = await recordWriteBack({ location: target.location, entry, stamp: entry.base.blob, takenIn,
    outcome: { kind: "landed", version: accepted.version }, readBack: current, grammar: undefined, format: "sha1",
    memo: createHistoryMemo(target.h.store) });
  const kept = recorded.entry.persisted?.takenIn;
  if (kept?.kind !== "copy") throw new Error("The accepted input was not retained");
  const refreshed = { ...projectionEntryForRecord(current, target.h.path, "sha1"), persisted: recorded.entry.persisted };
  await writeProjectionIndex(target.location, { ...target.index, entries: { ...target.index.entries, [target.h.path]: refreshed } });
  const content = current.content.replace("opening", "edited opening");
  await writeFile(join(target.checkout, target.h.path), extension === "md" ? renderStampedFile({ content, stamp: entry.base.blob }) : content);
  return { target, recorded: refreshed, current, kept, content };
}

it("keeps a claimed checkout with a missing index unobservable until a command rebuilds it", async () => {
  const target = await targetCheckout();
  await rm(join(target.location.stateDir, PROJECTION_INDEX_FILE));
  const refused = await checkProjectionRemoval(target.checkout, target.context);
  expect(refused).toMatchObject({ kind: "unobservable", detail: expect.stringContaining(target.checkout) });
  const command = { checkout: target.checkout, store: target.h.store, ports: target.h.ports };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("holds a projected checkout without an identity until its own configuration is repaired", async () => {
  const target = await targetCheckout();
  await target.h.exec("git", ["config", "arc.identity", "Invalid Identity"], { cwd: target.checkout });
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({
    kind: "would-refuse", remedy: { text: expect.stringContaining("arc.identity") },
  });
  await target.h.exec("git", ["config", "arc.identity", "andrew"], { cwd: target.checkout });
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("requires observing a different target identity from its own checkout", async () => {
  const target = await targetCheckout();
  await target.h.exec("git", ["config", "arc.identity", "blair"], { cwd: target.checkout });
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({
    kind: "unobservable", detail: expect.stringContaining(target.checkout),
  });
  await target.h.exec("git", ["config", "arc.identity", "andrew"], { cwd: target.checkout });
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("keeps a malformed target marker unobservable until it is repaired", async () => {
  const target = await targetCheckout();
  const marker = resolveWorktreeMarkerPath(target.checkout);
  const original = await readFile(marker);
  await writeFile(marker, "malformed marker\n");
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "unobservable" });
  await writeFile(marker, original);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("refuses a newly edited protected file and passes once its content is restored", async () => {
  const target = await targetCheckout();
  const { foreign, path, entry, original } = await foreignMetadata(target);
  await writeFile(join(target.checkout, path), renderStampedFile({ content: foreign.content + "\nHand correction.\n", stamp: entry.base.blob }));
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({
    kind: "would-refuse", remedy: { text: expect.stringContaining("work-item-foreign") },
  });
  await writeFile(join(target.checkout, path), original);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("admits a valid edit while another lease is held without sending or changing local authority", async () => {
  const target = await targetCheckout();
  const entry = target.index.entries[target.h.path];
  if (entry?.kind !== "record") throw new Error("Missing fixture entry");
  const bytes = renderStampedFile({ content: "A valid unsent edit.\n", stamp: entry.base.blob });
  await writeFile(join(target.checkout, target.h.path), bytes);
  const index = await readFile(join(target.location.stateDir, PROJECTION_INDEX_FILE));
  const version = success(await target.h.store.version());
  const roots = [...projectionProcessState().roots];
  const forbidden = async (): Promise<never> => { throw new Error("A check cannot create mutation authority"); };
  const observed = await withProjectionLock(target.location, async () => {
    const lock = await readFile(join(target.location.stateDir, PROJECTION_LOCK_FILE));
    expect(await checkProjectionRemoval(target.checkout, { ...target.context,
      ports: () => ({ ...target.h.ports(), actor: forbidden, writer: forbidden, maxWaitMs: 1 }),
    })).toEqual({ kind: "passes" });
    expect(await readFile(join(target.location.stateDir, PROJECTION_LOCK_FILE))).toEqual(lock);
  });
  expect(observed.status).toBe("done");
  expect(success(await target.h.store.version())).toBe(version);
  expect(await readFile(join(target.checkout, target.h.path), "utf8")).toBe(bytes);
  expect(await readFile(join(target.location.stateDir, PROJECTION_INDEX_FILE))).toEqual(index);
  expect([...projectionProcessState().roots]).toEqual(roots);
  await expect(access(join(target.location.commonDir, "arc/user/andrew/.internal/.machine-id"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("keeps a store read refused during admission unobservable and succeeds after the read is repaired", async () => {
  const target = await targetCheckout();
  const entry = target.index.entries[target.h.path];
  if (entry?.kind !== "record") throw new Error("Missing fixture entry");
  await writeFile(join(target.checkout, target.h.path), renderStampedFile({ content: "A valid edit awaiting admission.\n", stamp: entry.base.blob }));
  const refusing = createRefusingStore(target.h.store);
  let fail = true;
  const context = { ...target.context, store: refusing.store, ports: () => {
    const ports = target.h.ports();
    let configurations = 0;
    return { ...ports, exec: async (...args: Parameters<typeof ports.exec>) => {
      const result = await ports.exec(...args);
      if (args[1][0] === "config" && ++configurations === 2 && fail) refusing.refuse("read", {
        code: "state-unresolvable", class: "recoverable", historyRefs: [], condition: "Admission's store evidence is unavailable.",
        remedy: { text: "Restore the missing Store evidence, then retry the check." },
      });
      return result;
    } };
  } };
  expect(await checkProjectionRemoval(target.checkout, context)).toEqual({
    kind: "unobservable", detail: "Restore the missing Store evidence, then retry the check.",
  });
  fail = false;
  refusing.refuse("read", null);
  expect(await checkProjectionRemoval(target.checkout, context)).toEqual({ kind: "passes" });
});

it("retains a failed filesystem observation as unobservable and succeeds after repair", async () => {
  const target = await targetCheckout();
  let unreadable = true;
  const context = { ...target.context, ports: () => ({ ...target.h.ports(), walkFs: { readdir: (path: string) => {
    if (unreadable) throw Object.assign(new Error("The projected folder cannot be read."), { code: "EACCES" });
    return readdirSync(path, { withFileTypes: true });
  } } }) };
  expect(await checkProjectionRemoval(target.checkout, context)).toMatchObject({
    kind: "unobservable", detail: expect.stringContaining("The projected folder cannot be read."),
  });
  unreadable = false;
  expect(await checkProjectionRemoval(target.checkout, context)).toEqual({ kind: "passes" });
});

it.each(["state-unresolvable", "namespace-corrupt", "identity-mismatch"] as const)("keeps a rights read's %s unobservable instead of treating it as protection", async code => {
  const target = await targetCheckout();
  const { foreign, path, entry } = await foreignMetadata(target);
  await writeFile(join(target.checkout, path), renderStampedFile({ content: foreign.content + "\nHand correction.\n", stamp: entry.base.blob }));
  const refusing = createRefusingStore(target.h.store);
  const refusal = code === "namespace-corrupt" ? { code, class: "terminal", namespace: foreign.reference.owner.name }
    : code === "identity-mismatch" ? { code, class: "recoverable", expected: foreign.reference, actual: target.primary.reference }
    : { code, class: "recoverable", historyRefs: [] };
  refusing.refuse("read", StoreRefusalSchema.parse({ ...refusal,
    condition: "The rights record cannot be read.", remedy: { text: "Restore the rights evidence, then retry." } }));
  expect(await checkProjectionRemoval(target.checkout, { ...target.context, store: refusing.store })).toEqual({
    kind: "unobservable", detail: "Restore the rights evidence, then retry.",
  });
  refusing.refuse("read", null);
  expect(await checkProjectionRemoval(target.checkout, { ...target.context, store: refusing.store })).toMatchObject({ kind: "would-refuse" });
  await writeFile(join(target.checkout, path), renderStampedFile({ content: foreign.content, stamp: entry.base.blob }));
  expect(await checkProjectionRemoval(target.checkout, { ...target.context, store: refusing.store })).toEqual({ kind: "passes" });
});

it("checks a previous identity's files and passes after revert or save under that identity", async () => {
  const target = await targetCheckout();
  target.h.identity("blair");
  const foreign = await seed(target.h, RecordReferenceSchema.parse({ ...target.h.reference("personal/document"),
    owner: { type: "person", name: "blair" }, key: "scratch/previous.md" }), "Previous identity's prose.\n");
  const path = ".arc/user/blair/scratch/previous.md";
  const projected = await seedProjection({ store: target.h.store, checkout: target.checkout, identity: SlugSchema.parse("blair"),
    files: [{ path, reference: foreign.reference }] });
  target.h.identity("andrew");
  const entry = projected.index.entries[path];
  if (entry?.kind !== "record") throw new Error("Missing previous-identity entry");
  const original = await readFile(join(target.checkout, path));
  await writeFile(join(target.checkout, path), renderStampedFile({ content: "Still unsent under the former identity.\n", stamp: entry.base.blob }));
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({
    kind: "would-refuse", remedy: { text: expect.stringContaining("blair") },
  });
  await writeFile(join(target.checkout, path), original);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
  await writeFile(join(target.checkout, path), renderStampedFile({ content: "Saved under the previous identity.\n", stamp: entry.base.blob }));
  await target.h.exec("git", ["config", "arc.identity", "blair"], { cwd: target.checkout });
  target.h.identity("blair");
  const command = { checkout: target.checkout, store: target.h.store, ports: target.h.ports, mode: "save" as const };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  expect(success(await target.h.store.read({ reference: foreign.reference })).content).toContain("Saved under the previous identity.");
  target.h.identity("andrew");
  await target.h.exec("git", ["config", "arc.identity", "andrew"], { cwd: target.checkout });
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("holds a file withheld by a real index rebuild until its bytes are copied out and deleted", async () => {
  const target = await targetCheckout();
  await writeFile(join(target.checkout, target.h.path), "Unstamped bytes kept through a rebuild.\n");
  await rm(join(target.location.stateDir, PROJECTION_INDEX_FILE));
  const command = { checkout: target.checkout, store: target.h.store, ports: target.h.ports };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  expect(await readProjectionIndex(target.location, true, { groups: "all" })).toMatchObject({ kind: "index", index: {
    entries: { [target.h.path]: { withheld: true } },
  } });
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({
    kind: "would-refuse", remedy: { text: expect.stringContaining("delete") },
  });
  await rm(join(target.checkout, target.h.path));
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("holds a file a no-index rebuild could not place under its held remedy and passes once a repaired start settles it", async () => {
  const target = await targetCheckout();
  await rm(join(target.location.stateDir, PROJECTION_INDEX_FILE));
  const refusal = StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal", namespace: "refs/arc/personal/andrew",
    condition: "Personal inventory unavailable.", remedy: { text: "Repair the inventory and retry." } });
  const held = { checkout: target.checkout, ports: target.h.ports, store: overrideEngineStore(target.h.store, {
    list: input => input.family === "personal" ? Promise.resolve({ status: "refused", refusal }) : target.h.store.list(input) }) };
  expect(await startProjection(held)).toMatchObject({ kind: "ready" });
  await endProjection(held);
  expect(await readProjectionIndex(target.location, true, { groups: "all" })).toMatchObject({ kind: "index", index: {
    state: null, entries: { [target.h.path]: { kind: "ownerless", withheld: true } } } });
  const remedy = { text: expect.stringContaining("run any arc command from the checkout holding this file") };
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "would-refuse", remedy });
  expect(await persistProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "refused" });
  const repaired = { checkout: target.checkout, store: target.h.store, ports: target.h.ports };
  expect(await startProjection(repaired)).toMatchObject({ kind: "ready" });
  await endProjection(repaired);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
}, 60_000);

it("holds unfinished accepted-input recording locally until a save-mode command finishes it", async () => {
  const { target, command, repair } = await unfinishedRecording();
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({
    kind: "would-refuse", remedy: { text: expect.stringContaining("arc save") },
  });
  const original = target.index.entries[target.h.path];
  if (original?.kind !== "record") throw new Error("Missing original fixture entry");
  await writeFile(join(target.checkout, target.h.path), renderStampedFile({ content: target.h.record.content, stamp: original.base.blob }));
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({
    kind: "would-refuse", remedy: { text: expect.stringContaining("arc save") },
  });
  repair();
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("passes an unfinished write-back recording whose accepted file has since been deleted", async () => {
  const { target } = await unfinishedRecording();
  await rm(join(target.checkout, target.h.path));
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("treats authority changed before admission as a local conflict and passes after authority is restored", async () => {
  const target = await targetCheckout();
  const path = ".arc/active/current/meta-work-item-target.md";
  await rm(join(target.checkout, target.h.path));
  const projected = await seedProjection({ store: target.h.store, checkout: target.checkout, files: [
    { path: target.h.path, reference: target.h.record.reference }, { path, reference: target.primary.reference },
  ] });
  const entry = projected.index.entries[path];
  if (entry?.kind !== "record") throw new Error("Missing claimed metadata");
  await writeFile(join(target.checkout, path), renderStampedFile({ content: target.primary.content + "\nLocal correction.\n", stamp: entry.base.blob }));
  let change = true;
  const context = { ...target.context, ports: () => {
    const ports = target.h.ports();
    let configurations = 0;
    return { ...ports, exec: async (...args: Parameters<typeof ports.exec>) => {
      const result = await ports.exec(...args);
      if (args[1][0] === "config" && ++configurations === 2 && change) success(await target.h.store.write({
        ...update(target.h, target.primary, writeMetaOwner(target.primary.content, SlugSchema.parse("blair"))),
        provenance: { verb: "handover", lifecycleAction: "handover" },
      }));
      return result;
    } };
  } };
  expect(await checkProjectionRemoval(target.checkout, context)).toMatchObject({
    kind: "would-refuse", remedy: { text: expect.stringContaining("prepare") },
  });
  change = false;
  const changed = success(await target.h.store.read({ reference: target.primary.reference }));
  target.h.identity("blair");
  success(await target.h.store.write({ ...update(target.h, changed, target.primary.content), provenance: { verb: "handover", lifecycleAction: "handover" } }));
  target.h.identity("andrew");
  expect(await checkProjectionRemoval(target.checkout, context)).toEqual({ kind: "passes" });
});

it("refuses an unindexed file in another identity's personal root until it is removed", async () => {
  const target = await targetCheckout();
  const folder = join(target.checkout, ".arc/user/blair/scratch");
  await mkdir(folder, { recursive: true });
  const path = join(folder, "unindexed.md");
  await writeFile(path, "Prose that belongs to the other identity.\n");
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({
    kind: "would-refuse", remedy: { text: expect.stringContaining("blair") },
  });
  await rm(path);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

/** A command records the ignore proof every live checkout carries, so a check's guard read needs no fresh pass. */
async function recordIgnoreProof(target: Awaited<ReturnType<typeof targetCheckout>>): Promise<ProjectionIndex> {
  const command = { checkout: target.checkout, store: target.h.store, ports: target.h.ports, mode: "save" as const };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  const disk = await readProjectionIndex(target.location, true, { groups: "all" });
  if (disk.kind !== "index" || disk.index.ignoreGuard === null) throw new Error("No recorded ignore proof");
  return disk.index;
}

it("checks an unindexed existing record through its read path without capturing an unpublished attachment", async () => {
  const target = await targetCheckout();
  const entry = target.index.entries[target.h.path];
  if (entry?.kind !== "record") throw new Error("Missing fixture entry");
  await writeProjectionIndex(target.location, { ...await recordIgnoreProof(target), entries: {} });
  const bytes = renderStampedFile({ content: "A valid edit to an existing unindexed record.\n", stamp: entry.base.blob });
  await writeFile(join(target.checkout, target.h.path), bytes);
  const index = await readFile(join(target.location.stateDir, PROJECTION_INDEX_FILE));
  const version = success(await target.h.store.version());
  const context = { ...target.context, ports: () => {
    const ports = target.h.ports();
    let configurations = 0;
    return { ...ports, exec: (...args: Parameters<typeof ports.exec>) => {
      if (args[1][0] === "config" && ++configurations > 1) throw new Error("An unpublished attachment cannot enter indexed capture");
      return ports.exec(...args);
    } };
  } };
  expect(await checkProjectionRemoval(target.checkout, context)).toEqual({ kind: "passes" });
  expect(await readFile(join(target.checkout, target.h.path), "utf8")).toBe(bytes);
  expect(await readFile(join(target.location.stateDir, PROJECTION_INDEX_FILE))).toEqual(index);
  expect(success(await target.h.store.version())).toBe(version);
});

it("validates a prospective stub without minting or running adoption preparation", async () => {
  const target = await targetCheckout();
  await recordIgnoreProof(target);
  const folder = join(target.checkout, ".arc/backlog/planned/prospective");
  await mkdir(folder, { recursive: true });
  const metadata = makeMetaFixture("prospective", { owner: "andrew", state: "Planning", workClass: "Light", priority: "P1", currentWorkflow: null });
  await writeFile(join(folder, "meta-prospective.md"), metadata);
  await writeFile(join(folder, "notes-prospective.md"), "New owner's prose.\n");
  const version = success(await target.h.store.version());
  const index = await readFile(join(target.location.stateDir, PROJECTION_INDEX_FILE));
  const context = { ...target.context, ports: () => {
    const ports = target.h.ports();
    let configurations = 0;
    return { ...ports, exec: (...args: Parameters<typeof ports.exec>) => {
      if (args[1][0] === "config" && ++configurations > 1) throw new Error("A prospective owner cannot enter admission capture before minting");
      return ports.exec(...args);
    } };
  } };
  expect(await checkProjectionRemoval(target.checkout, context)).toEqual({ kind: "passes" });
  expect(success(await target.h.store.version())).toBe(version);
  expect(await readFile(join(folder, "meta-prospective.md"), "utf8")).toBe(metadata);
  expect(await readFile(join(target.location.stateDir, PROJECTION_INDEX_FILE))).toEqual(index);
  expect(await target.h.store.lookup({ kind: "slug", slug: SlugSchema.parse("prospective") })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});

it("holds accepted adoption awaiting installation with the current ignore remedy, then the save remedy", async () => {
  const { target, command, ignores } = await pendingAdoption();
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({
    kind: "would-refuse", remedy: { text: expect.stringMatching(/ignore/i) },
  });
  await writeFile(join(target.checkout, ".gitignore"), ignores);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({
    kind: "would-refuse", remedy: { text: expect.stringContaining("arc save") },
  });
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("holds an accepted adoption even after its uninstalled file is deleted", async () => {
  const { target, command, path, ignores } = await pendingAdoption();
  await writeFile(join(target.checkout, ".gitignore"), ignores);
  await rm(join(target.checkout, path));
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({
    kind: "would-refuse", remedy: { text: expect.stringContaining("arc save") },
  });
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("never enumerates a linked personal container while finding previous identities", async () => {
  const target = await targetCheckout();
  const folder = join(target.checkout, ".arc/user"), saved = join(target.checkout, "saved-personal");
  const original = await readFile(join(target.checkout, target.h.path));
  await rename(folder, saved);
  await symlink(saved, folder, "junction");
  const context = { ...target.context, ports: () => ({ ...target.h.ports(), walkFs: { readdir: (path: string) => {
    if (path === folder || path.startsWith(`${folder}/`)) throw new Error("The linked personal target was enumerated");
    return readdirSync(path, { withFileTypes: true });
  } } }) };
  expect(await checkProjectionRemoval(target.checkout, context)).toEqual({ kind: "passes" });
  expect(await readFile(join(saved, target.h.path.slice(".arc/user/".length)))).toEqual(original);
  await rm(folder);
  await rename(saved, folder);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it.each(["recording", "installation"] as const)("names the previous identity for unfinished personal %s", async state => {
  const pending = state === "recording" ? await unfinishedRecording() : await pendingAdoption();
  const { target, command } = pending;
  if ("ignores" in pending) await writeFile(join(target.checkout, ".gitignore"), pending.ignores);
  await target.h.exec("git", ["config", "arc.identity", "blair"], { cwd: target.checkout });
  target.h.identity("blair");
  expect(await checkProjectionRemoval(target.checkout, { ...target.context, identity: SlugSchema.parse("blair") })).toMatchObject({
    kind: "would-refuse", remedy: { text: expect.stringContaining("Have andrew apply the edit under their identity") },
  });
  await target.h.exec("git", ["config", "arc.identity", "andrew"], { cwd: target.checkout });
  target.h.identity("andrew");
  if ("repair" in pending) pending.repair();
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("holds an edited aside copy after its path moves on, until the copy is removed", async () => {
  const { target, entry, copy } = await interruptedCopy();
  await writeFile(join(target.checkout, copy.name), renderStampedFile({ content: "Late saved edit.\n", stamp: entry.base.blob }));
  await writeFile(join(target.checkout, target.h.path), renderStampedFile({ content: "Newer path edit.\n", stamp: entry.base.blob }));
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "would-refuse",
    remedy: { text: expect.stringContaining(copy.name) } });
  await rm(join(target.checkout, copy.name));
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("keeps an aside history failure unobservable and passes its repaired preparation without changing the copy", async () => {
  const { target, entry, copy } = await interruptedCopy();
  await writeFile(join(target.checkout, copy.name), renderStampedFile({ content: "opening\nbase\nlate closing\n", stamp: "f".repeat(40) }));
  const refusing = createRefusingStore(target.h.store);
  refusing.refuse("history", { code: "state-unresolvable", class: "recoverable", historyRefs: [],
    condition: "The aside's history is unavailable.", remedy: { text: "Restore the aside history, then retry." } });
  expect(await checkProjectionRemoval(target.checkout, { ...target.context, store: refusing.store })).toMatchObject({
    kind: "unobservable", detail: expect.stringContaining("Restore the aside history"),
  });
  refusing.refuse("history", null);
  const bytes = renderStampedFile({ content: "opening\nbase\nlate closing\n", stamp: parseAsideFile(copy.name)?.base ?? entry.base.blob });
  await writeFile(join(target.checkout, copy.name), bytes);
  const index = await readFile(join(target.location.stateDir, PROJECTION_INDEX_FILE));
  const version = success(await target.h.store.version());
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
  expect(await readFile(join(target.checkout, copy.name), "utf8")).toBe(bytes);
  await expect(access(join(target.checkout, target.h.path))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(target.location.stateDir, PROJECTION_INDEX_FILE))).toEqual(index);
  expect(success(await target.h.store.version())).toBe(version);
});

it("holds the newer edited copy once the older copy would be taken in, even while their path is absent", async () => {
  const { target, entry, copy } = await interruptedCopy();
  const base = parseAsideFile(copy.name)?.base;
  if (base === undefined) throw new Error("No copy base");
  const name = nameAsideFile({ path: target.h.path, base, role: "aside",
    writer: { pid: process.pid, processInstance: "second-swap", processScope: "removal-copy-tests" } });
  await writeFile(join(target.checkout, copy.name), renderStampedFile({ content: "opening\nbase\nolder save\n", stamp: base }));
  await createStagedFile(target.checkout, name, renderStampedFile({ content: "opening\nbase\nnewer save\n", stamp: base }));
  const disk = await readProjectionIndex(target.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("No copy index");
  await writeProjectionIndex(target.location, { ...disk.index, entries: { ...disk.index.entries,
    [target.h.path]: { ...entry, copies: [copy, { ...copy, name }] } } });
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "would-refuse",
    remedy: { text: expect.stringContaining(name) } });
  await rm(join(target.checkout, name));
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("holds an unrecorded aside edit until it is removed, without pruning its scaffolding", async () => {
  const target = await targetCheckout();
  const entry = target.index.entries[target.h.path];
  if (entry?.kind !== "record") throw new Error("No original copy basis");
  const name = nameAsideFile({ path: target.h.path, base: entry.base.blob, role: "aside",
    writer: { pid: process.pid, processInstance: "unrecorded-copy", processScope: "removal-copy-tests" } });
  const bytes = renderStampedFile({ content: "An unrecorded late edit.\n", stamp: entry.base.blob });
  await createStagedFile(target.checkout, name, bytes);
  const scaffold = join(target.checkout, ".arc/system/.local/projection/aside/empty-scaffold");
  await mkdir(scaffold, { recursive: true });
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "would-refuse",
    remedy: { text: expect.stringContaining(name) } });
  expect(await readFile(join(target.checkout, name), "utf8")).toBe(bytes);
  await rm(join(target.checkout, name));
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
  await expect(access(scaffold)).resolves.toBeUndefined();
});

it("holds a young empty Markdown save but passes once the emptied file is settled", async () => {
  const target = await targetCheckout();
  await writeFile(join(target.checkout, target.h.path), "");
  const saving = new Date(Date.now() + 60_000);
  await utimes(join(target.checkout, target.h.path), saving, saving);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "would-refuse",
    remedy: { text: expect.stringContaining("finish saving") } });
  await utimes(join(target.checkout, target.h.path), new Date(0), new Date(0));
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("keeps a rebuilt index's withheld copy held even if its bytes are restored to the old base", async () => {
  const target = await targetCheckout();
  const entry = target.index.entries[target.h.path];
  if (entry?.kind !== "record") throw new Error("No withheld copy basis");
  const name = nameAsideFile({ path: target.h.path, base: entry.base.blob, role: "aside",
    writer: { ...await target.h.ports().writer(), processInstance: "abandoned-copy" } });
  await createStagedFile(target.checkout, name, renderStampedFile({ content: "Unrecorded saved edit.\n", stamp: entry.base.blob }));
  await rm(join(target.location.stateDir, PROJECTION_INDEX_FILE));
  const command = { checkout: target.checkout, store: target.h.store, ports: target.h.ports, mode: "save" as const };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  expect(await readProjectionIndex(target.location, true, { groups: "all" })).toMatchObject({ kind: "index",
    index: { withheldCopies: expect.arrayContaining([name]) } });
  await writeFile(join(target.checkout, name), renderStampedFile({ content: target.h.record.content, stamp: entry.base.blob }));
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "would-refuse",
    remedy: { text: expect.stringContaining(name) } });
  await rm(join(target.checkout, name));
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it.each(["md", "txt"] as const)("holds a %s edit with an unreadable retained base until the copy is restored", async extension => {
  const { target, kept } = await retainedInput(extension);
  const copy = join(target.location.stateDir, TAKEN_IN_FOLDER, kept.name);
  const bytes = await readFile(copy);
  await rm(copy);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "would-refuse",
    remedy: { text: expect.stringContaining("Restore the retained base copy") } });
  await writeFile(copy, bytes);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("checks an unclaimed checkout's retained index but passes without either an index or an identity", async () => {
  const target = await targetCheckout();
  const header = join(target.location.stateDir, PROJECTION_INDEX_FILE), bytes = await readFile(header);
  await rm(resolveWorktreeMarkerPath(target.checkout));
  await target.h.exec("git", ["config", "arc.identity", "Invalid Identity"], { cwd: target.checkout });
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "would-refuse",
    remedy: { text: expect.stringContaining("arc.identity") } });
  await rm(header);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
  await writeFile(header, bytes);
  await target.h.exec("git", ["config", "arc.identity", "andrew"], { cwd: target.checkout });
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it.each([true, false])("reads every cold completed partition and repairs its corruption with claim=%s", async claimed => {
  const target = await targetCheckout();
  const archived = await seed(target.h, target.h.reference("work-item/meta", "archived"), makeMetaFixture("work-item-archived", {
    owner: "blair", state: "Shipped", workClass: "Light", priority: "P1", currentWorkflow: null,
  }), { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const path = ".arc/completed/2026-q4/01_work-item-archived/meta-work-item-archived.md";
  await rm(join(target.checkout, target.h.path));
  await seedProjection({ checkout: target.checkout, store: target.h.store, files: [
    { path: target.h.path, reference: target.h.record.reference }, { path, reference: archived.reference },
    { path: ".arc/active/current/meta-work-item-target.md", reference: target.primary.reference },
  ] });
  if (!claimed) await rm(resolveWorktreeMarkerPath(target.checkout));
  const header = JSON.parse(await readFile(join(target.location.stateDir, PROJECTION_INDEX_FILE), "utf8")) as {
    groups: Record<string, { name: string; unsettled: boolean }>;
  };
  const partition = header.groups[".arc/completed/2026-q4"];
  if (partition === undefined) throw new Error("No completed partition");
  expect(partition.unsettled).toBe(false);
  await rm(join(target.checkout, path));
  await writeFile(join(target.location.stateDir, partition.name), "Altered cold partition bytes\n");
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "unobservable",
    detail: expect.stringContaining("arc save") });
  const command = { checkout: target.checkout, store: target.h.store, ports: target.h.ports, mode: "save" as const };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  if (!claimed) {
    expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "would-refuse",
      remedy: { text: expect.stringContaining("delete") } });
    const rebuilt = await readProjectionIndex(target.location, true, { groups: "all" });
    if (rebuilt.kind !== "index") throw new Error("No rebuilt index");
    for (const [path, entry] of Object.entries(rebuilt.index.entries)) {
      if (entry.withheld) await rm(join(target.checkout, path), { force: true });
    }
  }
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("holds a projected conflict drawing and passes its resolved edit without resolving the stored conflict", async () => {
  const h = await createMarkerFixture();
  onTestFinished(h.dispose);
  await initializeEngineCheckout(h.checkout);
  const context = { store: h.store, identity: SlugSchema.parse("andrew") };
  expect(await checkProjectionRemoval(h.checkout, context)).toMatchObject({ kind: "would-refuse",
    remedy: { text: expect.any(String) } });
  const version = success(await h.store.version());
  await h.edit("Chosen resolution.\n");
  expect(await checkProjectionRemoval(h.checkout, context)).toEqual({ kind: "passes" });
  expect(success(await h.store.version())).toBe(version);
  expect(success(await h.store.read({ reference: h.entry.reference })).conflicts).toEqual(h.record.conflicts);
});

it("checks a retained input's recorded blob even when the ordinary read path does not consume it", async () => {
  const { target, recorded, kept, content } = await retainedInput("md");
  await writeFile(join(target.checkout, target.h.path), renderStampedFile({ content, stamp: recorded.base.blob }));
  const copy = join(target.location.stateDir, TAKEN_IN_FOLDER, kept.name), original = await readFile(copy);
  await writeFile(copy, "A changed retained input that this read path does not select.\n");
  expect(await prepareWriteBack({ store: target.h.store, location: target.location, format: "sha1", actor: "andrew@fixture" }, {
    checkout: target.checkout, path: target.h.path, copy: null, entry: recorded, base: { kind: "stamp", stamp: null },
  })).toMatchObject({ kind: "ready" });
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "would-refuse",
    remedy: { text: expect.stringContaining("Restore the retained local evidence") } });
  await writeFile(copy, original);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("keeps an interrupted plain-text history failure unobservable without pulling and passes after read repair", async () => {
  const { target, copy } = await interruptedCopy("txt");
  await rm(join(target.checkout, copy.name));
  const current = success(await target.h.store.read({ reference: target.h.record.reference }));
  await writeFile(join(target.checkout, target.h.path), `prefix\n${current.content}`);
  const refusing = createRefusingStore(target.h.store);
  refusing.refuse("history", { code: "state-unresolvable", class: "recoverable", historyRefs: [],
    condition: "The replacement's history is unavailable.", remedy: { text: "Restore the plain-text history, then retry." } });
  const store = overrideEngineStore(refusing.store, { pull: async () => { throw new Error("A removal check cannot fetch history"); } });
  const context = { ...target.context, store };
  expect(await checkProjectionRemoval(target.checkout, context)).toMatchObject({ kind: "unobservable",
    detail: expect.stringContaining("Restore the plain-text history") });
  refusing.refuse("history", null);
  expect(await checkProjectionRemoval(target.checkout, context)).toEqual({ kind: "passes" });
});

it.each(["markers", "metadata"] as const)("holds an aside copy's %s refusal and passes after repair", async shape => {
  const h = shape === "markers" ? await createMarkerFixture()
    : await createWriteBackFixture({ kind: "work-item/meta", identity: "andrew",
      fixture: await createRefFixture(createKindRegistry(PRODUCTION_REGISTRATIONS)) });
  onTestFinished(h.dispose);
  await initializeEngineCheckout(h.checkout);
  const takeIn = async (request: import("../../../../src/lib/store/projection/take-in-port.js").TakeInRequest) => ({ answer: "deferred" as const, entry: request.entry });
  const staged = success(await stageRecordFile({ ...h.context, checkout: h.checkout, path: h.path,
    record: success(await h.store.read({ reference: h.entry.reference })), replacing: h.entry.base.blob }));
  const replace = await guardReplacement({ ...h.context, checkout: h.checkout, path: h.path, entry: h.entry,
    staged, reference: await readReference(h.checkout), takeIn });
  if (replace.kind !== "replace") throw new Error("Conflict-copy replacement refused");
  const stop = new Error("stop with conflicted copy");
  await expect(swapBatch({ ...h.context, checkout: h.checkout, location: h.location, index: h.index,
    files: [{ path: h.path, replace }], readBack: false, takeIn,
    hooks: { afterMove: async () => { throw stop; } } })).rejects.toBe(stop);
  const disk = await readProjectionIndex(h.location, true, { groups: "all" });
  const entry = disk.kind === "index" ? disk.index.entries[h.path] : undefined;
  const copy = entry?.kind === "record" ? entry.copies[0] : undefined;
  if (copy === undefined) throw new Error("No conflicted aside copy");
  const original = await readFile(join(h.checkout, copy.name), "utf8");
  await writeFile(join(h.checkout, copy.name), shape === "markers" ? original.replace("stored side", "edited stored side")
    : renderStampedFile({ content: "Not valid metadata.\n", stamp: h.entry.base.blob }));
  const context = { store: h.store, identity: SlugSchema.parse("andrew") };
  expect(await checkProjectionRemoval(h.checkout, context)).toMatchObject({ kind: "would-refuse" });
  const resolved = renderStampedFile({ content: shape === "markers" ? "Chosen aside resolution.\n"
    : `${parseStampedFile(original).content}\nRepaired aside prose.\n`, stamp: h.entry.base.blob });
  await writeFile(join(h.checkout, copy.name), resolved);
  const version = success(await h.store.version());
  expect(await checkProjectionRemoval(h.checkout, context)).toEqual({ kind: "passes" });
  expect(await readFile(join(h.checkout, copy.name), "utf8")).toBe(resolved);
  expect(success(await h.store.version())).toBe(version);
});

it("holds an aside edit that clashes with current content and passes a nonclashing repair", async () => {
  const { target, recorded, current } = await retainedInput("md");
  await writeFile(join(target.checkout, target.h.path), renderStampedFile({ content: current.content, stamp: recorded.base.blob }));
  const disk = await readProjectionIndex(target.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("No retained-base swap index");
  const { copy } = await interruptedReplacement(target, disk.index, recorded);
  const base = recorded.persisted?.stamp;
  if (base === undefined) throw new Error("No clashing copy base");
  await writeFile(join(target.checkout, copy.name), renderStampedFile({ content: "opening\naccepted\nclosing\naside incoming\n", stamp: base }));
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "would-refuse" });
  const repaired = renderStampedFile({ content: `resolved prefix\n${current.content}`, stamp: base });
  await writeFile(join(target.checkout, copy.name), repaired);
  const version = success(await target.h.store.version());
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
  expect(await readFile(join(target.checkout, copy.name), "utf8")).toBe(repaired);
  expect(success(await target.h.store.version())).toBe(version);
});

it("holds a copy once its current file would send first, even if that file matches the copy's linked bytes", async () => {
  const { target, entry, copy, staged } = await interruptedCopy();
  await link(join(target.checkout, staged.location), join(target.checkout, target.h.path));
  await rm(join(target.checkout, staged.location));
  const stale = await readFile(join(target.checkout, target.h.path), "utf8");
  const before = success(await target.h.store.read({ reference: entry.reference }));
  success(await target.h.store.write(update(target.h, before, `${before.content}new stored footer\n`)));
  const current = success(await target.h.store.read({ reference: entry.reference }));
  const writer = { pid: process.pid, processInstance: "later-refresh", processScope: "removal-order-tests" };
  const renderer = createRecordRenderer({ store: target.h.store });
  const next = success(await stageRecordFile({ checkout: target.checkout, path: target.h.path, record: current,
    replacing: entry.base.blob, format: "sha1", writer, renderer }));
  const takeIn = async (request: import("../../../../src/lib/store/projection/take-in-port.js").TakeInRequest) => ({ answer: "deferred" as const, entry: request.entry });
  const replace = await guardReplacement({ checkout: target.checkout, path: target.h.path, entry, staged: next,
    reference: await readReference(target.checkout), format: "sha1", store: target.h.store, writer, renderer, takeIn });
  if (replace.kind !== "replace") throw new Error("Later refresh refused");
  const disk = await readProjectionIndex(target.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("No earlier swap index");
  const refreshed = await swapBatch({ checkout: target.checkout, location: target.location, index: disk.index,
    files: [{ path: target.h.path, replace }], writer, format: "sha1", readBack: false, takeIn });
  expect(refreshed.index.entries[target.h.path]).toMatchObject({ pending: false, copies: expect.arrayContaining([copy]) });
  const base = parseAsideFile(copy.name)?.base;
  if (base === undefined) throw new Error("No earlier copy base");
  await writeFile(join(target.checkout, copy.name), renderStampedFile({ content: `late prefix\n${target.h.record.content}`, stamp: base }));
  await writeFile(join(target.checkout, target.h.path), stale);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "would-refuse",
    remedy: { text: expect.stringContaining(copy.name) } });
  await rm(join(target.checkout, copy.name));
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("holds a new edit to another person's archived record and passes once it is reverted", async () => {
  const target = await targetCheckout();
  const primary = await seed(target.h, target.h.reference("work-item/meta", "archived"), makeMetaFixture("work-item-archived", {
    owner: "blair", state: "Shipped", workClass: "Light", priority: "P1", currentWorkflow: null,
  }), { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const notes = await seed(target.h, RecordReferenceSchema.parse({ kind: "work-item/notes", owner: primary.reference.owner }), "Archived prose.\n");
  const path = ".arc/completed/2026-q4/01_work-item-archived/notes-work-item-archived.md";
  const projected = await seedProjection({ checkout: target.checkout, store: target.h.store, files: [{ path, reference: notes.reference }] });
  const entry = projected.index.entries[path];
  if (entry?.kind !== "record") throw new Error("No archived note entry");
  const original = await readFile(join(target.checkout, path));
  await writeFile(join(target.checkout, path), renderStampedFile({ content: "A hand correction since the last command.\n", stamp: entry.base.blob }));
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "would-refuse",
    remedy: { text: expect.stringContaining("blair") } });
  await writeFile(join(target.checkout, path), original);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("holds an unfinished empty aside save with a retry remedy and passes once its deletion is settled", async () => {
  const { target, copy } = await interruptedCopy();
  await writeFile(join(target.checkout, copy.name), "");
  const future = new Date(Date.now() + 60_000);
  await utimes(join(target.checkout, copy.name), future, future);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "would-refuse",
    remedy: { text: expect.stringContaining("finish saving") } });
  await utimes(join(target.checkout, copy.name), new Date(0), new Date(0));
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("holds an unindexed attachment's unseen stored conflict until an explicit resolution lands", async () => {
  const h = await createMarkerFixture();
  onTestFinished(h.dispose);
  await initializeEngineCheckout(h.checkout);
  await writeProjectionIndex(h.location, { ...h.index, entries: {} });
  await h.edit(h.record.content);
  const context = { store: h.store, identity: SlugSchema.parse("andrew") };
  expect(await checkProjectionRemoval(h.checkout, context)).toMatchObject({ kind: "would-refuse",
    remedy: { text: expect.stringContaining("conflict") } });
  success(await h.store.write({ action: "put", reference: h.record.reference, content: h.record.content,
    expected: h.record.version, resolves: h.record.conflicts, provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const version = success(await h.store.version());
  expect(await checkProjectionRemoval(h.checkout, context)).toEqual({ kind: "passes" });
  expect(success(await h.store.version())).toBe(version);
});

it.each(["both", "earlier"] as const)("keeps %s unreadable interrupted versions unobservable when the history listing succeeds", async missing => {
  const { target, entry, copy } = await interruptedCopy("txt");
  const earlier = entry.inProgress?.replaces.version;
  if (earlier === undefined) throw new Error("No replaced version");
  await rm(join(target.checkout, copy.name));
  const current = success(await target.h.store.read({ reference: entry.reference }));
  await writeFile(join(target.checkout, target.h.path), `prefix\n${current.content}`);
  let unavailable = true;
  const store = overrideEngineStore(target.h.store, { history: async input => {
    const read = await target.h.store.history(input);
    return !unavailable || read.status === "refused" ? read
      : { status: "ok", result: read.result.map(each => missing === "both" || each.version === earlier
        ? { ...each, content: null } : each) };
  } });
  expect(await prepareWriteBack({ store, location: target.location, format: "sha1", actor: "andrew@fixture" }, {
    checkout: target.checkout, path: target.h.path, entry, copy: null, base: { kind: "blob", blob: entry.base.blob },
  })).toMatchObject({ kind: "held", result: { answer: "pending" } });
  const context = { ...target.context, store };
  expect(await checkProjectionRemoval(target.checkout, context)).toMatchObject({ kind: "unobservable",
    detail: expect.stringContaining(missing === "both" ? "Restore readable record history" : "Recover the projected file's base") });
  unavailable = false;
  expect(await checkProjectionRemoval(target.checkout, context)).toEqual({ kind: "passes" });
});

it("holds an attached adoption whose send was refused, as persistence does, and persists it once repaired", async () => {
  const target = await targetCheckout();
  const entry = target.index.entries[target.h.path];
  if (entry?.kind !== "record") throw new Error("Missing fixture entry");
  // The ref backend refuses content that breaks the serialization rules; the in-memory fixture store does not.
  const store = overrideEngineStore(target.h.store, { batch: async input => {
    for (const write of input.writes) {
      const refusal = write.action === "put" ? checkSerializationRules(write.reference, write.content) : undefined;
      if (refusal !== undefined) return { status: "refused", refusal };
    }
    return target.h.store.batch(input);
  } });
  const context = { ...target.context, store };
  await writeProjectionIndex(target.location, { ...target.index, entries: {} });
  const file = join(target.checkout, target.h.path);
  await writeFile(file, renderStampedFile({ content: "An edit holding a NUL \u0000 byte.\n", stamp: entry.base.blob }));
  const command = { checkout: target.checkout, store, ports: target.h.ports, mode: "save" as const };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  expect(await readProjectionIndex(target.location, true, { groups: "all" })).toMatchObject({ kind: "index", index: {
    entries: { [target.h.path]: { kind: "record", adoption: { kind: "write-back" } } } } });
  const refused = { kind: "would-refuse", remedy: { text: expect.stringContaining("Replace binary content") } };
  expect(await checkProjectionRemoval(target.checkout, context)).toMatchObject(refused);
  expect(await persistProjectionRemoval(target.checkout, context)).toMatchObject({ ...refused, kind: "refused" });
  await writeFile(file, renderStampedFile({ content: "A repaired edit.\n", stamp: entry.base.blob }));
  expect(await checkProjectionRemoval(target.checkout, context)).toEqual({ kind: "passes" });
  expect(await persistProjectionRemoval(target.checkout, context)).toEqual({ kind: "persisted" });
  expect(success(await target.h.store.read({ reference: target.h.record.reference })).content).toBe("A repaired edit.\n");
});

it.each(["txt", "md"] as const)("passes and persists a .%s file re-saved with only its line endings changed", async extension => {
  const target = await targetCheckout(`.arc/user/andrew/scratch/one.${extension}`);
  const file = join(target.checkout, target.h.path);
  await writeFile(file, (await readFile(file, "utf8")).replaceAll("\n", "\r\n"));
  const version = success(await target.h.store.version());
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
  expect(await persistProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "persisted" });
  expect(success(await target.h.store.read({ reference: target.h.record.reference })).content).toBe(target.h.record.content);
  if (extension === "txt") expect(success(await target.h.store.version())).toBe(version);
});

it("holds an edit in a root its ignore guard refuses, as persistence does, and passes once the rule is restored", async () => {
  const target = await targetCheckout();
  const entry = target.index.entries[target.h.path];
  if (entry?.kind !== "record") throw new Error("Missing fixture entry");
  await writeFile(join(target.checkout, target.h.path), renderStampedFile({ content: "An edit persistence cannot install.\n", stamp: entry.base.blob }));
  const ignores = await readFile(join(target.checkout, ".gitignore"));
  await writeFile(join(target.checkout, ".gitignore"), "");
  const checked = await checkProjectionRemoval(target.checkout, target.context);
  expect(checked).toMatchObject({ kind: "would-refuse", remedy: { text: expect.stringContaining(".arc/user/") } });
  if (checked.kind !== "would-refuse") throw new Error("The guard refusal was not predicted");
  expect(await persistProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "refused", remedy: checked.remedy });
  await writeFile(join(target.checkout, ".gitignore"), ignores);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
  expect(await persistProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "persisted" });
  expect(success(await target.h.store.read({ reference: target.h.record.reference })).content).toBe("An edit persistence cannot install.\n");
});

it("holds a new file in a root its ignore guard refuses until the rule is restored", async () => {
  const target = await targetCheckout();
  const path = join(target.checkout, ".arc/user/andrew/scratch/unadopted.md");
  await writeFile(path, "A new file persistence cannot install.\n");
  const ignores = await readFile(join(target.checkout, ".gitignore"));
  await writeFile(join(target.checkout, ".gitignore"), "");
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "would-refuse" });
  expect(await persistProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "refused" });
  await writeFile(join(target.checkout, ".gitignore"), ignores);
  expect(await persistProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "persisted" });
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("holds an edited aside copy in a root its ignore guard refuses, as persistence does, and passes once the rule is restored", async () => {
  const { target, entry, copy } = await interruptedCopy();
  const ignores = await readFile(join(target.checkout, ".gitignore"));
  await writeFile(join(target.checkout, ".gitignore"), "");
  const unedited = await checkProjectionRemoval(target.checkout, target.context);
  expect(await persistProjectionRemoval(target.checkout, target.context)).toEqual(unedited.kind === "passes" ? { kind: "persisted" }
    : { kind: "refused", remedy: unedited.kind === "would-refuse" ? unedited.remedy : undefined });
  const original = parseStampedFile(await readFile(join(target.checkout, copy.name), "utf8")).content;
  await writeFile(join(target.checkout, copy.name), renderStampedFile({ content: `Aside prefix.\n${original}`, stamp: entry.base.blob }));
  const checked = await checkProjectionRemoval(target.checkout, target.context);
  expect(checked).toMatchObject({ kind: "would-refuse", remedy: { text: expect.stringContaining(".arc/user/") } });
  if (checked.kind !== "would-refuse") throw new Error("The guard refusal was not predicted for the copy");
  expect(await persistProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "refused", remedy: checked.remedy });
  await writeFile(join(target.checkout, ".gitignore"), ignores);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
  expect(await persistProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "persisted" });
  expect(success(await target.h.store.read({ reference: target.h.record.reference })).content).toContain("Aside prefix.");
});

it("releases past an unedited aside copy in a root its ignore guard refuses, as the check predicts, and holds an edited one", async () => {
  const { target, entry, copy } = await interruptedCopy();
  const at = join(target.checkout, copy.name);
  const unedited = await readFile(at);
  await writeFile(join(target.checkout, ".gitignore"), "");
  const original = parseStampedFile(unedited.toString("utf8")).content;
  await writeFile(at, renderStampedFile({ content: `Aside prefix.\n${original}`, stamp: entry.base.blob }));
  const checked = await checkProjectionRemoval(target.checkout, target.context, "release");
  if (checked.kind !== "would-refuse") throw new Error("The edited copy was not held");
  expect(await releaseProjectionRemoval(target.checkout, false, target.context)).toEqual({ kind: "refused", remedy: checked.remedy });
  await writeFile(at, unedited);
  expect(await checkProjectionRemoval(target.checkout, target.context, "release")).toEqual({ kind: "passes" });
  expect(await releaseProjectionRemoval(target.checkout, false, target.context)).toEqual({ kind: "released" });
  expect(await readFile(at).then(() => "present", () => "absent")).toBe("absent");
});

it("holds an edit that resolves its conflict beside a damaged marker set, as persistence does, and persists once repaired", async () => {
  const base = "# Inbox\n\n## Errand\n\n### [ ] **First**\n\n- _Id:_ `11111111`\n\nbase first\n\n"
    + "### [ ] **Second**\n\n- _Id:_ `22222222`\n\nbase second\n";
  const h = await createMarkerFixture({ kind: "personal/inbox", base, current: base.replace("base first", "stored first"),
    incoming: base.replace("base first", "incoming first") });
  onTestFinished(h.dispose);
  await initializeEngineCheckout(h.checkout);
  const context = { store: h.store, identity: SlugSchema.parse("andrew") };
  const third = "### [ ] **Third**\n\nnew third\n";
  await h.edit(`${h.record.content.replace("stored first", "resolved first")}\n<<<<<<< local [arc-conflict: "personal/person/stranger/unindexed"]\n`
    + `${third}=======\n${third.replace("new third", "other third")}>>>>>>> incoming\n`);
  const checked = await checkProjectionRemoval(h.checkout, context);
  expect(checked).toMatchObject({ kind: "would-refuse", remedy: { text: expect.any(String) } });
  if (checked.kind !== "would-refuse") throw new Error("The retained mark was not predicted");
  expect(await persistProjectionRemoval(h.checkout, context)).toEqual({ kind: "refused", remedy: checked.remedy });
  const landed = success(await h.store.read({ reference: h.entry.reference })).content;
  await h.edit(`${landed}\n${third}`);
  expect(await checkProjectionRemoval(h.checkout, context)).toEqual({ kind: "passes" });
  expect(await persistProjectionRemoval(h.checkout, context)).toEqual({ kind: "persisted" });
  expect(success(await h.store.read({ reference: h.entry.reference })).content).toContain("new third");
});
