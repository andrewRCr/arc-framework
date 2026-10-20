/** Singleton response rebinding preserves the selected work-item generation. */
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { expect, it } from "vitest";
import { createReferenceFixture } from "../../../../helpers/store/reference-fixture.js";
import { lifecycleSuccess } from "../../../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { candidateRecordFixture } from "../../../../fixtures/review-candidate.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../../src/lib/store/identity.js";
import { projectPublicationBoundary } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { stageSingletonPublicationResponse } from "../../../../../src/scripts/review-gate/runtime/singleton-publication-response.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createStandardReviewReservation } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { projectStandardReviewObligation } from "../../../../../src/scripts/review-gate/policy/standard-review-projection.js";
import { resolveReviewRouting } from "../../../../../src/scripts/review-gate/policy/routing.js";
import { readSubmissionBoundaryVersioned } from "../../../../../src/lib/store/kinds/review/integration-boundary/access.js";

it.each([true, false])("rebinds and replays native publication with requirePublished=%s without projected Git effects", async requirePublished => {
  const h = createReviewHarness();
  const primary = await h.seedMeta("example");
  const { record, response } = candidateRecordFixture();
  await h.seedCandidate(primary.reference.owner, record);
  const reservation = createStandardReviewReservation({ candidateId: response.candidateId,
    sourceId: "codex-pr", sources: ["codex-pr"], repository: "owner/repo", headSha: response.oldTarget.revision,
    obligation: projectStandardReviewObligation(resolveReviewRouting({}).decision) });
  await h.seedBoundary(primary.reference.owner, projectPublicationBoundary({ workUnit: "example", branch: "topic/opaque",
    candidateId: response.candidateId, candidateSubjectDigest: response.oldTarget.subject.subjectDigest,
    reservation, readinessBinding: canonicalDigest({ reviewReadiness: 1 }),
    changeRequest: requirePublished ? { repository: "owner/repo", pullRequest: 42 } : null }, 2));
  const input = { cwd: "/unavailable", store: h.store, workItem: primary.reference.owner,
    exec: scriptGitExec([]).exec, workUnit: "example", response, requirePublished };
  await stageSingletonPublicationResponse(input);
  const access = { store: h.store, owner: primary.reference.owner };
  const rebound = await readSubmissionBoundaryVersioned(input.cwd, "example", access);
  expect(rebound.boundary).toMatchObject({ schemaVersion: 2, locus: requirePublished ? "hosted-review-pending" : "publication-pending", terminus: null,
    candidateSubjectDigest: response.newTarget.subject.subjectDigest,
    reservation, ...(requirePublished ? {} : { readinessBinding: canonicalDigest({ reviewReadiness: 1 }) }) });
  await stageSingletonPublicationResponse(input);
  expect(await readSubmissionBoundaryVersioned(input.cwd, "example", access)).toEqual(rebound);
});

it("advances the selected generation's publication boundary after its slug is reused", async () => {
  const { store } = createReferenceFixture();
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example" });
  const first = lifecycleSuccess(await store.write({ action: "put", reference: recordReferences["work-item/meta"](owner),
    expected: null, content: "{}", placement: { kind: "active" }, provenance: { verb: "activate", lifecycleAction: "activate" } }));
  if (first.version === undefined) throw new Error("Expected a created generation");
  const { response } = candidateRecordFixture();
  const boundaryReference = recordReferences["review/integration-boundary"](first.reference.owner);
  const boundary = projectPublicationBoundary({ workUnit: "example", branch: "feat/example",
    candidateId: response.candidateId, candidateSubjectDigest: response.oldTarget.subject.subjectDigest,
    reservation: null, changeRequest: null });
  lifecycleSuccess(await store.write({ action: "put", reference: boundaryReference, expected: null,
    content: JSON.stringify(boundary), provenance: { verb: "attest", lifecycleAction: "attest" } }));
  lifecycleSuccess(await store.write({ action: "remove", reference: first.reference, expected: first.version,
    provenance: { verb: "remove", lifecycleAction: "remove" } }));
  const replacement = lifecycleSuccess(await store.write({ action: "put", reference: recordReferences["work-item/meta"](owner),
    expected: null, content: "{}", placement: { kind: "active" }, provenance: { verb: "activate", lifecycleAction: "activate" } }));
  await stageSingletonPublicationResponse({ cwd: "/unavailable", store, workItem: first.reference.owner,
    exec: scriptGitExec([{ match: { prefix: ["add", "--"] }, responses: [{ stdout: "" }] }]).exec,
    workUnit: "example", response, requirePublished: true });
  expect(JSON.parse(lifecycleSuccess(await store.read({ reference: boundaryReference })).content))
    .toMatchObject({ candidateSubjectDigest: response.newTarget.subject.subjectDigest });
  expect(await store.read({ reference: recordReferences["review/integration-boundary"](replacement.reference.owner) }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});
