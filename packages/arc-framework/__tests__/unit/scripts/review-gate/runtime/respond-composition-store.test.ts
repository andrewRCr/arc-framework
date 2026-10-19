/** Read-only response decisions retain the invocation's durable evidence. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { storedLocalApproval } from "../../../../fixtures/review-family-access.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import { LocalReviewOperationStateStore } from "../../../../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { createRespondDependencies } from "../../../../../src/scripts/review-gate/runtime/respond-composition.js";

it("withdraws conditional authority against the supplied Store's current approval", async () => {
  const fixture = await storedLocalApproval();
  const commonDir = await mkdtemp(join(tmpdir(), "respond-store-"));
  try {
    const exec = scriptGitExec([{ match: ["rev-parse", "--git-common-dir"], responses: [{ stdout: commonDir }] }]).exec;
    const working = new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(exec, "/unavailable"));
    for (const { state } of fixture.fixture.operations.values()) await working.publishOperation(state, 0);
    const dependencies = createRespondDependencies({ cwd: "/unavailable", exec,
      store: fixture.harness.store, workItem: fixture.owner });
    const source = { lane: "standard" as const, repositoryId: fixture.fixture.state.repositoryId,
      headSha: fixture.fixture.state.target.headSha, lineage: fixture.fixture.state.lineage,
      producerId: fixture.original.operationId, dispositionSetId: fixture.original.currentDispositionSetId };
    const captured = await dependencies.captureConditionalNextPass({ ...source, authorizedBy: "andrew",
      exhaustedPassCount: 1, nextPass: 2 });
    expect(await dependencies.withdrawConditionalNextPass({ ...source,
      authorizationId: captured.authorizationId, withdrawnBy: "andrew" })).toMatchObject({ state: "withdrawn" });
  } finally { await rm(commonDir, { recursive: true, force: true }); }
});
