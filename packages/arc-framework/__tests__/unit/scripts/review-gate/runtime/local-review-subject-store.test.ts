/** Subject lineage uses the invocation's existing boundary reader. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../../../../helpers/store/reference-fixture.js";
import { boundaryFixture } from "../../../../helpers/store/tracked-write-fixture.js";
import { lifecycleSuccess } from "../../../../helpers/store/lifecycle-harness.js";
import { recordReferences, OwnerIdentitySchema } from "../../../../../src/lib/store/identity.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { createLocalReviewSubjectResolver } from "../../../../../src/scripts/review-gate/runtime/local-review-subject.js";

it("resolves Candidate lineage from the supplied store without a checkout boundary", async () => {
  const fixture = createReferenceFixture();
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example" });
  const primary = lifecycleSuccess(await fixture.store.write({ action: "put",
    reference: recordReferences["work-item/meta"](owner), expected: null, content: "{}",
    placement: { kind: "active" }, provenance: { verb: "activate", lifecycleAction: "activate" } }));
  const boundary = boundaryFixture();
  lifecycleSuccess(await fixture.store.write({ action: "put",
    reference: recordReferences["review/integration-boundary"](primary.reference.owner),
    expected: null, content: JSON.stringify(boundary), provenance: { verb: "attest", lifecycleAction: "attest" } }));
  const resolver = createLocalReviewSubjectResolver({ cwd: "/unavailable", exec: scriptGitExec([]).exec,
    store: fixture.store, workItem: primary.reference.owner,
    readLive: () => Promise.reject(new Error("unexpected live-context read")),
    candidateReader: { read: () => Promise.reject(new Error("unexpected Candidate read")),
      readSupersessionAncestors: async () => [] } });
  expect(await resolver.resolveLineage({ kind: "work-unit", identity: "example" }, "a".repeat(40)))
    .toEqual({ kind: "candidate", candidateId: boundary.candidateId });
});
