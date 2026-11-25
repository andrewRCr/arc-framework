/** Native delta admission reports a refused boundary or live-context read rather than withholding the delta check. */
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { candidateFixture } from "../../../../helpers/store/tracked-write-fixture.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { readLocalDeltaAdmissionSurface } from "../../../../../src/scripts/review-gate/runtime/local-reserved-obligation.js";
import { createProjectIdentityReader, ProjectIdentityError } from "../../../../../src/lib/store/project-identity.js";
import { StoreRefusalSchema } from "../../../../../src/lib/store/refusal.js";
import type { Store } from "../../../../../src/lib/store/contract.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
async function fixture(project = true) {
  const h = createReviewHarness();
  if (project) await h.seedProject(projectId);
  const branch = "topic/opaque", candidate = candidateFixture();
  const primary = await h.seedMeta("example", { owner: "test-user", branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
  });
  await h.seedCandidate(primary.reference.owner, candidate);
  await h.seedBoundary(primary.reference.owner, IntegrationBoundaryLocusV2Schema.parse({ schemaVersion: 2,
    mode: "pre-publication-review", workUnit: "example", candidateId: candidate.attestation.candidateId,
    candidateSubjectDigest: candidate.subject.subjectDigest, locus: "candidate-review-pending", reservation: null,
    nextAction: { kind: "run-self-review", command: "self-review", interactionText: "Review the Candidate." } }));
  const checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  await checkout.occupy(branch, { kind: "work-unit", name: "example" });
  const surface = (store: Store = h.store) => readLocalDeltaAdmissionSurface({ cwd: checkout.cwd, exec: checkout.exec,
    store, projectId: createProjectIdentityReader(store), workItem: primary.reference.owner, workUnitId: "example", pullRequest: null,
    lineage: { kind: "candidate", candidateId: candidate.attestation.candidateId } });
  return { ...h, surface };
}

it("raises a refused boundary read whole rather than withholding the delta check, and admits it after repair", async () => {
  const h = await fixture();
  let unavailable = true;
  const store = Object.create(h.store) as Store;
  store.read = async input => unavailable && input.reference.kind === "review/integration-boundary" ? { status: "refused",
    refusal: StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal", namespace: "work-item",
      condition: "The boundary record cannot be read.", remedy: { text: "Restore the boundary record, then retry." } }) }
    : h.store.read(input);
  await expect(h.surface(store)).rejects.toMatchObject({ offBranch: true, refusal: { code: "namespace-corrupt" } });
  unavailable = false;
  await expect(h.surface(store)).resolves.toBe("pre-publication");
});

it("raises a missing project ID from the live-context read whole, and admits the delta check once the clone holds it", async () => {
  const h = await fixture(false);
  await expect(h.surface()).rejects.toBeInstanceOf(ProjectIdentityError);
  await h.seedProject(projectId);
  await expect(h.surface()).resolves.toBe("pre-publication");
});
