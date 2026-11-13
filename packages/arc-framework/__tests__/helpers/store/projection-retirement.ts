/** Native Git retirement fixtures over the reference Store, shared by removal and release coverage. */
import { boundHolderLookup } from "./bound-checkout.js";
import { boundWorkUnitSubject } from "./bound-checkout.js";
import { expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, makeGitExec, makeGitExecInput } from "../integration.js";
import { createRetirementHarness, retirementLink } from "./retirement-harness.js";
import { buildExecutorContext } from "../../../src/lib/work-unit/executor-context.js";
import { createUserIOContext } from "../../../src/lib/io-context.js";
import { createDefaultLocusPorts } from "../../../src/lib/work-unit/locus-ports.js";
import { createStoreTeardownContext } from "../../../src/lib/work-unit/store-teardown-context.js";
import { nodeReconcileWorkUnitWorktreeFs } from "../../../src/lib/work-unit/mutators/reconcile-work-unit-worktree.js";
import { runStoreAbandon } from "../../../src/lib/work-unit/verbs/abandon-store.js";
import { TeardownCommandInputSchema } from "../../../src/handlers/lifecycle.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs } from "../../../src/lib/git/worktree-marker.js";
import { runTeardown } from "../../../src/lib/work-unit/verbs/teardown.js";
import { localLifecycleTip } from "../../../src/lib/git/lifecycle-ref-refresh.js";
import { persistProjectionRemoval, type ProjectionPersistContext } from "../../../src/lib/store/projection/removal-persist.js";
import { passingProjectionRemovalSlots } from "../../../src/lib/git/worktree-removal.js";
import { seedProjection } from "./projection/seeded-projection.js";
import { renderStampedFile } from "../../../src/lib/store/projection/stamp.js";
import { RecordReferenceSchema } from "../../../src/lib/store/identity.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { beginProjectionCommand } from "../../../src/lib/store/projection/process-state.js";
import { createProjectionEnginePorts } from "../../../src/lib/store/projection/engine-ports.js";
import { guardProjectionIgnores } from "../../../src/lib/store/projection/ignore-guard.js";
import { writeWorktreeMarker, type WorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { releaseProjectionRemoval } from "../../../src/lib/store/projection/removal-release.js";
import { createRefusingStore } from "./projection/refusing-store.js";
import { lifecycleSuccess } from "./lifecycle-harness.js";
import { stageRecordFile } from "../../../src/lib/store/projection/staging.js";
import { guardReplacement } from "../../../src/lib/store/projection/replace-guard.js";
import { swapBatch } from "../../../src/lib/store/projection/swap.js";
import { createRecordRenderer } from "../../../src/lib/store/projection/record-render.js";
import { readReference } from "../../../src/lib/store/projection/change-detection.js";
import { readProjectionIndex, writeProjectionIndex } from "../../../src/lib/store/projection/index-file.js";
import { createHistoryMemo } from "../../../src/lib/store/projection/base-recovery.js";
import { recordWriteBack, TAKEN_IN_FOLDER } from "../../../src/lib/store/projection/taken-in.js";
import { projectionEntryForRecord } from "../../../src/lib/store/projection/materialization-file.js";
import { overrideEngineStore } from "./projection/engine-fixture.js";
import { startProjection, endProjection } from "../../../src/lib/store/projection/engine.js";
import type { TakeInPort } from "../../../src/lib/store/projection/take-in-port.js";
import type { ProjectionIndex, RecordEntry } from "../../../src/lib/store/projection/index-schema.js";
export const retirementFixtureRoots: string[] = [];
const roots = retirementFixtureRoots;
export async function fixture(options: { adopted?: boolean; ended?: boolean; secondary?: boolean; end?: "archive" | "decompose"; projected?: boolean; repository?: string } = {}) {
  const root = await createTempRepo(); roots.push(root);
  const exec = makeGitExec(root), execInput = makeGitExecInput(root);
  await exec("git", ["branch", "-M", "main"]); await writeFile(join(root, "base"), "base\n");
  if (options.projected) {
    await mkdir(join(root, ".arc/user"), { recursive: true });
    await writeFile(join(root, ".gitignore"), ".arc/user/*/\n");
    await writeFile(join(root, ".arc/user/.npmignore"), "*\n");
    await exec("git", ["add", ".gitignore", ".arc/user/.npmignore"]);
  }
  await exec("git", ["add", "base"]); await exec("git", ["commit", "-m", "base"]);
  await writeFile(join(root, ".git", "info", "exclude"), "origin.git/\ncheckout*/\n" + (options.projected
    ? ".arc/active/\n.arc/backlog/\n.arc/completed/\n.arc/system/.local/\n" : ".arc/\n"));
  const baseOid = (await exec("git", ["rev-parse", "HEAD"])).stdout;
  await exec("git", ["init", "--bare", join(root, "origin.git")]); await exec("git", ["remote", "add", "origin", join(root, "origin.git")]); await exec("git", ["push", "origin", "main"]);
  await exec("git", ["switch", "-c", "feat/demo"]); await writeFile(join(root, "work"), "work\n");
  await exec("git", ["add", "work"]); await exec("git", ["commit", "-m", "work"]); await exec("git", ["push", "-u", "origin", "feat/demo"]);
  const workOid = (await exec("git", ["rev-parse", "HEAD"])).stdout;
  if (options.secondary) { await exec("git", ["branch", "chore/demo", workOid]); await exec("git", ["push", "origin", "chore/demo"]); }
  const h = await createRetirementHarness({ ended: options.ended, end: options.end, branches: [...(options.secondary ? [retirementLink("chore/demo")] : []), retirementLink("feat/demo", options.adopted ? "adopted" : "created")].map(link => ({ ...link, repository: options.repository ?? link.repository })) });
  await exec("git", ["config", "arc.identity", "test-user"]);
  await seedProjection({ checkout: root, store: h.store, identity: SlugSchema.parse("test-user"), files: [] });
  let holder: string | null = root;
  const marker: WorktreeMarker = { spawnedByArc: false, wuName: "demo", createdFor: boundWorkUnitSubject(h.meta), spawningIdentity: "test-user", createdAt: "2026-10-14T00:00:00Z" };
  const ports = { ...createDefaultLocusPorts(), findHoldingCheckout: boundHolderLookup(h.meta, () => holder) };
  const io = { ...createUserIOContext(), exec, execInput };
  const executor = buildExecutorContext({ cwd: root, io, store: h.store, locusPorts: ports, projectId: async () => options.repository ?? "repo", identity: "test-user", teamMode: false, internalTemplateDir: "/templates" });
  const ctx = createStoreTeardownContext({ cwd: root, identity: "test-user", io }, executor);
  // The locus provider's admitted anchored claim is supplied through its marker seam; Git and filesystem operations stay real.
  ctx.readTeardownSelection = undefined; ctx.teardownWorktree = undefined;
  ctx.readMarker = (path) => Promise.resolve(path === holder ? { kind: "present", marker } : { kind: "absent" });
  ctx.worktreeFs = nodeReconcileWorkUnitWorktreeFs;
  const abandon = () => runStoreAbandon({ executor, storeTeardown: ctx, baseBranch: "main", removal: { exec, readMarker: ctx.readMarker } }, { name: "demo", confirmed: true });
  const teardown = async (name = "demo") => { const input = TeardownCommandInputSchema.parse({ name });
    if (input.name === undefined) throw Error("Expected teardown operand");
    const result = await runTeardown(ctx, { subject: { kind: "slug", slug: input.name }, base: "main" });
    if (result.status === "rejected") throw Error(result.reason); return result; };
  return { ...h, root, exec, ctx, executor, marker, baseOid, workOid, abandon, teardown, setHolder: (path: string) => { holder = path; },
    local: (ref: string) => localLifecycleTip(exec, root, ref), remote: () => exec("git", ["ls-remote", "origin", "refs/heads/feat/demo"]) };
}

export async function projectedRetirement(content = "Original prose.\n", extension: "md" | "txt" = "md",
  options: { ended?: boolean; repository?: string } = {}) {
  beginProjectionCommand();
  const h = await fixture({ ...options, projected: true });
  await h.exec("git", ["switch", "main"]);
  const checkout = join(h.root, "checkout"), path = `.arc/user/test-user/scratch/persist.${extension}`;
  await h.exec("git", ["worktree", "add", checkout, "feat/demo"]);
  h.marker.spawnedByArc = true; h.setHolder(checkout); await writeWorktreeMarker(checkout, h.marker);
  await ensureWorktreeMarkerIgnored(checkout, h.exec, nodeWorktreeMarkerIgnoreFs);
  await h.exec("git", ["config", "arc.identity", "test-user"], { cwd: checkout });
  const identity = SlugSchema.parse("test-user");
  const ports = createProjectionEnginePorts(checkout);
  expect(await guardProjectionIgnores({ root: checkout, identity, exec: ports.execInput, fs: ports.fs })).toMatchObject({ kind: "passed" });
  const record = await h.seed(RecordReferenceSchema.parse({ kind: "personal/document",
    owner: { type: "person", name: identity }, key: `scratch/persist.${extension}` }), content);
  const projected = await seedProjection({ checkout, store: h.store, identity, files: [{ path, reference: record.reference }] });
  const entry = projected.index.entries[path];
  if (entry?.kind !== "record") throw new Error("Missing projected fixture entry");
  let projectionContext: ProjectionPersistContext = { store: h.store, identity };
  h.ctx.projectionRemovalSlots = { ...passingProjectionRemovalSlots,
    persist: target => persistProjectionRemoval(target, projectionContext),
    release: (target, primary) => releaseProjectionRemoval(target, primary, projectionContext) };
  const remove = () => {
    const input = TeardownCommandInputSchema.parse({ name: "demo" });
    if (input.name === undefined) throw new Error("No teardown operand");
    return runTeardown(h.ctx, { subject: { kind: "slug", slug: input.name }, base: "main" });
  };
  return { ...h, ...projected, path, record, entry, remove,
    persist: () => persistProjectionRemoval(checkout, projectionContext),
    release: () => releaseProjectionRemoval(checkout, false, projectionContext),
    configure: (changes: Partial<ProjectionPersistContext>) => { projectionContext = { ...projectionContext, ...changes }; },
    edit: (content: string) => writeFile(join(checkout, path), extension === "md" ? renderStampedFile({ content, stamp: entry.base.blob }) : content) };
}


export async function retirementRecording() {
  const h = await projectedRetirement();
  const initial = { checkout: h.checkout, store: h.store, mode: "save" as const };
  expect(await startProjection(initial)).toMatchObject({ kind: "ready" });
  await endProjection(initial);
  await h.edit("Accepted input awaiting its recording.\n");
  const refusing = createRefusingStore(h.store);
  let blocked = true;
  const store = overrideEngineStore(refusing.store, { batch: async input => {
    const result = await h.store.batch(input);
    if (blocked && result.status === "ok") refusing.refuse("read", { code: "state-unresolvable", class: "recoverable", historyRefs: [],
      condition: "Read-back is unavailable.", remedy: { text: "Repair the read-back and retry arc save." } });
    return result;
  } });
  const command = { ...initial, store };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  const disk = await readProjectionIndex(h.location, true, { groups: "all" });
  const entry = disk.kind === "index" ? disk.index.entries[h.path] : undefined;
  if (entry?.kind !== "record" || entry.persisted?.recording !== true || entry.persisted.takenIn.kind !== "copy")
    throw new Error("The failed read-back did not retain unfinished recording");
  h.configure({ store });
  return { ...h, command, retained: join(h.location.stateDir, TAKEN_IN_FOLDER, entry.persisted.takenIn.name),
    repair: () => { blocked = false; refusing.refuse("read", null); } };
}

export async function retirementRetainedBase(extension: "md" | "txt") {
  const h = await projectedRetirement("opening\nbase\nclosing\n", extension);
  const takenIn = "opening\naccepted\nclosing\n";
  lifecycleSuccess(await h.store.write({ action: "put", reference: h.record.reference, expected: h.record.version,
    content: takenIn, provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const accepted = lifecycleSuccess(await h.store.read({ reference: h.record.reference }));
  lifecycleSuccess(await h.store.write({ action: "put", reference: accepted.reference, expected: accepted.version,
    content: `${takenIn}concurrent\n`, provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const current = lifecycleSuccess(await h.store.read({ reference: h.record.reference }));
  const recorded = await recordWriteBack({ location: h.location, entry: h.entry, stamp: h.entry.base.blob, takenIn,
    outcome: { kind: "landed", version: accepted.version }, readBack: current, grammar: undefined, format: "sha1", memo: createHistoryMemo(h.store) });
  const kept = recorded.entry.persisted?.takenIn;
  if (kept?.kind !== "copy") throw new Error("The accepted input was not retained");
  const refreshed = { ...projectionEntryForRecord(current, h.path, "sha1"), persisted: recorded.entry.persisted };
  await writeProjectionIndex(h.location, { ...h.index, entries: { ...h.index.entries, [h.path]: refreshed } });
  const content = current.content.replace("opening", "edited opening");
  await h.edit(content);
  return { ...h, content, current, retained: join(h.location.stateDir, TAKEN_IN_FOLDER, kept.name) };
}

export async function interruptedRetirementCopy() {
  const h = await projectedRetirement("opening\nbase\nclosing\n");
  lifecycleSuccess(await h.store.write({ action: "put", reference: h.record.reference, expected: h.record.version,
    content: "opening\nbase\nclosing\nremote footer\n", provenance: { verb: "edit", lifecycleAction: "edit" } }));
  return interruptedRetirementReplacement(h, h.index, h.entry);
}

export async function interruptedRetirementReplacement(h: Awaited<ReturnType<typeof projectedRetirement>>, index: ProjectionIndex, previous: RecordEntry,
  at: "afterMove" | "afterFirstCheck" = "afterMove") {
  const record = lifecycleSuccess(await h.store.read({ reference: h.record.reference }));
  const writer = await createProjectionEnginePorts(h.checkout).writer(), renderer = createRecordRenderer({ store: h.store });
  const staged = lifecycleSuccess(await stageRecordFile({ checkout: h.checkout, path: h.path, record,
    replacing: previous.base.blob, writer, format: "sha1", renderer }));
  const takeIn: TakeInPort = async request => ({ answer: "deferred", entry: request.entry });
  const replace = await guardReplacement({ checkout: h.checkout, path: h.path, entry: previous, staged,
    reference: await readReference(h.checkout), store: h.store, writer, format: "sha1", renderer, takeIn });
  if (replace.kind !== "replace") throw new Error("Fixture replacement refused");
  const stopped = new Error("stop after copy move");
  const stop = (): Promise<never> => Promise.reject(stopped);
  await expect(swapBatch({ checkout: h.checkout, location: h.location, index,
    files: [{ path: h.path, replace }], writer, format: "sha1", takeIn, readBack: false,
    hooks: at === "afterMove" ? { afterMove: stop } : { afterFirstCheck: stop } })).rejects.toBe(stopped);
  const disk = await readProjectionIndex(h.location, true, { groups: "all" });
  const entry = disk.kind === "index" ? disk.index.entries[h.path] : undefined;
  const copy = entry?.kind === "record" ? entry.copies.at(-1) : undefined;
  if (entry?.kind !== "record" || copy === undefined) throw new Error("No interrupted replacement copy");
  if (disk.kind !== "index") throw new Error("No interrupted replacement index");
  return { ...h, index: disk.index, entry, copy, staged };
}
