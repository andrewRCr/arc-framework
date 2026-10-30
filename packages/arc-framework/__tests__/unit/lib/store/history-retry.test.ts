/** An ended item's reads and writes pull the history refs their refusal names and retry once. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { retryEndedItemHistory } from "../../../../src/lib/store/history-retry.js";
import { HistoryRefSchema, PullResultSchema, type RecordReference, type Store, type StoreRefusal, type StoreResult } from "../../../../src/lib/store/index.js";

interface EndedItemOptions {
  /** Pulls naming the history ref before this clone holds it. */
  pullsToRestore?: number;
  /** The state remote refuses the pull, though a partial fetch may already have restored the ref. */
  pullFails?: boolean;
  /** The first refusal's shape; an ended item's missing history unless set. */
  refusal?: "named-history" | "no-history-named" | "version-conflict";
}

/** A clone lacking an ended item's history ref until pulls name it, refusing as the ref backend does. */
async function endedItem(options: EndedItemOptions = {}) {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("ended");
  const owner = meta.reference.owner;
  const history = HistoryRefSchema.parse(`refs/arc/history/work/${"uid" in owner ? owner.uid : ""}`);
  const shape = options.refusal ?? "named-history";
  let pulls = 0, refusals = 0;
  const held = () => shape === "named-history" ? pulls >= (options.pullsToRestore ?? 1) : refusals > 0;
  const missing = (reference: RecordReference): StoreRefusal | null => {
    if (held() || JSON.stringify(reference.owner) !== JSON.stringify(owner)) return null;
    refusals++;
    const remedy = { text: `Pull ${history} by name, then retry the operation.` };
    if (shape === "version-conflict") {
      return { code: "version-conflict", class: "recoverable", records: [reference], condition: "The record moved.", remedy };
    }
    return { code: "state-unresolvable", class: "recoverable", reference,
      historyRefs: shape === "named-history" ? [history] : [],
      condition: "The retained history does not contain every batch named by this item's archive folders.", remedy };
  };
  const refused = async <T>(reference: RecordReference, operation: () => Promise<StoreResult<T>>): Promise<StoreResult<T>> => {
    const refusal = missing(reference);
    return refusal ? { status: "refused", refusal } : operation();
  };
  const store: Store = { capabilities: h.store.capabilities,
    read: input => refused(input.reference, () => h.store.read(input)),
    write: input => refused(input.reference, () => h.store.write(input)),
    list: input => h.store.list(input), batch: input => h.store.batch(input), version: () => h.store.version(),
    history: input => h.store.history(input), changes: input => h.store.changes(input), lookup: input => h.store.lookup(input),
    push: input => h.store.push(input), maintain: () => h.store.maintain(),
    pull: async input => {
      if (input?.history?.includes(history) === true) pulls++;
      return { status: "ok", result: PullResultSchema.parse({ states: [], pulls: options.pullFails === true ? [{ status: "failed",
        role: "state", remote: "origin", families: ["work-item"], notices: [], failure: { code: "unreachable", class: "recoverable",
          cause: "network", condition: "The state remote is unreachable.", remedy: { text: "Reconnect, then retry." } } }] : [] }) };
    } };
  return { store, meta };
}

function write(f: Awaited<ReturnType<typeof endedItem>>) {
  return { action: "put" as const, reference: f.meta.reference, expected: f.meta.version, content: f.meta.content,
    placement: { kind: "active" as const }, provenance: { verb: "attest", lifecycleAction: "attest" } };
}

it("pulls an ended item's named history and succeeds on the read's and the write's retry", async () => {
  const f = await endedItem();
  const store = retryEndedItemHistory(f.store);
  const read = lifecycleSuccess(await store.read({ reference: f.meta.reference }));
  expect(read.content).toBe(f.meta.content);
  const second = await endedItem();
  expect(lifecycleSuccess(await retryEndedItemHistory(second.store).write(write(second))).reference)
    .toEqual(second.meta.reference);
});

it("refuses with the refusal that follows its one pull", async () => {
  const f = await endedItem({ pullsToRestore: 2 });
  expect(await retryEndedItemHistory(f.store).read({ reference: f.meta.reference }))
    .toMatchObject({ status: "refused", refusal: { code: "state-unresolvable" } });
});

it.each([["another refusal", "version-conflict"], ["a refusal naming no history", "no-history-named"]] as const)(
  "passes %s through unretried", async (_label, refusal) => {
    const f = await endedItem({ refusal });
    expect(await retryEndedItemHistory(f.store).write(write(f)))
      .toMatchObject({ status: "refused", refusal: { code: refusal === "version-conflict" ? "version-conflict" : "state-unresolvable" } });
  });

it("keeps the original refusal and its remedy when the state remote refuses the pull", async () => {
  const f = await endedItem({ pullFails: true });
  expect(await retryEndedItemHistory(f.store).read({ reference: f.meta.reference })).toMatchObject({ status: "refused",
    refusal: { code: "state-unresolvable", remedy: { text: expect.stringContaining("by name") } } });
});

it("retries once however many selections wrap the same store", async () => {
  const f = await endedItem({ pullsToRestore: 2 });
  expect(await retryEndedItemHistory(retryEndedItemHistory(f.store)).read({ reference: f.meta.reference }))
    .toMatchObject({ status: "refused", refusal: { code: "state-unresolvable" } });
});
