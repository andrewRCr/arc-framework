/** A native lease blocks fan-out until its physical release, then combines its landed writes once. */
import { afterEach, beforeEach, expect, it } from "vitest";
import { createEngineFixture } from "../../../helpers/store/projection/engine-fixture.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { withProjectionFanOutLock } from "../../../../src/lib/store/projection/fan-out-lock.js";
import { requestProjectionFanOut, flushProjectionFanOut } from "../../../../src/lib/store/projection/fan-out-scheduler.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";

const directories: string[] = [];
beforeEach(() => { beginProjectionCommand(); });
afterEach(async () => { beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

async function fixture() {
  const h = await createEngineFixture(directories), destination = createReferenceFixture(), state = projectionProcessState();
  destination.identity("andrew");
  state.fanOut = async () => {
    expect(state.lockHeld).toBe(false);
    expect(await withProjectionLock(h.location, async () => "unlocked", { maxWaitMs: 0 })).toEqual({ status: "done", value: "unlocked" });
    const current = await h.stored(), previous = await destination.store.read({ reference: current.reference });
    success(await destination.store.write({ action: "put", reference: current.reference, content: current.content,
      expected: previous.status === "ok" ? previous.result.version : null, provenance: { verb: "save", lifecycleAction: "save" } }));
  };
  const store = withFanOut(h.store, { capture: () => references => requestProjectionFanOut(h.checkout, references),
    report: cause => { throw cause; } });
  return { h, destination, state, store };
}

it("keeps the lock flag until physical release and fans out locked writes once after it can reacquire the lease", async () => {
  const { h, destination, state, store } = await fixture();
  const result = await withProjectionFanOutLock(h.location, async session => {
    expect(state.lockHeld).toBe(true);
    for (const content of ["First locked edit.\n", "Last locked edit.\n"]) {
      const current = await h.stored();
      success(await store.write({ action: "put", reference: current.reference, content, expected: current.version,
        provenance: { verb: "save", lifecycleAction: "save" } }));
    }
    expect(await destination.store.read({ reference: h.record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    await session.step();
    return "completed";
  });
  expect(result).toEqual({ status: "done", value: "completed" });
  expect(state.lockHeld).toBe(false);
  expect(success(await destination.store.read({ reference: h.record.reference })).content).toBe("Last locked edit.\n");
  expect(success(await destination.store.history({ reference: h.record.reference }))).toHaveLength(1);
});

it("never marks a timed-out lease as held by the waiting command", async () => {
  const { h, state } = await fixture();
  const outer = await withProjectionLock(h.location, async () => {
    const waited = await withProjectionFanOutLock(h.location, async () => { throw new Error("A held lease admitted its waiter"); }, { maxWaitMs: 0 });
    expect(waited.status).toBe("held");
    expect(state.lockHeld).toBe(false);
  });
  expect(outer.status).toBe("done");
  expect(state.lockHeld).toBe(false);
});

it("flushes a landed write after an operation throws and preserves the original exception", async () => {
  const { h, destination, state, store } = await fixture();
  const failure = new Error("The operation failed after landing its edit");
  await expect(withProjectionFanOutLock(h.location, async () => {
    const current = await h.stored();
    success(await store.write({ action: "put", reference: current.reference, content: "Landed before the operation failed.\n", expected: current.version,
      provenance: { verb: "save", lifecycleAction: "save" } }));
    throw failure;
  })).rejects.toBe(failure);
  expect(state.lockHeld).toBe(false);
  expect(success(await destination.store.read({ reference: h.record.reference })).content).toBe("Landed before the operation failed.\n");
});

it("drops command-end notifications and still fans out a later ordinary write", async () => {
  const { h, destination, state, store } = await fixture();
  const result = await withProjectionFanOutLock(h.location, async () => {
    expect(state.lockHeld).toBe(true);
    const current = await h.stored();
    success(await store.write({ action: "put", reference: current.reference, content: "Taken in at command end.\n", expected: current.version,
      provenance: { verb: "save", lifecycleAction: "save" } }));
  }, { fanOut: "drop" });
  expect(result.status).toBe("done");
  expect(state.lockHeld).toBe(false);
  await flushProjectionFanOut();
  expect(await destination.store.read({ reference: h.record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  const current = await h.stored();
  expect(current.content).toBe("Taken in at command end.\n");
  success(await store.write({ action: "put", reference: current.reference, content: "A later ordinary write.\n", expected: current.version,
    provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(success(await destination.store.read({ reference: h.record.reference })).content).toBe("A later ordinary write.\n");
  expect(success(await destination.store.history({ reference: h.record.reference }))).toHaveLength(1);
});
