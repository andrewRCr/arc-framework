/** Production integration-merge target refresh coverage. */

import { describe, expect, it, vi } from "vitest";

import * as baseDistance from "../../../../src/lib/git/base-distance.js";
import type { BaseDriftResult } from "../../../../src/lib/git/base-drift-types.js";
import type { GitExec } from "../../../../src/lib/git/exec.js";
import type { ChangeRequestResolutionPort } from
  "../../../../src/scripts/review-gate/change-request.js";
import { HostedProcessError } from
  "../../../../src/scripts/review-gate/hosted/gh-process.js";
import { composeIntegrationFinalPlan, createIntegrationMergeDependencies } from
  "../../../../src/scripts/integration/merge-composition.js";

const oid = (character: string): string => character.repeat(40);

function port(headSha: string): ChangeRequestResolutionPort {
  return {
    resolveRepository: async () => "owner/repo",
    readHeadRef: async () => ({ local: null, remote: headSha }),
    listByHead: async () => [{
      number: 42,
      url: "https://example.test/owner/repo/pull/42",
      state: "OPEN",
      baseRefName: "main",
      headRefName: "feat/example",
      headRefOid: headSha,
    }],
    searchByHeadSha: async () => [],
  };
}

describe("integration merge composition", () => {
  it("fails closed when final drift analyzed a different local head than the refreshed host target", () => {
    const target = {
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      headRef: "feat/example",
      headSha: oid("c"),
    };
    expect(composeIntegrationFinalPlan({
      drift: {
        verdict: "clean",
        baseOid: oid("b"),
        headOid: oid("d"),
        movement: "disjoint",
        integrationEvidence: null,
      },
      target,
      feasibility: { state: "clean", base: oid("b"), head: target.headSha },
      admission: {
        state: "mergeable",
        repository: target.repository,
        changeRequest: target.pullRequest,
        base: oid("b"),
        head: target.headSha,
      },
    })).toMatchObject({
      status: "unavailable",
      baseOid: oid("b"),
      detail: expect.stringContaining(oid("d")),
    });
  });

  it("observes required checks once without repeating a provider read", async () => {
    const target = {
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      headRef: "feat/example",
      headSha: oid("c"),
    };
    const seen = new Set<string>();
    const dependencies = createIntegrationMergeDependencies({
      cwd: "/candidate",
      exec: vi.fn() as unknown as GitExec,
      workUnit: "example",
      changeRequestPort: port(target.headSha),
      hostedRunner: {
        run: async (args) => {
          const key = args.join(" ");
          if (seen.has(key)) throw new Error(`provider read repeated: ${key}`);
          seen.add(key);
          if (args[0] === "repo") {
            return { stdout: JSON.stringify({ nameWithOwner: target.repository }), stderr: "" };
          }
          if (args[0] === "api") {
            return { stdout: JSON.stringify({ head: { sha: target.headSha } }), stderr: "" };
          }
          if (args.includes("--required")) {
            return {
              stdout: JSON.stringify([{ name: "merge-ok", state: "PENDING", bucket: "pending" }]),
              stderr: "",
            };
          }
          return {
            stdout: JSON.stringify([
              { name: "merge-ok", state: "PENDING", bucket: "pending" },
              { name: "E2E shard 3", state: "FAILURE", bucket: "fail" },
            ]),
            stderr: "",
          };
        },
      },
    });

    await expect(dependencies.observeChecks(target)).resolves.toMatchObject({
      state: "pending",
      nextAction: "retry",
      checks: [{ name: "merge-ok", state: "pending" }],
      diagnosticFailures: [{ name: "E2E shard 3", state: "failed" }],
    });
  });

  it("confirms the exact merged request and returns the provider merge identity", async () => {
    const target = {
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      headRef: "feat/example",
      headSha: oid("c"),
    };
    let reads = 0;
    const hostedRunner = {
      run: async () => {
        reads += 1;
        return reads === 1
          ? {
              stdout: JSON.stringify({ merged: true, message: "merged", sha: oid("d") }),
              stderr: "",
            }
          : {
              stdout: JSON.stringify({
                number: 42,
                merged: true,
                merge_commit_sha: oid("d"),
                base: { ref: "main" },
                head: { ref: "feat/example", sha: oid("c") },
              }),
              stderr: "",
            };
      },
    };
    const dependencies = createIntegrationMergeDependencies({
      cwd: "/candidate",
      exec: vi.fn() as unknown as GitExec,
      workUnit: "example",
      changeRequestPort: port(target.headSha),
      hostedRunner,
    });

    await expect(dependencies.mergePinned(target, "merge")).resolves.toEqual({
      state: "merged",
      target,
      providerMergeId: oid("d"),
    });
  });

  it("returns confirmed success after an ambiguous mutating response", async () => {
    const target = {
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      headRef: "feat/example",
      headSha: oid("c"),
    };
    let reads = 0;
    const dependencies = createIntegrationMergeDependencies({
      cwd: "/candidate",
      exec: vi.fn() as unknown as GitExec,
      workUnit: "example",
      changeRequestPort: port(target.headSha),
      hostedRunner: {
        run: async () => {
          reads += 1;
          if (reads === 1) throw new Error("The mutating request timed out.");
          return {
            stdout: JSON.stringify({
              number: 42,
              merged: true,
              merge_commit_sha: oid("d"),
              base: { ref: "main" },
              head: { ref: "feat/example", sha: oid("c") },
            }),
            stderr: "",
          };
        },
      },
    });

    await expect(dependencies.mergePinned(target, "merge")).resolves.toEqual({
      state: "merged",
      target,
      providerMergeId: oid("d"),
    });
  });

  it("preserves mutation and confirmation diagnostics when the outcome stays unknown", async () => {
    const target = {
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      headRef: "feat/example",
      headSha: oid("c"),
    };
    let reads = 0;
    const dependencies = createIntegrationMergeDependencies({
      cwd: "/candidate",
      exec: vi.fn() as unknown as GitExec,
      workUnit: "example",
      changeRequestPort: port(target.headSha),
      hostedRunner: {
        run: async () => {
          reads += 1;
          throw new Error(reads === 1 ? "mutation timed out" : "confirmation unavailable");
        },
      },
    });

    await expect(dependencies.mergePinned(target, "merge")).resolves.toEqual({
      state: "merge-outcome-unknown",
      target,
      mutationDetail: "mutation timed out",
      confirmationDetail: "Exact merged-state confirmation was unavailable: confirmation unavailable",
    });
  });

  it.each([
    [false, 1], [true, 1], [false, 0], [true, 0],
  ] as const)(
    "classifies strict-currentness only when the exact head is behind (non-2xx: %s, behind: %s)",
    async (non2xx, behind) => {
    const target = {
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      headRef: "feat/example",
      headSha: oid("c"),
    };
    const drift = vi.spyOn(baseDistance, "runBaseDrift").mockResolvedValue({
      mode: "authoritative",
      verdict: behind > 0 ? "reconcile" : "clean",
      state: behind > 0 ? "diverged" : "local-ahead",
      ahead: 1,
      behind,
      base: "main",
      baseOid: oid("b"),
      headOid: target.headSha,
      movement: "disjoint",
      integrationEvidence: null,
      overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      register: null,
    } as BaseDriftResult);
    const dependencies = createIntegrationMergeDependencies({
      cwd: "/candidate",
      exec: vi.fn() as unknown as GitExec,
      workUnit: "example",
      changeRequestPort: port(target.headSha),
      hostedRunner: {
        run: async (args) => {
          const endpoint = args.find((argument) => argument.startsWith("repos/")) ?? "";
          if (endpoint.endsWith("/merge")) {
            if (non2xx) throw new HostedProcessError("HTTP 405: Merge refused.", "", 1, 405);
            return { stdout: JSON.stringify({ merged: false, message: "Merge refused.", sha: null }), stderr: "" };
          }
          if (endpoint.endsWith("/pulls/42")) {
            return {
              stdout: JSON.stringify({
                number: 42,
                merged: false,
                merge_commit_sha: null,
                base: { ref: "main" },
                head: { ref: "feat/example", sha: oid("c") },
              }),
              stderr: "",
            };
          }
          if (endpoint.includes("/rules/branches/main")) {
            return { stdout: JSON.stringify([[]]), stderr: "" };
          }
          if (endpoint.includes("/branches/main")) {
            return {
              stdout: JSON.stringify({ protection: { required_status_checks: { strict: true, contexts: [] } } }),
              stderr: "",
            };
          }
          throw new Error(`unexpected hosted args: ${args.join(" ")}`);
        },
      },
    });

    await expect(dependencies.mergePinned(target, "merge")).resolves.toMatchObject({
      state: behind > 0 ? "base-currentness-required" : "refused",
      target,
    });
    expect(drift).toHaveBeenCalledWith(expect.objectContaining({
      baseBranch: "main",
      mode: "authoritative",
    }));
    drift.mockRestore();
    },
  );

  it("classifies native head movement from exact confirmation", async () => {
    const target = {
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      headRef: "feat/example",
      headSha: oid("c"),
    };
    let reads = 0;
    const dependencies = createIntegrationMergeDependencies({
      cwd: "/candidate",
      exec: vi.fn() as unknown as GitExec,
      workUnit: "example",
      changeRequestPort: port(target.headSha),
      hostedRunner: {
        run: async () => {
          reads += 1;
          return reads === 1
            ? { stdout: JSON.stringify({ merged: false, message: "Head changed.", sha: null }), stderr: "" }
            : {
                stdout: JSON.stringify({
                  number: 42,
                  merged: false,
                  merge_commit_sha: null,
                  base: { ref: "main" },
                  head: { ref: "feat/example", sha: oid("f") },
                }),
                stderr: "",
              };
        },
      },
    });

    await expect(dependencies.mergePinned(target, "merge")).resolves.toEqual({
      state: "head-moved",
      target,
      actualHead: oid("f"),
      detail: "The change-request head moved before exact merge confirmation.",
    });
  });

  it("refreshes the checkpointed pull request from host state without consulting local HEAD", async () => {
    const exec = vi.fn(async () => {
      throw new Error("unexpected Git invocation");
    }) as unknown as GitExec;
    const dependencies = createIntegrationMergeDependencies({
      cwd: "/candidate",
      exec,
      workUnit: "example",
      changeRequestPort: port(oid("f")),
    });

    await expect(dependencies.refreshTarget({
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      headRef: "feat/example",
      headSha: oid("c"),
    })).resolves.toEqual({
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      headRef: "feat/example",
      headSha: oid("f"),
    });
    expect(exec).not.toHaveBeenCalled();
  });

  it("refuses a live pull request whose stable identity moved", async () => {
    const moved: ChangeRequestResolutionPort = {
      ...port(oid("f")),
      listByHead: async () => [{
        number: 43,
        url: "https://example.test/owner/repo/pull/43",
        state: "OPEN",
        baseRefName: "main",
        headRefName: "feat/example",
        headRefOid: oid("f"),
      }],
    };
    const dependencies = createIntegrationMergeDependencies({
      cwd: "/candidate",
      exec: vi.fn() as unknown as GitExec,
      workUnit: "example",
      changeRequestPort: moved,
    });

    await expect(dependencies.refreshTarget({
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      headRef: "feat/example",
      headSha: oid("c"),
    })).rejects.toThrow(/no longer open/u);
  });
});
