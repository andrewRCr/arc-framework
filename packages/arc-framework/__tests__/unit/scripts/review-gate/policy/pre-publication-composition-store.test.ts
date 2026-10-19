/** Store authority retained by pre-publication policy composition. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { storedLocalApproval } from "../../../../fixtures/review-family-access.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { createPrePublicationCompositionDependencies } from
  "../../../../../src/scripts/review-gate/policy/pre-publication-composition.js";

describe("pre-publication composition store", () => {
  it("reads approved evidence from the selected work item without repository files", async () => {
    const fixture = await storedLocalApproval();
    const commonDir = await mkdtemp(join(tmpdir(), "prepub-store-"));
    try {
      const dependencies = createPrePublicationCompositionDependencies({
        cwd: "/unavailable",
        exec: scriptGitExec([{ match: ["rev-parse", "--git-common-dir"], responses: [{ stdout: commonDir }] }]).exec,
        store: fixture.harness.store, workItem: fixture.owner,
      });
      expect(await dependencies.dispositionStore.readDispositionRecord(fixture.original.operationId))
        .toEqual(await fixture.evidence.readDispositionRecord(fixture.original.operationId));
    } finally { await rm(commonDir, { recursive: true, force: true }); }
  });
});
