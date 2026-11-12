/** Delivery chunk scope follows the range selected for the next pass. */
import { describe, expect, it } from "vitest";
import { AGENT_CONSUMABLE_CONFIG_FIELDS, ConfigSettingsSchema } from "../../../../src/lib/config/schema.js";
import { resolveDeliveryMemberScopeSelection } from "../../../../src/scripts/review-gate/status-delivery-scope.js";
import { scriptRawGitExec } from "../../../helpers/git-exec-fake.js";

const base = "a".repeat(40);
const predecessor = "b".repeat(40);
const head = "c".repeat(40);
const target = { repository: "owner/repo", pullRequest: 42, baseRevision: base, headSha: head };
const correctionScope = { schemaVersion: 1 as const, predecessorProducerId: "local-prior",
  predecessorHeadSha: predecessor, basisHeadSha: predecessor, headSha: head,
  requiredFindings: [{ producerId: "local-prior", findingId: "finding-1", locus: "large.ts:1" }] };

function fixture(coverage: "complete" | "incremental") {
  const settings = ConfigSettingsSchema.parse({
    ...Object.fromEntries(AGENT_CONSUMABLE_CONFIG_FIELDS.map(({ key, defaultValue }) => [key, defaultValue])),
    "changeset.advisory_threshold_lines": "50", "changeset.advisory_threshold_files": "0",
  });
  const output = (lines: number) => ({ stdout: Buffer.from(`${lines}\t0\tlarge.ts\0`), stderr: Buffer.alloc(0) });
  const { exec } = scriptRawGitExec([
    { match: ["diff", "--numstat", "-z", "-M", "-C", "--find-copies-harder", `${base}..${head}`, "--"], responses: [output(100)] },
    { match: ["diff", "--numstat", "-z", "-M", "-C", "--find-copies-harder", `${predecessor}..${head}`, "--"], responses: [output(2)] },
  ]);
  return { rawExec: exec, settings, planId: "plan-1", sourceId: "delegated-agent", target, coverage, correctionScope };
}

describe("delivery member pass range", () => {
  it("keeps a small fix range whole on a large member", async () => {
    await expect(resolveDeliveryMemberScopeSelection(fixture("incremental"))).resolves.toBeUndefined();
  });

  it("chunks the complete pass over the same large member", async () => {
    await expect(resolveDeliveryMemberScopeSelection(fixture("complete"))).resolves.toEqual({
      mode: "chunked", target: { repository: target.repository, pullRequest: target.pullRequest, headSha: head },
    });
  });

  it("refuses to guess a fix range when its correction scope is missing", async () => {
    await expect(resolveDeliveryMemberScopeSelection({ ...fixture("incremental"), correctionScope: undefined }))
      .rejects.toThrow("Incremental review measurement requires its correction scope");
  });
});
