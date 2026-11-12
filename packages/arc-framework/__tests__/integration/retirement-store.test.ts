/** Operational terminal snapshots drive real Git checkout and ref cleanup, including resumable failures. */
import { retirementRecording, retirementRetainedBase, interruptedRetirementCopy, interruptedRetirementReplacement } from "../helpers/store/projection-retirement.js";
import { createRefusingStore } from "../helpers/store/projection/refusing-store.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";

import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { afterEach, describe, expect, it } from "vitest";
import { link, mkdir, readFile, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createTempRepo, cleanupTempDir, makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { retirementLink } from "../helpers/store/retirement-harness.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { createStoreTeardownContext } from "../../src/lib/work-unit/store-teardown-context.js";
import { runStoreAbandon } from "../../src/lib/work-unit/verbs/abandon-store.js";
import { scanRegisteredWorktrees } from "../../src/lib/git/worktree-roster.js";
import { selectStoreRetirementHusk } from "../../src/lib/work-unit/store-retirement-husk.js";
import { readStoreRetirementEvidence, type TeardownSubject } from "../../src/lib/work-unit/store-retirement-evidence.js";
import { TeardownCommandInputSchema, AbandonCommandInputSchema } from "../../src/handlers/lifecycle.js";
import { runTeardownForOperand } from "../../src/handlers/teardown-operand.js";
import { createLocusPorts } from "../../src/lib/locus/lifecycle-ports.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, resolveWorktreeMarkerPath } from "../../src/lib/git/worktree-marker.js";
import { runTeardown } from "../../src/lib/work-unit/verbs/teardown.js";
import { persistProjectionRemoval } from "../../src/lib/store/projection/removal-persist.js";
import { checkProjectionRemoval } from "../../src/lib/store/projection/removal-check.js";
import { passingProjectionRemovalSlots } from "../../src/lib/git/worktree-removal.js";
import { seedProjection } from "../helpers/store/projection/seeded-projection.js";
import { parseStampedFile, renderStampedFile } from "../../src/lib/store/projection/stamp.js";
import { recordReferences, RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { flatWorkItemArtifactPath } from "../../src/lib/store/lifecycle-storage.js";
import { lackingEndedHistory } from "../helpers/store/ended-history.js";
import { selectProjectionResolution } from "../../src/lib/store/projection/save-resolution.js";
import { formatConflictToken } from "../../src/lib/status/conflict-token.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { projectionProcessState } from "../../src/lib/store/projection/process-state.js";
import { withFanOut } from "../../src/lib/store/projection/with-fan-out.js";
import { createProjectionFanOutDependencies } from "../../src/lib/store/projection/fan-out-binding.js";
import { PROJECTION_LOCK_FILE, withProjectionLock } from "../../src/lib/store/projection/lock.js";
import { acquireAdvisoryLock, releaseAdvisoryLockConfirmed, type AdvisoryLockHandle } from "../../src/lib/advisory-lock.js";
import { ADVISORY_LEASE_DURATION_MS } from "../../src/lib/renewable-lease.js";
import { createProjectionEnginePorts } from "../../src/lib/store/projection/engine-ports.js";
import { guardProjectionIgnores } from "../../src/lib/store/projection/ignore-guard.js";
import { PROJECTION_INDEX_FILE, readProjectionIndex } from "../../src/lib/store/projection/index-file.js";
import { overrideEngineStore } from "../helpers/store/projection/engine-fixture.js";
import { startProjection, endProjection } from "../../src/lib/store/projection/engine.js";
import { createStagedFile, nameAsideFile, parseAsideFile } from "../../src/lib/store/projection/aside.js";
import { writeWorktreeMarker, readWorktreeMarker, type WorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { fixture, projectedRetirement, retirementFixtureRoots as roots } from "../helpers/store/projection-retirement.js";
afterEach(async () => { for (const root of roots.splice(0)) await cleanupTempDir(root); });

describe("store retirement real Git", () => {
  it("persists a projected edit through its store teardown context before removing the linked checkout", async () => {
    const h = await projectedRetirement();
    await h.edit("A save that must survive teardown.\n");
    const removed = await h.remove();
    expect(removed, removed.status === "rejected" ? removed.reason : undefined).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("A save that must survive teardown.\n");
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(h.checkout);
  });

  it.each(["ordinary", "projection-admission"] as const)("keeps a %s version-conflicted edit and removes after retry", async cause => {
    const h = await projectedRetirement("opening\nbase\nclosing\n");
    const authored = "opening\nheld hand edit\nclosing\n";
    const refusing = createRefusingStore(h.store);
    refusing.refuse("batch", { code: "version-conflict", ...(cause === "ordinary" ? {} : { cause }), class: "recoverable", records: [h.record.reference],
      condition: "The content admission remains conflicted.", remedy: { text: "Retry the content admission after its conflict clears." } });
    h.configure({ store: refusing.store });
    await h.edit(authored);
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("Retry the content admission") });
    expect(parseStampedFile(await readFile(join(h.checkout, h.path), "utf8")).content).toBe(authored);
    refusing.refuse("batch", null);
    const removed = await h.remove();
    expect(removed, removed.status === "rejected" ? removed.reason : undefined).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe(authored);
  });

  it("persists a save arriving after its first write-back before removing the checkout", async () => {
    const h = await projectedRetirement();
    await h.edit("Earlier saved prose.\n");
    let saved = false;
    h.configure({ hooks: { beforeLastCheck: async () => {
      if (!saved) { saved = true; await h.edit("Later saved prose.\n"); }
    } } });
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("Later saved prose.\n");
  });

  it("adopts a file created after the first walk before removing the checkout", async () => {
    const h = await projectedRetirement();
    const path = ".arc/user/test-user/scratch/late.md";
    let created = false;
    h.configure({ hooks: { beforeLastCheck: async () => {
      if (!created) { created = true; await writeFile(join(h.checkout, path), "New prose after the walk.\n"); }
    } } });
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(await h.store.read({ reference: RecordReferenceSchema.parse({ kind: "personal/document",
      owner: { type: "person", name: "test-user" }, key: "scratch/late.md" }) }))
      .toMatchObject({ status: "ok", result: { content: "New prose after the walk.\n" } });
  });

  it("keeps a checkout changing through all final passes and removes it once saving stops", async () => {
    const h = await projectedRetirement();
    let changing = true;
    h.configure({ hooks: { beforeLastCheck: async (_checkout, pass) => {
      if (changing) await h.edit(`Save arriving in final pass ${pass}.\n`);
    } } });
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("Let the saves finish") });
    expect(parseStampedFile(await readFile(join(h.checkout, h.path), "utf8")).content).toBe("Save arriving in final pass 3.\n");
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("Save arriving in final pass 2.\n");
    changing = false;
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("Save arriving in final pass 3.\n");
  });

  it("holds an accepted edit whose read-back is not authorized and removes after ignore repair", async () => {
    const h = await projectedRetirement();
    const excludes = join(h.root, ".git/info/exclude"), original = await readFile(excludes);
    await writeFile(excludes, ".arc/\n");
    const ports = createProjectionEnginePorts(h.checkout);
    const guard = await guardProjectionIgnores({ root: h.checkout, identity: SlugSchema.parse("test-user"), exec: ports.execInput, fs: ports.fs });
    if (guard.kind !== "refused") throw new Error("The personal rule still authorizes replacement");
    await h.edit("Accepted input awaiting authorized read-back.\n");
    const authored = await readFile(join(h.checkout, h.path));
    expect(await h.persist()).toMatchObject({ kind: "refused", remedy: { text: guard.remedy } });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("Accepted input awaiting authorized read-back.\n");
    expect(await readFile(join(h.checkout, h.path))).toEqual(authored);
    await writeFile(excludes, original);
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
  });

  it("takes over a settled edited aside copy while its writer is live before teardown", async () => {
    const h = await interruptedRetirementCopy();
    const named = parseAsideFile(h.copy.name);
    if (named === undefined) throw new Error("No aside base");
    await writeFile(join(h.checkout, h.copy.name), renderStampedFile({ content: "local prefix\nopening\nbase\nclosing\n", stamp: named.base }));
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content)
      .toBe("local prefix\nopening\nbase\nclosing\nremote footer\n");
  });

  it("keeps a copy whose take-in stays pending and removes after the admission retry succeeds", async () => {
    const h = await interruptedRetirementCopy();
    const named = parseAsideFile(h.copy.name);
    if (named === undefined) throw new Error("No aside base");
    const authored = renderStampedFile({ content: "local prefix\nopening\nbase\nclosing\n", stamp: named.base });
    await writeFile(join(h.checkout, h.copy.name), authored);
    const refusing = createRefusingStore(h.store);
    refusing.refuse("batch", { code: "version-conflict", cause: "projection-admission", class: "recoverable", records: [h.record.reference],
      condition: "The copy admission remains pending.", remedy: { text: "Retry the copy admission once its authority settles." } });
    h.configure({ store: refusing.store });
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("Retry the copy admission") });
    expect(await readFile(join(h.checkout, h.copy.name), "utf8")).toBe(authored);
    refusing.refuse("batch", null);
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content)
      .toBe("local prefix\nopening\nbase\nclosing\nremote footer\n");
  });

  it("treats a settled empty Markdown file as deletion and retires without another content write", async () => {
    const h = await projectedRetirement();
    await writeFile(join(h.checkout, h.path), "");
    await utimes(join(h.checkout, h.path), new Date(0), new Date(0));
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(await h.store.read({ reference: h.record.reference })).toMatchObject({ status: "ok",
      result: { content: h.record.content, version: h.record.version } });
  });

  it("keeps a moved-on copy after persisting its current path and removes once that copy is deleted", async () => {
    const h = await interruptedRetirementCopy();
    await link(join(h.checkout, h.staged.location), join(h.checkout, h.path));
    await rm(join(h.checkout, h.staged.location));
    const current = "current prefix\nopening\nbase\nclosing\nremote footer\n";
    await writeFile(join(h.checkout, h.path), renderStampedFile({ content: current, stamp: h.entry.base.blob }));
    const named = parseAsideFile(h.copy.name);
    if (named === undefined) throw new Error("No aside base");
    const older = renderStampedFile({ content: "opening\nolder buffer body\nclosing\n", stamp: named.base });
    await writeFile(join(h.checkout, h.copy.name), older);
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining(h.copy.name) });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe(current);
    expect(await readFile(join(h.checkout, h.copy.name), "utf8")).toBe(older);
    await rm(join(h.checkout, h.copy.name));
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
  });

  it("takes in the older edited copy of an absent path and holds its newer copy until explicit deletion", async () => {
    const first = await interruptedRetirementCopy();
    await link(join(first.checkout, first.staged.location), join(first.checkout, first.path));
    await rm(join(first.checkout, first.staged.location));
    const current = lifecycleSuccess(await first.store.read({ reference: first.record.reference }));
    lifecycleSuccess(await first.store.write({ action: "put", reference: current.reference, expected: current.version,
      content: `${current.content}newer remote footer\n`, provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const second = await interruptedRetirementReplacement(first, first.index, first.entry);
    const older = parseAsideFile(first.copy.name), newer = parseAsideFile(second.copy.name);
    if (older === undefined || newer === undefined || first.copy.name === second.copy.name) throw new Error("No distinct swap copies");
    await writeFile(join(first.checkout, first.copy.name), renderStampedFile({ content: "older prefix\nopening\nbase\nclosing\n", stamp: older.base }));
    const newerBytes = renderStampedFile({ content: "opening\nnewer buffer body\nclosing\nremote footer\n", stamp: newer.base });
    await writeFile(join(first.checkout, second.copy.name), newerBytes);
    expect(await first.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining(second.copy.name) });
    expect(lifecycleSuccess(await first.store.read({ reference: first.record.reference })).content)
      .toBe("older prefix\nopening\nbase\nclosing\nremote footer\nnewer remote footer\n");
    expect(await readFile(join(first.checkout, second.copy.name), "utf8")).toBe(newerBytes);
    await rm(join(first.checkout, second.copy.name));
    expect(await first.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: first.checkout });
  });

  it("refuses a target identity mismatch before changing its record or creating an actor, and removes under its identity", async () => {
    const h = await projectedRetirement();
    await h.edit("An edit under the target identity.\n");
    h.configure({ identity: SlugSchema.parse("blair") });
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("Run removal or release from that checkout") });
    expect(await h.store.read({ reference: h.record.reference })).toMatchObject({ status: "ok",
      result: { content: h.record.content, version: h.record.version } });
    await expect(readFile(join(h.location.commonDir, "arc/user/blair/.internal/.machine-id"))).rejects.toMatchObject({ code: "ENOENT" });
    h.configure({ identity: SlugSchema.parse("test-user") });
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("An edit under the target identity.\n");
  });

  it("holds removal without an identity and proceeds once the target identity is configured", async () => {
    const h = await projectedRetirement();
    await h.edit("An edit waiting for configured identity.\n");
    await h.exec("git", ["config", "--unset-all", "arc.identity"], { cwd: h.checkout });
    await h.exec("git", ["config", "user.name", ""], { cwd: h.checkout });
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("git config --local arc.identity") });
    expect(await h.store.read({ reference: h.record.reference })).toMatchObject({ status: "ok", result: { version: h.record.version } });
    await h.exec("git", ["config", "arc.identity", "test-user"], { cwd: h.checkout });
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("An edit waiting for configured identity.\n");
  });

  it("holds a damaged projection index until a command in that checkout rebuilds it", async () => {
    const h = await projectedRetirement();
    await writeFile(join(h.location.stateDir, PROJECTION_INDEX_FILE), "damaged header\n");
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining(`Run arc save from ${h.checkout}`) });
    expect(await h.store.read({ reference: h.record.reference })).toMatchObject({ status: "ok", result: { version: h.record.version } });
    const command = { checkout: h.checkout, store: h.store, mode: "save" as const };
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    await endProjection(command);
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
  });

  it("releases a retired target before fan-out refreshes its sibling and leaves no target binding at command end", async () => {
    const h = await projectedRetirement("opening\nbase\nclosing\n");
    const store = withFanOut(h.store, createProjectionFanOutDependencies(h.root));
    const command = { checkout: h.root, store };
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    lifecycleSuccess(await store.write({ action: "put", reference: h.record.reference, expected: h.record.version,
      content: `${h.record.content}remote footer\n`, provenance: { verb: "edit", lifecycleAction: "edit" } }));
    expect(projectionProcessState().roots.has(h.checkout)).toBe(true);
    const history = projectionProcessState().history;
    if (history === null) throw new Error("Command history was not bound");
    lifecycleSuccess(await history.read(h.record.reference));
    await h.edit("local prefix\nopening\nbase\nclosing\n");
    const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "test-user" }, key: "scratch/after-retirement.md" });
    let created = false;
    h.configure({ store, hooks: { beforeLastCheck: async () => {
      if (created) return;
      created = true;
      lifecycleSuccess(await store.write({ action: "put", reference, expected: null, content: "Fan-out after retirement.\n",
        provenance: { verb: "edit", lifecycleAction: "edit" } }));
    } } });
    expect(await h.persist()).toEqual({ kind: "persisted" });
    expect(lifecycleSuccess(await history.read(h.record.reference)).some(each =>
      each.content === "local prefix\nopening\nbase\nclosing\nremote footer\n")).toBe(true);
    expect(await withProjectionLock(h.location, async () => "released", { maxWaitMs: 0 })).toEqual({ status: "done", value: "released" });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content)
      .toBe("local prefix\nopening\nbase\nclosing\nremote footer\n");
    expect(parseStampedFile(await readFile(join(h.root, h.path), "utf8")).content)
      .toBe("local prefix\nopening\nbase\nclosing\nremote footer\n");
    expect(await readFile(join(h.root, ".arc/user/test-user/scratch/after-retirement.md"), "utf8")).toContain("Fan-out after retirement.");
    await expect(readFile(join(h.checkout, ".arc/user/test-user/scratch/after-retirement.md"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(projectionProcessState().roots.has(h.checkout)).toBe(false);
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    await endProjection(command);
    expect(projectionProcessState().diagnostics.filter(each => each.mark.reason.includes("Fan-out failed"))).toEqual([]);
  });

  it.each(["read-back", "retained-copy"] as const)("holds unfinished %s recording after the check and removes once repaired", async fault => {
    const h = await retirementRecording();
    if (fault === "retained-copy") { h.repair(); await rename(h.retained, `${h.retained}.held`); }
    const authored = await readFile(join(h.checkout, h.path));
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining(
      fault === "read-back" ? "Repair the read-back" : "Restore the retained base copy") });
    expect(await readFile(join(h.checkout, h.path))).toEqual(authored);
    if (fault === "read-back") h.repair();
    else await rename(`${h.retained}.held`, h.retained);
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("Accepted input awaiting its recording.\n");
  });

  it.each(["md", "txt"] as const)("holds an edited %s file until its retained base is restored", async extension => {
    const h = await retirementRetainedBase(extension);
    await rename(h.retained, `${h.retained}.held`);
    const authored = await readFile(join(h.checkout, h.path));
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("Restore the retained base copy") });
    expect(await readFile(join(h.checkout, h.path))).toEqual(authored);
    expect(await h.store.read({ reference: h.record.reference })).toMatchObject({ status: "ok", result: { version: h.current.version } });
    await rename(`${h.retained}.held`, h.retained);
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe(h.content);
  });

  it.each(["write", "history"] as const)("pulls missing ended-item history for a %s and persists the archived edit before teardown", async operation => {
    const h = await projectedRetirement();
    const primary = await h.seedMeta("archived", { owner: "test-user", state: "Shipped", currentWorkflow: null },
      { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
    const record = await h.seed(recordReferences["work-item/companion"](primary.reference.owner, "attachment.md"), "opening\nbase\nclosing\n");
    if (record.placement?.kind !== "completed" || !("sequence" in record.placement)) throw new Error("Archive placement missing");
    const path = `${dirname(flatWorkItemArtifactPath("archived", "meta", record.placement, null))}/attachment.md`;
    await rm(join(h.checkout, h.path));
    await seedProjection({ checkout: h.checkout, store: h.store, identity: SlugSchema.parse("test-user"), files: [
      { path: h.path, reference: h.record.reference }, { path, reference: record.reference },
    ] });
    const authored = "local prefix\nopening\nbase\nclosing\n";
    if (operation === "history") lifecycleSuccess(await h.store.write({ action: "put", reference: record.reference,
      expected: record.version, content: `${record.content}remote footer\n`, provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const original = parseStampedFile(await readFile(join(h.checkout, path), "utf8"));
    if (original.stamp === null) throw new Error("The archived file has no base stamp");
    await writeFile(join(h.checkout, path), operation === "history" ? authored : renderStampedFile({ content: authored, stamp: original.stamp }));
    const missing = lackingEndedHistory(h.store, record.reference.owner);
    let refusedHistory = false;
    h.configure({ store: overrideEngineStore(missing, {
      history: async input => {
        const result = await missing.history(input);
        if (result.status === "refused") refusedHistory = true;
        return result;
      },
      pull: async input => {
        expect(projectionProcessState().lockHeld).toBe(true);
        return missing.pull(input);
      },
    }) });
    const removed = await h.remove();
    expect(removed, removed.status === "rejected" ? removed.reason : undefined).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: record.reference })).content)
      .toBe(operation === "history" ? `${authored}remote footer\n` : authored);
    expect(refusedHistory).toBe(operation === "history");
  });

  it("takes in an edited copy appearing where an opaque link stood at the final check", async () => {
    const h = await interruptedRetirementCopy();
    const named = parseAsideFile(h.copy.name);
    if (named === undefined) throw new Error("No aside base");
    await rm(join(h.checkout, h.copy.name));
    await symlink(join(h.root, "base"), join(h.checkout, h.copy.name));
    let saved = false;
    h.configure({ hooks: { beforeLastCheck: async () => {
      if (saved) return;
      saved = true;
      await rm(join(h.checkout, h.copy.name));
      await writeFile(join(h.checkout, h.copy.name), renderStampedFile({ content: "late prefix\nopening\nbase\nclosing\n", stamp: named.base }));
    } } });
    const removed = await h.remove();
    expect(removed, removed.status === "rejected" ? removed.reason : undefined).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content)
      .toBe("late prefix\nopening\nbase\nclosing\nremote footer\n");
    expect(await readFile(join(h.root, "base"), "utf8")).toBe("base\n");
  });

  it("persists another checkout's ordinary edit without consuming the command's resolution at the same relative path", async () => {
    const a = await projectedRetirement("opening\nbase\nclosing\n", "txt"), b = await projectedRetirement(undefined, "txt");
    for (const content of ["opening\ncurrent\nclosing\n", "opening\nincoming\nclosing\n"])
      lifecycleSuccess(await a.store.write({ action: "put", reference: a.record.reference, expected: a.record.version,
        content, provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const clashed = lifecycleSuccess(await a.store.read({ reference: a.record.reference })), conflict = clashed.conflicts[0];
    if (conflict === undefined) throw new Error("Concurrent writes made no conflict");
    lifecycleSuccess(await a.store.write({ action: "put", reference: a.record.reference, expected: clashed.version,
      content: "new content without the conflicted span\n", provenance: { verb: "edit", lifecycleAction: "edit" } }));
    await rm(join(a.checkout, a.path));
    const projected = await seedProjection({ checkout: a.checkout, store: a.store, identity: SlugSchema.parse("test-user"),
      files: [{ path: a.path, reference: a.record.reference }] });
    const command = { checkout: a.checkout, store: a.store };
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    const intent = await selectProjectionResolution(a.store, projected.index, formatConflictToken(conflict));
    expect(intent).toMatchObject({ selection: "selected", accepted: false, refusal: null, target: { path: a.path } });
    projectionProcessState().resolution = intent;
    await b.edit("An ordinary edit in the target checkout.\n");
    const removed = await b.remove();
    expect(removed, removed.status === "rejected" ? removed.reason : undefined).toMatchObject({ status: "torn-down", worktreeRemoved: b.checkout });
    expect(lifecycleSuccess(await b.store.read({ reference: b.record.reference })).content).toBe("An ordinary edit in the target checkout.\n");
    expect(lifecycleSuccess(await a.store.read({ reference: a.record.reference })).conflicts).toContainEqual(conflict);
    expect(await a.store.read({ reference: conflict })).toMatchObject({ status: "ok" });
    expect(intent.accepted).toBe(false);
    await endProjection(command);
  });

  it("holds removal behind a live projection lease and removes after its holder releases", async () => {
    const h = await projectedRetirement();
    await h.edit("An edit waiting for the target lease.\n");
    h.configure({ ports: checkout => ({ ...createProjectionEnginePorts(checkout), maxWaitMs: 100 }) });
    const held = await withProjectionLock(h.location, async () => {
      const removed = await h.remove();
      expect(removed).toMatchObject({ status: "rejected", reason: expect.stringContaining("holder") });
      if (removed.status !== "rejected") throw new Error("The held lease allowed removal");
      expect(removed.reason).toContain(String(process.pid));
      expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).version).toBe(h.record.version);
      expect(parseStampedFile(await readFile(join(h.checkout, h.path), "utf8")).content).toBe("An edit waiting for the target lease.\n");
    });
    expect(held.status).toBe("done");
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("An edit waiting for the target lease.\n");
  }, 30_000);

  it("holds removal when its lease is replaced after a write and completes after ownership is repaired", async () => {
    const h = await projectedRetirement();
    await h.edit("An accepted edit before lease loss.\n");
    const authored = await readFile(join(h.checkout, h.path));
    let now = Date.now(), replacement: AdvisoryLockHandle | undefined;
    const store = overrideEngineStore(h.store, { batch: async input => {
      const result = await h.store.batch(input);
      now = Date.now() + ADVISORY_LEASE_DURATION_MS + 1000;
      replacement = await acquireAdvisoryLock(join(h.location.stateDir, PROJECTION_LOCK_FILE), {
        pid: process.pid, processInstance: "replacement", processScope: "replacement-scope", now: () => now,
        leaseDurationMs: ADVISORY_LEASE_DURATION_MS, maxWaitMs: 200,
      });
      return result;
    } });
    h.configure({ store, ports: checkout => ({ ...createProjectionEnginePorts(checkout), lock: { now: () => now,
      resolveProcessScope: async () => "original-scope", scheduleEvery: () => () => undefined } }) });
    try {
      expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("Projection lease lost") });
      expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("An accepted edit before lease loss.\n");
      expect(await readFile(join(h.checkout, h.path))).toEqual(authored);
    } finally { if (replacement !== undefined) await releaseAdvisoryLockConfirmed(replacement); }
    h.configure({ store: h.store, ports: undefined });
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
  });

  it("holds a previous identity's edit until saved there under that identity", async () => {
    const h = await projectedRetirement();
    const foreign = await h.seed(RecordReferenceSchema.parse({ kind: "personal/document",
      owner: { type: "person", name: "blair" }, key: "scratch/previous.md" }), "Previous identity's prose.\n");
    const path = ".arc/user/blair/scratch/previous.md";
    const projected = await seedProjection({ checkout: h.checkout, store: h.store, identity: SlugSchema.parse("blair"),
      files: [{ path, reference: foreign.reference }] });
    const entry = projected.index.entries[path];
    if (entry?.kind !== "record") throw new Error("No previous-identity entry");
    const content = "A hand save under the previous identity.\n";
    const bytes = renderStampedFile({ content, stamp: entry.base.blob });
    await writeFile(join(h.checkout, path), bytes);
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("blair") });
    expect(await readFile(join(h.checkout, path), "utf8")).toBe(bytes);
    expect(lifecycleSuccess(await h.store.read({ reference: foreign.reference })).version).toBe(foreign.version);
    await h.exec("git", ["config", "arc.identity", "blair"], { cwd: h.checkout });
    h.store.environment.identity = "blair";
    const command = { checkout: h.checkout, store: h.store, mode: "save" as const };
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    await endProjection(command);
    expect(lifecycleSuccess(await h.store.read({ reference: foreign.reference })).content, JSON.stringify(projectionProcessState().diagnostics)).toBe(content);
    await h.exec("git", ["config", "arc.identity", "test-user"], { cwd: h.checkout });
    h.store.environment.identity = "test-user";
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
  });

  it("persists the target's edit even when automatic projection was skipped for the command", async () => {
    const h = await projectedRetirement();
    await h.edit("An edit that survives --skip-projection teardown.\n");
    const command = { checkout: h.root, store: h.store, skipProjection: true };
    expect(await startProjection(command)).toMatchObject({ kind: "skipped", skip: { reason: "switch" } });
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content)
      .toBe("An edit that survives --skip-projection teardown.\n");
    await endProjection(command);
  });

  it("removes a husk without a projection before consulting a missing identity", async () => {
    const h = await huskFixture();
    await h.exec("git", ["config", "arc.identity", ""]);
    await h.exec("git", ["config", "user.name", ""]);
    h.ctx.projectionRemovalSlots = { ...passingProjectionRemovalSlots, persist: checkout => persistProjectionRemoval(checkout,
      { store: h.store, identity: SlugSchema.parse("test-user") }) };
    const input = TeardownCommandInputSchema.parse({ name: "demo", husk: h.paths[0] });
    const removed = await runTeardown(h.ctx, { subject: { kind: "slug", slug: "demo" }, base: "main", huskPath: input.husk });
    expect(removed, removed.status === "rejected" ? removed.reason : undefined).toMatchObject({ status: "torn-down", worktreeRemoved: h.paths[0] });
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(h.paths[0]);
  });

  it("names the deletion remedy for a file withheld by an index rebuild and removes after deletion", async () => {
    const h = await projectedRetirement();
    const bytes = "Unstamped saved bytes kept through the index rebuild.\n";
    await writeFile(join(h.checkout, h.path), bytes);
    await rm(join(h.location.stateDir, PROJECTION_INDEX_FILE));
    const command = { checkout: h.checkout, store: h.store, mode: "save" as const };
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    await endProjection(command);
    expect(await readProjectionIndex(h.location, true, { groups: "all" })).toMatchObject({ kind: "index", index: {
      entries: { [h.path]: { withheld: true } },
    } });
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("delete") });
    expect(await readFile(join(h.checkout, h.path), "utf8")).toBe(bytes);
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).version).toBe(h.record.version);
    await rm(join(h.checkout, h.path));
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
  });

  it("persists an unclaimed husk's retained index before removing it", async () => {
    const h = await huskFixture({ projected: true }), checkout = h.paths[0], identity = SlugSchema.parse("test-user");
    await ensureWorktreeMarkerIgnored(checkout, h.exec, nodeWorktreeMarkerIgnoreFs);
    await h.exec("git", ["config", "arc.identity", identity], { cwd: checkout });
    const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: identity }, key: "scratch/husk.md" });
    const record = await h.seed(reference, "A husk's original prose.\n"), path = ".arc/user/test-user/scratch/husk.md";
    const projected = await seedProjection({ checkout, store: h.store, identity, files: [{ path, reference }] });
    const entry = projected.index.entries[path];
    if (entry?.kind !== "record") throw new Error("No retained husk entry");
    await writeFile(join(checkout, path), renderStampedFile({ content: "A husk's pending saved edit.\n", stamp: entry.base.blob }));
    h.ctx.projectionRemovalSlots = { ...passingProjectionRemovalSlots,
      persist: target => persistProjectionRemoval(target, { store: h.store, identity }) };
    const input = TeardownCommandInputSchema.parse({ name: "demo", husk: checkout });
    const removed = await runTeardown(h.ctx, { subject: { kind: "slug", slug: "demo" }, base: "main", huskPath: input.husk });
    expect(removed, removed.status === "rejected" ? removed.reason : undefined).toMatchObject({ status: "torn-down", worktreeRemoved: checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: record.reference })).content).toBe("A husk's pending saved edit.\n");
  });

  it("resumes an accepted adoption after repairing its read-back without creating it twice", async () => {
    const h = await projectedRetirement();
    const path = ".arc/user/test-user/scratch/adopted.md", key = "scratch/adopted.md", content = "Accepted new prose awaiting read-back.\n";
    const initial = { checkout: h.checkout, store: h.store, mode: "save" as const };
    expect(await startProjection(initial)).toMatchObject({ kind: "ready" });
    await endProjection(initial);
    await writeFile(join(h.checkout, path), content);
    let accepted = false, blocked = true;
    const store = overrideEngineStore(h.store, {
      batch: async input => {
        const result = await h.store.batch(input);
        if (result.status === "ok" && result.result.writes.some(write => write.reference.kind === "personal/document" && write.reference.key === key)) accepted = true;
        return result;
      },
      read: async input => accepted && blocked && input.reference.kind === "personal/document" && input.reference.key === key
        ? { status: "refused", refusal: { code: "state-unresolvable", class: "recoverable", historyRefs: [],
          condition: "Accepted adoption cannot be read back.", remedy: { text: "Repair the adoption read-back and retry arc save." } } }
        : h.store.read(input),
    });
    const command = { ...initial, store };
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    await endProjection(command);
    expect(await readProjectionIndex(h.location, true, { groups: "all" })).toMatchObject({ kind: "index", index: {
      entries: { [path]: { adoption: { kind: "read-back" } } },
    } });
    const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "test-user" }, key });
    const landed = lifecycleSuccess(await h.store.read({ reference }));
    h.configure({ store });
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("Repair the adoption read-back") });
    expect(await readFile(join(h.checkout, path), "utf8")).toBe(content);
    blocked = false;
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference }))).toMatchObject({ content, version: landed.version });
  });

  it("holds a recording left before the removal check until a save command finishes it", async () => {
    const h = await retirementRecording();
    h.repair();
    const slots = h.ctx.projectionRemovalSlots;
    if (slots === undefined) throw new Error("Missing fixture removal slots");
    h.ctx.projectionRemovalSlots = { ...slots, check: checkout => checkProjectionRemoval(checkout,
      { store: h.store, identity: SlugSchema.parse("test-user") }) };
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("finish recording") });
    expect(await readProjectionIndex(h.location, true, { groups: "all" })).toMatchObject({ kind: "index", index: {
      entries: { [h.path]: { persisted: { recording: true } } },
    } });
    expect(await startProjection(h.command)).toMatchObject({ kind: "ready" });
    await endProjection(h.command);
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("Accepted input awaiting its recording.\n");
  });

  it("holds an altered cold archive partition until arc save rebuilds it", async () => {
    const h = await projectedRetirement();
    const archived = await h.seedMeta("archived", { owner: "blair", state: "Shipped", currentWorkflow: null },
      { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
    if (archived.placement?.kind !== "completed" || !("sequence" in archived.placement)) throw new Error("Archive placement missing");
    const path = flatWorkItemArtifactPath("archived", "meta", archived.placement, null);
    await rm(join(h.checkout, h.path));
    await seedProjection({ checkout: h.checkout, store: h.store, identity: SlugSchema.parse("test-user"), files: [
      { path: h.path, reference: h.record.reference }, { path, reference: archived.reference },
    ] });
    const header = JSON.parse(await readFile(join(h.location.stateDir, PROJECTION_INDEX_FILE), "utf8")) as {
      groups: Record<string, { name: string; unsettled: boolean }>;
    };
    const partition = header.groups[".arc/completed/2026-q4"];
    if (partition === undefined) throw new Error("No completed partition");
    expect(partition.unsettled).toBe(false);
    await rm(join(h.checkout, path));
    await writeFile(join(h.location.stateDir, partition.name), "Altered cold partition bytes\n");
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("arc save") });
    const command = { checkout: h.checkout, store: h.store, mode: "save" as const };
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    await endProjection(command);
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: archived.reference })).version).toBe(archived.version);
  });

  it("holds a young empty file until the editor completes its save", async () => {
    const h = await projectedRetirement();
    await writeFile(join(h.checkout, h.path), "");
    const saving = new Date(Date.now() + 60_000);
    await utimes(join(h.checkout, h.path), saving, saving);
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("finish saving") });
    expect(await readFile(join(h.checkout, h.path), "utf8")).toBe("");
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).version).toBe(h.record.version);
    await h.edit("The editor's completed save.\n");
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("The editor's completed save.\n");
  });

  it("holds a young empty aside copy until its deletion has settled", async () => {
    const h = await interruptedRetirementCopy();
    await writeFile(join(h.checkout, h.copy.name), "");
    const saving = new Date(Date.now() + 60_000);
    await utimes(join(h.checkout, h.copy.name), saving, saving);
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("finish saving") });
    expect(await readFile(join(h.checkout, h.copy.name), "utf8")).toBe("");
    await utimes(join(h.checkout, h.copy.name), new Date(0), new Date(0));
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("opening\nbase\nclosing\nremote footer\n");
  });

  it("keeps unparseable archived metadata and removes after its parser accepts the repaired edit", async () => {
    const h = await projectedRetirement();
    const record = await h.seedMeta("editable", { owner: "test-user", state: "Shipped", currentWorkflow: null },
      { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
    if (record.placement?.kind !== "completed" || !("sequence" in record.placement)) throw new Error("Archive placement missing");
    const path = flatWorkItemArtifactPath("editable", "meta", record.placement, null);
    const projected = await seedProjection({ checkout: h.checkout, store: h.store, identity: SlugSchema.parse("test-user"), files: [{ path, reference: record.reference }] });
    const entry = projected.index.entries[path];
    if (entry?.kind !== "record") throw new Error("No archived metadata entry");
    const bytes = renderStampedFile({ content: "No metadata heading or table.\n", stamp: entry.base.blob });
    await writeFile(join(h.checkout, path), bytes);
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("parser accepts") });
    expect(await readFile(join(h.checkout, path), "utf8")).toBe(bytes);
    expect(lifecycleSuccess(await h.store.read({ reference: record.reference })).version).toBe(record.version);
    const content = `${record.content}\nA repaired archived note.\n`;
    await writeFile(join(h.checkout, path), renderStampedFile({ content, stamp: entry.base.blob }));
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: record.reference })).content).toBe(content);
  });

  it("removes a refused edit reverted to its base without retrying its blocked write", async () => {
    const h = await projectedRetirement("opening\nbase\nclosing\n");
    const refusing = createRefusingStore(h.store);
    refusing.refuse("batch", { code: "lock-held", class: "recoverable", lock: "content",
      condition: "The content writer is held.", remedy: { text: "Release the content writer before retrying the edit." } });
    h.configure({ store: refusing.store });
    await h.edit("opening\nrefused edit\nclosing\n");
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("Release the content writer") });
    await h.edit(h.record.content);
    const removed = await h.remove();
    expect(removed, removed.status === "rejected" ? removed.reason : undefined).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference }))).toMatchObject({ content: h.record.content, version: h.record.version });
  });

  it("holds a stored conflict drawing until its markers are resolved by hand", async () => {
    const h = await projectedRetirement("opening\nbase\nclosing\n");
    for (const content of ["opening\nremote\nclosing\n", "opening\nlocal\nclosing\n"])
      lifecycleSuccess(await h.store.write({ action: "put", reference: h.record.reference, expected: h.record.version,
        content, provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const command = { checkout: h.checkout, store: h.store };
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    await endProjection(command);
    const stored = lifecycleSuccess(await h.store.read({ reference: h.record.reference }));
    expect(stored.conflicts).not.toEqual([]);
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("Resolve the conflicts") });
    const drawing = await readFile(join(h.checkout, h.path), "utf8");
    expect(drawing).toContain("[arc-conflict:");
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("Resolve the conflicts") });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).version).toBe(stored.version);
    const stamp = parseStampedFile(drawing).stamp;
    if (stamp === null) throw new Error("The checkout drawing has no base stamp");
    await writeFile(join(h.checkout, h.path), renderStampedFile({ content: "opening\nchosen resolution\nclosing\n", stamp }));
    const removed = await h.remove();
    expect(removed, removed.status === "rejected" ? removed.reason : undefined).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).content).toBe("opening\nchosen resolution\nclosing\n");
  });

  it("keeps a rebuilt withheld copy held after its bytes return to the base and removes after explicit deletion", async () => {
    const h = await projectedRetirement();
    const name = nameAsideFile({ path: h.path, base: h.entry.base.blob, role: "aside",
      writer: { ...await createProjectionEnginePorts(h.checkout).writer(), processInstance: "abandoned-copy" } });
    await createStagedFile(h.checkout, name, renderStampedFile({ content: "Unrecorded saved prose.\n", stamp: h.entry.base.blob }));
    await rm(join(h.location.stateDir, PROJECTION_INDEX_FILE));
    const command = { checkout: h.checkout, store: h.store, mode: "save" as const };
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    await endProjection(command);
    expect(await readProjectionIndex(h.location, true, { groups: "all" })).toMatchObject({ kind: "index", index: {
      withheldCopies: expect.arrayContaining([name]),
    } });
    const bytes = renderStampedFile({ content: h.record.content, stamp: h.entry.base.blob });
    await writeFile(join(h.checkout, name), bytes);
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining(name) });
    expect(await readFile(join(h.checkout, name), "utf8")).toBe(bytes);
    await rm(join(h.checkout, name));
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
  });

  it("holds unadopted prose and persists it after it moves to an owned scratch path", async () => {
    const h = await projectedRetirement(), path = ".arc/active/loose.txt", content = "Saved prose with no record address.\n";
    await mkdir(join(h.checkout, ".arc/active"), { recursive: true });
    await writeFile(join(h.checkout, path), content);
    expect(await h.remove()).toMatchObject({ status: "rejected", reason: expect.stringContaining("Move the file") });
    expect(await readFile(join(h.checkout, path), "utf8")).toBe(content);
    await rename(join(h.checkout, path), join(h.checkout, ".arc/user/test-user/scratch/loose.txt"));
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(lifecycleSuccess(await h.store.read({ reference: RecordReferenceSchema.parse({ kind: "personal/document",
      owner: { type: "person", name: "test-user" }, key: "scratch/loose.txt" }) })).content).toBe(content);
  });

  it("retires with indexed and unindexed symbolic links while preserving their external target", async () => {
    const h = await projectedRetirement();
    await rm(join(h.checkout, h.path));
    for (const path of [h.path, ".arc/user/test-user/scratch/linked.md"])
      await symlink(join(h.root, "base"), join(h.checkout, path));
    const removed = await h.remove();
    expect(removed, removed.status === "rejected" ? removed.reason : undefined).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
    expect(await readFile(join(h.root, "base"), "utf8")).toBe("base\n");
    expect(lifecycleSuccess(await h.store.read({ reference: h.record.reference })).version).toBe(h.record.version);
  });

  it.each(["existing", "new"] as const)("persists a %s save first observed during final feasibility", async kind => {
    const h = await projectedRetirement(), content = "A save first observed by final feasibility.\n";
    const path = ".arc/user/test-user/scratch/final-feasibility.md";
    let armed = false, written = false;
    h.configure({ hooks: { beforeLastCheck: async () => { if (!written) armed = true; } }, ports: checkout => {
      const native = createProjectionEnginePorts(checkout);
      return { ...native, exec: async (command, args, options) => {
        if (armed && args[0] === "config") {
          armed = false; written = true;
          if (kind === "existing") await h.edit(content);
          else await writeFile(join(checkout, path), content);
        }
        return native.exec(command, args, options);
      } };
    } });
    expect(await h.persist()).toEqual({ kind: "persisted" });
    expect(written).toBe(true);
    const reference = kind === "existing" ? h.record.reference : RecordReferenceSchema.parse({ kind: "personal/document",
      owner: { type: "person", name: "test-user" }, key: "scratch/final-feasibility.md" });
    expect(await h.store.read({ reference })).toMatchObject({ status: "ok", result: { content } });
    expect(await h.remove()).toMatchObject({ status: "torn-down", worktreeRemoved: h.checkout });
  });

  it("refuses the selected repository's operator lock through an ambient executor and abandons after unlock", async () => {
    const h = await fixture({ ended: false });
    const ambient = await createTempRepo(); roots.push(ambient);
    const raw = makeGitExec(ambient), path = join(h.root, "checkout");
    await h.exec("git", ["switch", "main"]); await h.exec("git", ["worktree", "add", path, "feat/demo"]);
    h.marker.spawnedByArc = true; h.setHolder(path); await writeWorktreeMarker(path, h.marker);
    await seedProjection({ checkout: path, store: h.store, identity: SlugSchema.parse("test-user"), files: [] });
    await h.exec("git", ["worktree", "lock", "--reason", "owner holds checkout", path]);
    const before = lifecycleSuccess(await h.store.read({ reference: h.meta.reference }));
    const input = AbandonCommandInputSchema.parse({ slug: "demo" });
    const run = () => runStoreAbandon({ executor: { ...h.executor, exec: raw }, storeTeardown: h.ctx, baseBranch: "main",
      removal: { exec: raw, readMarker: h.ctx.readMarker } }, { name: input.slug!, confirmed: true });
    expect(await run()).toMatchObject({ status: "rejected", reason: expect.stringContaining("owner holds checkout") });
    expect(lifecycleSuccess(await h.store.read({ reference: h.meta.reference }))).toEqual(before);
    expect((await h.store.list({ family: "lineage", kind: "lineage/transition" }))).toMatchObject({ status: "ok", result: { status: "absent" } });
    await h.exec("git", ["worktree", "unlock", path]);
    expect(await run()).toMatchObject({ status: "abandoned" });
    expect(await h.store.read({ reference: h.meta.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(path);
    expect(await h.local("refs/heads/feat/demo")).toBeNull();
  }, 30_000);
  it("returns a clean anchored created branch to base and reaps its exact local, tracking, and remote refs", async () => {
    const h = await fixture(); expect(await h.teardown()).toMatchObject({ status: "torn-down", branchDeleted: true, remoteBranchDeleted: true });
    expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"])).stdout).toBe("main");
    expect(await h.local("refs/heads/feat/demo")).toBeNull(); expect(await h.local("refs/remotes/origin/feat/demo")).toBeNull(); expect((await h.remote()).stdout).toBe("");
  });
  it("keeps a dirty anchored checkout's branch, HEAD, files, and remote after ending its primary", async () => {
    const h = await fixture({ ended: false }); await writeFile(join(h.root, "personal.txt"), "keep\n");
    expect(await h.abandon()).toMatchObject({ status: "abandoned", notices: expect.arrayContaining([expect.stringContaining("personal.txt")]) });
    expect(await h.local("refs/heads/feat/demo")).toBe(h.workOid); expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(h.workOid);
    expect((await h.remote()).stdout).toContain(h.workOid); expect((await h.exec("git", ["status", "--porcelain"])).stdout).toContain("personal.txt");
  });
  it("keeps an adopted branch on its held HEAD and names both owner cleanup commands", async () => {
    const h = await fixture({ adopted: true }); expect(await h.teardown()).toMatchObject({ status: "torn-down", branchDeleted: false,
      notices: expect.arrayContaining([expect.stringContaining("git switch"), expect.stringContaining("git branch -D feat/demo")]) });
    expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"])).stdout).toBe("feat/demo"); expect(await h.local("refs/heads/feat/demo")).toBe(h.workOid);
  });
  it("removes a clean ARC-spawned linked checkout before reaping its branch", async () => {
    const h = await fixture(); await h.exec("git", ["switch", "main"]); const path = join(h.root, "checkout");
    await h.exec("git", ["worktree", "add", path, "feat/demo"]); h.marker.spawnedByArc = true; h.setHolder(path); await writeWorktreeMarker(path, h.marker);
    await seedProjection({ checkout: path, store: h.store, identity: SlugSchema.parse("test-user"), files: [] });
    expect(await h.teardown()).toMatchObject({ status: "torn-down", worktreeRemoved: path, branchDeleted: true });
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(path);
  });
  it("detaches a clean retained linked checkout at base when the primary holds base", async () => {
    const h = await fixture(); await h.exec("git", ["switch", "main"]); const path = join(h.root, "checkout");
    await h.exec("git", ["worktree", "add", path, "feat/demo"]); h.setHolder(path);
    expect(await h.teardown()).toMatchObject({ status: "torn-down", branchDeleted: true });
    expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: path })).stdout).toBe(h.baseOid);
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain("detached");
  });
  it("reaps an additional zero-delta local/tracking ref but keeps origin's own additional branch", async () => {
    const h = await fixture({ secondary: true }); expect(await h.teardown()).toMatchObject({ status: "torn-down" });
    expect(await h.local("refs/heads/chore/demo")).toBeNull(); expect(await h.local("refs/remotes/origin/chore/demo")).toBeNull();
    expect((await h.exec("git", ["ls-remote", "origin", "refs/heads/chore/demo"])).stdout).toContain(h.workOid);
  });
  it("returns a clean additional holder to base before reaping its local and tracking refs", async () => {
    const h = await fixture({ secondary: true }), path = join(h.root, "checkout-extra");
    await h.exec("git", ["worktree", "add", path, "chore/demo"]);
    expect(await h.teardown()).toMatchObject({ status: "torn-down", branchDeleted: true });
    expect(await h.local("refs/heads/chore/demo")).toBeNull();
    expect(await h.local("refs/remotes/origin/chore/demo")).toBeNull();
    expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: path })).stdout).toBe(h.baseOid);
  });
  it("keeps a clean additional holder with independent work on its exact branch and head", async () => {
    const h = await fixture({ secondary: true }), path = join(h.root, "checkout-extra");
    await h.exec("git", ["worktree", "add", path, "chore/demo"]);
    await writeFile(join(path, "extra"), "independent\n");
    await h.exec("git", ["add", "extra"], { cwd: path });
    await h.exec("git", ["commit", "-m", "independent"], { cwd: path });
    const extraHead = (await h.exec("git", ["rev-parse", "HEAD"], { cwd: path })).stdout;
    expect(await h.teardown()).toMatchObject({ status: "torn-down", branchDeleted: true, remoteBranchDeleted: true });
    expect(await h.local("refs/heads/chore/demo")).toBe(extraHead);
    expect(await h.local("refs/remotes/origin/chore/demo")).toBe(h.workOid);
    expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"], { cwd: path })).stdout).toBe("chore/demo");
    expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: path })).stdout).toBe(extraHead);
    expect(await readFile(join(path, "extra"), "utf8")).toBe("independent\n");
  });
  it("retains the retiring proof while an additional holder is dirty and reaps both after repair", async () => {
    const h = await fixture({ secondary: true }), path = join(h.root, "checkout-extra");
    await h.exec("git", ["worktree", "add", path, "chore/demo"]);
    await writeFile(join(path, "personal.txt"), "preserve\n");
    expect(await runTeardown(h.ctx, { subject: { kind: "slug", slug: "demo" }, base: "main" })).toMatchObject({ status: "rejected",
      remedy: { argv: ["arc", "teardown", "demo"] } });
    expect(await h.local("refs/heads/feat/demo")).toBe(h.workOid);
    expect(await h.local("refs/remotes/origin/feat/demo")).toBe(h.workOid);
    expect((await h.remote()).stdout).toContain(h.workOid);
    expect(await h.local("refs/heads/chore/demo")).toBe(h.workOid);
    expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: path })).stdout).toBe(h.workOid);
    expect(await readFile(join(path, "personal.txt"), "utf8")).toBe("preserve\n");
    await rm(join(path, "personal.txt"));
    expect(await h.teardown()).toMatchObject({ status: "torn-down", branchDeleted: true, remoteBranchDeleted: true });
    expect(await h.local("refs/heads/chore/demo")).toBeNull();
    expect(await h.local("refs/remotes/origin/chore/demo")).toBeNull();
    expect(await h.local("refs/heads/feat/demo")).toBeNull();
    expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: path })).stdout).toBe(h.baseOid);
  });
  it("retains terminal authority and typed continuation when remote cleanup fails, then completes a real retry", async () => {
    const h = await fixture({ ended: false }); const original = h.ctx.exec;
    h.ctx.exec = (command, args, options) => args[0] === "push" ? Promise.reject(Error("injected remote failure")) : original(command, args, options);
    expect(await h.abandon()).toMatchObject({ status: "abandoned", outcome: { continuation: { argv: ["arc", "teardown", boundWorkUnitSubject(h.meta).uid] } } });
    expect((await h.store.read({ reference: h.meta.reference })).status).toBe("refused"); expect(await h.local("refs/heads/feat/demo")).toBe(h.workOid);
    h.ctx.exec = original; expect(await h.teardown(boundWorkUnitSubject(h.meta).uid)).toMatchObject({ status: "torn-down", branchDeleted: true, remoteBranchDeleted: true });
  });
  it("cleans the exact current-lineage husk while leaving a second husk registered", async () => {
    const h = await huskFixture();
    expect(await runTeardown(h.ctx, { subject: { kind: "slug", slug: "demo" }, base: "main", huskPath: h.paths[0] })).toMatchObject({ status: "torn-down", worktreeRemoved: h.paths[0] });
    const roster = (await h.exec("git", ["worktree", "list", "--porcelain"])).stdout;
    expect(roster).not.toContain(h.paths[0]); expect(roster).toContain(h.paths[1]);
  });
  it.each(["wrong-path", "evidence-mismatch", "head-moved", "dirty"] as const)("refuses %s husk selection before checkout/ref mutations", async (fault) => {
    const h = await huskFixture(); const path = h.paths[0];
    if (fault === "evidence-mismatch") await writeWorktreeMarker(path, { ...h.huskMarker, husk: { ...h.huskMarker.husk!, evidence: { kind: "lineage", transition: "abandon",
      reference: h.terminal.evidence.kind === "lineage" ? h.terminal.evidence.reference : h.meta.reference,
      version: h.meta.version, resultDigest: h.terminal.evidence.resultDigest } } });
    if (fault === "head-moved") await h.exec("git", ["commit", "--allow-empty", "-m", "after stamp"], { cwd: path });
    if (fault === "dirty") await writeFile(join(path, "personal.txt"), "keep\n");
    const before = (await h.exec("git", ["worktree", "list", "--porcelain"])).stdout;
    expect(await runTeardown(h.ctx, { subject: { kind: "slug", slug: "demo" }, base: "main", huskPath: fault === "wrong-path" ? join(h.root, "unknown") : path })).toMatchObject({ status: "rejected" });
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toBe(before); expect(await h.local("refs/heads/feat/demo")).toBe(h.workOid); expect((await h.remote()).stdout).toContain(h.workOid);
  });

  it.each([true, false])("checks the shipped stamp's original base proof against the current base, contained=%s", async (contained) => {
    const h = await huskFixture({ end: "archive" });
    await h.exec("git", ["commit", "--allow-empty", "-m", "later base"]); await h.exec("git", ["push", "origin", "main"]);
    if (!contained) {
      if (h.terminal.evidence.kind !== "shipped") throw Error("completed fixture must be shipped");
      await writeWorktreeMarker(h.paths[0], { ...h.huskMarker, husk: { ...h.huskMarker.husk!, evidence: { ...h.terminal.evidence, baseProofOid: h.workOid } } });
    }
    expect(await runTeardown(h.ctx, { subject: { kind: "slug", slug: "demo" }, base: "main", huskPath: h.paths[0] })).toMatchObject(contained ? { status: "torn-down", worktreeRemoved: h.paths[0] } : { status: "rejected" });
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(h.paths[1]);
  });
  it.each(["slug", "owner"] as const)("retains exact --husk retry arguments after a transient removal failure, selector=%s", async selector => {
    const h = await huskFixture(), original = h.ctx.exec;
    const subject: TeardownSubject = selector === "slug" ? { kind: "slug", slug: "demo" }
      : { kind: "owner", owner: h.meta.reference.owner };
    const operand = selector === "slug" ? "demo" : boundWorkUnitSubject(h.meta).uid;
    h.ctx.exec = (command, args, options) => args[0] === "worktree" && args[1] === "remove" ? Promise.reject(Error("injected removal failure")) : original(command, args, options);
    expect(await runTeardown(h.ctx, { subject, base: "main", huskPath: h.paths[0] })).toMatchObject({ status: "rejected", remedy: { argv: ["arc", "teardown", operand, "--husk", h.paths[0]] } });
    h.ctx.exec = original;
    expect(await runTeardown(h.ctx, { subject, base: "main", huskPath: h.paths[0] })).toMatchObject({ status: "torn-down", worktreeRemoved: h.paths[0] });
  });

  it("keeps the exact husk available for the same selector retry when ref cleanup fails first", async () => {
    const h = await huskFixture(), original = h.ctx.exec;
    h.ctx.exec = (command, args, options) => args[0] === "push" ? Promise.reject(Error("injected ref cleanup failure")) : original(command, args, options);
    expect(await runTeardown(h.ctx, { subject: { kind: "slug", slug: "demo" }, base: "main", huskPath: h.paths[0] })).toMatchObject({ status: "rejected", remedy: { argv: ["arc", "teardown", "demo", "--husk", h.paths[0]] } });
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(h.paths[0]);
    h.ctx.exec = original;
    expect(await runTeardown(h.ctx, { subject: { kind: "slug", slug: "demo" }, base: "main", huskPath: h.paths[0] })).toMatchObject({ status: "torn-down", worktreeRemoved: h.paths[0] });
  });

  it("retains the exact husk retry while another holder blocks ref cleanup and completes after repair", async () => {
    const h = await fixture({ secondary: true }); await h.exec("git", ["switch", "main"]);
    const terminal = await readStoreRetirementEvidence(h.store, h.meta.reference, h.baseOid);
    const huskPath = join(h.root, "checkout-husk"), extraPath = join(h.root, "checkout-extra");
    await h.exec("git", ["worktree", "add", "--detach", huskPath, h.workOid]);
    await writeWorktreeMarker(huskPath, { ...h.marker, spawnedByArc: true, husk: { sha: h.workOid,
      at: "2026-10-14T00:00:00Z", subject: { kind: "work-unit", name: "demo" }, branch: "feat/demo",
      authorization: "discard-confirmed", remoteRef: null, evidence: terminal.evidence } });
    await h.exec("git", ["worktree", "add", extraPath, "chore/demo"]);
    await writeFile(join(extraPath, "personal.txt"), "preserve\n"); h.ctx.readMarker = readWorktreeMarker;
    expect(await runTeardown(h.ctx, { subject: { kind: "slug", slug: "demo" }, base: "main", huskPath })).toMatchObject({ status: "rejected",
      remedy: { argv: ["arc", "teardown", "demo", "--husk", huskPath] } });
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(huskPath);
    expect(await h.local("refs/heads/feat/demo")).toBe(h.workOid);
    await rm(join(extraPath, "personal.txt")); await h.exec("git", ["switch", "--detach", h.baseOid], { cwd: extraPath });
    expect(await runTeardown(h.ctx, { subject: { kind: "slug", slug: "demo" }, base: "main", huskPath })).toMatchObject({ status: "torn-down", worktreeRemoved: huskPath });
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(huskPath);
    expect(await h.local("refs/heads/feat/demo")).toBeNull(); expect(await h.local("refs/heads/chore/demo")).toBeNull();
  });

});

it.each(["local", "tracking"].flatMap((source) => ["moved", "absent"].map((fault) => ({ source, fault }))))("retains additional refs when the $source preservation ref is $fault before deletion", async ({ source, fault }) => {
  const input = TeardownCommandInputSchema.parse({ name: "demo" });
  const h = await fixture({ secondary: true });
  if (source === "tracking") { await h.exec("git", ["switch", "main"]); await h.exec("git", ["update-ref", "-d", "refs/heads/feat/demo"]); }
  const ref = source === "local" ? "refs/heads/feat/demo" : "refs/remotes/origin/feat/demo";
  const normal = h.ctx.execInput!; let injected = false;
  h.ctx.execInput = async (args, input, options) => {
    if (!injected && args[0] === "update-ref" && input.includes("delete refs/heads/chore/demo ")) {
      injected = true; await h.exec("git", fault === "absent" ? ["update-ref", "-d", ref] : ["update-ref", ref, h.baseOid]);
    }
    return normal(args, input, options);
  };
  expect(await runTeardown(h.ctx, { subject: { kind: "slug", slug: input.name! }, base: "main" })).toMatchObject({ status: "rejected",
    remedy: { argv: ["arc", "teardown", "demo"] } });
  expect(injected).toBe(true);
  expect(await h.local("refs/heads/chore/demo")).toBe(h.workOid);
  expect(await h.local("refs/remotes/origin/chore/demo")).toBe(h.workOid);
  await h.exec("git", ["update-ref", ref, h.workOid]); h.ctx.execInput = normal;
  expect(await h.teardown()).toMatchObject({ status: "torn-down", remoteBranchDeleted: source === "local" });
  for (const name of ["feat/demo", "chore/demo"]) {
    expect(await h.local(`refs/heads/${name}`)).toBeNull();
    expect(await h.local(`refs/remotes/origin/${name}`)).toBe(source === "tracking" && name === "feat/demo" ? h.workOid : null);
  }
  expect((await h.exec("git", ["ls-remote", "origin", "refs/heads/chore/demo"])).stdout).toContain(h.workOid);
}, 30_000);
it("does not adopt a new retiring generation after additional ref deletion, then completes a fresh retry", async () => {
  const input = TeardownCommandInputSchema.parse({ name: "demo" });
  const h = await fixture({ secondary: true }), normal = h.ctx.execInput!; let injected = false;
  h.ctx.execInput = async (args, input, options) => {
    const result = await normal(args, input, options);
    if (!injected && args[0] === "update-ref" && input.includes("delete refs/heads/chore/demo ")) {
      injected = true; await h.exec("git", ["update-ref", "refs/heads/feat/demo", h.baseOid]);
    }
    return result;
  };
  expect(await runTeardown(h.ctx, { subject: { kind: "slug", slug: input.name! }, base: "main" })).toMatchObject({ status: "rejected",
    remedy: { argv: ["arc", "teardown", "demo"] } });
  expect(await h.local("refs/heads/feat/demo")).toBe(h.baseOid);
  expect(await h.local("refs/remotes/origin/feat/demo")).toBe(h.workOid);
  expect((await h.remote()).stdout).toContain(h.workOid);
  await h.exec("git", ["update-ref", "refs/heads/feat/demo", h.workOid]); h.ctx.execInput = normal;
  expect(await h.teardown()).toMatchObject({ status: "torn-down", branchDeleted: true, remoteBranchDeleted: true });
}, 30_000);

async function huskFixture(options: { end?: "archive" | "decompose"; projected?: boolean } = {}) {
  const h = await fixture(options); await h.exec("git", ["switch", "main"]);
  const terminal = await readStoreRetirementEvidence(h.store, h.meta.reference, h.baseOid);
  const paths = [join(h.root, "checkout-one"), join(h.root, "checkout-two")] as const;
  const huskMarker: WorktreeMarker = { ...h.marker, spawnedByArc: true, husk: { sha: h.workOid, at: "2026-10-14T00:00:00Z", subject: { kind: "work-unit", name: "demo" }, branch: "feat/demo",
    authorization: terminal.rule === "discard" ? "discard-confirmed" : "merged-preserved", remoteRef: null, evidence: terminal.evidence } };
  for (const path of paths) { await h.exec("git", ["worktree", "add", "--detach", path, h.workOid]); await writeWorktreeMarker(path, huskMarker); }
  h.ctx.readMarker = readWorktreeMarker;
  return { ...h, terminal, paths, huskMarker };
}

it.each([false, true])("preserves divergent ignored user files and removes after recovery, husk=%s", async (husk) => {
  const h = await huskFixture(); const path = h.paths[0];
  if (!husk) {
    const marker = { ...h.huskMarker }; delete marker.husk; await writeWorktreeMarker(path, marker);
    await seedProjection({ checkout: path, store: h.store, identity: SlugSchema.parse("test-user"), files: [] });
    h.setHolder(path);
  }
  const local = join(path, ".arc", "user", "test-user"); const canonical = join(h.root, ".arc", "user", "test-user");
  await mkdir(local, { recursive: true }); await mkdir(canonical, { recursive: true });
  await writeFile(join(local, "personal.md"), "unique local work\n"); await writeFile(join(canonical, "personal.md"), "different primary work\n");
  const params = { subject: { kind: "slug" as const, slug: "demo" }, base: "main", ...(husk ? { huskPath: path } : {}) };
  const refused = await runTeardown(h.ctx, params);
  expect(refused).toMatchObject({ status: "rejected" });
  if (husk) expect(refused).toMatchObject({ reason: expect.stringContaining("personal.md") });
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(path);
  expect(await readFile(join(local, "personal.md"), "utf8")).toBe("unique local work\n");
  expect(await readFile(join(canonical, "personal.md"), "utf8")).toBe("different primary work\n");
  const recovery = await createTempRepo("arc-personal-recovery-"); roots.push(recovery);
  await rename(join(local, "personal.md"), join(recovery, "personal.md"));
  const removed = await runTeardown(h.ctx, params);
  expect(removed, removed.status === "rejected" ? removed.reason : undefined).toMatchObject({ status: "torn-down", worktreeRemoved: path });
  expect(await readFile(join(recovery, "personal.md"), "utf8")).toBe("unique local work\n");
  expect(await readFile(join(canonical, "personal.md"), "utf8")).toBe("different primary work\n");
});

it.each(["archive", "decompose"] as const)("keeps an unlanded %s husk after its refs disappear and removes it after landing", async (end) => {
  const h = await huskFixture({ end }); const path = h.paths[0];
  await h.exec("git", ["branch", "-D", "feat/demo"]); await h.exec("git", ["push", "origin", "--delete", "feat/demo"]);
  const params = { subject: { kind: "slug" as const, slug: "demo" }, base: "main", huskPath: path };
  expect(await runTeardown(h.ctx, params)).toMatchObject({ status: "rejected", reason: expect.stringMatching(/preserv|landed/iu) });
  expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: path })).stdout).toBe(h.workOid);
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(path);
  await h.exec("git", ["merge", "--ff-only", h.workOid]); await h.exec("git", ["push", "origin", "main"]);
  expect(await runTeardown(h.ctx, params)).toMatchObject({ status: "torn-down", worktreeRemoved: path });
  expect(await readFile(join(h.root, "work"), "utf8")).toBe("work\n");
});

it("revalidates stamped-commit preservation before locked husk removal and accepts a repaired upstream", async () => {
  const h = await huskFixture({ end: "archive" }); const path = h.paths[0];
  const roster = await scanRegisteredWorktrees(h.exec); if (!roster.ok) throw new Error(roster.message);
  const selected = await selectStoreRetirementHusk({ ctx: h.ctx, evidence: h.terminal, baseOid: h.baseOid, path }, roster.worktrees);
  await h.exec("git", ["push", "origin", "--delete", "feat/demo"]);
  await expect(selected.revalidate()).rejects.toThrow(/not proven landed/iu);
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(path);
  await h.exec("git", ["push", "origin", "feat/demo"]);
  await expect(selected.revalidate()).resolves.toBeUndefined();
});

async function reusedNativeFixture() {
  const h = await fixture({ end: "archive" });
  await h.exec("git", ["switch", "main"]);
  const live = await h.seedMeta("demo", {}, { kind: "active" }, { branches: [retirementLink("feat/live")] });
  await h.exec("git", ["branch", "feat/live", h.baseOid]);
  const archivedPath = join(h.root, "checkout-archived"), livePath = join(h.root, "checkout-live");
  for (const [path, branch, record] of [[archivedPath, "feat/demo", h.meta], [livePath, "feat/live", live]] as const) {
    await h.exec("git", ["worktree", "add", path, branch]);
    await ensureWorktreeMarkerIgnored(path, h.exec, nodeWorktreeMarkerIgnoreFs);
    await writeWorktreeMarker(path, { ...h.marker, spawnedByArc: true, createdFor: boundWorkUnitSubject(record) });
    await seedProjection({ checkout: path, store: h.store, identity: SlugSchema.parse("test-user"), files: [] });
  }
  const ctx = nativeRetirementContext(h);
  const teardownUid = () => {
    const input = TeardownCommandInputSchema.parse({ name: boundWorkUnitSubject(h.meta).uid });
    if (input.name === undefined) throw Error("Missing test operand");
    return runTeardownForOperand(ctx, { name: input.name, base: "main" });
  };
  return { ...h, ctx, live, archivedPath, livePath, teardownUid };
}
it.each([false, true])("native UID teardown removes only its archived holder, former marker name=%s", async former => {
  const h = await reusedNativeFixture();
  if (former) await writeWorktreeMarker(h.archivedPath, { ...h.marker, wuName: "former", spawnedByArc: true,
    createdFor: boundWorkUnitSubject(h.meta, "former") });
  const liveMarker = await readFile(resolveWorktreeMarkerPath(h.livePath)), before = lifecycleSuccess(await h.store.version());
  expect(await h.teardownUid()).toMatchObject({ status: "torn-down", worktreeRemoved: h.archivedPath });
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(h.archivedPath);
  expect(await readFile(resolveWorktreeMarkerPath(h.livePath))).toEqual(liveMarker);
  expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"], { cwd: h.livePath })).stdout).toBe("feat/live");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: h.live.reference }))).toEqual(h.live);
}, 30_000);
it("native UID teardown refuses an unbound namesake and completes after its owner binds it", async () => {
  const h = await reusedNativeFixture();
  await writeWorktreeMarker(h.archivedPath, { ...h.marker, spawnedByArc: true, createdFor: { kind: "work-unit", name: "demo" } });
  const before = await readFile(resolveWorktreeMarkerPath(h.archivedPath));
  expect(await h.teardownUid()).toMatchObject({ status: "rejected", reason: expect.stringContaining("arc locus release") });
  expect(await readFile(resolveWorktreeMarkerPath(h.archivedPath))).toEqual(before);
  await writeWorktreeMarker(h.archivedPath, { ...h.marker, spawnedByArc: true });
  expect(await h.teardownUid()).toMatchObject({ status: "torn-down", worktreeRemoved: h.archivedPath });
}, 30_000);

it("keeps a UID husk retry in its preservation refusal and completes after upstream repair", async () => {
  const h = await huskFixture({ end: "archive" }), uid = boundWorkUnitSubject(h.meta).uid, path = h.paths[0];
  await h.exec("git", ["update-ref", "-d", "refs/remotes/origin/feat/demo"]);
  expect(await runTeardownForOperand(h.ctx, { name: uid, base: "main", huskPath: path })).toMatchObject({ status: "rejected",
    reason: expect.stringContaining(`retry arc teardown ${uid} --husk ${path}`) });
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(path);
  await h.exec("git", ["update-ref", "refs/remotes/origin/feat/demo", h.workOid]);
  expect(await runTeardownForOperand(h.ctx, { name: uid, base: "main", huskPath: path }))
    .toMatchObject({ status: "torn-down", worktreeRemoved: path });
}, 30_000);

it("keeps and reports the live holder's checkout, branch, and remote during archived UID teardown", async () => {
  const h = await reusedNativeFixture(), liveUid = boundWorkUnitSubject(h.live).uid;
  await h.exec("git", ["switch", "--detach", h.baseOid], { cwd: h.archivedPath });
  await h.exec("git", ["switch", "feat/demo"], { cwd: h.livePath });
  lifecycleSuccess(await h.store.write({ ...recordPut(h.live, { links: { branches: [retirementLink()] } }),
    provenance: { verb: "link", lifecycleAction: "link" } }));
  const marker = await readFile(resolveWorktreeMarkerPath(h.livePath)), before = lifecycleSuccess(await h.store.version());
  const result = await h.teardownUid();
  expect(result).toMatchObject({ status: "torn-down", branchDeleted: false, remoteBranchDeleted: false,
    notices: expect.arrayContaining([expect.stringContaining(`checkout`), expect.stringContaining(`local branch`),
      expect.stringContaining(`origin/feat/demo`)]) });
  if (result.status !== "torn-down") throw Error(result.reason);
  expect(result.notices.join(" ")).toContain(liveUid);
  expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"], { cwd: h.livePath })).stdout).toBe("feat/demo");
  expect(await h.local("refs/heads/feat/demo")).toBe(h.workOid);
  expect((await h.remote()).stdout).toContain(h.workOid);
  expect(await readFile(resolveWorktreeMarkerPath(h.livePath))).toEqual(marker);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
}, 30_000);

it.each(["live", "ambiguous", "refused"] as const)("keeps an additional zero-delta branch after a %s ref lookup without blocking teardown", async kind => {
  const h = await reusedNativeFixture(), link = retirementLink("chore/demo");
  await h.exec("git", ["branch", link.ref, h.workOid]); await h.exec("git", ["push", "origin", link.ref]);
  lifecycleSuccess(await h.store.write({ ...recordPut(h.meta, { links: { branches: [link, retirementLink()] } }),
    provenance: { verb: "link", lifecycleAction: "link" } }));
  if (kind !== "refused") {
    await h.exec("git", ["switch", link.ref], { cwd: h.livePath });
    lifecycleSuccess(await h.store.write({ ...recordPut(h.live, { links: { branches: [link] } }),
      provenance: { verb: "link", lifecycleAction: "link" } }));
  }
  const second = kind === "ambiguous" ? await h.seedMeta("other-live", {}, { kind: "active" }, { branches: [link] }) : undefined;
  const store = Object.create(h.store) as typeof h.store;
  store.lookup = async input => input.kind === "ref" && input.ref === link.ref
    ? { status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: "work-items",
      condition: "Branch ownership unavailable.", remedy: { text: "Retry after the writer finishes." } } }
    : h.store.lookup(input);
  if (kind === "refused") h.ctx.store = store;
  const marker = await readFile(resolveWorktreeMarkerPath(h.livePath));
  const result = await h.teardownUid();
  expect(result).toMatchObject({ status: "torn-down", notices: expect.arrayContaining([expect.stringContaining("Kept local branch chore/demo")]) });
  if (result.status !== "torn-down") throw Error(result.reason);
  for (const owner of kind === "refused" ? [] : [h.live, ...(second === undefined ? [] : [second])])
    expect(result.notices.join(" ")).toContain(boundWorkUnitSubject(owner).uid);
  if (kind === "refused") expect(result.notices.join(" ")).toContain("Branch ownership unavailable");
  expect(await h.local("refs/heads/chore/demo")).toBe(h.workOid);
  expect(await h.local("refs/remotes/origin/chore/demo")).toBe(h.workOid);
  expect((await h.exec("git", ["ls-remote", "origin", "refs/heads/chore/demo"])).stdout).toContain(h.workOid);
  expect(await readFile(resolveWorktreeMarkerPath(h.livePath))).toEqual(marker);
  if (kind !== "refused") expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"], { cwd: h.livePath })).stdout).toBe(link.ref);
  else {
    h.ctx.store = h.store;
    expect(await h.teardownUid()).toMatchObject({ status: "torn-down" });
    expect(await h.local("refs/heads/chore/demo")).toBeNull();
  }
}, 30_000);
it("reaps a branch linked by another completed holder", async () => {
  const h = await reusedNativeFixture();
  await h.exec("git", ["merge", "--ff-only", "feat/demo"]); await h.exec("git", ["push", "origin", "main"]);
  const other = await h.seedMeta("other-ended", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, { branches: [retirementLink()] });
  expect(await h.teardownUid()).toMatchObject({ status: "torn-down", branchDeleted: true, remoteBranchDeleted: true });
  expect(await h.local("refs/heads/feat/demo")).toBeNull(); expect((await h.remote()).stdout).toBe("");
  expect(lifecycleSuccess(await h.store.read({ reference: other.reference }))).toEqual(other);
}, 30_000);
it("omits adopted-branch cleanup advice when a live holder links that branch", async () => {
  const h = await reusedNativeFixture();
  await h.exec("git", ["switch", "--detach", h.baseOid], { cwd: h.archivedPath });
  await h.exec("git", ["switch", "feat/demo"], { cwd: h.livePath });
  lifecycleSuccess(await h.store.write({ ...recordPut(h.meta, { links: { branches: [retirementLink("feat/demo", "adopted")] } }),
    provenance: { verb: "link", lifecycleAction: "link" } }));
  lifecycleSuccess(await h.store.write({ ...recordPut(h.live, { links: { branches: [retirementLink()] } }),
    provenance: { verb: "link", lifecycleAction: "link" } }));
  const result = await h.teardownUid();
  expect(result.status).toBe("torn-down");
  if (result.status !== "torn-down") throw Error(result.reason);
  expect(result.notices.join(" ")).toContain(boundWorkUnitSubject(h.live).uid);
  expect(result.notices.join(" ")).not.toContain("Owner cleanup:");
  expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"], { cwd: h.livePath })).stdout).toBe("feat/demo");
  expect(await h.local("refs/heads/feat/demo")).toBe(h.workOid); expect((await h.remote()).stdout).toContain(h.workOid);
}, 30_000);

function nativeRetirementContext(h: Awaited<ReturnType<typeof fixture>>) {
  const io = { ...createUserIOContext(), exec: h.exec, execInput: makeGitExecInput(h.root) };
  const executor = buildExecutorContext({ cwd: h.root, io, store: h.store,
    locusPorts: createLocusPorts({ cwd: h.root, exec: h.exec, store: h.store }), projectId: async () => "repo",
    identity: "test-user", teamMode: false, internalTemplateDir: "/templates" });
  return createStoreTeardownContext({ cwd: h.root, identity: "test-user", io }, executor);
}
it.each(["contained", "ahead", "missing-object", "no-local"] as const)("discard teardown deletes only a held advertised remote tip, state=%s", async state => {
  const h = await fixture(), ctx = nativeRetirementContext(h);
  await ensureWorktreeMarkerIgnored(h.root, h.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(h.root, h.marker);
  let advertised = h.workOid;
  if (state === "ahead" || state === "missing-object") {
    const tree = (await h.exec("git", ["rev-parse", `${h.workOid}^{tree}`])).stdout;
    advertised = (await h.exec("git", ["--git-dir", join(h.root, "origin.git"), "-c", "user.name=Test", "-c", "user.email=test@example.com",
      "commit-tree", tree, "-p", h.workOid, "-m", "Another machine's push"])).stdout;
    await h.exec("git", ["--git-dir", join(h.root, "origin.git"), "update-ref", "refs/heads/feat/demo", advertised]);
    if (state === "ahead") await h.exec("git", ["fetch", "origin", "feat/demo"]);
    else await expect(h.exec("git", ["cat-file", "-e", advertised])).rejects.toBeDefined();
  }
  if (state === "no-local") {
    await h.exec("git", ["switch", "main"]); await h.exec("git", ["branch", "-D", "feat/demo"]);
  }
  const tracking = await h.local("refs/remotes/origin/feat/demo");
  const input = TeardownCommandInputSchema.parse({ name: boundWorkUnitSubject(h.meta).uid });
  if (input.name === undefined) throw Error("Missing UID operand");
  const result = await runTeardownForOperand(ctx, { name: input.name, base: "main" });
  expect(result).toMatchObject({ status: "torn-down", remoteBranchDeleted: state === "contained" });
  if (state === "contained") {
    expect((await h.remote()).stdout).toBe(""); expect(await h.local("refs/remotes/origin/feat/demo")).toBeNull();
  } else {
    expect((await h.remote()).stdout).toContain(advertised);
    expect(await h.local("refs/remotes/origin/feat/demo")).toBe(tracking);
    if (result.status !== "torn-down") throw Error(result.reason);
    expect(result.notices.join(" ")).toContain("Kept origin/feat/demo");
    expect(await h.local("refs/heads/feat/demo")).toBeNull();
    await h.exec("git", ["fetch", "origin", "feat/demo"]);
    await h.exec("git", ["branch", "feat/demo", advertised]);
    expect(await runTeardownForOperand(ctx, { name: input.name, base: "main" }))
      .toMatchObject({ status: "torn-down", remoteBranchDeleted: true });
    expect((await h.remote()).stdout).toBe(""); expect(await h.local("refs/remotes/origin/feat/demo")).toBeNull();
  }
}, 30_000);
