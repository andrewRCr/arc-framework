/** Status retains an invocation's exact work-item generation. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { boundaryFixture } from "../../../helpers/store/tracked-write-fixture.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { resolveReviewStatusForWorkUnit, ReviewStatusWrongRouteError } from "../../../../src/scripts/review-gate/status-composition.js";

it("uses the selected generation's boundary after its work-unit slug is reused", async () => {
  const { store } = createReferenceFixture();
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example" });
  const first = lifecycleSuccess(await store.write({ action: "put", reference: recordReferences["work-item/meta"](owner),
    expected: null, content: "{}", placement: { kind: "active" }, provenance: { verb: "activate", lifecycleAction: "activate" } }));
  if (first.version === undefined) throw new Error("Expected the created meta's version");
  lifecycleSuccess(await store.write({ action: "put", reference: recordReferences["review/integration-boundary"](first.reference.owner),
    expected: null, content: JSON.stringify(boundaryFixture()), provenance: { verb: "attest", lifecycleAction: "attest" } }));
  lifecycleSuccess(await store.write({ action: "remove", reference: first.reference, expected: first.version,
    provenance: { verb: "remove", lifecycleAction: "remove" } }));
  lifecycleSuccess(await store.write({ action: "put", reference: recordReferences["work-item/meta"](owner),
    expected: null, content: "{}", placement: { kind: "active" }, provenance: { verb: "activate", lifecycleAction: "activate" } }));
  await expect(resolveReviewStatusForWorkUnit({ cwd: "/unavailable", exec: scriptGitExec([]).exec,
    store, workItem: first.reference.owner, workUnitId: "example" })).rejects.toBeInstanceOf(ReviewStatusWrongRouteError);
});
