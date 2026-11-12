/** Real clones compare independent review readers and retain the status reader's identity ref. */
import { expect, it } from "vitest";
import type { ReviewInvocationInput } from "../../src/scripts/review-gate/runtime/invocation.js";
import { createReviewRepositoryHarness, compareReviewImplementations } from "../helpers/store/review-differential.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createLocalMappingFixture } from "../fixtures/review-mapping.js";
import { TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import { readTransientIdentitySnapshot } from "../../src/lib/errand/identity-snapshot.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { LocalReviewOperationStateStore } from "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { readLaneProgress } from "../../src/scripts/review-gate/lane-progress.js";
import { mapReviewRecords } from "../../src/lib/store/kinds/review/mapping.js";
import { createReviewOutcomePort } from "../../src/lib/store/kinds/review/outcome/access.js";
import { deriveReviewOutcomePassCounts } from "../../src/lib/store/kinds/review/outcome/counts.js";

function errandRecord() {
  const value = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand",
    slug: "review-errand", claimId: "1".repeat(32), intent: "Review differential", origin: "description", originEntry: null,
    branch: "chore/review-errand", state: "open", savedHead: null, changeRequest: null,
    createdAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z" });
  if (value.kind !== "errand" || value.purpose !== "errand") throw new Error("Expected ordinary Errand");
  return value;
}

it("compares produced pass counts and detects a missing native result", async () => {
  const h = await createReviewRepositoryHarness();
  try {
    const record = errandRecord(), primary = await h.reference.seedErrand(record);
    const projectId = "123e4567-e89b-42d3-a456-426614174099";
    await h.reference.seedProject(projectId);
    if (primary.reference.owner.type !== "work-item" || primary.reference.owner.uid === undefined) throw new Error("Expected stored Errand generation");
    const fixture = await createLocalMappingFixture({ repositoryId: projectId,
      lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: record.claimId, headSha: "c".repeat(40) },
      vehicle: { kind: "errand", identity: record.slug, claimId: record.claimId },
      imported: { workItems: [{ kind: "errand", slug: record.slug, claimId: record.claimId,
        uid: primary.reference.owner.uid, live: true }], candidates: [] } });
    await fixture.conclude("clean");
    const working = new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(h.inRepo.exec, h.inRepo.cwd));
    for (const { state } of fixture.operations.values()) await working.publishOperation(state, 0);
    const observations = {
      inRepo: async (input: ReviewInvocationInput) => {
        const reader = new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(input.exec, input.cwd));
        const progress = await readLaneProgress(reader, { lane: "standard", repositoryId: projectId,
          headSha: fixture.state.target.headSha, lineage: fixture.state.lineage });
        if (progress.status !== "recorded") throw new Error("Expected produced lane");
        return { completedPasses: progress.completedPasses, completePasses: progress.completePasses,
          inheritedCompletedPasses: 0, inheritedCompletePasses: 0, nextLogicalPass: progress.completedPasses + 1 };
      },
      native: async (input: ReviewInvocationInput) => {
        if (input.store === undefined) throw new Error("Expected native Store");
        const listing = await createReviewOutcomePort(input.store, primary.reference.owner).list();
        if (listing.status !== "complete") throw new Error("Expected complete stored outcomes");
        return deriveReviewOutcomePassCounts({ lane: "standard", lineage: fixture.state.lineage,
          outcomes: listing.records.map(({ value }) => value) });
      },
    };
    await expect(compareReviewImplementations(h, observations)).rejects.toThrow(/review observations differ/u);
    lifecycleSuccess(await h.reference.store.batch({ writes: mapReviewRecords(fixture.input()).records.map(record => ({
      action: "put", reference: record.reference, expected: null, content: record.contents[0]!,
    })), provenance: { verb: "review", lifecycleAction: "create" } }));
    const compared = await compareReviewImplementations(h, observations);
    expect(compared.native).toEqual(compared.inRepo);
    expect(compared.native).toMatchObject({ completedPasses: 1, completePasses: 1, nextLogicalPass: 2 });
  } finally { await h.cleanup(); }
}, 30_000);

it("dual-seeds the retained Errand status reader with a real identity-ref commit", async () => {
  const h = await createReviewRepositoryHarness();
  try {
    const record = errandRecord();
    await h.reference.seedErrand(record);
    await h.seedErrandRef(record, "test-user");
    const read = await readTransientIdentitySnapshot({ exec: h.native.exec, identity: "test-user" });
    expect(read.kind).toBe("complete");
    if (read.kind !== "complete") throw new Error("Expected identity-ref snapshot");
    expect(read.records.get(record.slug)).toEqual(record);
  } finally { await h.cleanup(); }
}, 30_000);
