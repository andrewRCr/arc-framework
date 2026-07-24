import { describe, expect, it } from "vitest";

import type { HostedProcessRunner } from "../../../../../../src/scripts/review-gate/hosted/gh-process.js";
import { GhReviewUnlockPort } from "../../../../../../src/scripts/review-gate/hosts/github/unlock.js";

function runner(responses: string[]): { port: HostedProcessRunner; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    port: {
      run: async (args) => {
        calls.push(args);
        const stdout = responses.shift();
        if (stdout === undefined) throw new Error("unexpected gh call");
        return { stdout, stderr: "" };
      },
    },
  };
}

describe("GhReviewUnlockPort", () => {
  it("resolves canonical repository, PR, and workflow facts from strict gh JSON", async () => {
    const boundary = runner([
      JSON.stringify({
        nameWithOwner: "owner/repo",
        defaultBranchRef: { name: "main" },
      }),
      JSON.stringify({
        number: 42,
        state: "open",
        head: { ref: "feat/demo", sha: "a".repeat(40) },
        base: { repo: { full_name: "owner/repo" } },
      }),
      JSON.stringify({
        type: "file",
        path: ".github/workflows/arc-clearance.yml",
        sha: "b".repeat(40),
      }),
    ]);
    const port = new GhReviewUnlockPort(boundary.port, async () => {
      throw new Error("readiness not used");
    });

    await expect(port.resolveRepository()).resolves.toEqual({
      repository: "owner/repo",
      defaultBranch: "main",
    });
    await expect(port.resolvePullRequest("owner/repo", 42)).resolves.toMatchObject({
      repository: "owner/repo",
      number: 42,
      state: "open",
      headBranch: "feat/demo",
      headSha: "a".repeat(40),
    });
    await expect(port.inspectWorkflow({
      repository: "owner/repo",
      ref: "main",
      path: ".github/workflows/arc-clearance.yml",
    })).resolves.toEqual({ state: "present" });
  });

  it("posts a fully bound repository-dispatch payload", async () => {
    const boundary = runner([""]);
    const port = new GhReviewUnlockPort(boundary.port, async () => {
      throw new Error("readiness not used");
    });

    await port.dispatch({
      eventType: "arc-clearance",
      repository: "owner/repo",
      pullRequest: 42,
      headSha: "a".repeat(40),
      vehicle: {
        kind: "work-unit",
        slug: "demo",
        archiveCadence: "with-integration",
      },
    });

    expect(boundary.calls[0]).toEqual(expect.arrayContaining([
      "repos/owner/repo/dispatches",
      "event_type=arc-clearance",
      "client_payload[pull_request]=42",
      `client_payload[head_sha]=${"a".repeat(40)}`,
      "client_payload[vehicle_kind]=work-unit",
      "client_payload[slug]=demo",
      "client_payload[archive_cadence]=with-integration",
    ]));
  });

  it.each([null, "42", 42.5])("rejects malformed pull-request number %j at the port boundary", async (number) => {
    const boundary = runner([JSON.stringify({
      number,
      state: "open",
      head: { ref: "feat/demo", sha: "a".repeat(40) },
      base: { repo: { full_name: "owner/repo" } },
    })]);
    const port = new GhReviewUnlockPort(boundary.port, async () => {
      throw new Error("readiness not used");
    });

    await expect(port.resolvePullRequest("owner/repo", 42)).rejects.toThrow(/expected an integer/iu);
  });
});
