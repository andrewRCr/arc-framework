import { describe, expect, it, vi } from "vitest";

import {
  discoverCandidates,
  reconciliationGroup,
  resolveMatrixOutput,
} from "../../../../../src/scripts/review-gate/runtime/discovery.js";

const EMPTY_PORT = { resolveOpenPullRequestsByHead: async () => [], listOpenPullRequests: async function* () {} };

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

describe("review-gate discovery matrix output", () => {
  const sha = "a".repeat(40);

  it("emits no output for a candidate-less wake-up so the reconcile job is skipped", async () => {
    const output = await resolveMatrixOutput("schedule", { repository: { id: 42 } }, 91, EMPTY_PORT);
    expect(output).toBeNull();
  });

  it("emits the include matrix unchanged when candidates exist", async () => {
    const output = await resolveMatrixOutput(
      "status",
      { repository: { id: 42 }, sha, pull_requests: [{ number: 7 }] },
      91,
      EMPTY_PORT,
    );
    expect(output).toBe(JSON.stringify({ include: [{ repositoryId: 42, pullRequestNumber: 7 }] }));
  });

  it("routes proxy completion exactly when coordinates exist and repairs by bounded scan when absent", async () => {
    const exact = await resolveMatrixOutput("workflow_run", {
      action: "completed",
      repository: { id: 42 },
      workflow_run: { name: "Review Gate Wakeup", head_sha: sha, pull_requests: [{ number: 7 }, { number: 7 }] },
    }, 91, EMPTY_PORT);
    expect(exact).toBe(JSON.stringify({ include: [{ repositoryId: 42, pullRequestNumber: 7 }] }));

    const listOpenPullRequests = vi.fn(async function* () { yield [9, 3]; });
    const repaired = await resolveMatrixOutput("workflow_run", {
      action: "completed",
      repository: { id: 42 },
      workflow_run: { name: "Review Gate Wakeup", head_sha: sha, pull_requests: [] },
    }, 91, { ...EMPTY_PORT, listOpenPullRequests });
    expect(repaired).toBe(JSON.stringify({
      include: [{ repositoryId: 42, pullRequestNumber: 3 }, { repositoryId: 42, pullRequestNumber: 9 }],
    }));
    expect(listOpenPullRequests).toHaveBeenCalledOnce();
  });

  it("suppresses the controller's own completed check before expansion", async () => {
    const output = await resolveMatrixOutput(
      "check_run",
      { action: "completed", repository: { id: 42 }, check_run: { name: "review-gate-shadow", app: { id: 91 } } },
      91,
      EMPTY_PORT,
    );
    expect(output).toBeNull();
  });

  it("still discovers a same-name check authored by another App", async () => {
    const output = await resolveMatrixOutput(
      "check_run",
      {
        action: "completed",
        repository: { id: 42 },
        check_run: { name: "merge-ok", app: { id: 92 }, pull_requests: [{ number: 7 }], check_suite: { head_sha: sha } },
      },
      91,
      EMPTY_PORT,
    );
    expect(output).toBe(JSON.stringify({ include: [{ repositoryId: 42, pullRequestNumber: 7 }] }));
  });

  it("carries a bounded deleted-comment tombstone directly into the writer matrix", async () => {
    const output = await resolveMatrixOutput(
      "issue_comment",
      {
        action: "deleted",
        repository: { id: 42 },
        issue: { number: 7, pull_request: {} },
        comment: {
          id: 123,
          node_id: "IC_123",
          body: "@codex review",
          updated_at: "2026-07-12T20:00:00.000Z",
          user: { id: 101 },
        },
      },
      91,
      {
        ...EMPTY_PORT,
        resolvePullRequestHead: async () => "f".repeat(40),
      },
    );
    const parsed = JSON.parse(output ?? "null") as { include: Array<Record<string, unknown>> };
    expect(parsed.include).toEqual([expect.objectContaining({
      repositoryId: 42,
      pullRequestNumber: 7,
      triggerDeletion: expect.objectContaining({
        schemaVersion: 1,
        commentId: "123",
        actorIdentity: "101",
        observedHeadSha: "f".repeat(40),
        providerIdentity: "codex-pr",
        triggerClassification: "provider-trigger",
      }),
    })]);
  });
});
