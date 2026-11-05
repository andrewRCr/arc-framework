/** Save runs through the registered CLI, its start hook, and a real reference backend. */
import { afterEach, expect, it, vi } from "vitest";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { ProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";

const binding = vi.hoisted(() => ({ store: null as Store | null,
  singleUse: false,
  ports: null as ((ports: ProjectionEnginePorts) => ProjectionEnginePorts) | null }));
vi.mock("../../../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => {
    const selected = binding.store;
    if (binding.singleUse) binding.store = null;
    return selected ?? original.createStore(...args);
  } };
});
vi.mock("../../../../src/lib/store/projection/engine-ports.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../../../src/lib/store/projection/engine-ports.js")>();
  return { ...original, createProjectionEnginePorts: (...args: Parameters<typeof original.createProjectionEnginePorts>) => {
    const ports = original.createProjectionEnginePorts(...args);
    return binding.ports?.(ports) ?? ports;
  } };
});

import { dispatchRegisteredCli } from "../../../helpers/registered-cli.js";
import { createEngineFixture } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { seed } from "../../../helpers/store/suite-tools.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { configureEngineCheckout } from "../../../helpers/store/projection/engine-fixture.js";
import { formatConflictToken } from "../../../../src/lib/status/conflict-token.js";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { createCheckoutFixture } from "../../../helpers/store/projection/checkout-fixture.js";
import { initializeEngineCheckout } from "../../../helpers/store/projection/engine-fixture.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";
import { writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { update } from "../../../helpers/store/suite-tools.js";
import { seedStatusConflict } from "../../../helpers/store/status-conflicts.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";
import { withProjectionLock, PROJECTION_LOCK_FILE } from "../../../../src/lib/store/projection/lock.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { acquireAdvisoryLock, releaseAdvisoryLockConfirmed, type AdvisoryLockHandle } from "../../../../src/lib/advisory-lock.js";
import { ADVISORY_LEASE_DURATION_MS } from "../../../../src/lib/renewable-lease.js";
import { startProjection } from "../../../../src/lib/store/projection/engine.js";

const directories: string[] = [];
afterEach(async () => { binding.store = null; binding.singleUse = false; binding.ports = null; await removeGitBackedDirs(directories.splice(0)); });

async function save(h: { store: Store; checkout: string }, args: readonly string[] = []) {
  const cwd = process.cwd(), exit = process.exitCode;
  let output = "", errors = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { errors += String(chunk); return true; });
  try {
    binding.store = h.store;
    process.chdir(h.checkout); process.exitCode = undefined;
    await dispatchRegisteredCli(["save", ...args, "--json"]);
    return { result: JSON.parse(output) as { status: string; result?: { version: string }; refusal?: { code: string; condition: string; remedy: { text: string } } },
      exitCode: process.exitCode ?? 0, errors };
  } finally { stdout.mockRestore(); stderr.mockRestore(); process.chdir(cwd); process.exitCode = exit; }
}

it("saves a completed-file edit and returns the version after that write", async () => {
  const h = await createEngineFixture(directories, { path: ".arc/completed/2026-q4/document.md" });
  await h.edit("completed edit\n");
  const saved = await save(h);
  expect(saved.result).toMatchObject({ status: "ok", result: { version: success(await h.store.version()) } });
  expect(saved.exitCode).toBe(0);
  expect((await h.stored()).content).toBe("completed edit\n");
  expect(success(await h.store.history({ reference: h.record.reference }))[0]?.provenance).toMatchObject({ verb: "save", lifecycleAction: "edit" });
});

it("uses the hook's selected Store for the registered save action's result", async () => {
  const h = await createEngineFixture(directories);
  await h.edit("selected store edit\n");
  binding.singleUse = true;
  const saved = await save(h);
  expect((await h.stored()).content).toBe("selected store edit\n");
  expect(saved.result).toMatchObject({ status: "ok", result: { version: success(await h.store.version()) } });
});

it("refuses a standing hold's markers, then sends its resolved text against the current version", async () => {
  const h = await createCheckoutFixture({ path: ".arc/user/andrew/document.txt" });
  directories.push(h.checkout);
  await initializeEngineCheckout(h.checkout);
  await h.edit(h.incoming);
  const held = await writeBackFile(h.context, h.index, h.request);
  const mark = held.result.entry.refused;
  expect(mark?.reason).toBe("bases-disagree");
  const token = mark?.remedy.argv?.at(-1);
  if (token === undefined) throw new Error("Missing hold token");
  const refused = await save(h, ["--resolve", token]);
  expect(refused.result).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("markers"),
    remedy: { text: expect.stringContaining("markers") } } });
  await h.edit(h.incoming);
  const resolved = await save(h, ["--resolve", token]);
  expect(resolved.result.status).toBe("ok");
  const current = success(await h.store.read({ reference: h.entry.reference }));
  expect(current.content).toBe(h.incoming);
  expect(current.conflicts).toEqual([]);
  expect(await h.file()).toBe(h.incoming);
});

async function conflictedProjection(path: string, unplaced = true) {
  const fixture = createReferenceFixture();
  fixture.identity("andrew");
  const base = await seed(fixture, RecordReferenceSchema.parse({ ...fixture.reference("personal/document"),
    owner: { type: "person", name: "andrew" } }), "opening\nbase\nclosing\n");
  for (const content of ["opening\ncurrent\nclosing\n", "opening\nincoming\nclosing\n"]) {
    success(await fixture.store.write({ action: "put", reference: base.reference, expected: base.version, content,
      provenance: { verb: "edit", lifecycleAction: "edit" } }));
  }
  const clashed = success(await fixture.store.read({ reference: base.reference }));
  const conflict = clashed.conflicts[0];
  if (conflict === undefined) throw new Error("Producer made no conflict");
  if (unplaced) success(await fixture.store.write({ action: "put", reference: base.reference, expected: clashed.version,
    content: "new content without the conflicted span\n", provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const projected = await seedProjection({ store: fixture.store, files: [{ reference: base.reference, path }] });
  directories.push(projected.checkout);
  await configureEngineCheckout(projected.checkout);
  return { ...fixture, ...projected, path, reference: base.reference, conflict };
}

it("resolves an unchanged stampless subject using its indexed reference and keeps the store's side", async () => {
  const h = await conflictedProjection(".arc/user/andrew/document.txt");
  const before = success(await h.store.read({ reference: h.reference }));
  expect(h.index.entries[h.path]).toMatchObject({ markers: null, unshown: [h.conflict] });
  const saved = await save(h, ["--resolve", formatConflictToken(h.conflict)]);
  expect(saved.result.status).toBe("ok");
  const after = success(await h.store.read({ reference: h.reference }));
  expect(after.conflicts).toEqual([]);
  expect(after.content).toBe(before.content);
  expect(await h.store.read({ reference: h.conflict })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(success(await h.store.history({ reference: h.conflict }))[0]?.provenance).toMatchObject({ verb: "save" });
  expect(saved.errors).toContain(formatConflictToken(h.conflict));
});

it("refuses a conflict whose markers stand, then resolves removed markers only once", async () => {
  const h = await conflictedProjection(".arc/user/andrew/document.md", false);
  const token = formatConflictToken(h.conflict);
  const refused = await save(h, ["--resolve", token]);
  expect(refused.result).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("markers"),
    remedy: { text: expect.stringContaining("markers") } } });
  expect(refused.exitCode).toBe(1);
  const current = success(await h.store.read({ reference: h.reference }));
  expect(current.conflicts).toEqual([h.conflict]);
  const entry = h.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing subject");
  await writeFile(join(h.checkout, h.path), renderStampedFile({ content: current.content, stamp: entry.base.blob }));
  const resolved = await save(h, ["--resolve", token]);
  expect(resolved.result.status).toBe("ok");
  expect(success(await h.store.read({ reference: h.reference })).conflicts).toEqual([]);
  expect(success(await h.store.history({ reference: h.conflict })).filter(each => each.content === null)).toHaveLength(1);
});

it("names an unmapped conflict's owner without resolving it, then resolves from a restored mapping", async () => {
  const h = await conflictedProjection(".arc/user/andrew/document.txt");
  await writeProjectionIndex(h.location, { ...h.index, entries: {} });
  const token = formatConflictToken(h.conflict);
  const refused = await save(h, ["--resolve", token]);
  expect(refused.result).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("no projected file"),
    remedy: { text: expect.stringContaining(h.reference.owner.name) } } });
  expect(success(await h.store.read({ reference: h.reference })).conflicts).toEqual([h.conflict]);
  await writeProjectionIndex(h.location, h.index);
  expect((await save(h, ["--resolve", token])).result.status).toBe("ok");
  expect(success(await h.store.read({ reference: h.reference })).conflicts).toEqual([]);
});

it("names an indexed conflict that was already resolved", async () => {
  const h = await conflictedProjection(".arc/user/andrew/document.txt");
  const current = success(await h.store.read({ reference: h.reference }));
  success(await h.store.write({ action: "put", reference: h.reference, expected: current.version, content: current.content,
    resolves: [h.conflict], provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const refused = await save(h, ["--resolve", formatConflictToken(h.conflict)]);
  expect(refused.result).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("already resolved"),
    remedy: { text: expect.stringContaining("arc status --conflicts") } } });
});

it("refuses an unmapped token shared by two owner generations and names both UIDs", async () => {
  const h = await createEngineFixture(directories);
  const old = await seed(h, h.reference("work-item/meta"));
  success(await h.store.write({ ...update(h, old), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
  const current = await seed(h, h.reference("work-item/meta"));
  const conflicts = [];
  for (const owner of [old.reference.owner, current.reference.owner]) conflicts.push(await seedStatusConflict(h,
    RecordReferenceSchema.parse({ kind: "work-item/conflict-record", owner, key: "shared/id" })));
  const first = conflicts[0];
  if (first === undefined) throw new Error("No conflict was seeded");
  const saved = await save(h, ["--resolve", formatConflictToken(first.reference)]);
  expect(saved.result).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("Ambiguous"),
    remedy: { text: expect.stringContaining("UID") } } });
  for (const conflict of conflicts) {
    expect(saved.result.refusal?.condition).toContain(conflict.reference.owner.type === "work-item" ? conflict.reference.owner.uid : "missing UID");
    expect(success(await h.store.read({ reference: conflict.reference })).content).toBe(conflict.content);
  }
  const projected = await seedProjection({ store: h.store, files: [
    { reference: old.reference, path: ".arc/completed/2026-q4/meta-work-item-one.md" },
    { reference: current.reference, path: ".arc/active/meta-work-item-one.md" },
  ] });
  directories.push(projected.checkout);
  await configureEngineCheckout(projected.checkout);
  const mapped = await save({ ...h, ...projected }, ["--resolve", formatConflictToken(first.reference)]);
  expect(mapped.result).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("Ambiguous") } });
});

async function wholeRecordProjection(change: "removal" | "placement" | "verb-owned" | "content") {
  const fixture = createReferenceFixture({}, { "work-item/meta": { parser: META_REGISTRATION.parser } });
  const content = makeMetaFixture("work-item-one", { owner: "andrew", workClass: "Light", priority: "P1",
    currentWorkflow: "process-task-loop", design: ["spec-work-item-one.md"] });
  const base = await seed(fixture, fixture.reference("work-item/meta"), content);
  const remote = fixture.remote(true);
  if (remote === undefined) throw new Error("No reference remote");
  success(await fixture.store.push());
  if (change === "removal") success(await fixture.store.write({ action: "remove", reference: base.reference, expected: base.version,
    provenance: { verb: "abandon", lifecycleAction: "remove" } }));
  else success(await fixture.store.write({ ...update(fixture, base, change === "verb-owned"
    ? content.replace("`andrew`", "`bob`") : content + "\nLocal note.\n"),
    ...(change === "placement" ? { placement: { kind: "backlog" as const, commitment: "planned" as const } } : {}),
    provenance: { verb: change === "placement" ? "promote" : change === "verb-owned" ? "handover" : "edit", lifecycleAction: "edit" } }));
  success(await remote.write({ ...update(fixture, base, content + "\nRemote note.\n"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
  success(await fixture.store.push());
  const current = success(await fixture.store.read({ reference: base.reference }));
  const conflict = current.conflicts[0];
  if (conflict === undefined) throw new Error("Sync produced no whole-record conflict");
  const path = ".arc/active/meta-work-item-one.md";
  const projected = await seedProjection({ store: fixture.store, files: [{ reference: base.reference, path }] });
  directories.push(projected.checkout);
  await configureEngineCheckout(projected.checkout);
  await writeWorktreeMarker(projected.checkout, { spawnedByArc: false, spawningIdentity: "andrew",
    createdAt: "2026-10-24T00:00:00Z", createdFor: boundWorkUnitSubject(base) });
  return { ...fixture, ...projected, fixture, reference: base.reference, conflict, current };
}

it.each([
  ["removal", "abandon"], ["placement", "promote"], ["verb-owned", "handover"],
] as const)("refuses a whole-record %s alternative and names its owning verb", async (change, verb) => {
  const h = await wholeRecordProjection(change);
  const refused = await save(h, ["--resolve", formatConflictToken(h.conflict)]);
  expect(refused.result).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining(change),
    remedy: { text: expect.stringContaining(verb) } } });
  expect(success(await h.store.read({ reference: h.reference })).conflicts).toEqual([h.conflict]);
  success(await h.store.write({ ...update(h.fixture, h.current, h.current.content), resolves: [h.conflict],
    provenance: { verb, lifecycleAction: "edit" } }));
  expect((await save(h)).result.status).toBe("ok");
  expect(success(await h.store.read({ reference: h.reference })).conflicts).toEqual([]);
});

it("refuses without identity as whole JSON, then saves after identity repair", async () => {
  const h = await createEngineFixture(directories);
  await h.edit("identity repair edit\n");
  await h.exec("git", ["config", "arc.identity", "BAD ID"], { cwd: h.checkout });
  const refused = await save(h);
  expect(refused.result).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("identity"),
    remedy: { text: expect.stringContaining("arc.identity") } } });
  expect(refused.exitCode).toBe(1);
  expect((await h.stored()).content).not.toContain("identity repair edit");
  await h.exec("git", ["config", "arc.identity", "andrew"], { cwd: h.checkout });
  expect((await save(h)).result.status).toBe("ok");
  expect((await h.stored()).content).toBe("identity repair edit\n");
});

it("names a held lock's holder and retry, then saves after release", async () => {
  const h = await createEngineFixture(directories);
  await h.edit("after lock release\n");
  let release = (): void => undefined, acquired = (): void => undefined;
  const held = new Promise<void>(resolve => { acquired = resolve; });
  const holding = withProjectionLock(h.location, async () => { acquired(); await new Promise<void>(resolve => { release = resolve; }); });
  await held;
  // Let the real holder be read before the wait expires, independent of filesystem or scheduler latency.
  let seen = false;
  binding.ports = ports => ({ ...ports, maxWaitMs: 50, lock: { ...ports.lock,
    now: () => seen ? 1_000 : 0,
    readFile: async path => { try { return await readFile(path, "utf8"); } finally { seen = true; } },
  } });
  try {
    const refused = await save(h);
    expect(refused.result).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("held"),
      remedy: { text: expect.stringContaining("Retry") } } });
    expect(refused.result.refusal?.condition).toContain(String(process.pid));
    expect((await h.stored()).content).not.toContain("after lock release");
  } finally { release(); await holding; binding.ports = null; }
  expect((await save(h)).result.status).toBe("ok");
  expect((await h.stored()).content).toBe("after lock release\n");
});

it("refuses a missing Git directory, then saves once it is restored", async () => {
  const h = await createEngineFixture(directories);
  await h.edit("restored directory edit\n");
  const backup = `${h.location.gitDir}-saved`;
  await rename(h.location.gitDir, backup);
  try {
    const refused = await save(h);
    expect(refused.result).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("Git directory is missing"),
      remedy: { text: expect.stringContaining("Retry") } } });
    expect((await h.stored()).content).not.toContain("restored directory edit");
  } finally { await rename(backup, h.location.gitDir); }
  expect((await save(h)).result.status).toBe("ok");
  expect((await h.stored()).content).toBe("restored directory edit\n");
});

it("refuses a lost lease with a retry while preserving its accepted edit", async () => {
  const h = await createEngineFixture(directories);
  await h.edit("accepted before lease loss\n");
  let now = Date.now();
  let replacement: AdvisoryLockHandle | undefined;
  const store = overrideEngineStore(h.store, { write: async input => {
    const result = await h.store.write(input);
    now = Date.now() + ADVISORY_LEASE_DURATION_MS + 1000;
    replacement = await acquireAdvisoryLock(join(h.location.stateDir, PROJECTION_LOCK_FILE), {
      pid: process.pid, processInstance: "replacement", processScope: "replacement-scope", now: () => now,
      leaseDurationMs: ADVISORY_LEASE_DURATION_MS, maxWaitMs: 200,
    });
    return result;
  } });
  binding.ports = ports => ({ ...ports, lock: { now: () => now, resolveProcessScope: async () => "original-scope",
    scheduleEvery: () => () => undefined } });
  const refused = await save({ ...h, store });
  expect(refused.result).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("lease lost"),
    remedy: { text: expect.stringContaining("Retry") } } });
  expect((await h.stored()).content).toBe("accepted before lease loss\n");
  if (replacement === undefined) throw new Error("Replacement lock missing");
  await releaseAdvisoryLockConfirmed(replacement);
  binding.ports = null;
  expect((await save(h)).result.status).toBe("ok");
  expect((await h.disk()).entries[h.path]).toMatchObject({ base: { version: (await h.stored()).version } });
});

it("takes in a late aside edit left by an exited writer", async () => {
  const h = await createEngineFixture(directories);
  const ports = h.ports();
  await h.edit("first save\n");
  await startProjection({ store: h.store, checkout: h.checkout, ports: () => ({ ...ports,
    writer: async () => ({ ...await ports.writer(), processInstance: "exited-save-writer" }) }) });
  const entry = (await h.disk()).entries[h.path];
  if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("No displaced copy");
  const copy = entry.copies[0].name;
  await writeFile(join(h.checkout, copy), renderStampedFile({ content: "late aside save\n", stamp: h.entry.base.blob }));
  expect((await save(h)).result.status).toBe("ok");
  expect((await h.stored()).content).toBe("late aside save\n");
  expect(success(await h.store.history({ reference: h.record.reference }))[0]?.provenance).toMatchObject({ verb: "save" });
});

it("refuses a malformed set with its repair, then draws the unseen conflict after repair", async () => {
  const h = await conflictedProjection(".arc/user/andrew/document.md", false);
  const prior = success(await h.store.read({ reference: h.reference }));
  for (const tail of ["store tail\n", "incoming tail\n"]) success(await h.store.write({ action: "put", reference: h.reference,
    expected: prior.version, content: prior.content + tail, provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const current = success(await h.store.read({ reference: h.reference }));
  const unseen = current.conflicts.find(reference => formatConflictToken(reference) !== formatConflictToken(h.conflict));
  if (unseen === undefined) throw new Error("No second conflict was produced");
  const drawing = await readFile(join(h.checkout, h.path), "utf8");
  await writeFile(join(h.checkout, h.path), drawing.replace(/^>{7}[^\n]*(?:\n|$)/mu, ""));
  await startProjection({ store: h.store, checkout: h.checkout });
  const refused = await save(h, ["--resolve", formatConflictToken(unseen)]);
  expect(refused.result).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("marker-malformed"),
    remedy: { text: expect.stringContaining("Finish resolving") } } });
  expect(success(await h.store.read({ reference: unseen })).reference).toEqual(unseen);
  const entry = h.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("No projected subject");
  await writeFile(join(h.checkout, h.path), renderStampedFile({ content: prior.content, stamp: entry.base.blob }));
  expect((await save(h)).result.status).toBe("ok");
  const repaired = await readFile(join(h.checkout, h.path), "utf8");
  expect(repaired).toContain(formatConflictToken(unseen));
  expect(repaired).toContain("<<<<<<<");
  expect(success(await h.store.read({ reference: h.reference })).conflicts).toEqual([unseen]);
});

it("resolves the indexed completed owner's UID even when a live owner has the same name", async () => {
  const fixture = createReferenceFixture({}, { "work-item/meta": { parser: META_REGISTRATION.parser } });
  const meta = makeMetaFixture("work-item-one", { owner: "andrew", workClass: "Light", priority: "P1" });
  const primary = await seed(fixture, fixture.reference("work-item/meta"), meta);
  const subject = await seed(fixture, RecordReferenceSchema.parse({ kind: "work-item/notes", owner: primary.reference.owner }),
    "opening\nbase\nclosing\n");
  for (const content of ["opening\ncurrent\nclosing\n", "opening\nincoming\nclosing\n"]) success(await fixture.store.write({
    action: "put", reference: subject.reference, expected: subject.version, content, provenance: { verb: "edit", lifecycleAction: "edit" },
  }));
  const current = success(await fixture.store.read({ reference: subject.reference }));
  const conflict = current.conflicts[0];
  if (conflict === undefined) throw new Error("No conflict was produced");
  success(await fixture.store.write({ action: "put", reference: subject.reference, expected: current.version,
    content: "unplaced old owner content\n", provenance: { verb: "edit", lifecycleAction: "edit" } }));
  success(await fixture.store.write({ ...update(fixture, primary, meta.replace("`Active`", "`Shipped`")),
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
  const live = await seed(fixture, fixture.reference("work-item/meta"), meta);
  expect(live.reference.owner).not.toEqual(primary.reference.owner);
  const projected = await seedProjection({ store: fixture.store, files: [{ reference: subject.reference,
    path: ".arc/completed/2026-q4/notes-work-item-one.txt" }] });
  directories.push(projected.checkout);
  await configureEngineCheckout(projected.checkout);
  expect((await save({ ...fixture, ...projected }, ["--resolve", formatConflictToken(conflict)])).result.status).toBe("ok");
  expect(success(await fixture.store.read({ reference: subject.reference })).conflicts).toEqual([]);
  expect(success(await fixture.store.read({ reference: live.reference }))).toEqual(live);
});

it("reports an accepted resolution as successful when its later read-back refuses", async () => {
  const h = await conflictedProjection(".arc/user/andrew/document.txt");
  let accepted = false, refusedRead = false;
  const store = overrideEngineStore(h.store, {
    write: async input => {
      const result = await h.store.write(input);
      if (result.status === "ok" && input.resolves?.length) accepted = true;
      return result;
    },
    read: async input => {
      if (accepted && !refusedRead && input.reference.kind === h.reference.kind) {
        refusedRead = true;
        return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "personal",
          condition: "Read-back temporarily unavailable.", remedy: { text: "Repair the personal namespace and retry." } } };
      }
      return h.store.read(input);
    },
  });
  const saved = await save({ ...h, store }, ["--resolve", formatConflictToken(h.conflict)]);
  expect(saved.result.status).toBe("ok");
  expect(saved.errors).toContain("read-back failed");
  expect(success(await h.store.read({ reference: h.reference })).conflicts).toEqual([]);
  expect(success(await h.store.history({ reference: h.conflict })).filter(each => each.content === null)).toHaveLength(1);
});

it("keeps the stored side of a content-only whole-record conflict", async () => {
  const h = await wholeRecordProjection("content");
  expect((await save(h, ["--resolve", formatConflictToken(h.conflict)])).result.status).toBe("ok");
  const current = success(await h.store.read({ reference: h.reference }));
  expect(current.content).toBe(h.current.content);
  expect(current.conflicts).toEqual([]);
});

it.each(["", "not-a-token"])("reports an unknown token %j as whole JSON and accepts a corrected token", async token => {
  const h = await conflictedProjection(".arc/user/andrew/document.txt");
  expect((await save(h, ["--resolve", token])).result).toMatchObject({ status: "refused", refusal: {
    condition: expect.stringContaining("Unknown conflict token"), remedy: { text: expect.stringContaining("arc status --conflicts") },
  } });
  expect((await save(h, ["--resolve", formatConflictToken(h.conflict)])).result.status).toBe("ok");
  expect(success(await h.store.read({ reference: h.reference })).conflicts).toEqual([]);
});

it("accepts a requested resolution already fulfilled by the start's aside sweep", async () => {
  const h = await conflictedProjection(".arc/user/andrew/document.md", false);
  await writeFile(join(h.checkout, h.path), await readFile(join(h.checkout, h.path), "utf8") + "\nIndependent note.\n");
  const ports = createProjectionEnginePorts(h.checkout);
  await startProjection({ store: h.store, checkout: h.checkout, ports: () => ({ ...ports,
    writer: async () => ({ ...await ports.writer(), processInstance: "exited-resolution-writer" }) }) });
  const disk = await import("../../../../src/lib/store/projection/index-file.js").then(module => module.readProjectionIndex(h.location, true));
  if (disk.kind !== "index") throw new Error("Missing projection index");
  const entry = disk.index.entries[h.path];
  if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("No displaced marked copy");
  const copy = entry.copies[0].name;
  const stamp = parseStampedFile(await readFile(join(h.checkout, copy), "utf8")).stamp;
  if (stamp === null) throw new Error("Copy lost its stamp");
  const current = success(await h.store.read({ reference: h.reference }));
  await writeFile(join(h.checkout, copy), renderStampedFile({ content: current.content, stamp }));
  const saved = await save(h, ["--resolve", formatConflictToken(h.conflict)]);
  expect(saved.result.status).toBe("ok");
  expect(success(await h.store.read({ reference: h.reference })).conflicts).toEqual([]);
  expect(success(await h.store.history({ reference: h.conflict })).filter(each => each.content === null)).toHaveLength(1);
});
