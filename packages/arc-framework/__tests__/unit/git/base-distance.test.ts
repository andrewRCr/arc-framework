import { describe, expect, it } from "vitest";

import { runBaseDrift, runBaseDistanceStatus } from "../../../src/lib/git/base-distance.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const BASE_OID = "b".repeat(40);
const MERGE_OID = "c".repeat(40);
const PARENT_A = "d".repeat(40);
const PARENT_B = "e".repeat(40);

interface MockOptions {
  distance?: string;
  cleanupFails?: boolean;
  fetchFails?: boolean;
}

function gitMock(options: MockOptions = {}): { exec: GitExec; calls: string[][] } {
  const calls: string[][] = [];
  const exec: GitExec = async (_cmd, args) => {
    calls.push(args);
    if (args[0] === "check-ref-format") return { stdout: "" };
    if (args.join(" ") === "rev-parse --abbrev-ref HEAD") return { stdout: "feat/example\n" };
    if (args.join(" ") === "remote get-url origin") return { stdout: "git@example/repo\n" };
    if (args[0] === "fetch") {
      if (options.fetchFails) throw new Error("fetch failed");
      return { stdout: "" };
    }
    if (args[0] === "rev-parse" && args[1] === "--verify") return { stdout: `${BASE_OID}\n` };
    if (args[0] === "rev-list") return { stdout: options.distance ?? "0\t0\n" };
    if (args[0] === "log") {
      return { stdout: `${MERGE_OID}\0${PARENT_A} ${PARENT_B}\0Merge pull request #12 from x/y\0` };
    }
    if (args[0] === "update-ref") {
      if (options.cleanupFails) throw new Error("cleanup failed");
      return { stdout: "" };
    }
    throw new Error(`Unexpected Git invocation: ${args.join(" ")}`);
  };
  return { exec, calls };
}

describe("base drift raw-distance boundary", () => {
  it("skips advisory analysis before any Git invocation", async () => {
    const { exec, calls } = gitMock();
    const result = await runBaseDistanceStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: false,
    });
    expect(result.verdict).toBe("skipped");
    expect(result.register).toBeNull();
    expect(calls).toEqual([]);
  });

  it("authoritative mode ignores the advisory remote-sync setting", async () => {
    const { exec, calls } = gitMock();
    const result = await runBaseDrift({
      exec,
      baseBranch: "main",
      mode: "authoritative",
      remoteSyncEnabled: false,
      token: () => "test-token",
    });
    expect(result.verdict).toBe("clean");
    expect(result.baseOid).toBe(BASE_OID);
    expect(calls.some((args) => args[0] === "fetch")).toBe(true);
  });

  it("fetches a validated full ref into an owned ref and cleans it up", async () => {
    const { exec, calls } = gitMock();
    await runBaseDrift({
      exec,
      baseBranch: "main",
      mode: "authoritative",
      token: () => "test-token",
    });
    expect(calls).toContainEqual(["check-ref-format", "refs/heads/main"]);
    expect(calls).toContainEqual([
      "fetch",
      "--no-write-fetch-head",
      "origin",
      "refs/heads/main:refs/arc/base-drift/test-token",
    ]);
    expect(calls).toContainEqual(["update-ref", "-d", "refs/arc/base-drift/test-token"]);
    expect(calls.some((args) => args.includes("FETCH_HEAD"))).toBe(false);
  });

  it("keeps raw distance authoritative for reconcile", async () => {
    const { exec } = gitMock({ distance: "0\t1\n" });
    const result = await runBaseDrift({
      exec,
      baseBranch: "main",
      mode: "authoritative",
      token: () => "test-token",
    });
    expect(result.verdict).toBe("reconcile");
    expect(result.behind).toBe(1);
    expect(result.integrationEvidence).toMatchObject({ coverage: "complete", scannedCommitCount: 1 });
    expect(result.register?.kind).toBe("calm");
  });

  it("cleanup failure overrides an otherwise healthy reading", async () => {
    const { exec } = gitMock({ cleanupFails: true });
    const result = await runBaseDrift({
      exec,
      baseBranch: "main",
      mode: "authoritative",
      token: () => "test-token",
    });
    expect(result).toMatchObject({
      verdict: "unavailable",
      unavailableReason: "temporary-ref-cleanup-failed",
      baseOid: null,
    });
  });

  it("rejects option-shaped base configuration before fetch", async () => {
    const { exec, calls } = gitMock();
    const result = await runBaseDrift({ exec, baseBranch: "--upload-pack=x", mode: "authoritative" });
    expect(result.unavailableReason).toBe("invalid-base");
    expect(calls.some((args) => args[0] === "fetch")).toBe(false);
  });

  it("maps a fetch failure without claiming zero-distance parity", async () => {
    const { exec } = gitMock({ fetchFails: true });
    const result = await runBaseDrift({ exec, baseBranch: "main", mode: "authoritative" });
    expect(result.verdict).toBe("unavailable");
    expect(result.unavailableReason).toBe("fetch-failed");
    expect(result.baseOid).toBeNull();
  });
});
