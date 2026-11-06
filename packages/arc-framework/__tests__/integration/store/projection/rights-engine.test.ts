/** Engine-bound rights preserve refused edits through the real checkout and take-in port. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { createKindRegistry } from "../../../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../src/lib/store/kinds/registrations.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { startProjection } from "../../../../src/lib/store/projection/engine.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { configureEngineCheckout, initializeEngineCheckout } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { createLifecycleHarness } from "../../../helpers/store/lifecycle-harness.js";
import { TASK_RULE_CONTENT } from "../../../helpers/store/task-rule-input.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { formatConflictToken } from "../../../../src/lib/status/conflict-token.js";
import { createCheckoutFixture } from "../../../helpers/store/projection/checkout-fixture.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function project(input: { store: Store; record: StoreRecord; path: string; identity: string }) {
  const projected = await seedProjection({ store: input.store, identity: SlugSchema.parse(input.identity),
    files: [{ reference: input.record.reference, path: input.path }] });
  directories.push(projected.checkout);
  const exec = await configureEngineCheckout(projected.checkout);
  await exec("git", ["config", "arc.identity", input.identity], { cwd: projected.checkout });
  const file = (path = input.path) => readFile(join(projected.checkout, path), "utf8");
  const edit = async (content: string, path = input.path) => {
    const stamp = parseStampedFile(await file(path)).stamp;
    if (stamp === null) throw new Error("The projected file lost its stamp");
    const bytes = renderStampedFile({ content, stamp });
    await writeFile(join(projected.checkout, path), bytes);
    return bytes;
  };
  const disk = async () => {
    const read = await readProjectionIndex(projected.location, true);
    if (read.kind !== "index") throw new Error("The projection index is unreadable");
    return read.index;
  };
  return { ...projected, exec, file, edit, disk, path: input.path, ports: () => createProjectionEnginePorts(projected.checkout) };
}

it("binds rights to refuse another identity's working-memory edit and lands it after identity repair", async () => {
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
  const h = createReferenceFixture(undefined, { "personal/working-memory": registry["personal/working-memory"] });
  h.identity("alice");
  const reference = recordReferences["personal/working-memory"](OwnerIdentitySchema.parse({ type: "person", name: "alice" }));
  const original = h.content(reference);
  const record = await seed(h, reference, original);
  const view = await project({ store: h.store, record, identity: "alice", path: ".arc/user/alice/WORKING-MEMORY.md" });
  const content = original.replace("\nfirst\n", "\nChanged memory.\n");
  const bytes = await view.edit(content);
  await view.exec("git", ["config", "arc.identity", "bob"], { cwd: view.checkout });
  h.identity("bob");
  await startProjection({ store: h.store, checkout: view.checkout });
  const root = projectionProcessState().roots.get(view.checkout);
  const entry = (await view.disk()).entries[view.path];
  if (root === undefined || entry?.kind !== "record") throw new Error("The command did not bind a projection root");
  expect(entry.changed).toBe(false);
  const denied = await withProjectionLock(view.location, async session => {
    root.checkpoint = session.step;
    try { return await root.takeIn({ checkout: view.checkout, path: view.path, copy: null, entry, observedEdit: true, base: { kind: "stamp", stamp: null } }); }
    finally { root.checkpoint = null; }
  });
  expect(denied).toMatchObject({ status: "done", value: {
    answer: "refused", entry: { changed: true, pending: true, refused: { reason: expect.stringContaining("alice") } },
  } });
  expect(success(await h.store.read({ reference })).content).toBe(original);
  expect(await view.file()).toBe(bytes);
  expect(root.unsent.has(view.path)).toBe(true);
  expect(projectionProcessState().diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: view.path, copy: null, mark: expect.objectContaining({ reason: expect.stringContaining("alice") }) }),
  ]));
  await view.exec("git", ["config", "arc.identity", "alice"], { cwd: view.checkout });
  h.identity("alice");
  await startProjection({ store: h.store, checkout: view.checkout });
  expect(success(await h.store.read({ reference })).content).toBe(content);
});

async function taskView() {
  const h = createLifecycleHarness();
  const subject = await h.seedMeta("subject", { owner: "alice" });
  const sibling = await h.seedMeta("sibling", { owner: "alice" });
  const original = TASK_RULE_CONTENT.replace("\n---\n", "\nFirst note.\n\nSecond note.\n\n---\n");
  const record = await h.seed(recordReferences["work-item/task-list"](subject.reference.owner), original);
  const view = await project({ store: h.store, record, identity: "alice", path: ".arc/active/subject/tasks-subject.md" });
  const claim = (owner: StoreRecord) => writeWorktreeMarker(view.checkout, { spawnedByArc: false,
    spawningIdentity: "alice", createdAt: "2026-10-24T00:00:00Z", createdFor: boundWorkUnitSubject(owner) });
  return { ...view, store: h.store, original, record, subject, sibling, claim,
    stored: async () => success(await h.store.read({ reference: record.reference })) };
}

it("publishes command-start rights refusals and retries the preserved edit after checkout repair", async () => {
  const h = await taskView();
  const content = h.original.replace("First note.", "Changed first note.");
  const bytes = await h.edit(content);
  await h.claim(h.sibling);
  expect(await startProjection({ store: h.store, checkout: h.checkout })).toMatchObject({ kind: "ready" });
  expect((await h.stored()).content).toBe(h.original);
  expect(await h.file()).toBe(bytes);
  expect((await h.disk()).entries[h.path]).toMatchObject({ pending: true, refused: {
    reason: expect.stringContaining("owning checkout"), remedy: { text: expect.stringContaining("subject") },
  } });
  expect(projectionProcessState().roots.get(h.checkout)?.unsent.has(h.path)).toBe(true);
  expect(projectionProcessState().diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: h.path, copy: null, mark: expect.objectContaining({ reason: expect.stringContaining("owning checkout") }) }),
  ]));
  await h.claim(h.subject);
  expect(await startProjection({ store: h.store, checkout: h.checkout })).toMatchObject({ kind: "ready" });
  expect((await h.stored()).content).toBe(content);
  expect((await h.disk()).entries[h.path]).toMatchObject({ refused: null });
  expect(projectionProcessState().roots.get(h.checkout)?.unsent.has(h.path)).toBe(false);
});

it("reports a late aside rights refusal against that copy and retries it after checkout repair", async () => {
  const h = await taskView();
  await h.claim(h.subject);
  const first = h.original.replace("First note.", "Changed first note.");
  await h.edit(first);
  const ports = h.ports();
  await startProjection({ store: h.store, checkout: h.checkout, ports: () => ({ ...ports,
    writer: async () => ({ ...await ports.writer(), processInstance: "exited-rights-writer" }) }) });
  expect((await h.stored()).content).toBe(first);
  const entry = (await h.disk()).entries[h.path];
  if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("No displaced task-list copy");
  const copy = entry.copies[0].name;
  const late = first.replace("Second note.", "Changed second note.");
  const bytes = await h.edit(late, copy);
  await h.claim(h.sibling);
  await startProjection({ store: h.store, checkout: h.checkout });
  expect((await h.stored()).content).toBe(first);
  expect(await h.file()).toBe(bytes);
  expect((await h.disk()).entries[h.path]).toMatchObject({ pending: true, refused: { reason: expect.stringContaining("owning checkout") } });
  expect(projectionProcessState().roots.get(h.checkout)?.unsent.has(h.path)).toBe(true);
  expect(projectionProcessState().diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: h.path, copy, mark: expect.objectContaining({ reason: expect.stringContaining("owning checkout") }) }),
  ]));
  await h.claim(h.subject);
  await startProjection({ store: h.store, checkout: h.checkout });
  expect((await h.stored()).content).toBe(late);
});

it("retains an explicit resolution's rights refusal and resolves the same conflict after identity repair", async () => {
  const h = createReferenceFixture();
  const reference = recordReferences["personal/document"](OwnerIdentitySchema.parse({ type: "person", name: "alice" }), "scratch/document.md");
  const base = await seed(h, reference, "opening\nbase\nclosing\n");
  for (const side of ["stored", "incoming"]) success(await h.store.write({ action: "put", reference: base.reference,
    expected: base.version, content: `opening\n${side}\nclosing\n`, provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const current = success(await h.store.read({ reference: base.reference }));
  const conflict = current.conflicts[0];
  if (conflict === undefined) throw new Error("The writes produced no conflict");
  const view = await project({ store: h.store, record: current, identity: "bob", path: ".arc/user/alice/scratch/document.md" });
  await startProjection({ store: h.store, checkout: view.checkout, mode: "save", resolve: formatConflictToken(conflict) });
  expect(projectionProcessState().resolution).toMatchObject({ accepted: false,
    refusal: { reason: expect.stringContaining("alice"), remedy: { text: expect.stringContaining("alice") } } });
  expect(success(await h.store.read({ reference: base.reference })).conflicts).toEqual([conflict]);
  await view.exec("git", ["config", "arc.identity", "alice"], { cwd: view.checkout });
  await view.edit(current.content);
  await startProjection({ store: h.store, checkout: view.checkout, mode: "save", resolve: formatConflictToken(conflict) });
  expect(projectionProcessState().resolution).toMatchObject({ accepted: true });
  expect(success(await h.store.read({ reference: base.reference })).conflicts).toEqual([]);
});

it.each(["command-start", "take-in"] as const)("preserves a standing hold token through a %s rights refusal", async boundary => {
  const h = await createCheckoutFixture({ path: ".arc/user/andrew/document.txt" });
  directories.push(h.checkout);
  await initializeEngineCheckout(h.checkout);
  await h.edit(h.incoming);
  const held = await writeBackFile(h.context, h.index, h.request);
  const mark = held.result.entry.refused;
  const token = mark?.remedy.argv?.at(-1);
  if (mark?.reason !== "bases-disagree" || token === undefined) throw new Error("No real hold token was produced");
  const bytes = await h.file();
  const exec = await configureEngineCheckout(h.checkout);
  await exec("git", ["config", "arc.identity", "bob"], { cwd: h.checkout });
  await startProjection({ store: h.store, checkout: h.checkout,
    ...(boundary === "command-start" ? { mode: "save", resolve: token } as const : {}) });
  const root = projectionProcessState().roots.get(h.checkout);
  if (root === undefined) throw new Error("The command bound no root");
  if (boundary === "take-in") {
    const entry = held.result.entry;
    const copy = entry.copies[0];
    if (copy === undefined) throw new Error("The hold drawing left no displaced copy");
    await writeFile(join(h.checkout, copy.name), h.incoming);
    const answer = await withProjectionLock(h.location, async session => {
      root.checkpoint = session.step;
      try { return await root.takeIn({ ...h.request, entry, copy: copy.name }); }
      finally { root.checkpoint = null; }
    });
    expect(answer).toMatchObject({ status: "done", value: { answer: "refused", mark, entry: { pending: true, refused: mark } } });
    expect(await readFile(join(h.checkout, copy.name), "utf8")).toBe(h.incoming);
  } else expect(projectionProcessState().resolution).toMatchObject({ accepted: false,
    refusal: { reason: expect.stringContaining("andrew") } });
  const disk = await readProjectionIndex(h.location, true);
  if (disk.kind !== "index") throw new Error("The command lost the index");
  expect(disk.index.entries[h.path]).toMatchObject({ refused: mark });
  expect(await h.file()).toBe(bytes);
  expect(root.unsent.has(h.path)).toBe(true);
  expect(projectionProcessState().diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: h.path, mark: expect.objectContaining({ reason: expect.stringContaining("andrew") }) }),
  ]));
  await exec("git", ["config", "arc.identity", "andrew"], { cwd: h.checkout });
  await h.edit(h.incoming);
  await startProjection({ store: h.store, checkout: h.checkout, mode: "save", resolve: token });
  expect(projectionProcessState().resolution).toMatchObject({ accepted: true });
  expect(success(await h.store.read({ reference: h.entry.reference })).content).toBe(h.incoming);
});
