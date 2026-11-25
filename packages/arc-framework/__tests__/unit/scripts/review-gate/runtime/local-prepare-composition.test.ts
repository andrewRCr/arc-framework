import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalPrepareDependencies } from "../../../../../src/scripts/review-gate/runtime/local-prepare-composition.js";
import { storedLocalApproval } from "../../../../fixtures/review-family-access.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { createLocalReviewCandidateReader } from "../../../../../src/scripts/review-gate/runtime/local-prepare-composition.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../../helpers/store/lifecycle-harness.js";
import { candidateFixture } from "../../../../helpers/store/tracked-write-fixture.js";
import { recordReferences } from "../../../../../src/lib/store/identity.js";
import { serializeCandidateManagedRecord } from "../../../../../src/lib/work-unit/candidate-attestation.js";

it("keeps the selected Candidate when its work-unit name is reused", async () => {
  const harness = createLifecycleHarness();
  const first = await harness.seedMeta("example");
  const candidate = candidateFixture();
  await harness.seed(recordReferences["review/candidate"](first.reference.owner), serializeCandidateManagedRecord(candidate));
  lifecycleSuccess(await harness.store.write({ action: "remove", reference: first.reference, expected: first.version,
    provenance: { verb: "remove", lifecycleAction: "remove" } }));
  await harness.seedMeta("example");
  const reader = createLocalReviewCandidateReader({ cwd: "/unavailable", exec: scriptGitExec([]).exec,
    store: harness.store, workItem: first.reference.owner });
  expect(await reader.read("example")).toEqual(candidate);
});

it("reads approved responses from the invocation's selected work item", async ({ onTestFinished }) => {
  const { harness, owner, original } = await storedLocalApproval();
  const commonDir = await mkdtemp(join(tmpdir(), "arc-review-resume-"));
  onTestFinished(() => rm(commonDir, { recursive: true, force: true }));
  const exec = scriptGitExec([{ match: ["rev-parse", "--git-common-dir"], responses: [{ stdout: commonDir }] }]).exec;
  const dependencies = createLocalPrepareDependencies({ cwd: "/unavailable", exec,
    store: harness.store, workItem: owner });
  expect(await dependencies.confirmDispositionSetCurrent(original.operationId, original.currentDispositionSetId))
    .toBe(true);
});
