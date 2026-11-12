import { describe, expect, it } from "vitest";

import {
  HostedProcessError,
  type HostedProcessRunner,
} from "../../../../../../src/scripts/review-gate/hosted/gh-process.js";
import { GhMergeLockPort } from "../../../../../../src/scripts/review-gate/hosts/github/merge-lock.js";
import { releaseMergeLock } from "../../../../../../src/scripts/review-gate/merge-lock.js";
import type { MergeLockSetting } from "../../../../../../src/scripts/review-gate/merge-lock.js";
import { ReviewVehicleSchema } from "../../../../../../src/scripts/review-gate/readiness.js";

const SHA = "a".repeat(40);

const TARGET = { repository: "owner/repo", pullRequest: 42, headSha: SHA };
const VEHICLE = ReviewVehicleSchema.parse({ kind: "work-unit", slug: "demo", archiveCadence: "manual" });

function repositoryJson() {
  return JSON.stringify({ nameWithOwner: "owner/repo", defaultBranchRef: { name: "main" } });
}

function pullRequestJson(draft: boolean) {
  return JSON.stringify({
    number: 42,
    state: "open",
    draft,
    head: { ref: "feat/demo", sha: SHA },
    base: { repo: { full_name: "owner/repo" } },
  });
}

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

function unusedReadiness(): never {
  throw new Error("readiness not used");
}

function unusedConfig(): never {
  throw new Error("config not used");
}

describe("GhMergeLockPort", () => {
  it("reads the live lock state from the pull-request payload without a second round trip", async () => {
    const boundary = runner([pullRequestJson(true)]);
    const port = new GhMergeLockPort(boundary.port, unusedReadiness, unusedConfig);

    await expect(port.resolvePullRequest("owner/repo", 42)).resolves.toEqual({
      repository: "owner/repo",
      number: 42,
      state: "open",
      headBranch: "feat/demo",
      headSha: SHA,
      locked: true,
    });
    expect(boundary.calls).toEqual([["api", "repos/owner/repo/pulls/42"]]);
  });

  it("reports an open pull request as unlocked", async () => {
    const boundary = runner([pullRequestJson(false)]);
    const port = new GhMergeLockPort(boundary.port, unusedReadiness, unusedConfig);

    await expect(port.resolvePullRequest("owner/repo", 42)).resolves.toMatchObject({ locked: false });
  });

  it("rejects a pull-request payload with no readable lock state", async () => {
    const boundary = runner([JSON.stringify({
      number: 42,
      state: "open",
      head: { ref: "feat/demo", sha: SHA },
      base: { repo: { full_name: "owner/repo" } },
    })]);
    const port = new GhMergeLockPort(boundary.port, unusedReadiness, unusedConfig);

    await expect(port.resolvePullRequest("owner/repo", 42)).rejects.toThrow(/expected a boolean/iu);
  });

  it("resolves canonical repository facts from strict gh JSON", async () => {
    const boundary = runner([repositoryJson()]);
    const port = new GhMergeLockPort(boundary.port, unusedReadiness, unusedConfig);

    await expect(port.resolveRepository()).resolves.toEqual({
      repository: "owner/repo",
      defaultBranch: "main",
    });
  });

  it("issues the ready transition on a release and its inverse on a hold", async () => {
    const boundary = runner(["", ""]);
    const port = new GhMergeLockPort(boundary.port, unusedReadiness, unusedConfig);

    await port.applyTransition({ repository: "owner/repo", pullRequest: 42, transition: "release" });
    await port.applyTransition({ repository: "owner/repo", pullRequest: 42, transition: "hold" });

    expect(boundary.calls).toEqual([
      ["pr", "ready", "42", "--repo", "owner/repo"],
      ["pr", "ready", "42", "--repo", "owner/repo", "--undo"],
    ]);
  });

  it("surfaces a failed transition as a blocked outcome rather than an escaping exception", async () => {
    const readiness = async () => ({
      schemaVersion: 1 as const,
      mode: "review-readiness" as const,
      diagnostics: [],
      state: "ready" as const,
      nextAction: "none" as const,
      payload: { target: TARGET, vehicle: VEHICLE },
    });
    const config = async (): Promise<MergeLockSetting> => ({ state: "value", value: "draft" });
    const port = new GhMergeLockPort({
      run: async (args) => {
        if (args[0] === "repo") return { stdout: repositoryJson(), stderr: "" };
        if (args[0] === "api") return { stdout: pullRequestJson(true), stderr: "" };
        throw new HostedProcessError("gh pr ready failed", "HTTP 422", 1, 422);
      },
    }, readiness, config);

    const result = await releaseMergeLock({
      schemaVersion: 1,
      treeRoot: "/candidate",
      target: TARGET,
      vehicle: VEHICLE,
    }, port);

    expect(result).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      payload: { ...TARGET, reason: "transition-failed" },
    });
  });

  it("delegates the config and readiness reads to its injected collaborators", async () => {
    const roots: string[] = [];
    const port = new GhMergeLockPort(
      runner([]).port,
      unusedReadiness,
      async (treeRoot) => {
        roots.push(treeRoot);
        return { state: "absent" };
      },
    );

    await expect(port.readMergeLock("/candidate")).resolves.toEqual({ state: "absent" });
    expect(roots).toEqual(["/candidate"]);
  });
});
