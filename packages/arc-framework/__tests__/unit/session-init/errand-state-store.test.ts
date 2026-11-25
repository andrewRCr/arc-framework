/** Resume and materialization use only this identity's active ordinary Errand records. */
import { expect, it } from "vitest";
import { runErrandState, type RunErrandStateOptions } from "../../../src/lib/session-init/errand-state.js";
import { TransientIdentityRecordV3Schema, serializeTransientIdentityRecord } from "../../../src/lib/errand/identity-record.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
const head = "a".repeat(40);
async function fixture(originEntry = "personal:11111111") {
  const h = createLifecycleHarness();
  const records = [];
  for (const [slug, owner] of [["own", "andrew"], ["closed", "andrew"], ["foreign", "someone"]] as const) {
    const record = TransientIdentityRecordV3Schema.parse({ version: 3, kind: "errand", purpose: "errand", slug, owner,
      claimId: "b".repeat(32), branch: `chore/${slug}`, intent: "Fix it", ...(slug === "own" ? { origin: "inbox", originEntry, originEntrySourceDigest: null } : { origin: "description", originEntry: null }),
      state: "paused", savedHead: head, changeRequest: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" });
    if (record.kind !== "errand" || record.purpose !== "errand") throw new Error("Expected ordinary Errand");
    records.push(record);
    await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: slug })),
      serializeTransientIdentityRecord(record), slug === "closed" ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" });
  }
  const options: RunErrandStateOptions = { store: h.store, identity: "andrew", records, recordsComplete: true,
    exec: async () => { throw new Error("No Git classification needed for an empty oracle set"); }, currentBranch: "main", hasBackingMeta: false,
    includeDiscovery: true, entries: [], baseBranch: "main", staleThresholdDays: 3, remoteTips: new Map(records.map(record => [record.branch, head])),
    nudge: { shouldNudge: false, markerPath: "/nudge", today: "2026-10-16" } };
  return { ...h, options };
}
it.each(["closed", "foreign"])("never resumes or offers a %s record whose remote branch survives", async slug => {
  const h = await fixture();
  const result = await runErrandState({ ...h.options, currentBranch: `chore/${slug}` });
  expect(result.resume.resumable).toBe(false);
  expect(result.materializable.candidates.map(candidate => candidate.slug)).toEqual(["own"]);
});
it.each(["personal:11111111", "Former capture title"])("detects its owned active Errand in any mode and retains originEntry %s", async originEntry => {
  const h = await fixture(originEntry);
  expect((await runErrandState({ ...h.options, currentBranch: "chore/own", includeDiscovery: false })).resume)
    .toMatchObject({ resumable: true, slug: "own" });
  expect((await runErrandState(h.options)).materializable.candidates[0]).toMatchObject({ slug: "own", originEntry });
});
