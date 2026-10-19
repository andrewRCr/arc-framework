/** Singleton response rebinding preserves the selected work-item generation. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../../../../helpers/store/reference-fixture.js";
import { lifecycleSuccess } from "../../../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { candidateRecordFixture } from "../../../../fixtures/review-candidate.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../../src/lib/store/identity.js";
import { projectPublicationBoundary } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { stageSingletonPublicationResponse } from "../../../../../src/scripts/review-gate/runtime/singleton-publication-response.js";

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
