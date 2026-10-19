/** Checkpoint convergence actions follow the invocation's selected backend. */
import { expect, it } from "vitest";
import { checkpointIntegration } from "../../../../src/scripts/integration/checkpoint.js";
import { createIntegrationCheckpointDependencies } from "../../../../src/scripts/integration/checkpoint-composition.js";
import { BaseDriftResultSchema } from "../../../../src/lib/git/base-drift-types.js";
import { createStore } from "../../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../../src/lib/store/default-ports.js";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { candidateFixture } from "../../../helpers/store/tracked-write-fixture.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { checkpointDependencies } from "../../../helpers/integration-checkpoint.js";

it.each([
  { native: false, reconcile: false }, { native: true, reconcile: false },
  { native: false, reconcile: true }, { native: true, reconcile: true },
])("selects full convergence for native=$native on reconcile=$reconcile", async ({ native, reconcile }) => {
  const h = createReviewHarness(), candidate = candidateFixture();
  const primary = await h.seedMeta("example");
  await h.seedCandidate(primary.reference.owner, candidate);
  const exec = scriptGitExec([]).exec;
  const store = native ? h.store : createStore(createDefaultStorePorts({ checkoutRoot: "/unavailable", exec }));
  const production = createIntegrationCheckpointDependencies({ cwd: "/unavailable", exec, store, workItem: primary.reference.owner });
  const deps = { ...production, ...checkpointDependencies(), boundarySchemaVersion: production.boundarySchemaVersion };
  if (!reconcile) {
    const readDrift = deps.readDrift;
    deps.readDrift = async name => BaseDriftResultSchema.parse({ ...await readDrift(name), verdict: "clean", state: "local-ahead", behind: 0,
      movement: "disjoint", overlap: { status: "available", substantivePaths: [], regenerablePaths: [] }, register: null });
  }
  deps.readCandidate = async () => ({ status: "current", candidateId: candidate.attestation.candidateId,
    recognizedRevision: "c".repeat(40), implementationChanged: true, convergenceVerification: "pending", convergenceScope: "full" });
  const result = await checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps);
  expect(result).toMatchObject({ state: "blocked", reason: "candidate-convergence-pending",
    nextAction: "run-convergence-verification", action: { kind: "run-convergence-verification", requiredScope: "full",
      verificationKind: native ? "merge" : "tier-3", verificationEvidenceRefRequired: true,
      attestArgv: ["arc", "attest", "example", "--scope", "full", "--verification-evidence-ref", "{verificationEvidenceRef}", "--json"] } });
  if (!("action" in result) || result.action.kind !== "run-convergence-verification") throw new Error("Expected convergence action");
  if (native) expect(result.action.postAttestContinuation).not.toHaveProperty("projectionDisposition");
  else expect(result.action.postAttestContinuation).toHaveProperty("projectionDisposition", "keep-staged-until-publication");
});
