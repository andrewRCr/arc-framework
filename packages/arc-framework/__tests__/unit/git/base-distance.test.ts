import { describe, expect, it } from "vitest";

import {
  analyzeBaseDistanceSnapshot,
  runBaseDrift,
} from "../../../src/lib/git/base-distance.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { GitProcessError } from "../../../src/lib/git/process-error.js";

const BASE_OID = "b".repeat(40);
const MERGE_OID = "c".repeat(40);
const PARENT_A = "d".repeat(40);
const PARENT_B = "e".repeat(40);

interface MockOptions {
  distance?: string;
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
    if (args.join(" ") === "rev-parse --is-shallow-repository") return { stdout: "false" };
    if (args[0] === "rev-parse" && args[1] === "--verify") return { stdout: `${BASE_OID}\n` };
    if (args[0] === "rev-list") return { stdout: options.distance ?? "0\t0\n" };
    if (args[0] === "merge-base") return { stdout: `${PARENT_A}\n` };
    if (args[0] === "diff") return { stdout: "shared.ts\0" };
    if (args[0] === "log") {
      return { stdout: `${MERGE_OID}\0${PARENT_A} ${PARENT_B}\0Merge pull request #12 from x/y\0` };
    }
    throw new Error(`Unexpected Git invocation: ${args.join(" ")}`);
  };
  return { exec, calls };
}

describe("snapshot-driven base distance", () => {
  it("preserves exact distance values against a locally available advertised base", async () => {
    const exec: GitExec = async (_command, args, options) => {
      if (["fetch", "update-ref"].includes(args[0] ?? "")) {
        throw new Error(`mutation attempted: ${args.join(" ")}`);
      }
      if (options?.objectAccess !== "local-only") {
        throw new Error(`lazy object access allowed: ${args.join(" ")}`);
      }
      if (args[0] === "rev-list") return { stdout: "2\t0\n" };
      throw new Error(`Unexpected Git invocation: ${args.join(" ")}`);
    };

    await expect(analyzeBaseDistanceSnapshot({
      exec,
      baseBranch: "main",
      snapshot: { kind: "available", scope: "exact", tips: { main: BASE_OID } },
      objectAvailability: { kind: "complete", commits: { [BASE_OID]: true } },
      history: { kind: "complete" },
    })).resolves.toMatchObject({
      verdict: "clean",
      state: "local-ahead",
      ahead: 2,
      behind: 0,
      base: "main",
      baseOid: BASE_OID,
      remoteEvidence: "exact",
    });
  });

  it("preserves reconciliation evidence against the advertised base OID", async () => {
    const exec: GitExec = async (_command, args, options) => {
      if (options?.objectAccess !== "local-only") {
        throw new Error(`lazy object access allowed: ${args.join(" ")}`);
      }
      if (args[0] === "rev-list") return { stdout: "0\t1\n" };
      if (args[0] === "log") {
        return { stdout: `${MERGE_OID}\0${PARENT_A} ${PARENT_B}\0Merge pull request #12 from x/y\0` };
      }
      if (args[0] === "merge-base") return { stdout: `${PARENT_A}\n` };
      if (args[0] === "diff") return { stdout: "shared.ts\0" };
      throw new Error(`Unexpected Git invocation: ${args.join(" ")}`);
    };

    await expect(analyzeBaseDistanceSnapshot({
      exec,
      baseBranch: "main",
      snapshot: { kind: "available", scope: "all-heads", tips: { main: BASE_OID } },
      objectAvailability: { kind: "complete", commits: { [BASE_OID]: true } },
      history: { kind: "complete" },
    })).resolves.toMatchObject({
      verdict: "reconcile",
      state: "remote-ahead",
      ahead: 0,
      behind: 1,
      baseOid: BASE_OID,
      integrationEvidence: { coverage: "complete", scannedCommitCount: 1 },
      remoteEvidence: "exact",
    });
  });

  it("rejects graph distance when local history is shallow", async () => {
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "rev-list") return { stdout: "0\t0\n" };
      throw new Error(`Unexpected Git invocation: ${args.join(" ")}`);
    };

    await expect(analyzeBaseDistanceSnapshot({
      exec,
      baseBranch: "main",
      snapshot: { kind: "available", scope: "exact", tips: { main: BASE_OID } },
      objectAvailability: { kind: "complete", commits: { [BASE_OID]: true } },
      history: { kind: "shallow" },
    })).rejects.toThrow(/Complete local history/u);
  });

  it("returns pending evidence with neutral counts when the advertised base is not local", async () => {
    const exec: GitExec = async (_command, args) => {
      throw new Error(`Unexpected Git invocation: ${args.join(" ")}`);
    };

    await expect(analyzeBaseDistanceSnapshot({
      exec,
      baseBranch: "main",
      snapshot: { kind: "available", scope: "exact", tips: { main: BASE_OID } },
      objectAvailability: { kind: "complete", commits: { [BASE_OID]: false } },
      history: { kind: "unavailable", reason: "execution" },
    })).resolves.toMatchObject({
      verdict: "unavailable",
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: "main",
      baseOid: BASE_OID,
      unavailableReason: "base-object-pending-fetch",
      remoteEvidence: "pending-fetch",
    });
  });

  it.each([
    ["execution", /inspection failed/u],
    ["malformed", /malformed output/u],
  ] as const)("propagates %s base object-availability prerequisite failure", async (reason, message) => {
    const exec: GitExec = async (_command, args) => {
      throw new Error(`Unexpected Git invocation: ${args.join(" ")}`);
    };

    await expect(analyzeBaseDistanceSnapshot({
      exec,
      baseBranch: "main",
      snapshot: { kind: "available", scope: "exact", tips: { main: BASE_OID } },
      objectAvailability: { kind: "unavailable", reason },
      history: { kind: "complete" },
    })).rejects.toThrow(message);
  });

  it("returns exact remote-base absence without running local object or graph reads", async () => {
    const exec: GitExec = async (_command, args) => {
      throw new Error(`Unexpected Git invocation: ${args.join(" ")}`);
    };

    await expect(analyzeBaseDistanceSnapshot({
      exec,
      baseBranch: "main",
      snapshot: { kind: "available", scope: "all-heads", tips: {} },
      objectAvailability: { kind: "unavailable", reason: "execution" },
      history: { kind: "unavailable", reason: "execution" },
    })).resolves.toMatchObject({
      verdict: "unavailable",
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: "main",
      baseOid: null,
      unavailableReason: "remote-base-absent",
      remoteEvidence: "exact",
    });
  });

  it("preserves typed unreachable evidence without running local Git", async () => {
    const { exec, calls } = gitMock();

    await expect(analyzeBaseDistanceSnapshot({
      exec,
      baseBranch: "main",
      snapshot: { kind: "unreachable", failureReason: "auth" },
      objectAvailability: { kind: "complete", commits: {} },
      history: { kind: "complete" },
    })).resolves.toMatchObject({
      verdict: "unavailable",
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: "main",
      baseOid: null,
      remoteEvidence: "unreachable",
      failureReason: "auth",
    });
    expect(calls).toEqual([]);
  });

  it.each([
    ["execution failure", () => { throw new Error("distance failed"); }, /distance failed/u],
    ["malformed output", { stdout: "not counts" }, /Malformed git rev-list/u],
  ] as const)("propagates local distance %s", async (_label, distanceResponse, expected) => {
    const exec: GitExec = async (_command, args) => {
      if (args[0] !== "rev-list") throw new Error(`Unexpected Git invocation: ${args.join(" ")}`);
      return typeof distanceResponse === "function" ? distanceResponse() : distanceResponse;
    };

    await expect(analyzeBaseDistanceSnapshot({
      exec,
      baseBranch: "main",
      snapshot: { kind: "available", scope: "exact", tips: { main: BASE_OID } },
      objectAvailability: { kind: "complete", commits: { [BASE_OID]: true } },
      history: { kind: "complete" },
    })).rejects.toThrow(expected);
  });
});

describe("base drift raw-distance boundary", () => {
  it("authoritative mode materializes regardless of automatic session policy", async () => {
    const { exec, calls } = gitMock();
    const result = await runBaseDrift({
      exec,
      baseBranch: "main",
      mode: "authoritative",
    });
    expect(result.verdict).toBe("clean");
    expect(result.baseOid).toBe(BASE_OID);
    expect(calls.some((args) => args[0] === "fetch")).toBe(true);
  });

  it("authoritative mode materializes the standard remote base without an ARC temporary ref", async () => {
    const { exec, calls } = gitMock();
    await runBaseDrift({
      exec,
      baseBranch: "main",
      mode: "authoritative",
    });
    expect(calls).toContainEqual(["check-ref-format", "refs/heads/main"]);
    expect(calls).toContainEqual([
      "fetch",
      "origin",
      "+refs/heads/main:refs/remotes/origin/main",
    ]);
    expect(calls).toContainEqual([
      "rev-parse",
      "--verify",
      "refs/remotes/origin/main^{commit}",
    ]);
    expect(calls.some((args) => args[0] === "update-ref")).toBe(false);
    expect(calls.some((args) => args.join(" ").includes("refs/arc/base-drift"))).toBe(false);
  });

  it("preserves an absent authoritative remote base without resolving a stale tracking ref", async () => {
    const calls: string[][] = [];
    const exec: GitExec = async (_command, args) => {
      calls.push(args);
      if (args[0] === "check-ref-format") return { stdout: "" };
      if (args.join(" ") === "rev-parse --abbrev-ref HEAD") return { stdout: "feat/example" };
      if (args.join(" ") === "remote get-url origin") return { stdout: "remote" };
      throw new GitProcessError({
        kind: "nonzero-exit",
        command: "git",
        args,
        exitCode: 128,
        expectedOutcome: "absent-remote-ref",
      });
    };

    await expect(runBaseDrift({ exec, baseBranch: "main", mode: "authoritative" }))
      .resolves.toMatchObject({
        verdict: "unavailable",
        unavailableReason: "remote-base-absent",
      });
    expect(calls.some((args) => args.includes("--verify"))).toBe(false);
  });

  it("keeps raw distance authoritative for reconcile", async () => {
    const { exec } = gitMock({ distance: "0\t1\n" });
    const result = await runBaseDrift({
      exec,
      baseBranch: "main",
      mode: "authoritative",
    });
    expect(result.verdict).toBe("reconcile");
    expect(result.behind).toBe(1);
    expect(result.integrationEvidence).toMatchObject({ coverage: "complete", scannedCommitCount: 1 });
    expect(result.register?.kind).toBe("calm");
  });

  it("keeps a healthy reconcile verdict when the resolver factory fails", async () => {
    const { exec } = gitMock({ distance: "0\t1\n" });
    const result = await runBaseDrift({
      exec,
      baseBranch: "main",
      mode: "authoritative",
      resolverFactory: () => {
        throw new Error("resolver unavailable");
      },
    });
    expect(result).toMatchObject({ verdict: "reconcile", ahead: 0, behind: 1, baseOid: BASE_OID });
  });

  it("degrades only overlap evidence when the classifier fails", async () => {
    const { exec } = gitMock({ distance: "1\t1\n" });
    const result = await runBaseDrift({
      exec,
      baseBranch: "main",
      mode: "authoritative",
      classifyReconciliation: () => {
        throw new Error("classifier unavailable");
      },
    });
    expect(result).toMatchObject({
      verdict: "reconcile",
      ahead: 1,
      behind: 1,
      baseOid: BASE_OID,
      overlap: { status: "unavailable", reason: "classification-failed" },
      register: { kind: "degraded" },
    });
  });

  it("refuses advisory acquisition before any Git invocation", async () => {
    const { exec, calls } = gitMock();
    // `mode` now admits only `authoritative`, so this models the untyped caller the
    // runtime guard is retained for. The refusal must still land before any fetch.
    await expect(runBaseDrift({
      exec,
      baseBranch: "main",
      mode: "advisory" as unknown as "authoritative",
    })).rejects.toThrow(/supplied snapshot evidence/u);
    expect(calls).toEqual([]);
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
