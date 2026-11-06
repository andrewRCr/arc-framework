/** Cohort retirement preflights and post-write observations retain exact record state. */
import { expect, it } from "vitest";
import { runCohortClose, runCohortRemove } from "../../../src/commands/cohort.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { HistoryRefSchema, RecordReferenceSchema } from "../../../src/lib/store/index.js";
import type { Store } from "../../../src/lib/store/contract.js";
import { mergeLineText } from "../../../src/lib/store/concurrency/index.js";
import { createMemoryRemote } from "../../helpers/store/sync.js";

const clock = () => new Date("2026-10-14T12:00:00Z");
const document = "# Cohort: `group`\n\n**Parent:** [none]\n\n**Purpose:** Coordinate the group.\n";
async function fixture() {
  const h = createLifecycleHarness();
  const group = await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })), document);
  return { ...h, group };
}

it.each([runCohortClose, runCohortRemove])("classifies an absent cohort UID without changing state", async run => {
  const h = await fixture(), uid = "abcdef01-2345-4678-9abc-def012345678";
  const before = lifecycleSuccess(await h.store.version());
  expect(await run(h.store, { operand: uid, confirmed: true })).toMatchObject({ status: "refused",
    refusal: { code: "not-found", uid, condition: expect.stringContaining(uid), remedy: { text: expect.stringMatching(/pull/iu) } } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("refuses a completed cohort selected by UID without rewriting it", async () => {
  const h = await fixture();
  lifecycleSuccess(await h.store.write({ ...recordPut(h.group, { placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }),
    provenance: { verb: "cohort-close", lifecycleAction: "close" } }));
  const completed = lifecycleSuccess(await h.store.read({ reference: h.group.reference }));
  const owner = completed.reference.owner;
  if (owner.type === "person" || owner.uid === undefined) throw new Error("Expected cohort UID");
  expect(await runCohortClose(h.store, { operand: owner.uid, confirmed: true }, clock))
    .toMatchObject({ status: "refused", refusal: { reference: completed.reference, condition: expect.stringMatching(/already.*completed/iu) } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.group.reference }))).toEqual(completed);
});

it("reports that close persisted when its assigned placement cannot yet be read", async () => {
  const h = await fixture();
  let persisted = false;
  const store: Store = new Proxy(h.store, { get(target, key) {
    if (key === "batch") return async (input: Parameters<Store["batch"]>[0]) => {
      const result = await target.batch(input); persisted = result.status === "ok"; return result;
    };
    if (key === "read") return async (input: Parameters<Store["read"]>[0]) => {
      if (persisted) throw new Error("Placement read transport is down.");
      return target.read(input);
    };
    const value: unknown = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  expect(await runCohortClose(store, { operand: "group", confirmed: true }, clock))
    .toMatchObject({ status: "refused", persisted: true, plan: { reference: h.group.reference },
      refusal: { condition: expect.stringContaining("Placement read transport is down") } });
  const closed = lifecycleSuccess(await h.store.read({ reference: h.group.reference }));
  expect(closed.placement?.kind).toBe("completed");
  expect(await runCohortClose(h.store, { operand: "group", confirmed: true }, clock)).toMatchObject({ status: "refused",
    refusal: { condition: expect.stringMatching(/already.*completed/iu) } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.group.reference }))).toEqual(closed);
});

it("names unresolved cohort conflicts before confirmation and closes after resolution", async () => {
  const h = await fixture(), label = { actor: "remote", time: new Date(0).toISOString() };
  const currentContent = h.group.content.replace("Coordinate", "Deliver locally");
  lifecycleSuccess(await h.store.write({ ...recordPut(h.group, { content: currentContent }), provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const merged = mergeLineText({ record: h.group.reference, baseVersion: h.group.version, base: h.group.content,
    current: currentContent, incoming: h.group.content.replace("Coordinate", "Deliver remotely"), currentLabel: label, incomingLabel: label });
  const data = merged.conflicts[0], key = "00000000-0000-4000-8000-000000000099";
  if (data === undefined) throw new Error("Expected a producer-generated Purpose conflict");
  const conflict = RecordReferenceSchema.parse({ owner: h.group.reference.owner, kind: "cohort/conflict-record", key });
  lifecycleSuccess(await h.store.write({ action: "put", expected: null, reference: conflict,
    content: JSON.stringify(data),
    provenance: { verb: "sync", lifecycleAction: "reconcile" } }));
  const disputed = lifecycleSuccess(await h.store.read({ reference: h.group.reference }));
  expect(disputed.conflicts).toEqual([conflict]);
  expect(await runCohortClose(h.store, { operand: "group", confirmed: false }, clock))
    .toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining(key),
      remedy: { text: expect.stringContaining("Resolve the named conflict records") } } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.group.reference }))).toEqual(disputed);
  lifecycleSuccess(await h.store.write({ ...recordPut(disputed), resolves: disputed.conflicts,
    provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  expect(await runCohortClose(h.store, { operand: "group", confirmed: true }, clock)).toMatchObject({ status: "closed" });
});

it("refuses removal while completed membership cannot be enumerated and removes after read repair", async () => {
  const h = await fixture();
  const store: Store = new Proxy(h.store, { get(target, key) {
    if (key === "list") {
      const list: Store["list"] = async input => input.kind === "work-item/meta"
        ? { status: "ok", result: { status: "unreadable", condition: "Completed membership is unreadable.", remedy: { text: "Repair membership reads." } } }
        : target.list(input);
      return list;
    }
    const value: unknown = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  expect(await runCohortRemove(store, { operand: "group", confirmed: true }))
    .toMatchObject({ status: "refused", refusal: { condition: "Completed membership is unreadable." } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.group.reference }))).toEqual(h.group);
  expect(await runCohortRemove(h.store, { operand: "group", confirmed: true }))
    .toMatchObject({ status: "removed", reference: h.group.reference, placement: null });
});

async function removalHistoryFixture() {
  const h = await fixture(), remote = createMemoryRemote(), peer = createLifecycleHarness();
  h.store.context.publication.remote = remote; peer.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.write({ ...recordPut(h.group, { placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }),
    provenance: { verb: "cohort-close", lifecycleAction: "close" } }));
  lifecycleSuccess(await h.store.push()); lifecycleSuccess(await peer.store.pull());
  const owner = h.group.reference.owner;
  if (owner.type !== "cohort" || owner.uid === undefined) throw new Error("Expected cohort UID");
  const history = HistoryRefSchema.parse(`refs/arc/history/cohort/${owner.uid}`);
  let missingHistory = true;
  const store: Store = new Proxy(h.store, { get(target, key) {
    if (key === "batch") {
      const batch: Store["batch"] = async input => missingHistory ? { status: "refused", refusal: {
        code: "state-unresolvable", class: "recoverable", reference: h.group.reference, historyRefs: [history],
        condition: "The retained history lacks the cohort's closeout batch.", remedy: { text: `Pull ${history} by name and retry.` },
      } } : target.batch(input);
      return batch;
    }
    if (key === "pull") {
      const pull: Store["pull"] = async input => {
        const result = await target.pull(input);
        if (result.status === "ok" && input?.history?.includes(history)) missingHistory = false;
        return result;
      };
      return pull;
    }
    const value: unknown = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { ...h, peer, store };
}

it("rechecks completed holders landed by the removal's history pull", async () => {
  const h = await removalHistoryFixture();
  const member = await h.peer.seedMeta("arrived", { state: "Shipped", cohort: "group", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  lifecycleSuccess(await h.peer.store.push());
  expect(await runCohortRemove(h.store, { operand: "group", confirmed: true })).toMatchObject({ status: "refused",
    refusal: { rule: "cohort.remove-holdings", condition: expect.stringContaining("arrived") } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.group.reference })).placement?.kind).toBe("completed");
  expect(lifecycleSuccess(await h.store.read({ reference: member.reference })).content).toBe(member.content);
});

it("keeps the selected UID when a history pull brings a live cohort reusing its slug", async () => {
  const h = await removalHistoryFixture();
  const reused = await h.peer.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group",
    uid: "00000000-0000-4000-8000-000000000077" })), document);
  lifecycleSuccess(await h.peer.store.push());
  expect(await runCohortRemove(h.store, { operand: "group", confirmed: true })).toMatchObject({ status: "removed", reference: h.group.reference });
  expect(await h.store.read({ reference: h.group.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(lifecycleSuccess(await h.store.read({ reference: reused.reference })).content).toBe(reused.content);
});
