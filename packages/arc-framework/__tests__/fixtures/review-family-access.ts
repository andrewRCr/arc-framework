/** Native approved records imported into a checked work-item store for compatibility reads. */
import { createLocalMappingFixture, mappingErrand } from "./review-mapping.js";
import { approvedRecord } from "./review-response-proof.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { transientContent } from "../helpers/store/in-repo-substrates.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { mapReviewRecords } from "../../src/lib/store/kinds/review/mapping.js";
import { ReviewOutcomeSchema } from "../../src/lib/store/kinds/review/outcome/schema.js";
import { createReviewEvidencePort } from "../../src/lib/store/kinds/review/evidence/access.js";

export async function storedLocalApproval() {
  const claimId = "1".repeat(32);
  const repositoryId = "123e4567-e89b-42d3-a456-426614174099";
  const fixture = await createLocalMappingFixture({
    repositoryId,
    lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: claimId, headSha: "c".repeat(40) },
    vehicle: { kind: "errand", identity: mappingErrand.slug, claimId },
  });
  await fixture.conclude();
  const producer = await fixture.resultReader.readResult(fixture.state.operationId);
  const original = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "defer" }]);
  const harness = createLifecycleHarness();
  await harness.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({
    type: "project", name: "test-project", uid: repositoryId,
  })), "{}");
  const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: mappingErrand.slug }));
  const identity = TransientIdentityRecordSchema.parse(JSON.parse(transientContent(reference)));
  const primary = await harness.seed(reference, serializeTransientIdentityRecord(identity), { kind: "active" });
  if (primary.reference.owner.type !== "work-item" || primary.reference.owner.uid === undefined) throw new Error("Expected imported work-item identity");
  const input = fixture.input();
  input.workItems = [{ ...mappingErrand, claimId, uid: primary.reference.owner.uid }];
  input.gate.push({ path: `arc/review-gate/evidence/disposition-${canonicalDigest({ operationId: original.operationId }).slice(7)}.json`,
    bytes: new TextEncoder().encode(JSON.stringify(original)) });
  const mapped = mapReviewRecords(input);
  lifecycleSuccess(await harness.store.batch({ writes: mapped.records.map(({ reference, contents }) => ({
    action: "put", reference, expected: null, content: contents[0]!,
  })), provenance: { verb: "review", lifecycleAction: "create" } }));
  const outcome = ReviewOutcomeSchema.parse(JSON.parse(mapped.records.find(r => r.reference.kind === "review/outcome")!.contents[0]!));
  return { harness, fixture, original, outcome, owner: primary.reference.owner,
    evidence: createReviewEvidencePort(harness.store, primary.reference.owner) };
}
