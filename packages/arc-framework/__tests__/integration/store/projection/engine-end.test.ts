/** Fresh index authority and copy settlement at the command's end. */
import { access, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { NATIVE_LEASE_PROCESS } from "../../../../src/lib/lease-process.js";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { createEngineFixture, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";
import { recordWriteBack, TAKEN_IN_FOLDER } from "../../../../src/lib/store/projection/taken-in.js";
import { writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { PROJECTION_LOCK_FILE } from "../../../../src/lib/store/projection/lock.js";
import { acquireAdvisoryLock, releaseAdvisoryLockConfirmed, type AdvisoryLockHandle } from "../../../../src/lib/advisory-lock.js";
import { ADVISORY_LEASE_DURATION_MS } from "../../../../src/lib/renewable-lease.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { createStore } from "../../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../../src/lib/store/default-store-ports.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { success } from "../../../helpers/store/suite-tools.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

describe("projection command end", () => {
  it("takes only the start lock and leaves the header unchanged when there is nothing to settle", async () => {
    const h = await createEngineFixture(directories), base = { store: h.store, checkout: h.checkout };
    await startProjection(base); await endProjection(base);
    let leases = 0;
    const native = h.ports();
    const input = { ...base, ports: () => ({ ...native, lock: {
      resolveProcessScope: async () => { leases++; return NATIVE_LEASE_PROCESS.resolveProcessScope(); },
    } }) };
    expect(await startProjection(input)).toMatchObject({ kind: "ready" });
    const path = join(h.location.stateDir, "index"), before = await stat(path, { bigint: true }), bytes = await readFile(path, "utf8");
    await endProjection(input);
    const after = await stat(path, { bigint: true });
    expect(leases).toBe(1);
    expect({ ino: after.ino, mtimeNs: after.mtimeNs }).toEqual({ ino: before.ino, mtimeNs: before.mtimeNs });
    expect(await readFile(path, "utf8")).toBe(bytes);
  });

  it.each([false, true])("settles an otherwise empty end after a store send, refused=%s", async refused => {
    const h = await createEngineFixture(directories), base = { store: h.store, checkout: h.checkout };
    await startProjection(base); await endProjection(base);
    await writeFile(join(h.checkout, ".gitignore"), "");
    await h.edit("A send still requires collection.\n");
    const fault = createRefusingStore(h.store);
    if (refused) fault.refuse("batch", { code: "record-malformed", class: "recoverable", rule: "fixture.send",
      condition: "Injected batch refusal", remedy: { text: "Repair the batch boundary and retry." } });
    let leases = 0;
    const native = h.ports();
    const input = { checkout: h.checkout, store: fault.store, ports: () => ({ ...native, lock: {
      resolveProcessScope: async () => { leases++; return NATIVE_LEASE_PROCESS.resolveProcessScope(); },
    } }) };
    expect(await startProjection(input)).toMatchObject({ kind: "ready" });
    const root = projectionProcessState().roots.get(h.checkout);
    expect(root).toMatchObject({ copies: [], removals: [], sweepEmpty: true });
    expect(fault.calls("batch")).toBeGreaterThan(0);
    const folder = join(h.location.stateDir, TAKEN_IN_FOLDER);
    await mkdir(folder, { recursive: true }); await writeFile(join(folder, "orphan"), "retained orphan\n");
    const beforeEnd = leases;
    await endProjection(input);
    expect(leases).toBe(beforeEnd + 1);
    await expect(access(join(folder, "orphan"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await h.stored()).content).toBe(refused ? h.record.content : "A send still requires collection.\n");
  });

  it("takes the end lease for a recorded removal whose file was already absent, without a send or aside copy", async () => {
    const h = await createEngineFixture(directories), base = { store: h.store, checkout: h.checkout };
    await startProjection(base); await endProjection(base);
    success(await h.store.write({ action: "remove", reference: h.record.reference, expected: h.record.version,
      provenance: { verb: "merge", lifecycleAction: "remove" } }));
    await rm(join(h.checkout, h.path));
    let leases = 0;
    const native = h.ports();
    const input = { ...base, ports: () => ({ ...native, lock: {
      resolveProcessScope: async () => { leases++; return NATIVE_LEASE_PROCESS.resolveProcessScope(); },
    } }) };
    expect(await startProjection(input)).toMatchObject({ kind: "ready" });
    expect(projectionProcessState().roots.get(h.checkout)).toMatchObject({ sent: false, copies: [], removals: [h.path], sweepEmpty: true });
    await endProjection(input);
    expect(leases).toBe(2);
    await expect(access(join(h.checkout, h.path))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reads the current index under the end lock, keeps its named content copy, and removes orphaned copies", async () => {
    const h = await createEngineFixture(directories);
    await h.edit("An initial send requires end settlement.\n");
    await startProjection({ store: h.store, checkout: h.checkout });
    const recorded = await recordWriteBack({ location: h.location, entry: h.entry, stamp: h.entry.base.blob,
      takenIn: "hand edit the merge did not store verbatim\n", outcome: { kind: "landed", version: h.record.version },
      readBack: h.record, grammar: undefined, format: "sha1", memo: createHistoryMemo(h.store) });
    const copy = recorded.entry.persisted?.takenIn;
    if (copy?.kind !== "copy") throw new Error("expected a retained merged input");
    const folder = join(h.location.stateDir, TAKEN_IN_FOLDER);
    await writeFile(join(folder, "orphan"), "a stop left this before publication");
    const disk = await h.disk();
    await writeProjectionIndex(h.location, { ...disk, entries: { ...disk.entries, [h.path]: recorded.entry } });
    await endProjection({ store: h.reopen(), checkout: h.checkout });
    expect((await h.disk()).entries[h.path]).toMatchObject({ persisted: recorded.entry.persisted });
    expect(await readFile(join(folder, copy.name), "utf8")).toBe("hand edit the merge did not store verbatim\n");
    await expect(access(join(folder, "orphan"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("clears a stampless file's replacement progress when its own aside copy is settled", async () => {
    const h = await createEngineFixture(directories, { path: ".arc/user/andrew/scratch/document.txt" });
    await h.edit("hand edit\n");
    await startProjection({ store: h.store, checkout: h.checkout });
    const stored = await h.stored();
    expect((await h.disk()).entries[h.path]).toMatchObject({ inProgress: { replaces: {
      blob: gitBlobId(stored.content, "sha1"), version: stored.version } } });
    await endProjection({ store: h.store, checkout: h.checkout });
    expect((await h.disk()).entries[h.path]).toMatchObject({ inProgress: null, copies: [] });
    expect(await h.file()).toBe("hand edit\n");
  });

  it("preserves files and retained content when the index becomes unusable at command end, then retries after repair", async () => {
    const h = await createEngineFixture(directories);
    expect(await startProjection({ store: h.store, checkout: h.checkout })).toMatchObject({ kind: "ready" });
    const original = await readFile(join(h.location.stateDir, "index"), "utf8");
    const folder = join(h.location.stateDir, TAKEN_IN_FOLDER);
    await mkdir(folder);
    await writeFile(join(folder, "orphan"), "retained input");
    await h.edit("hand edit\n");
    const saved = await h.file();
    await writeFile(join(h.location.stateDir, "index"), "unreadable");
    await endProjection({ store: h.store, checkout: h.checkout });
    expect(await h.file()).toBe(saved);
    expect(await readFile(join(folder, "orphan"), "utf8")).toBe("retained input");
    await writeFile(join(h.location.stateDir, "index"), original);
    await startProjection({ store: h.store, checkout: h.checkout });
    await endProjection({ store: h.store, checkout: h.checkout });
    expect((await h.stored()).content).toBe("hand edit\n");
    await expect(access(join(folder, "orphan"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not run a ready root's end when the caller's backend keeps state in the checkout", async () => {
    const h = await createEngineFixture(directories);
    await startProjection({ store: h.store, checkout: h.checkout });
    const folder = join(h.location.stateDir, TAKEN_IN_FOLDER);
    await mkdir(folder);
    await writeFile(join(folder, "orphan"), "must remain");
    await endProjection({ store: createStore(createDefaultStorePorts({ checkoutRoot: h.checkout })), checkout: h.checkout });
    expect(await readFile(join(folder, "orphan"), "utf8")).toBe("must remain");
  });

  it("leaves a late copy after end loses its lease, and the next start sweeps it successfully", async () => {
    const h = await createEngineFixture(directories);
    await h.edit("first edit\n");
    let ending = false;
    let now = Date.now();
    let replacement: AdvisoryLockHandle | undefined;
    const native = h.ports();
    const store = overrideEngineStore(h.store, { batch: async input => {
      const result = await h.store.batch(input);
      if (ending) {
        now = Date.now() + ADVISORY_LEASE_DURATION_MS + 1000;
        replacement = await acquireAdvisoryLock(join(h.location.stateDir, PROJECTION_LOCK_FILE), {
          pid: process.pid, processInstance: "replacement", processScope: "other-scope", now: () => now,
          leaseDurationMs: ADVISORY_LEASE_DURATION_MS, maxWaitMs: 200,
        });
      }
      return result;
    } });
    await startProjection({ store, checkout: h.checkout, ports: () => ({ ...native,
      writer: async () => ({ ...await native.writer(), processInstance: "first-command" }),
      lock: { now: () => now, resolveProcessScope: async () => "original-scope", scheduleEvery: () => () => undefined },
    }) });
    const entry = (await h.disk()).entries[h.path];
    if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("missing first-check copy");
    const copy = entry.copies[0].name;
    const late = renderStampedFile({ content: "late save\n", stamp: h.entry.base.blob });
    await writeFile(join(h.checkout, copy), late);
    ending = true;
    await endProjection({ store, checkout: h.checkout });
    expect(await readFile(join(h.checkout, copy), "utf8")).toBe(late);
    expect(projectionProcessState().diagnostics.some(diagnostic => diagnostic.mark.reason.includes("end skipped: lost"))).toBe(true);
    expect(projectionProcessState().lockHeld).toBe(false);
    if (replacement === undefined) throw new Error("replacement never acquired");
    await releaseAdvisoryLockConfirmed(replacement);
    await startProjection({ store: h.store, checkout: h.checkout });
    expect((await h.stored()).content).toBe("late save\n");
    await expect(access(join(h.checkout, copy))).rejects.toMatchObject({ code: "ENOENT" });
  });


  it("keeps an empty second-check copy for the next command's sweep", async () => {
    const h = await createEngineFixture(directories);
    await h.edit("hand edit\n");
    const native = h.ports();
    await startProjection({ store: h.store, checkout: h.checkout, ports: () => ({ ...native,
      writer: async () => ({ ...await native.writer(), processInstance: "first-command" }),
    }) });
    const entry = (await h.disk()).entries[h.path];
    if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("missing second-check copy");
    const copy = entry.copies[0].name;
    await writeFile(join(h.checkout, copy), "");
    await utimes(join(h.checkout, copy), 0, 0);
    await endProjection({ store: h.store, checkout: h.checkout });
    expect(await readFile(join(h.checkout, copy), "utf8")).toBe("");
    await startProjection({ store: h.store, checkout: h.checkout });
    await expect(access(join(h.checkout, copy))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await h.file()).toContain("hand edit");
  });

});
