/** Delivery input refuses conflicted metadata before exposing task-list authority. */
import { expect, it } from "vitest";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { createMemoryRemote } from "../../../helpers/store/sync.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaNextAction } from "../../../../src/lib/store/kinds/meta/writers.js";
import { readStoredDeliveryEntryInput } from "../../../../src/lib/store/delivery-entry-input.js";

it("reports exact metadata conflicts without writes and reads the same owner after resolution", async () => {
  const h = createReviewHarness(), primary = await h.seedMeta("example", { taskList: "tasks-example.md" });
  const remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.push());
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  for (const [store, label] of [[h.store, "local"], [writer, "remote"]] as const) {
    const record = lifecycleSuccess(await store.read({ reference: primary.reference }));
    lifecycleSuccess(await store.write({ ...recordPut(record, { content: writeMetaNextAction(record.content, label) }),
      provenance: { verb: "attest", lifecycleAction: "edit" } }));
  }
  lifecycleSuccess(await h.store.push());
  const disputed = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  expect(disputed.conflicts.length).toBeGreaterThan(0);
  const version = lifecycleSuccess(await h.store.version());
  const refused = await readStoredDeliveryEntryInput(h.store, "example");
  expect(refused).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("unresolved conflicts"),
    remedy: { text: expect.stringContaining("resolve") } } });
  for (const conflict of disputed.conflicts) {
    expect(refused.status === "refused" ? refused.refusal.condition : "").toContain(JSON.stringify(conflict));
  }
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  lifecycleSuccess(await h.store.write({ ...recordPut(disputed), resolves: disputed.conflicts,
    provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  expect(await readStoredDeliveryEntryInput(h.store, "example")).toMatchObject({ status: "ok", result: {
    primary: { reference: disputed.reference }, taskListPath: ".arc/active/tasks-example.md" } });
});
