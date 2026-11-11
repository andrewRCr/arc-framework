/** Deferred operation notifications combine while a projection owns its lease and resume after release. */
import { afterEach, beforeEach, expect, it } from "vitest";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { requestProjectionFanOut, flushProjectionFanOut, withProjectionFanOutHold } from "../../../../src/lib/store/projection/fan-out-scheduler.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { success } from "../../../helpers/store/suite-tools.js";

beforeEach(() => { beginProjectionCommand(); });
afterEach(() => { beginProjectionCommand(); });

it("combines locked writes into one fan-out after release, reading the last landed content", async () => {
  const source = createReferenceFixture(), destination = createReferenceFixture();
  const reference = source.reference("personal/document"), state = projectionProcessState();
  state.fanOut = async () => {
    expect(state.lockHeld).toBe(false);
    const current = success(await source.store.read({ reference }));
    const previous = await destination.store.read({ reference });
    success(await destination.store.write({ action: "put", reference, content: current.content,
      expected: previous.status === "ok" ? previous.result.version : null, provenance: { verb: "save", lifecycleAction: "save" } }));
  };
  const store = withFanOut(source.store, { capture: () => references => requestProjectionFanOut("test-checkout", references),
    report: cause => { throw cause; } });
  state.lockHeld = true;
  success(await store.write({ action: "put", reference, content: "First edit.\n", expected: null,
    provenance: { verb: "save", lifecycleAction: "save" } }));
  const first = success(await source.store.read({ reference }));
  success(await store.write({ action: "put", reference, content: "Second edit.\n", expected: first.version,
    provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(await destination.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  state.lockHeld = false;
  await flushProjectionFanOut();
  expect(success(await destination.store.read({ reference })).content).toBe("Second edit.\n");
  expect(success(await destination.store.history({ reference }))).toHaveLength(1);
});

it("keeps a write during fan-out in its next round instead of nesting another fan-out", async () => {
  const source = createReferenceFixture(), destination = createReferenceFixture();
  const reference = source.reference("personal/document"), state = projectionProcessState();
  let active = false, first = true;
  const store = withFanOut(source.store, { capture: () => references => requestProjectionFanOut("test-checkout", references),
    report: cause => { throw cause; } });
  state.fanOut = async () => {
    if (active) throw new Error("A nested fan-out entered an unfinished round");
    active = true;
    const current = success(await source.store.read({ reference }));
    const previous = await destination.store.read({ reference });
    success(await destination.store.write({ action: "put", reference, content: current.content,
      expected: previous.status === "ok" ? previous.result.version : null, provenance: { verb: "save", lifecycleAction: "save" } }));
    if (first) {
      first = false;
      state.lockHeld = true;
      success(await store.write({ action: "put", reference, content: "A take-in during the first round.\n", expected: current.version,
        provenance: { verb: "save", lifecycleAction: "save" } }));
      state.lockHeld = false;
      await flushProjectionFanOut();
    }
    active = false;
  };
  success(await store.write({ action: "put", reference, content: "The initial write.\n", expected: null,
    provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(success(await destination.store.read({ reference })).content).toBe("A take-in during the first round.\n");
  expect(success(await destination.store.history({ reference }))).toHaveLength(2);
  expect(state.diagnostics).toEqual([]);
});

for (const outcome of ["bound", "refused"] as const) {
  it(`holds a scaffold write until its marker is ${outcome}, without treating the hold as a lock`, async () => {
    const source = createReferenceFixture(), destination = createReferenceFixture();
    const reference = source.reference("personal/document"), state = projectionProcessState();
    let marker = "unbound";
    state.fanOut = async () => {
      const current = success(await source.store.read({ reference }));
      success(await destination.store.write({ action: "put", reference, content: `${current.content}Marker: ${marker}.\n`, expected: null,
        provenance: { verb: "save", lifecycleAction: "save" } }));
    };
    const store = withFanOut(source.store, { capture: () => references => requestProjectionFanOut("test-checkout", references),
      report: cause => { throw cause; } });
    const result = await withProjectionFanOutHold(async () => {
      expect(state.lockHeld).toBe(false);
      success(await store.write({ action: "put", reference, content: "Scaffold.\n", expected: null,
        provenance: { verb: "start", lifecycleAction: "create" } }));
      expect(await destination.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      marker = outcome;
      return outcome;
    });
    expect(result).toBe(outcome);
    expect(success(await destination.store.read({ reference })).content).toBe(`Scaffold.\nMarker: ${outcome}.\n`);
  });
}

it("reports a failed deferred fan-out without rejecting its flush and succeeds after the destination is repaired", async () => {
  const source = createReferenceFixture(), destination = createReferenceFixture();
  const reference = source.reference("personal/document"), state = projectionProcessState();
  state.fanOut = () => Promise.reject(new Error("The destination is temporarily unavailable"));
  const store = withFanOut(source.store, { capture: () => references => requestProjectionFanOut("test-checkout", references),
    report: cause => { throw cause; } });
  state.lockHeld = true;
  success(await store.write({ action: "put", reference, content: "Landed before deferred fan-out.\n", expected: null,
    provenance: { verb: "save", lifecycleAction: "save" } }));
  state.lockHeld = false;
  await expect(flushProjectionFanOut()).resolves.toBeUndefined();
  expect(state.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ path: "test-checkout",
    mark: expect.objectContaining({ reason: expect.stringContaining("The destination is temporarily unavailable") }) })]));
  state.fanOut = async () => {
    const record = success(await source.store.read({ reference }));
    success(await destination.store.write({ action: "put", reference, content: record.content, expected: null,
      provenance: { verb: "save", lifecycleAction: "save" } }));
  };
  await requestProjectionFanOut("test-checkout");
  expect(success(await destination.store.read({ reference })).content).toBe("Landed before deferred fan-out.\n");
});

for (const reason of ["switch", "no-identity"] as const) {
  it(`drops deferred and new fan-out requests while projection is skipped for ${reason}`, async () => {
    const source = createReferenceFixture(), destination = createReferenceFixture();
    const reference = source.reference("personal/document"), state = projectionProcessState();
    state.fanOut = async () => {
      const record = success(await source.store.read({ reference }));
      const previous = await destination.store.read({ reference });
      success(await destination.store.write({ action: "put", reference, content: record.content,
        expected: previous.status === "ok" ? previous.result.version : null, provenance: { verb: "save", lifecycleAction: "save" } }));
    };
    const store = withFanOut(source.store, { capture: () => references => requestProjectionFanOut("test-checkout", references),
      report: cause => { throw cause; } });
    state.lockHeld = true;
    success(await store.write({ action: "put", reference, content: "Deferred before the skip.\n", expected: null,
      provenance: { verb: "save", lifecycleAction: "save" } }));
    state.skip = { reason, mark: { reason: reason === "switch" ? "Projection skipped by --skip-projection." : "Projection disabled: unset identity.",
      remedy: { text: "Run a command with projection and an identified checkout." } } };
    state.lockHeld = false;
    await flushProjectionFanOut();
    const first = success(await source.store.read({ reference }));
    success(await store.write({ action: "put", reference, content: "Written under the skip.\n", expected: first.version,
      provenance: { verb: "save", lifecycleAction: "save" } }));
    expect(await destination.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
}
