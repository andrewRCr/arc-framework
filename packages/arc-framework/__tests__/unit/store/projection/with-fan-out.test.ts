/** Landed operations become visible to a fan-out destination before the decorated operation returns. */
import { expect, it } from "vitest";
import { withFanOut, type FanOutDependencies } from "../../../../src/lib/store/projection/with-fan-out.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import { PullResultSchema } from "../../../../src/lib/store/sync.js";

function interpose(store: Store, overrides: Partial<Store>): Store {
  return new Proxy(store, { get(target, key) {
    const override: unknown = Reflect.get(overrides, key);
    if (override !== undefined) return override;
    const value: unknown = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

it("fans out a landed write after its new content is readable", async () => {
  const source = createReferenceFixture(), destination = createReferenceFixture();
  const reference = source.reference("personal/document");
  const store = withFanOut(source.store, { capture: () => async () => {
    const record = success(await source.store.read({ reference }));
    success(await destination.store.write({ action: "put", reference, content: record.content, expected: null,
      provenance: { verb: "save", lifecycleAction: "save" } }));
  }, report: cause => { throw cause; } });
  expect(await store.write({ action: "put", reference, content: "A landed edit.\n", expected: null,
    provenance: { verb: "save", lifecycleAction: "save" } })).toMatchObject({ status: "ok" });
  expect(success(await destination.store.read({ reference })).content).toBe("A landed edit.\n");
});

it("captures notification authority before the backend runs and cannot complete into a later command", async () => {
  const source = createReferenceFixture(), destinations = [createReferenceFixture(), createReferenceFixture()];
  const reference = source.reference("personal/document");
  let current = 0, blocked = false;
  let release = (): void => { throw new Error("The operation gate was not initialized"); };
  const gate = new Promise<void>(resolve => { release = resolve; });
  const observed = interpose(source.store, { write: async input => {
    if (blocked) await gate;
    return source.store.write(input);
  } });
  const copy = async (index: number): Promise<void> => {
    const destination = destinations[index];
    if (destination === undefined) throw new Error("No destination for the current command");
    const record = success(await source.store.read({ reference })), previous = await destination.store.read({ reference });
    success(await destination.store.write({ action: "put", reference, content: record.content,
      expected: previous.status === "ok" ? previous.result.version : null, provenance: { verb: "save", lifecycleAction: "save" } }));
  };
  const store = withFanOut(observed, { capture: () => {
    const selected = current;
    return async () => { if (selected === current) await copy(selected); };
  }, report: cause => { throw cause; } });
  success(await store.write({ action: "put", reference, content: "The first command.\n", expected: null,
    provenance: { verb: "save", lifecycleAction: "save" } }));
  const first = success(await source.store.read({ reference }));
  blocked = true;
  const late = store.write({ action: "put", reference, content: "Completed after the command changed.\n", expected: first.version,
    provenance: { verb: "save", lifecycleAction: "save" } });
  current = 1;
  release();
  success(await late);
  const [earlier, later] = destinations;
  if (earlier === undefined || later === undefined) throw new Error("Missing command destinations");
  expect(success(await earlier.store.read({ reference })).content).toBe("The first command.\n");
  expect(await later.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});

for (const operation of ["write", "batch"] as const) {
  it(`does not fan out a refused ${operation}`, async () => {
    const source = createReferenceFixture(), destination = createReferenceFixture();
    const reference = source.reference("personal/document");
    source.hold(reference, true);
    const store = withFanOut(source.store, { capture: () => async () => {
      const version = success(await source.store.version());
      success(await destination.store.write({ action: "put", reference, content: `Observed ${version}.\n`, expected: null,
        provenance: { verb: "save", lifecycleAction: "save" } }));
    }, report: cause => { throw cause; } });
    const mutation = { action: "put" as const, reference, content: "Refused edit.\n", expected: null };
    const provenance = { verb: "save", lifecycleAction: "save" };
    const result = operation === "write" ? await store.write({ ...mutation, provenance }) : await store.batch({ writes: [mutation], provenance });
    expect(result).toMatchObject({ status: "refused", refusal: { code: "lock-held" } });
    expect(await destination.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
}

for (const reporterThrows of [false, true]) {
  it(`preserves a landed result when fan-out fails and its reporter ${reporterThrows ? "throws" : "reports"}`, async () => {
    const source = createReferenceFixture();
    const reference = source.reference("personal/document"), fault = new Error("A destination cannot be refreshed");
    const diagnostics: unknown[] = [];
    let landed: Awaited<ReturnType<Store["write"]>> | undefined;
    const observed = interpose(source.store, { write: async input => { landed = await source.store.write(input); return landed; } });
    const store = withFanOut(observed, { capture: () => () => Promise.reject(fault), report: cause => {
      diagnostics.push(cause);
      if (reporterThrows) throw new Error("The reporter failed");
    } });
    const result = await store.write({ action: "put", reference, content: "Durably landed despite the fan-out fault.\n", expected: null,
      provenance: { verb: "save", lifecycleAction: "save" } });
    expect(result).toBe(landed);
    expect(result).toMatchObject({ status: "ok" });
    expect(success(await source.store.read({ reference })).content).toBe("Durably landed despite the fan-out fault.\n");
    expect(diagnostics).toEqual([fault]);
  });
}

it("does not wrap an already decorated store or repeat its fan-out", async () => {
  const source = createReferenceFixture(), destination = createReferenceFixture();
  const reference = source.reference("personal/document");
  const deps: FanOutDependencies = { capture: () => async () => {
    const record = success(await source.store.read({ reference }));
    const previous = await destination.store.read({ reference });
    success(await destination.store.write({ action: "put", reference,
      content: (previous.status === "ok" ? previous.result.content : "") + record.content,
      expected: previous.status === "ok" ? previous.result.version : null, provenance: { verb: "save", lifecycleAction: "save" } }));
  }, report: cause => { throw cause; } };
  const once = withFanOut(source.store, deps), twice = withFanOut(once, deps);
  success(await twice.write({ action: "put", reference, content: "One fan-out.\n", expected: null,
    provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(success(await destination.store.read({ reference })).content).toBe("One fan-out.\n");
  expect(twice).toBe(once);
});

it("leaves a store with in-repo capability unchanged and performs no fan-out", async () => {
  const source = createReferenceFixture(), destination = createReferenceFixture();
  const reference = source.reference("personal/document");
  const disabled = interpose(source.store, { capabilities: { stateOffBranch: false } });
  const store = withFanOut(disabled, { capture: () => async () => {
    success(await destination.store.write({ action: "put", reference, content: "Unexpected fan-out.\n", expected: null,
      provenance: { verb: "save", lifecycleAction: "save" } }));
  }, report: cause => { throw cause; } });
  success(await store.write({ action: "put", reference, content: "A plain store write.\n", expected: null,
    provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(success(await source.store.read({ reference })).content).toBe("A plain store write.\n");
  expect(await destination.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(store).toBe(disabled);
});

for (const remote of ["absent", "down"] as const) {
  it(`fans out after a push with its remote ${remote}`, async () => {
    const source = createReferenceFixture(), destination = createReferenceFixture();
    const record = await seed(source, source.reference("personal/document"), "Locally landed before sync.\n");
    if (remote === "down") { source.remote(true); source.remoteState("down"); }
    const store = withFanOut(source.store, { capture: () => async () => {
      const current = success(await source.store.read({ reference: record.reference }));
      success(await destination.store.write({ action: "put", reference: record.reference, content: current.content, expected: null,
        provenance: { verb: "save", lifecycleAction: "save" } }));
    }, report: cause => { throw cause; } });
    const pushed = success(await store.push());
    expect(remote === "down" ? pushed.publishes[0]?.status : pushed.states[0]?.status).toBe(remote === "down" ? "failed" : "no-remote");
    expect(success(await destination.store.read({ reference: record.reference })).content).toBe(record.content);
  });
}

it("fans out a pull reported failed after a merge and preserves the exact sync result", async () => {
  const source = createReferenceFixture(), destination = createReferenceFixture();
  const reference = source.reference("personal/document");
  const remote = source.remote(true);
  if (remote === undefined) throw new Error("No memory remote");
  success(await remote.write({ action: "put", reference, content: "Merged before a partial failure.\n", expected: null,
    provenance: { verb: "save", lifecycleAction: "save" } }));
  let reported: Awaited<ReturnType<Store["pull"]>> | undefined;
  const partial = interpose(source.store, { pull: async input => {
    const merged = success(await source.store.pull(input));
    reported = { status: "ok", result: PullResultSchema.parse({ ...merged,
      pulls: merged.pulls.map(pull => ({ ...pull, status: "failed", failure: { code: "unreachable", class: "recoverable",
        cause: "network", condition: "A later fetch failed after a merge.", remedy: { text: "Retry sync." } } })) }) };
    return reported;
  } });
  const store = withFanOut(partial, { capture: () => async () => {
    const current = success(await source.store.read({ reference }));
    success(await destination.store.write({ action: "put", reference, content: current.content, expected: null,
      provenance: { verb: "save", lifecycleAction: "save" } }));
  }, report: cause => { throw cause; } });
  const result = await store.pull();
  expect(result).toBe(reported);
  expect(result).toMatchObject({ status: "ok", result: { pulls: [expect.objectContaining({ status: "failed" })] } });
  expect(success(await destination.store.read({ reference })).content).toBe("Merged before a partial failure.\n");
});

it("fans out all records of a landed atomic batch", async () => {
  const source = createReferenceFixture(), destination = createReferenceFixture();
  const references = [source.reference("personal/document", "one"), source.reference("personal/document", "two")];
  const store = withFanOut(source.store, { capture: () => async references => {
    for (const reference of references) {
      const record = success(await source.store.read({ reference }));
      success(await destination.store.write({ action: "put", reference, content: record.content, expected: null,
        provenance: { verb: "save", lifecycleAction: "save" } }));
    }
  }, report: cause => { throw cause; } });
  expect(await store.batch({ writes: references.map((reference, i) => ({ action: "put", reference,
    content: `Batch member ${i}.\n`, expected: null })), provenance: { verb: "save", lifecycleAction: "save" } })).toMatchObject({ status: "ok" });
  for (const [i, reference] of references.entries()) expect(success(await destination.store.read({ reference })).content).toBe(`Batch member ${i}.\n`);
});
