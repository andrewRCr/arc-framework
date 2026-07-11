import { describe, expect, it, vi } from "vitest";

import { discoverCandidates, reconciliationGroup } from "../../../../../src/scripts/review-gate/runtime/discovery.js";

describe("review-gate candidate discovery", () => {
  it("fully scans, deduplicates, and sorts scheduled candidates", async () => {
    const listOpenPullRequests = vi.fn(async function* () { yield [9, 2]; yield [2, 5]; });
    const candidates = await discoverCandidates(
      { kind: "schedule", repositoryId: 42, pullRequestNumbers: [], headSha: null, workflowName: null },
      { resolveOpenPullRequestsByHead: async () => [], listOpenPullRequests },
    );
    expect(candidates).toEqual([
      { repositoryId: 42, pullRequestNumber: 2 },
      { repositoryId: 42, pullRequestNumber: 5 },
      { repositoryId: 42, pullRequestNumber: 9 },
    ]);
    expect(reconciliationGroup(candidates[0]!)).toBe("review-gate-42-2");
  });

  it("fans a shared status head into isolated candidates", async () => {
    const candidates = await discoverCandidates(
      { kind: "status", repositoryId: 42, pullRequestNumbers: [], headSha: "a".repeat(40), workflowName: null },
      { resolveOpenPullRequestsByHead: async () => [8, 3], listOpenPullRequests: async function* () {} },
    );
    expect(candidates.map(reconciliationGroup)).toEqual(["review-gate-42-3", "review-gate-42-8"]);
  });

  it("fails visibly rather than truncating an oversized scan", async () => {
    await expect(discoverCandidates(
      { kind: "schedule", repositoryId: 42, pullRequestNumbers: [], headSha: null, workflowName: null },
      { resolveOpenPullRequestsByHead: async () => [], listOpenPullRequests: async function* () { yield [1, 2, 3]; } },
      2,
    )).rejects.toThrow("candidate-cap-exceeded:2");
  });
});
