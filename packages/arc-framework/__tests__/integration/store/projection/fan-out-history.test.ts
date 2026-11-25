/** A save-start history pull releases its merged changes even when the retried archive write refuses. */
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createEngineFixture, configureEngineCheckout, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { lackingEndedHistory } from "../../../helpers/store/ended-history.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import { createProjectionFanOutDependencies } from "../../../../src/lib/store/projection/fan-out-binding.js";

const directories: string[] = [];
beforeEach(() => { beginProjectionCommand(); });
afterEach(async () => { beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

it("fans out a history pull after releasing the save-start lease even when its retry lands no archive write", async () => {
  const h = await createEngineFixture(directories, { kind: "work-item/notes",
    path: ".arc/completed/2026-q4/01_work-item-one/notes-work-item-one.md",
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  const first = { store: h.store, checkout: h.checkout, location: h.location, ports: h.ports };
  expect(await startProjection(first)).toMatchObject({ kind: "ready" });
  await endProjection(first);
  await h.exec("git", ["commit", "--allow-empty", "-m", "Seed code"], { cwd: h.checkout });
  const parent = await mkdtemp(join(tmpdir(), "arc-fan-out-history-")); directories.push(parent);
  const checkout = join(parent, "linked");
  await h.exec("git", ["worktree", "add", "--detach", checkout], { cwd: h.checkout });
  await configureEngineCheckout(checkout);
  const sibling = await seedProjection({ store: h.store, checkout, files: [{ path: h.path, reference: h.record.reference }] });
  const siblingInput = { store: h.store, checkout, location: sibling.location };
  expect(await startProjection(siblingInput)).toMatchObject({ kind: "ready" });
  await endProjection(siblingInput);
  await h.edit("An archive edit waiting for its writer.\n");
  const missing = lackingEndedHistory(h.store, h.record.reference.owner);
  const fetched = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "scratch/fetched.md" });
  let pulled = false;
  const source = overrideEngineStore(missing, {
    batch: input => pulled ? Promise.resolve({ status: "refused", refusal: StoreRefusalSchema.parse({ code: "lock-held", class: "recoverable",
      lock: "archive", condition: "The archive writer is held after history arrived.", remedy: { text: "Release the archive writer and retry save." } }) }) : missing.batch(input),
    pull: async input => {
      expect(projectionProcessState().lockHeld).toBe(true);
      success(await h.store.write({ action: "put", reference: fetched, expected: null, content: "Merged by the history pull.\n",
        provenance: { verb: "save", lifecycleAction: "save" } }));
      pulled = true;
      return missing.pull(input);
    },
    version: async () => {
      if (projectionProcessState().fanOutRunning) {
        expect(projectionProcessState().lockHeld).toBe(false);
        expect(await withProjectionLock(h.location, async () => "released", { maxWaitMs: 0 })).toEqual({ status: "done", value: "released" });
      }
      return h.store.version();
    },
  });
  const store = withFanOut(source, createProjectionFanOutDependencies(h.checkout));
  expect(await startProjection({ ...first, store, mode: "save" })).toMatchObject({ kind: "ready" });
  expect(pulled).toBe(true);
  expect((await h.stored()).content).toBe(h.record.content);
  expect(await h.file()).toContain("An archive edit waiting for its writer.");
  expect(projectionProcessState().roots.get(h.checkout)?.changed).toBe(false);
  for (const root of [h.checkout, sibling.checkout]) {
    expect(await readFile(join(root, ".arc/user/andrew/scratch/fetched.md"), "utf8")).toContain("Merged by the history pull.");
  }
  expect(projectionProcessState().diagnostics.some(diagnostic => diagnostic.mark.reason.includes("archive writer is held"))).toBe(true);
  expect(projectionProcessState().diagnostics.some(diagnostic => diagnostic.mark.reason.includes("Fan-out failed"))).toBe(false);
});
