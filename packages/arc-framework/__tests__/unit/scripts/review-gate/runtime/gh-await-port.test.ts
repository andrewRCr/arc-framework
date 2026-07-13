import { describe, expect, it } from "vitest";

import { GhDeveloperActionPort, GhProcessError, type ProcessRunner } from "../../../../../src/scripts/review-gate/runtime/gh-action-port.js";
import { GhAwaitHostPort } from "../../../../../src/scripts/review-gate/runtime/gh-await-port.js";

const HEAD = "a".repeat(40);
const CHANGE_SET = "b".repeat(64);

class FakeProcess implements ProcessRunner {
  readonly calls: string[][] = [];
  responses: string[] = [];
  fail = false;
  authenticationFailure = false;

  async run(command: string, args: string[]): Promise<{ stdout: string }> {
    this.calls.push([command, ...args]);
    if (this.authenticationFailure) throw new GhProcessError("authentication-failure");
    if (this.fail) throw new GhProcessError("host-failure");
    return { stdout: this.responses.shift() ?? "{}" };
  }
}

function marker(conclusion: string): string {
  return `<!-- arc-review-gate-state:v1:${Buffer.from(JSON.stringify({
    schemaVersion: 1, conclusion, blockerCodes: [], ledgerVersion: 3, receiptRefs: [],
  })).toString("base64url")} -->`;
}

describe("developer-authenticated await host port", () => {
  it("reads the exact PR head and source-pinned ci-ok through the shared gh port", async () => {
    const process = new FakeProcess();
    process.responses = [
      JSON.stringify({ head: { sha: HEAD } }),
      JSON.stringify({ check_runs: [{ name: "ci-ok", head_sha: HEAD, app: { id: 15368 }, status: "completed", conclusion: "success", created_at: "2026-07-12T10:00:00Z", id: 4 }] }),
    ];
    const host = new GhAwaitHostPort(new GhDeveloperActionPort(process), { expectedAppId: "91", contextName: "review-gate-shadow" });
    await expect(host.readPullRequestHead("owner/repo", 7)).resolves.toEqual({ kind: "ok", value: HEAD });
    await expect(host.readCiState("owner/repo", HEAD)).resolves.toEqual({ kind: "ok", value: "success" });
    expect(process.calls).toEqual([
      ["gh", "api", "repos/owner/repo/pulls/7"],
      ["gh", "api", `repos/owner/repo/commits/${HEAD}/check-runs?app_id=15368&check_name=ci-ok&filter=all&per_page=100`],
    ]);
  });

  it("parses only the exact aggregate marker and maps process/read failures to attention", async () => {
    const process = new FakeProcess();
    process.responses = [JSON.stringify({ check_runs: [{
      name: "review-gate-shadow", head_sha: HEAD,
      external_id: `arc-review-gate:7:${CHANGE_SET}:review-gate-shadow`, app: { id: 91 },
      output: { summary: marker("pending") },
    }] })];
    const host = new GhAwaitHostPort(new GhDeveloperActionPort(process), { expectedAppId: "91", contextName: "review-gate-shadow" });
    await expect(host.readReviewState({ repositoryRef: "owner/repo", pullRequestNumber: 7, headSha: HEAD }))
      .resolves.toEqual({ kind: "ok", value: { conclusion: "pending", blockerCodes: [], ledgerVersion: 3, receiptRefs: [] } });

    process.fail = true;
    await expect(host.readPullRequestHead("owner/repo", 7)).resolves.toEqual({ kind: "host-failure" });
    process.fail = false;
    process.authenticationFailure = true;
    await expect(host.readPullRequestHead("owner/repo", 7)).resolves.toEqual({ kind: "authentication-failure" });
    process.authenticationFailure = false;
    process.responses = ["not-json"];
    await expect(host.readPullRequestHead("owner/repo", 7)).resolves.toEqual({ kind: "malformed-projection" });

    for (const read of [
      () => host.readCiState("owner/repo", HEAD),
      () => host.readReviewState({ repositoryRef: "owner/repo", pullRequestNumber: 7, headSha: HEAD }),
    ]) {
      process.fail = true;
      await expect(read()).resolves.toEqual({ kind: "host-failure" });
      process.fail = false;
      process.authenticationFailure = true;
      await expect(read()).resolves.toEqual({ kind: "authentication-failure" });
      process.authenticationFailure = false;
      process.responses = ["not-json"];
      await expect(read()).resolves.toEqual({ kind: "malformed-projection" });
    }
  });
});
