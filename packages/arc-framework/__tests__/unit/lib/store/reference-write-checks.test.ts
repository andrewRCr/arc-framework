/** Awaited checks preserve atomicity across reopened writers and remote publication. */
import { expect, it } from "vitest";
import type { WriteCheck } from "../../../../src/lib/store/index.js";
import { referenceRegistration } from "../../../helpers/store/reference-fixture.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";
import { success, testProvenance } from "../../../helpers/store/suite-tools.js";

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

it.each([false, true])("refuses breaking checks without publishing records or history; batch: %s", async (batch) => {
  const check: WriteCheck = async () => [{ rule: "counter.test", condition: "Counter rejected",
    remedy: { text: "Change the counter and retry" } }];
  const fixture = await referenceRegistration.create({ "project-registry/counter": { check: check } });
  const reference = fixture.reference("project-registry/counter");
  const from = success(await fixture.store.version());
  const mutation = { action: "put" as const, reference, expected: null, content: fixture.content(reference) };
  const result = batch ? await fixture.store.batch({ writes: [mutation], provenance: testProvenance })
    : await fixture.store.write({ ...mutation, provenance: testProvenance });
  expect(result).toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "counter.test" } });
  expect(success(await fixture.store.version())).toBe(from);
  expect(await fixture.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(success(await fixture.store.changes({ from, to: from }))).toEqual([]);
});

it("releases a shared queue after a check throws and discards the failed mutation", async () => {
  const entered = barrier(), unblock = barrier();
  let first = true;
  const defect = new Error("Check defect");
  const fixture = await referenceRegistration.create({ "project-registry/counter": { check: async () => {
    if (first) { first = false; entered.release(); await unblock.promise; throw defect; }
    return [];
  } } });
  const store = fixture.store, reopened = fixture.reopen();
  const from = success(await store.version());
  const rejected = fixture.reference("project-registry/counter", "rejected");
  const accepted = fixture.reference("project-registry/counter", "accepted");
  const left = store.write({ action: "put", reference: rejected, expected: null,
    content: fixture.content(rejected), provenance: testProvenance });
  const failure = expect(left).rejects.toBe(defect);
  await entered.promise;
  const right = reopened.write({ action: "put", reference: accepted, expected: null,
    content: fixture.content(accepted), provenance: testProvenance });
  unblock.release();
  await failure;
  success(await right);
  expect(await store.read({ reference: rejected })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(success(await store.history({ reference: accepted }))).toHaveLength(1);
  expect(success(await store.changes({ from, to: success(await store.version()) })).map((event) => event.reference))
    .toEqual([success(await store.read({ reference: accepted })).reference]);
  const third = fixture.reference("project-registry/counter", "third");
  success(await reopened.write({ action: "put", reference: third, expected: null,
    content: fixture.content(third), provenance: testProvenance }));
});

it("version-checks a reopened batch after an awaited writer commits", async () => {
  const entered = barrier(), unblock = barrier();
  const fixture = await referenceRegistration.create({ "project-registry/counter": { check: async ({ next }) => {
    if (next?.content.includes('"value":2')) { entered.release(); await unblock.promise; }
    return [];
  } } });
  const reference = fixture.reference("project-registry/counter");
  const seed = success(await fixture.store.write({ action: "put", reference, expected: null,
    content: fixture.content(reference), provenance: testProvenance }));
  const left = fixture.store.write({ action: "put", reference: seed.reference, expected: seed.version!,
    content: fixture.content(reference, "changed"), provenance: testProvenance });
  await entered.promise;
  const right = fixture.reopen().batch({ writes: [{ action: "put", reference: seed.reference, expected: seed.version!,
    content: fixture.content(reference, "changed-again") }], provenance: testProvenance });
  unblock.release();
  const winner = success(await left);
  expect(await right).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
  expect(success(await fixture.store.read({ reference })).version).toBe(winner.version);
  expect(success(await fixture.store.read({ reference })).content).toBe(fixture.content(reference, "changed"));
});

it("reconciles a remote write that commits after sync prepared its first publish", async () => {
  const entered = barrier(), unblock = barrier(), prepared = barrier();
  const fixture = await referenceRegistration.create({ "project-registry/counter": { check: async ({ next }) => {
    if (next?.content.includes('"value":2')) { entered.release(); await unblock.promise; }
    return [];
  } } });
  const remote = fixture.remote(true)!;
  const localReference = fixture.reference("project-registry/counter", "local");
  success(await fixture.store.write({ action: "put", reference: localReference, expected: null,
    content: fixture.content(localReference), provenance: testProvenance }));
  const remoteReference = fixture.reference("project-registry/counter", "remote");
  const writing = remote.write({ action: "put", reference: remoteReference, expected: null,
    content: fixture.content(remoteReference, "changed"), provenance: testProvenance });
  await entered.promise;
  (fixture.store as ReferenceBackend).context.publication.remote!.beforePublish = () => { prepared.release(); };
  const syncing = fixture.store.push();
  await prepared.promise;
  unblock.release();
  success(await writing);
  expect(success(await syncing).publishes[0]?.status).toBe("reconciled");
  for (const store of [fixture.store, remote]) {
    expect(success(await store.read({ reference: localReference })).content).toBe(fixture.content(localReference));
    expect(success(await store.read({ reference: remoteReference })).content).toBe(fixture.content(remoteReference, "changed"));
  }
});
