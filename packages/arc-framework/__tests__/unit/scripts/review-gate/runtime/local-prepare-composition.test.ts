import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalPrepareDependencies } from "../../../../../src/scripts/review-gate/runtime/local-prepare-composition.js";
import { storedLocalApproval } from "../../../../fixtures/review-family-access.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";

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
