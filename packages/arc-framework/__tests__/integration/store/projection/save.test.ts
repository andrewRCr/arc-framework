/** Save runs through the registered CLI, its start hook, and a real reference backend. */
import { afterEach, expect, it, vi } from "vitest";
import { Command } from "commander";
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
import { chmod, lstat, mkdir, readFile, rename, symlink, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { createCheckoutFixture } from "../../../helpers/store/projection/checkout-fixture.js";
import { initializeEngineCheckout } from "../../../helpers/store/projection/engine-fixture.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";
import { readProjectionIndex, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { update } from "../../../helpers/store/suite-tools.js";
import { seedStatusConflict } from "../../../helpers/store/status-conflicts.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { RecordReferenceSchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";
import { COHORT_REGISTRATION } from "../../../../src/lib/store/kinds/cohort/registration.js";
import { withProjectionLock, PROJECTION_LOCK_FILE } from "../../../../src/lib/store/projection/lock.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { acquireAdvisoryLock, releaseAdvisoryLockConfirmed, type AdvisoryLockHandle } from "../../../../src/lib/advisory-lock.js";
import { ADVISORY_LEASE_DURATION_MS } from "../../../../src/lib/renewable-lease.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { flatWorkItemArtifactPath } from "../../../../src/lib/store/lifecycle-storage.js";
import { createLifecycleHarness } from "../../../helpers/store/lifecycle-harness.js";
import { lackingEndedHistory } from "../../../helpers/store/ended-history.js";
import { registerProjectionHooks } from "../../../../src/lib/store/projection/command-hooks.js";
import { HistoryRefSchema, PullResultSchema, StoreRefusalSchema } from "../../../../src/lib/store/index.js";
import { createEditorHandles } from "../../../helpers/store/projection/editor-handles.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { createRecordRenderer } from "../../../../src/lib/store/projection/record-render.js";
import { createProjectionProtection } from "../../../../src/lib/store/projection/protection.js";
import { TASK_RULE_CONTENT } from "../../../helpers/store/task-rule-input.js";
import { createHistoryRefusingStore } from "../../../helpers/store/projection/history-refusing-store.js";
import { stageRecordFile } from "../../../../src/lib/store/projection/staging.js";
import { guardReplacement } from "../../../../src/lib/store/projection/replace-guard.js";
import { swapBatch } from "../../../../src/lib/store/projection/swap.js";
import { readReference } from "../../../../src/lib/store/projection/change-detection.js";
import { writeBackProjectionFiles } from "../../../../src/lib/store/projection/engine-files.js";
import { createProjectionReporter } from "../../../../src/lib/store/projection/report.js";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { resolveArcPath } from "../../../../src/lib/layout/index.js";
import { selectProjectedMarkdown } from "../../../../src/lib/store/projection/selection.js";


const directories: string[] = [];
const editors = createEditorHandles();
afterEach(async () => { binding.store = null; binding.singleUse = false; binding.ports = null;
  await editors.closeAll(); await removeGitBackedDirs(directories.splice(0)); });

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

it("refuses the skip switch without sending edits and saves normally once the switch is omitted", async () => {
  const h = await createEngineFixture(directories);
  await h.edit("explicit save edit\n");
  const before = success(await h.store.version());
  const skipped = await save(h, ["--skip-projection"]);
  expect(skipped).toMatchObject({ exitCode: 1, result: { status: "refused", refusal: { code: "projection-skipped",
    condition: expect.stringContaining("--skip-projection"), remedy: { text: expect.stringContaining("without --skip-projection") } } } });
  expect((await h.stored()).content).toBe(h.record.content);
  expect(await h.file()).toContain("explicit save edit");
  expect(success(await h.store.version())).toBe(before);
  expect((await save(h)).result).toMatchObject({ status: "ok" });
  expect((await h.stored()).content).toBe("explicit save edit\n");
});

it("saves a completed-file edit and returns the version after that write", async () => {
  const h = await createEngineFixture(directories, { kind: "work-item/notes",
      path: ".arc/completed/2026-q4/01_work-item-one/notes-work-item-one.md",
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  await h.edit("completed edit\n");
  const saved = await save(h);
  expect(saved.result).toMatchObject({ status: "ok", result: { version: success(await h.store.version()) } });
  expect(saved.exitCode).toBe(0);
  expect((await h.stored()).content).toBe("completed edit\n");
  expect(success(await h.store.history({ reference: h.record.reference }))[0]?.provenance).toMatchObject({ verb: "save", lifecycleAction: "edit" });
});

async function archivedView(artifact: "meta" | "tasks" | "companion" = "meta", identity = "andrew") {
  const h = createLifecycleHarness();
  h.store.environment.identity = identity;
  const primary = await h.seedMeta("corrected", { owner: "andrew", state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const record = artifact === "meta" ? primary : artifact === "tasks"
    ? await h.seed(recordReferences["work-item/task-list"](primary.reference.owner), TASK_RULE_CONTENT.replaceAll("`[ ]`", "`[x]`"))
    : await h.seed(recordReferences["work-item/companion"](primary.reference.owner, "attachment.txt"), "First line.\n\nLast line.\n");
  const placement = record.placement;
  if (placement?.kind !== "completed" || !("sequence" in placement)) throw new Error("The backend assigned no archive placement");
  const owner = record.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("The backend assigned no archived owner UID");
  const path = artifact === "companion"
    ? `${dirname(flatWorkItemArtifactPath("corrected", "meta", placement, null))}/attachment.txt`
    : flatWorkItemArtifactPath("corrected", artifact, placement, null);
  const selectedIdentity = SlugSchema.parse(identity);
  const view = await seedProjection({ store: h.store, files: [{ reference: record.reference, path }], identity: selectedIdentity,
    renderer: checkout => createRecordRenderer({ store: h.store,
      protection: createProjectionProtection({ store: h.store, checkout, identity: selectedIdentity, exec: createProjectionEnginePorts(checkout).exec }) }) });
  directories.push(view.checkout);
  const exec = await configureEngineCheckout(view.checkout);
  await exec("git", ["config", "arc.identity", identity], { cwd: view.checkout });
  const entry = view.index.entries[path];
  if (entry?.kind !== "record") throw new Error("The projection omitted its archived meta");
  const file = () => readFile(join(view.checkout, path), "utf8");
  return { ...h, ...view, record, placement, owner, path, exec, file,
    history: HistoryRefSchema.parse(`refs/arc/history/work/${owner.uid}`),
    stored: async () => success(await h.store.read({ reference: record.reference })),
    edit: async (content: string) => {
      const stamp = parseStampedFile(await file()).stamp;
      if (stamp === null) throw new Error("The archived projection lost its stamp");
      await writeFile(join(view.checkout, path), renderStampedFile({ content, stamp }));
    } };
}

it("pulls an archived owner's named history under the save lease and keeps its assigned archive number", async () => {
  const h = await archivedView();
  const content = `${h.record.content}\nOwner correction.\n`;
  await h.edit(content);
  const missing = lackingEndedHistory(h.store, h.record.reference.owner);
  const pulls: { history: readonly string[]; held: boolean }[] = [];
  const store = overrideEngineStore(missing, { pull: async input => {
    pulls.push({ history: input?.history ?? [], held: projectionProcessState().lockHeld });
    return missing.pull(input);
  } });
  const saved = await save({ store, checkout: h.checkout });
  expect(saved.result).toMatchObject({ status: "ok", result: { version: success(await h.store.version()) } });
  expect(saved.errors).toBe("");
  const current = await h.stored();
  expect(current.content).toBe(content);
  expect(current.placement).toEqual(h.placement);
  expect(pulls).toEqual([{ history: [h.history], held: true }]);
});

it("routes history-pull notices through the command reporter before output and flushes them once", async () => {
  const h = await archivedView();
  const content = `${h.record.content}\nReported correction.\n`;
  await h.edit(content);
  const missing = lackingEndedHistory(h.store, h.record.reference.owner);
  const store = overrideEngineStore(missing, { pull: async input => {
    const pulled = await missing.pull(input);
    if (pulled.status === "refused") return pulled;
    return { status: "ok", result: PullResultSchema.parse({ ...pulled.result,
      pulls: pulled.result.pulls.map(each => ({ ...each, notices: [...each.notices, { kind: "tracking-update-failed",
        ref: `refs/arc-remotes/origin/history/work/${h.owner.uid}`, condition: "The history tracking ref needs repair.",
        remedy: { text: "Repair the tracking ref, then retry the pull.", argv: ["arc", "store", "pull"] } }] })) }) };
  } });
  const events: { stream: string; text: string }[] = [];
  const program = new Command("arc").exitOverride();
  program.command("save").action(() => { events.push({ stream: "stdout", text: JSON.stringify({ ok: true }) }); });
  registerProjectionHooks(program, { input: () => ({ store, checkout: h.checkout }),
    writeError: text => { events.push({ stream: "stderr", text }); } });
  await program.parseAsync(["save"], { from: "user" });
  expect((await h.stored()).content).toBe(content);
  expect(events[0]).toMatchObject({ stream: "stderr", text: expect.stringContaining("The history tracking ref needs repair.") });
  const reports = events.filter(each => each.stream === "stderr").map(each => each.text).join("");
  expect(reports).toContain("Repair the tracking ref, then retry the pull.");
  expect(reports).toContain("arc store pull");
  expect(reports.match(/The history tracking ref needs repair\./gu)).toHaveLength(1);
  expect(JSON.parse(events.find(each => each.stream === "stdout")?.text ?? "")).toEqual({ ok: true });
});

async function staleArchivedView() {
  const h = await archivedView();
  const base = `${h.record.content}\nFirst note.\n\nSeparate note.\n\nSecond note.\n`;
  await h.edit(base);
  expect((await save(h)).errors).toBe("");
  const previous = await h.stored();
  const remote = base.replace("First note.", "Remote first note.");
  success(await h.store.write({ action: "put", reference: h.record.reference, expected: previous.version,
    content: remote, placement: { kind: "completed", quarter: h.placement.quarter },
    provenance: { verb: "save", lifecycleAction: "edit" } }));
  await h.edit(base.replace("Second note.", "Local second note."));
  return { ...h, base, previous, remote, merged: remote.replace("Second note.", "Local second note.") };
}

it("memoizes the retried historical base of an archived correction and merges it after a writer repair", async () => {
  const h = await staleArchivedView();
  const bytes = await h.file();
  const missing = lackingEndedHistory(h.store, h.record.reference.owner);
  let blocked = true;
  const store = overrideEngineStore(missing, { batch: input => blocked ? Promise.resolve({ status: "refused",
    refusal: { code: "lock-held", class: "recoverable", lock: "archive", condition: "The archive writer is held.",
      remedy: { text: "Release the archive writer, then retry arc save.", argv: ["arc", "save"] } } }) : missing.batch(input) });
  const refused = await save({ store, checkout: h.checkout });
  expect(refused.errors).toContain("The archive writer is held.");
  expect((await h.stored()).content).toBe(h.remote);
  expect(await h.file()).toBe(bytes);
  const memo = projectionProcessState().history;
  if (memo === null) throw new Error("The command bound no history memo");
  expect(success(await memo.read(h.record.reference))).toContainEqual(expect.objectContaining({ version: h.previous.version, content: h.base }));
  blocked = false;
  expect((await save({ store, checkout: h.checkout })).errors).toBe("");
  expect((await h.stored()).content).toBe(h.merged);
  expect((await h.stored()).placement).toEqual(h.placement);
});

type BlockedHistoryPull = "lock-held" | "state-failed" | "candidate-failed" | "designation-needed";
function blockedHistoryPull(kind: BlockedHistoryPull): Awaited<ReturnType<Store["pull"]>> {
  if (kind === "lock-held") return { status: "refused", refusal: { code: "lock-held", class: "recoverable",
    lock: "history-pull", condition: "The history pull lock is held.", remedy: { text: "Release the history pull lock." } } };
  if (kind === "designation-needed") return { status: "ok", result: PullResultSchema.parse({ states: [{
    status: "designation-needed", remote: "origin", choices: ["push", "read", "off"],
    remedy: { text: "Choose the origin store designation." } }], pulls: [] }) };
  return { status: "ok", result: PullResultSchema.parse({ states: [], pulls: [{ status: "failed",
    role: kind === "state-failed" ? "state" : "candidate", remote: "origin", families: ["work-item"], notices: [],
    failure: { code: "unreachable", class: "recoverable", cause: "network", condition: "The history remote is unavailable.",
      remedy: { text: "Restore the history remote." } } }] }) };
}

it.each<BlockedHistoryPull>(["lock-held", "state-failed", "candidate-failed", "designation-needed"])(
  "keeps an archived edit and its original remedy when its pull is %s, then saves after repair", async kind => {
    const h = await archivedView();
    const content = `${h.record.content}\nRetry this archived correction.\n`;
    const missing = lackingEndedHistory(h.store, h.record.reference.owner);
    const first = await missing.write({ action: "put", reference: h.record.reference, expected: h.record.version,
      content, placement: { kind: "completed", quarter: h.placement.quarter }, provenance: { verb: "save", lifecycleAction: "edit" } });
    if (first.status !== "refused") throw new Error("The fixture did not refuse missing history");
    await h.edit(content);
    const bytes = await h.file();
    let blocked = true, pulls = 0;
    const store = overrideEngineStore(missing, { pull: input => {
      pulls++;
      return blocked ? Promise.resolve(blockedHistoryPull(kind)) : missing.pull(input);
    } });
    const refused = await save({ store, checkout: h.checkout });
    expect(refused.errors).toContain(first.refusal.condition);
    expect(refused.errors).toContain(first.refusal.remedy.text);
    expect((await h.stored()).content).toBe(h.record.content);
    expect(await h.file()).toBe(bytes);
    const firstPulls = pulls;
    blocked = false;
    expect((await save({ store, checkout: h.checkout })).errors).toBe("");
    expect((await h.stored()).content).toBe(content);
    expect((await h.stored()).placement).toEqual(h.placement);
    expect(firstPulls).toBe(1);
    expect(pulls).toBe(2);
  });

it.each(["history", "primary-read"] as const)("keeps a late archived aside edit offline at ordinary command start and names save as its repair (%s)", async fault => {
  const h = await archivedView();
  const stamp = parseStampedFile(await h.file()).stamp;
  if (stamp === null) throw new Error("The archived projection lost its stamp");
  const editor = await editors.open(join(h.checkout, h.path));
  const first = `${h.record.content}\nFirst archived correction.\n`;
  await h.edit(first);
  const ports = createProjectionEnginePorts(h.checkout);
  await startProjection({ store: h.store, checkout: h.checkout, mode: "save", ports: () => ({ ...ports,
    writer: async () => ({ ...await ports.writer(), processInstance: "exited-archive-writer" }) }) });
  expect((await h.stored()).content).toBe(first);
  const disk = await readProjectionIndex(h.location, true, { groups: "all" });
  const entry = disk.kind === "index" ? disk.index.entries[h.path] : undefined;
  if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("The save retained no displaced editor copy");
  const copy = entry.copies[0].name;
  const late = `${first}\nLate archived correction.\n`;
  const bytes = renderStampedFile({ content: late, stamp });
  await editor.truncate(0); await editor.writeFile(bytes);
  const missing = lackingEndedHistory(h.store, h.record.reference.owner);
  let pulls = 0;
  let missingPrimary = true;
  const primary = await missing.history({ reference: h.record.reference });
  if (primary.status !== "refused") throw new Error("The missing history did not refuse its read");
  const primaryRefusal = primary.refusal;
  const selected = fault === "history" ? missing : overrideEngineStore(h.store, {
    read: input => missingPrimary && input.reference.kind === h.record.reference.kind
      && input.reference.owner.name === h.owner.name ? Promise.resolve({ status: "refused", refusal: primaryRefusal }) : h.store.read(input),
  });
  const store = overrideEngineStore(selected, { pull: input => {
    pulls++;
    if (input?.history?.includes(h.history)) missingPrimary = false;
    return selected.pull(input);
  } });
  const output: string[] = [];
  const program = new Command("arc").exitOverride();
  program.command("probe").action(() => { output.push("command output"); });
  registerProjectionHooks(program, { input: () => ({ store, checkout: h.checkout }), writeError: text => { output.push(text); } });
  await program.parseAsync(["probe"], { from: "user" });
  expect((await h.stored()).content).toBe(first);
  expect(await h.file()).toBe(bytes);
  expect(pulls).toBe(0);
  const diagnostic = output.slice(0, output.indexOf("command output")).join("");
  expect(diagnostic).toContain(h.path);
  expect(diagnostic).toContain(copy);
  expect(diagnostic).toContain("arc save");
  expect((await save({ store, checkout: h.checkout })).errors).toBe("");
  expect((await h.stored()).content).toBe(late);
  expect((await h.stored()).placement).toEqual(h.placement);
  expect(pulls).toBe(1);
});

it("keeps an interrupted archived stampless edit offline and names save before a repaired retry lands", async () => {
  const h = await archivedView("companion");
  const original = h.index.entries[h.path];
  if (original?.kind !== "record") throw new Error("The companion was not projected");
  const next = "Updated first line.\n\nLast line.\n";
  success(await h.store.write({ action: "put", reference: h.record.reference, content: next, expected: h.record.version,
    provenance: { verb: "save", lifecycleAction: "edit" } }));
  const current = await h.stored();
  const writer = { ...await createProjectionEnginePorts(h.checkout).writer(), processInstance: "interrupted-archive-writer" };
  const renderer = createRecordRenderer({ store: h.store });
  const staged = success(await stageRecordFile({ checkout: h.checkout, path: h.path, record: current,
    replacing: original.base.blob, writer, format: "sha1", readOnly: false, renderer }));
  const takeIn = async () => { throw new Error("The unedited original must not be sent"); };
  const replace = await guardReplacement({ checkout: h.checkout, path: h.path, entry: original, staged,
    reference: await readReference(h.checkout), format: "sha1", store: h.store, writer, renderer, takeIn });
  if (replace.kind !== "replace") throw new Error("The unedited companion could not be replaced");
  await expect(swapBatch({ location: h.location, checkout: h.checkout, index: h.index, files: [{ path: h.path, replace }],
    readBack: false, writer, format: "sha1", takeIn, hooks: { afterRecheck: async () => { throw new Error("interrupted before moving"); } },
  })).rejects.toThrow("interrupted before moving");
  const content = `${next}\nOwner correction after interruption.\n`;
  await writeFile(join(h.checkout, h.path), content);
  const missing = lackingEndedHistory(h.store, h.owner);
  let pulls = 0;
  const store = overrideEngineStore(missing, { pull: input => { pulls++; return missing.pull(input); } });
  expect(await startProjection({ store, checkout: h.checkout })).toMatchObject({ kind: "ready" });
  const root = projectionProcessState().roots.get(h.checkout);
  if (root === undefined) throw new Error("The command did not bind its projection root");
  const disk = await readProjectionIndex(h.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("The interrupted index is unavailable");
  expect(disk.index.entries[h.path]).toMatchObject({ inProgress: { replaces: original.base } });
  await withProjectionLock(h.location, async session => {
    root.checkpoint = session.step;
    try { await writeBackProjectionFiles(root, disk.index, [h.path]); }
    finally { root.checkpoint = null; }
  });
  let diagnostic = "";
  createProjectionReporter(store, text => { diagnostic += text; })();
  expect((await h.stored()).content).toBe(next);
  expect(await h.file()).toBe(content);
  expect(pulls).toBe(0);
  expect(await readProjectionIndex(h.location, true, { groups: "all" })).toMatchObject({ kind: "index", index: { entries: { [h.path]: { pending: true } } } });
  expect(diagnostic).toContain(h.path);
  expect(diagnostic).toContain("arc save");
  expect((await save({ store, checkout: h.checkout })).errors).toBe("");
  expect((await h.stored()).content).toBe(content);
  expect((await h.stored()).placement).toEqual(h.placement);
  expect(pulls).toBe(1);
});

it.each(["meta", "tasks"] as const)("protects another person's archived %s and lands the same correction for its owner", async artifact => {
  const h = await archivedView(artifact, "bob");
  expect((await lstat(join(h.checkout, h.path))).mode & 0o222).toBe(0);
  expect(await h.file()).toContain("Code generated by ARC. DO NOT EDIT.");
  expect(await h.file()).toContain("andrew");
  const content = `${h.record.content}\nArchived owner correction.\n`;
  await chmod(join(h.checkout, h.path), 0o644);
  await h.edit(content);
  const bytes = await h.file();
  const denied = await save(h);
  expect(denied.errors).toContain("andrew");
  expect((await h.stored()).content).toBe(h.record.content);
  expect(await h.file()).toBe(bytes);
  await h.exec("git", ["config", "arc.identity", "andrew"], { cwd: h.checkout });
  h.store.environment.identity = "andrew";
  expect((await save(h)).errors).toBe("");
  expect((await h.stored()).content).toBe(content);
  expect((await h.stored()).placement).toEqual(h.placement);
  const disk = await readProjectionIndex(h.location, true, { groups: "all" });
  expect(disk).toMatchObject({ kind: "index", index: { entries: { [h.path]: { protected: false, refused: null } } } });
  expect((await lstat(join(h.checkout, h.path))).mode & 0o222).not.toBe(0);
});

it.each(["no-history-named", "namespace-corrupt"] as const)("does not pull an archived %s refusal and saves after local repair", async kind => {
  const h = await archivedView();
  const content = `${h.record.content}\nLocally repaired correction.\n`;
  await h.edit(content);
  const bytes = await h.file();
  const refusal = StoreRefusalSchema.parse(kind === "no-history-named"
    ? { code: "state-unresolvable", class: "recoverable", reference: h.record.reference, historyRefs: [],
      condition: "The captured state version is unavailable.", remedy: { text: "Restore the captured version locally, then retry this edit." } }
    : { code: "namespace-corrupt", class: "terminal", namespace: h.history,
      condition: "The retained archive namespace is malformed.", remedy: { text: "Restore valid archive namespace data locally, then retry." } });
  let blocked = true, pulls = 0;
  const store = overrideEngineStore(h.store, {
    batch: input => blocked ? Promise.resolve({ status: "refused", refusal }) : h.store.batch(input),
    pull: input => { pulls++; return h.store.pull(input); },
  });
  const refused = await save({ store, checkout: h.checkout });
  expect(refused.errors).toContain(refusal.condition);
  expect(refused.errors).toContain(refusal.remedy.text);
  expect((await h.stored()).content).toBe(h.record.content);
  expect(await h.file()).toBe(bytes);
  expect(pulls).toBe(0);
  blocked = false;
  expect((await save({ store, checkout: h.checkout })).errors).toBe("");
  expect((await h.stored()).content).toBe(content);
  expect((await h.stored()).placement).toEqual(h.placement);
  expect(pulls).toBe(0);
});

it("keeps the retried history refusal's remedy until the archived base is repaired", async () => {
  const h = await staleArchivedView();
  const bytes = await h.file();
  const refusing = createHistoryRefusingStore(h.store, [h.record.reference]);
  const retried = StoreRefusalSchema.parse({ code: "state-unresolvable", class: "recoverable",
    reference: h.record.reference, historyRefs: [h.history], condition: `The tip or a tree of ${h.history} is unavailable locally.`,
    remedy: { text: `Restore or fetch the missing objects for ${h.history} in the store repository, then retry.` } });
  let repaired = false;
  const store = overrideEngineStore(refusing.store, { history: async input => {
    if (repaired) return h.store.history(input);
    const result = await refusing.store.history(input);
    return refusing.calls("history") > 1 ? { status: "refused", refusal: retried } : result;
  } });
  const refused = await save({ store, checkout: h.checkout });
  expect(refused.errors).toContain(retried.condition);
  expect(refused.errors).toContain(retried.remedy.text);
  expect(refused.errors).not.toContain("This clone has not fetched the record's history.");
  expect((await h.stored()).content).toBe(h.remote);
  expect(await h.file()).toBe(bytes);
  expect(refusing.calls("pull")).toBe(1);
  expect(refusing.calls("history")).toBe(2);
  repaired = true;
  expect((await save({ store, checkout: h.checkout })).errors).toBe("");
  expect((await h.stored()).content).toBe(h.merged);
  expect((await h.stored()).placement).toEqual(h.placement);
  expect(refusing.calls("pull")).toBe(1);
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
  const h = await createCheckoutFixture({ path: ".arc/user/andrew/scratch/document.txt" });
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
    owner: { type: "person", name: "andrew" }, key: path.slice(".arc/user/andrew/".length) }), "opening\nbase\nclosing\n");
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
  const h = await conflictedProjection(".arc/user/andrew/scratch/document.txt");
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
  const h = await conflictedProjection(".arc/user/andrew/scratch/document.md", false);
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
  const h = await conflictedProjection(".arc/user/andrew/scratch/document.txt");
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

it("names an unprojected in-flight subject's exact owner and resolves once refresh supplies its mapping", async () => {
  const { f, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  directories.push(f.root);
  const other = await seed(f, RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "beta" } }),
    makeMetaFixture("beta", { owner: "andrew", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }),
    { kind: "active" });
  const owner = other.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Native fixture allocated no work-item UID");
  const subject = await seed(f, recordReferences["work-item/companion"](other.reference.owner, "correction.txt"), "opening\nbase\nclosing\n");
  for (const content of ["opening\ncurrent\nclosing\n", "opening\nincoming\nclosing\n"]) {
    success(await f.store.write({ action: "put", reference: subject.reference, expected: subject.version, content,
      provenance: { verb: "edit", lifecycleAction: "edit" } }));
  }
  const clashed = success(await f.store.read({ reference: subject.reference })), conflict = clashed.conflicts[0];
  if (conflict === undefined) throw new Error("Native writes produced no conflict");
  const content = "New prose without the conflicted span\n";
  success(await f.store.write({ action: "put", reference: subject.reference, expected: clashed.version, content,
    provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const token = formatConflictToken(conflict), before = success(await f.store.version());
  const refused = await save({ store: f.store, checkout: f.root }, ["--resolve", token]);
  expect(refused.result).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("no projected file"),
    remedy: { text: expect.stringContaining(owner.name) } } });
  expect(refused.result.refusal?.remedy.text).toContain(owner.uid);
  expect(success(await f.store.version())).toBe(before);
  expect(success(await f.store.read({ reference: subject.reference })).conflicts).toEqual([conflict]);
  const path = resolveArcPath({ kind: "work-unit-companion", slug: SlugSchema.parse("beta"), key: "correction.txt",
    placement: { kind: "active", scope: { kind: "project", location: { kind: "another" } } } });
  expect(await readFile(join(f.root, path), "utf8")).toContain(content);
  expect(await readProjectionIndex(projected.location, true)).toMatchObject({ kind: "index", index: {
    entries: { [path]: { reference: subject.reference, unshown: [conflict] } },
  } });
  expect((await save({ store: f.store, checkout: f.root }, ["--resolve", token])).result.status).toBe("ok");
  expect(success(await f.store.read({ reference: subject.reference }))).toMatchObject({ content, conflicts: [] });
  expect(await f.store.read({ reference: conflict })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});

it("names an indexed conflict that was already resolved", async () => {
  const h = await conflictedProjection(".arc/user/andrew/scratch/document.txt");
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

async function cohortResolutionCopies() {
  const fixture = createReferenceFixture({}, { "cohort/document": { parser: COHORT_REGISTRATION.parser },
    "work-item/meta": { parser: META_REGISTRATION.parser } });
  fixture.identity("andrew");
  const content = "# Cohort: cohort-one\n\n**Parent:** [none]\n\n**Purpose:** Coordinate work.\n\nOriginal prose.\n";
  const base = await seed(fixture, fixture.reference("cohort/document"), content);
  const primary = await seed(fixture, fixture.reference("work-item/meta"), makeMetaFixture("work-item-one", {
    owner: "andrew", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop", cohort: "cohort-one" }));
  success(await fixture.store.write(update(fixture, base, content.replace("Original prose.", "Stored prose."))));
  success(await fixture.store.write(update(fixture, base, content.replace("Original prose.", "Competing prose."))));
  const current = success(await fixture.store.read({ reference: base.reference })), conflict = current.conflicts[0];
  if (conflict === undefined) throw new Error("Sync produced no cohort conflict");
  const paths = [resolveArcPath({ kind: "cohort-document", cohort: [SlugSchema.parse("cohort-one")],
    placement: { kind: "planned" } }), ".arc/active/current/cohort-cohort-one.md"];
  const extraPath = ".arc/user/andrew/scratch/extra.md";
  const extra = await seed(fixture, RecordReferenceSchema.parse({ kind: "personal/document",
    owner: { type: "person", name: "andrew" }, key: "scratch/extra.md" }), "# Extra\n\nOriginal.\n");
  const withoutHistory = createHistoryRefusingStore(fixture.store, [current.reference]);
  const projected = await seedProjection({ store: fixture.store, renderer: () => createRecordRenderer({ store: withoutHistory.store }), files: [
    ...paths.map(path => ({ path, reference: current.reference })), { path: extraPath, reference: extra.reference },
  ] });
  for (const path of paths) {
    const entry = projected.index.entries[path];
    if (entry?.kind !== "record" || entry.markers !== null || entry.notices.length !== 1) throw new Error("Cohort conflict was not rendered as a notice");
  }
  directories.push(projected.checkout);
  await configureEngineCheckout(projected.checkout);
  await writeWorktreeMarker(projected.checkout, { spawnedByArc: false, spawningIdentity: "andrew",
    createdAt: "2026-11-01T00:00:00Z", createdFor: boundWorkUnitSubject(primary) });
  return { ...fixture, ...projected, current, conflict, paths, extra, extraPath };
}

async function writeCohortChoice(h: Awaited<ReturnType<typeof cohortResolutionCopies>>, path: string, content: string) {
  const entry = h.index.entries[path];
  if (entry?.kind !== "record") throw new Error("Missing cohort projection");
  const bytes = renderStampedFile({ content, stamp: entry.base.blob });
  await writeFile(join(h.checkout, path), bytes);
  return bytes;
}

it.each([false, true])("resolves one cohort conflict through equivalent canonical and current copies (edited: %s)", async edited => {
  const h = await cohortResolutionCopies(), content = h.current.content + (edited ? "\nChosen correction.\n" : "");
  if (edited) for (const path of h.paths) await writeCohortChoice(h, path, content);
  const saved = await save(h, ["--resolve", formatConflictToken(h.conflict)]);
  expect(saved.result.status).toBe("ok");
  expect(saved.exitCode).toBe(0);
  expect(success(await h.store.read({ reference: h.current.reference }))).toMatchObject({ content, conflicts: [] });
});

it("preserves incompatible cohort choices while another edit lands, then resolves after the copies agree", async () => {
  const h = await cohortResolutionCopies(), choices = [];
  const original = await Promise.all(h.paths.map(path => readFile(join(h.checkout, path), "utf8")));
  for (const [i, path] of h.paths.entries()) choices.push({ path,
    bytes: await writeCohortChoice(h, path, `${h.current.content}\nChoice ${i}.\n`) });
  const independent = "# Extra\n\nIndependent edit.\n";
  await writeFile(join(h.checkout, h.extraPath), renderStampedFile({ content: independent, stamp: gitBlobId(h.extra.content, "sha1") }));
  const refused = await save(h, ["--resolve", formatConflictToken(h.conflict)]);
  expect(refused.result).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("copies disagree"),
    remedy: { text: expect.stringContaining("agree") } } });
  for (const choice of choices) expect(await readFile(join(h.checkout, choice.path), "utf8")).toBe(choice.bytes);
  expect(success(await h.store.read({ reference: h.current.reference }))).toMatchObject({ content: h.current.content, conflicts: [h.conflict] });
  expect(success(await h.store.read({ reference: h.extra.reference })).content).toBe(independent);
  const held = await readProjectionIndex(h.location, true, { groups: "all" });
  if (held.kind !== "index") throw new Error("Missing held index");
  for (const path of h.paths) expect(held.index.entries[path]).toMatchObject({ changed: true });
  expect(selectProjectedMarkdown(held.index.entries, { changed: true })).toEqual(expect.arrayContaining(h.paths));
  for (const [i, path] of h.paths.entries()) if (i === 0) await writeFile(join(h.checkout, path), original[i]!);
  expect((await save(h, ["--resolve", formatConflictToken(h.conflict)])).result.status).toBe("refused");
  const observedAgain = await readProjectionIndex(h.location, true, { groups: "all" });
  if (observedAgain.kind !== "index") throw new Error("Missing held index");
  for (const path of h.paths) expect(observedAgain.index.entries[path]).toMatchObject({ changed: true });
  const content = `${h.current.content}\nAgreed correction.\n`;
  for (const path of h.paths) await writeCohortChoice(h, path, content);
  expect((await save(h, ["--resolve", formatConflictToken(h.conflict)])).result.status).toBe("ok");
  expect(success(await h.store.read({ reference: h.current.reference }))).toMatchObject({ content, conflicts: [] });
});

it("does not bypass a withheld cohort alias and resolves after that alias is released", async () => {
  const h = await cohortResolutionCopies(), path = h.paths[0];
  if (path === undefined) throw new Error("Missing canonical path");
  const entry = h.index.entries[path];
  if (entry?.kind !== "record") throw new Error("Missing canonical entry");
  const editedPath = h.paths[1];
  if (editedPath === undefined) throw new Error("Missing current path");
  const content = `${h.current.content}\nChosen correction.\n`;
  await writeCohortChoice(h, editedPath, content);
  const before = await Promise.all(h.paths.map(path => readFile(join(h.checkout, path), "utf8")));
  await writeProjectionIndex(h.location, { ...h.index, entries: { ...h.index.entries, [path]: { ...entry, withheld: true } } });
  const refused = await save(h, ["--resolve", formatConflictToken(h.conflict)]);
  expect(refused.result).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("withheld"),
    remedy: { text: expect.stringContaining("delete") } } });
  expect(await Promise.all(h.paths.map(path => readFile(join(h.checkout, path), "utf8")))).toEqual(before);
  expect(success(await h.store.read({ reference: h.current.reference })).conflicts).toEqual([h.conflict]);
  const held = await readProjectionIndex(h.location, true, { groups: "all" });
  if (held.kind !== "index") throw new Error("Missing held index");
  for (const alias of h.paths) expect(held.index.entries[alias]).toMatchObject({ pending: true,
    changed: alias === editedPath, refused: { reason: expect.stringContaining("withheld") } });
  expect(selectProjectedMarkdown(held.index.entries, { changed: true })).toEqual([editedPath]);
  await writeProjectionIndex(h.location, { ...held.index, entries: { ...held.index.entries, [path]: { ...entry, withheld: false } } });
  await writeCohortChoice(h, path, content);
  expect((await save(h, ["--resolve", formatConflictToken(h.conflict)])).result.status).toBe("ok");
  expect(success(await h.store.read({ reference: h.current.reference })).conflicts).toEqual([]);
});

async function wholeRecordProjection(change: "removal" | "placement" | "verb-owned" | "content" | "links") {
  const fixture = createReferenceFixture({}, { "work-item/meta": { parser: META_REGISTRATION.parser } });
  fixture.identity("andrew");
  const content = makeMetaFixture("work-item-one", { owner: "andrew", workClass: "Light", priority: "P1",
    currentWorkflow: "process-task-loop", design: ["spec-work-item-one.md"] });
  const base = await seed(fixture, fixture.reference("work-item/meta"), content, { kind: "active" },
    { changeRequest: { repository: "project", number: 7 } });
  const remote = fixture.remote(true);
  if (remote === undefined) throw new Error("No reference remote");
  success(await fixture.store.push());
  if (change === "removal") success(await fixture.store.write({ action: "remove", reference: base.reference, expected: base.version,
    provenance: { verb: "abandon", lifecycleAction: "remove" } }));
  else success(await fixture.store.write({ ...update(fixture, base, change === "verb-owned"
    ? content.replace("`andrew`", "`bob`") : content + "\nLocal note.\n"),
    ...(change === "placement" ? { placement: { kind: "backlog" as const, commitment: "planned" as const } } : {}),
    ...(change === "links" ? { links: { changeRequest: { repository: "project", number: 8 } } } : {}),
    provenance: { verb: change === "placement" ? "promote" : change === "verb-owned" ? "handover" : "edit", lifecycleAction: "edit" } }));
  success(await remote.write({ ...update(fixture, base, content + "\nRemote note.\n"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
  success(await fixture.store.push());
  const current = success(await fixture.store.read({ reference: base.reference }));
  const conflict = current.conflicts[0];
  if (conflict === undefined) throw new Error("Sync produced no whole-record conflict");
  const path = ".arc/active/current/meta-work-item-one.md";
  const projected = await seedProjection({ store: fixture.store, files: [{ reference: base.reference, path }] });
  directories.push(projected.checkout);
  await configureEngineCheckout(projected.checkout);
  await writeWorktreeMarker(projected.checkout, { spawnedByArc: false, spawningIdentity: "andrew",
    createdAt: "2026-10-24T00:00:00Z", createdFor: boundWorkUnitSubject(base) });
  return { ...fixture, ...projected, fixture, reference: base.reference, conflict, current, path };
}

it.each(["removal", "placement", "verb-owned"] as const)("keeps the stored side when discarding a whole-record %s alternative", async change => {
  const h = await wholeRecordProjection(change);
  const saved = await save(h, ["--resolve", formatConflictToken(h.conflict)]);
  expect(saved.result.status).toBe("ok");
  expect(saved.exitCode).toBe(0);
  expect(success(await h.store.read({ reference: h.reference }))).toMatchObject({ reference: h.current.reference,
    content: h.current.content, fields: h.current.fields, placement: h.current.placement, links: h.current.links, conflicts: [] });
});

it("resolves with an admitted content edit while retaining stored traceability links", async () => {
  const h = await wholeRecordProjection("links");
  const entry = h.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing whole-record subject");
  const content = `${h.current.content}\nChosen content correction.\n`;
  await writeFile(join(h.checkout, h.path), renderStampedFile({ content, stamp: entry.base.blob }));
  const saved = await save(h, ["--resolve", formatConflictToken(h.conflict)]);
  expect(saved.result.status).toBe("ok");
  expect(success(await h.store.read({ reference: h.reference }))).toMatchObject({ content,
    placement: h.current.placement, links: h.current.links, conflicts: [] });
});

it("refuses a submitted verb-owned field change, then resolves the same conflict after the file is repaired", async () => {
  const h = await wholeRecordProjection("placement");
  const entry = h.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing whole-record subject");
  const bytes = renderStampedFile({ content: h.current.content.replace("`andrew`", "`bob`"), stamp: entry.base.blob });
  await writeFile(join(h.checkout, h.path), bytes);
  const refused = await save(h, ["--resolve", formatConflictToken(h.conflict)]);
  expect(refused.result).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("meta.verb-owned-field"),
    remedy: { text: expect.stringContaining("arc handover") } } });
  expect(await readFile(join(h.checkout, h.path), "utf8")).toBe(bytes);
  expect(success(await h.store.read({ reference: h.reference }))).toMatchObject({ content: h.current.content,
    placement: h.current.placement, links: h.current.links, conflicts: [h.conflict] });
  await writeFile(join(h.checkout, h.path), renderStampedFile({ content: h.current.content, stamp: entry.base.blob }));
  expect((await save(h, ["--resolve", formatConflictToken(h.conflict)])).result.status).toBe("ok");
  expect(success(await h.store.read({ reference: h.reference }))).toMatchObject({ content: h.current.content,
    placement: h.current.placement, links: h.current.links, conflicts: [] });
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
  const store = overrideEngineStore(h.store, { batch: async input => {
    const result = await h.store.batch(input);
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
  const h = await conflictedProjection(".arc/user/andrew/scratch/document.md", false);
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
  fixture.identity("andrew");
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
    path: ".arc/completed/2026-q4/01_work-item-one/notes-work-item-one.md" }] });
  directories.push(projected.checkout);
  await configureEngineCheckout(projected.checkout);
  expect((await save({ ...fixture, ...projected }, ["--resolve", formatConflictToken(conflict)])).result.status).toBe("ok");
  expect(success(await fixture.store.read({ reference: subject.reference })).conflicts).toEqual([]);
  expect(success(await fixture.store.read({ reference: live.reference }))).toEqual(live);
});

it("reports an accepted resolution as successful when its later read-back refuses", async () => {
  const h = await conflictedProjection(".arc/user/andrew/scratch/document.txt");
  let accepted = false, refusedRead = false;
  const store = overrideEngineStore(h.store, {
    batch: async input => {
      const result = await h.store.batch(input);
      if (result.status === "ok" && input.writes[0]?.resolves?.length) accepted = true;
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

it("names a linked resolution destination and accepts the same token after regular-file repair", async () => {
  const h = await wholeRecordProjection("content");
  const path = Object.keys(h.index.entries)[0];
  if (path === undefined) throw new Error("The conflict has no projected subject");
  const original = await readFile(join(h.checkout, path), "utf8"), target = join(h.checkout, "external-resolution.md");
  await writeFile(target, "external resolution target\n");
  await unlink(join(h.checkout, path));
  await symlink(target, join(h.checkout, path), "file");
  const before = success(await h.store.version()), token = formatConflictToken(h.conflict);
  const refused = await save(h, ["--resolve", token]);
  expect(refused.result).toMatchObject({ status: "refused", refusal: { code: "resolution-refused", condition: "not-a-file",
    remedy: { text: expect.stringContaining("regular file") } } });
  expect(success(await h.store.version())).toBe(before);
  expect(success(await h.store.read({ reference: h.reference })).conflicts).toEqual([h.conflict]);
  expect(await readFile(target, "utf8")).toBe("external resolution target\n");
  await unlink(join(h.checkout, path));
  await writeFile(join(h.checkout, path), original);
  expect((await save(h, ["--resolve", token])).result.status).toBe("ok");
  expect(success(await h.store.read({ reference: h.reference })).conflicts).toEqual([]);
  expect(await readFile(target, "utf8")).toBe("external resolution target\n");
});

it.each(["", "not-a-token"])("reports an unknown token %j as whole JSON and accepts a corrected token", async token => {
  const h = await conflictedProjection(".arc/user/andrew/scratch/document.txt");
  expect((await save(h, ["--resolve", token])).result).toMatchObject({ status: "refused", refusal: {
    condition: expect.stringContaining("Unknown conflict token"), remedy: { text: expect.stringContaining("arc status --conflicts") },
  } });
  expect((await save(h, ["--resolve", formatConflictToken(h.conflict)])).result.status).toBe("ok");
  expect(success(await h.store.read({ reference: h.reference })).conflicts).toEqual([]);
});

it("accepts a requested resolution already fulfilled by the start's aside sweep", async () => {
  const h = await conflictedProjection(".arc/user/andrew/scratch/document.md", false);
  await writeFile(join(h.checkout, h.path), await readFile(join(h.checkout, h.path), "utf8") + "\nIndependent note.\n");
  const ports = createProjectionEnginePorts(h.checkout);
  await startProjection({ store: h.store, checkout: h.checkout, ports: () => ({ ...ports,
    writer: async () => ({ ...await ports.writer(), processInstance: "exited-resolution-writer" }) }) });
  const disk = await import("../../../../src/lib/store/projection/index-file.js").then(module => module.readProjectionIndex(h.location, true, { groups: "all" }));
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


it("keeps a stopped archived swap outside a linked parent and recovers after directory repair", async () => {
  const h = await archivedView("companion");
  const native = createProjectionEnginePorts(h.checkout);
  const ports = (instance: string) => ({ ...native, writer: async () => ({ ...await native.writer(), processInstance: instance }) });
  await writeFile(join(h.checkout, h.path), "archived hand edit\n");
  await expect(startProjection({ store: h.store, checkout: h.checkout, mode: "save", ports: () => ({
    ...ports("interrupted-archive-command"), hooks: { afterMove: async () => { throw new Error("stopped archive swap"); } },
  }) })).rejects.toThrow("stopped archive swap");
  const stopped = await readProjectionIndex(h.location, true, { groups: "all" });
  if (stopped.kind !== "index") throw new Error("Stopped index missing");
  const entry = stopped.index.entries[h.path];
  if (entry?.kind !== "record" || entry.copies.length === 0) throw new Error("Stopped copy missing");
  const folder = dirname(join(h.checkout, h.path)), external = join(h.checkout, "outside-projection");
  await rename(folder, `${folder}-original`);
  await mkdir(external);
  await symlink(external, folder, "dir");
  expect(await startProjection({ store: h.store, checkout: h.checkout, ports: () => ports("blocked-archive-command") }))
    .toMatchObject({ kind: "ready", discovered: [] });
  await expect(readFile(join(external, basename(h.path)), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  for (const copy of entry.copies) expect(await readFile(join(h.checkout, copy.name), "utf8")).toBe("archived hand edit\n");
  expect(projectionProcessState().diagnostics).toContainEqual(expect.objectContaining({ path: h.path,
    mark: expect.objectContaining({ remedy: { text: expect.stringContaining("symbolic link") } }) }));
  await unlink(folder);
  await rename(`${folder}-original`, folder);
  expect(await startProjection({ store: h.store, checkout: h.checkout, ports: () => ports("repaired-archive-command") }))
    .toMatchObject({ kind: "ready" });
  expect(await h.file()).toBe("archived hand edit\n");
  await endProjection({ store: h.store, checkout: h.checkout });
  expect((await readProjectionIndex(h.location, true, { groups: "all" }))).toMatchObject({ kind: "index", index: {
    entries: { [h.path]: { copies: [] } },
  } });
});

it("leaves failed archived admission for explicit save after the condition is repaired", async () => {
  const h = await createAdoptionFixture({ placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  directories.push(h.f.root);
  const path = `${h.folder}/extra.txt`, reference = recordReferences["work-item/companion"](h.primary.reference.owner, "extra.txt");
  await writeFile(join(h.f.root, path), "archived new companion\n");
  let blocked = true;
  const refusal = StoreRefusalSchema.parse({ code: "lock-held", class: "recoverable", lock: "work-item",
    condition: "Archived admission is locked.", remedy: { text: "Release the lock and retry save." } });
  const store = overrideEngineStore(h.f.store, { batch: input => blocked && input.writes[0]?.reference.kind === "work-item/companion"
    ? Promise.resolve({ status: "refused", refusal }) : h.f.store.batch(input) });
  expect((await save({ store, checkout: h.f.root })).errors).toContain(refusal.condition);
  expect(await readProjectionIndex(h.projected.location, true, { groups: "all" })).toMatchObject({ kind: "index", index: {
    entries: { [path]: { kind: "ownerless" } },
  } });
  blocked = false;
  expect(await startProjection({ store, checkout: h.f.root })).toMatchObject({ kind: "ready", discovered: [] });
  expect(await h.f.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(await readProjectionIndex(h.projected.location, true, { groups: "all" })).toMatchObject({ kind: "index", index: {
    entries: { [path]: { kind: "ownerless" } },
  } });
  expect((await save({ store, checkout: h.f.root })).errors).toBe("");
  expect(success(await h.f.store.read({ reference })).content).toBe("archived new companion\n");
  expect(success(await h.f.store.history({ reference }))[0]?.provenance).toMatchObject({ verb: "save", lifecycleAction: "edit" });
});
