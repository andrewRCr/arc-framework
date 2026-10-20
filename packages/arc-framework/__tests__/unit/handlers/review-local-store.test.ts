/** Default local review handlers select native checkout authority before binding durable ports. */
import { unlink } from "node:fs/promises";
import { createProjectIdentityReader } from "../../../src/lib/store/project-identity.js";
import { resolveWorktreeMarkerPath } from "../../../src/lib/git/worktree-marker.js";
import { candidateFixture } from "../../helpers/store/tracked-write-fixture.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { expect, it, onTestFinished } from "vitest";
import { handleReviewLocalPrepare } from "../../../src/handlers/review.js";
import { TransientIdentityRecordSchema } from "../../../src/lib/errand/identity-record.js";
import { createReviewHarness } from "../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../helpers/store/review-checkout.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
async function fixture(project = true, vehicle: "work-unit" | "errand" = "errand") {
  const h = createReviewHarness();
  if (project) await h.seedProject(projectId);
  const claimId = "1".repeat(32), branch = vehicle === "errand" ? "chore/repair" : "topic/opaque";
  if (vehicle === "errand") {
    const errand = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "repair",
      claimId, intent: "Repair one issue", owner: "test-user", origin: "description", originEntry: null,
      branch, state: "open", savedHead: null, changeRequest: null,
      createdAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z" });
    if (errand.kind !== "errand") throw new Error("Expected Errand");
    await h.seedErrand(errand);
  } else {
    const primary = await h.seedMeta("example", { owner: "test-user", branch: null }, { kind: "active" }, {
      branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
    });
    const candidate = candidateFixture();
    await h.seedCandidate(primary.reference.owner, candidate);
    await h.seedBoundary(primary.reference.owner, IntegrationBoundaryLocusV2Schema.parse({ schemaVersion: 2,
      mode: "pre-publication-review", workUnit: "example", candidateId: candidate.attestation.candidateId,
      candidateSubjectDigest: candidate.subject.subjectDigest, locus: "candidate-review-pending", reservation: null,
      nextAction: { kind: "run-self-review", command: "self-review", interactionText: "Review the Candidate." } }));
  }
  const head = "a".repeat(40), base = "b".repeat(40);
  const checkout = await createReviewCheckout(h, { script: [
    { match: ["for-each-ref", "--format=%(refname)", "refs/arc/review/local/"], responses: [{ stdout: "" }] },
    { match: ["rev-parse", "HEAD"], responses: [{ stdout: head }] },
    { match: ["check-ref-format", "refs/heads/main"], responses: [{ stdout: "" }] },
    { match: ["rev-parse", "--verify", "HEAD"], responses: [{ stdout: head }] },
    { match: ["rev-parse", "--verify", "refs/heads/main"], responses: [{ stdout: base }] },
    { match: ["cat-file", "-t", head], responses: [{ stdout: "commit" }] },
    { match: ["cat-file", "-t", base], responses: [{ stdout: "commit" }] },
    { match: ["status", "--porcelain=v2", "--untracked-files=normal"], responses: [{ stdout: "" }] },
    { match: ["merge-base", "--all", base, head], responses: [{ stdout: base }] },
    { match: ["rev-parse", `${base}^{tree}`], responses: [{ stdout: "c".repeat(40) }] },
    { match: ["rev-parse", `${head}^{tree}`], responses: [{ stdout: "d".repeat(40) }] },
  ] });
  onTestFinished(checkout.cleanup);
  await checkout.occupy(branch, vehicle === "errand" ? { kind: "errand", slug: "repair", claimId }
    : { kind: "work-unit", name: "example" });
  const request = { schemaVersion: 1, evaluatorIdentity: "fresh-reviewer", routingFacts: {
    contentKind: "documentation", reviewRisk: "routine", changeDeterminacy: "atomic",
    ownership: "self", surfaceAuthority: "planning-grooming",
  } };
  return { ...checkout, claimId, request, run: async () => {
    let output = "";
    await handleReviewLocalPrepare("-", { resolveRoot: () => checkout.cwd,
      readText: async () => JSON.stringify(request), write: text => { output += text; }, setExitCode: () => {} },
    undefined, { ...checkout, projectId: createProjectIdentityReader(checkout.store) });
    return JSON.parse(output) as unknown;
  } };
}
it.each(["work-unit", "errand"] as const)("selects the actual stored %s before reporting exempt preparation", async vehicle => {
  const h = await fixture(true, vehicle);
  const result = await h.run();
  expect(result, JSON.stringify(result)).toMatchObject({ mode: "review-local-prepare", state: "exempt", nextAction: "none" });
});
it("keeps the vehicle refusal and completes exempt preparation after marker repair", async () => {
  const h = await fixture();
  await unlink(resolveWorktreeMarkerPath(h.cwd));
  const version = lifecycleSuccess(await h.store.version());
  expect(await h.run()).toMatchObject({ error: { code: "invalid-input", message: "vehicle-unresolved" } });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  await h.occupy("chore/repair", { kind: "errand", slug: "repair", claimId: h.claimId });
  expect(await h.run()).toMatchObject({ state: "exempt", nextAction: "none" });
});
it("retains project-identity recovery and completes exempt preparation after repair", async () => {
  const h = await fixture(false);
  const version = lifecycleSuccess(await h.store.version());
  expect(await h.run()).toMatchObject({ error: { code: "project-identity-unavailable" },
    remedy: { argv: ["arc", "review", "local", "prepare", "-"], stdin: h.request } });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  await h.seedProject(projectId);
  expect(await h.run()).toMatchObject({ state: "exempt", nextAction: "none" });
});
