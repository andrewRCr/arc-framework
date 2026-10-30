/** A clone lacking an ended item's history pulls the refs its refusal names and retries the operation once. */
import { expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { retryEndedItemHistory } from "../../src/lib/store/history-retry.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");

it("writes to an item another clone archived after pulling the history its refusal names", async () => {
  const h = await refSyncFixture();
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("ended-retry"),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "ended-retry" } }),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  const live = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.write({ action: "put", reference: live.reference, expected: live.version, content: live.content,
    placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const ended = success(await h.b.store.read({ reference: made.reference }));
  const write = { action: "put" as const, reference: ended.reference, expected: ended.version,
    content: makeMetaFixture("ended-retry", { nextAction: "Record the landing commit" }),
    placement: { kind: "completed" as const, quarter }, provenance: { verb: "merge", lifecycleAction: "link" } };
  const uid = "uid" in made.reference.owner ? made.reference.owner.uid : "";
  expect(await h.b.store.write(write)).toMatchObject({ status: "refused",
    refusal: { code: "state-unresolvable", historyRefs: [`refs/arc/history/work/${uid}`] } });
  success(await retryEndedItemHistory(h.b.store, () => {}).write(write));
  expect(success(await h.b.store.read({ reference: made.reference })).content).toBe(write.content);
});
