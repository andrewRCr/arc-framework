/** Production integration-merge target refresh coverage. */

import { describe, expect, it, vi } from "vitest";

import * as baseDistance from "../../../../src/lib/git/base-distance.js";
import type { BaseDriftResult } from "../../../../src/lib/git/base-drift-types.js";
import type { GitExec } from "../../../../src/lib/git/exec.js";
import type { ChangeRequestResolutionPort } from
  "../../../../src/scripts/review-gate/change-request.js";
import { HostedProcessError } from
  "../../../../src/scripts/review-gate/hosted/gh-process.js";
import {
  composeIntegrationFinalPlan,
  createIntegrationMergeDependencies,
  finalBaseMovementUnavailableDetail,
  readMergeBaseDrift,
} from "../../../../src/scripts/integration/merge-composition.js";
import { MATERIALIZING_FETCH_TIMEOUT_MS } from "../../../../src/lib/git/worktree-sync.js";
import { scriptGitExec, type GitExecCall } from "../../../helpers/git-exec-fake.js";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";

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
        overlap: null,
      },
      target,
      feasibility: { state: "clean", base: oid("b"), head: target.headSha },
      admission: {
        state: "mergeable",
        repository: target.repository,
        changeRequest: target.pullRequest,
        baseRef: target.baseRef,
        base: oid("b"),
        head: target.headSha,
      },
    })).toMatchObject({
      status: "unavailable",
      baseOid: oid("b"),
      detail: expect.stringContaining(oid("d")),
    });
  });

  it("revalidates the head around single required and diagnostic check reads", async () => {
    const target = {
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      headRef: "feat/example",
      headSha: oid("c"),
    };
    const reads: string[] = [];
    const dependencies = createIntegrationMergeDependencies({
      cwd: "/candidate",
      exec: vi.fn() as unknown as GitExec,
      workUnit: "example",
      changeRequestPort: port(target.headSha),
      hostedRunner: {
        run: async (args) => {
          const key = args.join(" ");
          reads.push(key);
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
    expect(reads.filter((read) => read.startsWith("api "))).toHaveLength(3);
    expect(reads.filter((read) => read.includes("--required"))).toHaveLength(1);
    expect(reads.filter((read) => read.startsWith("pr checks ") && !read.includes("--required"))).toHaveLength(1);
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
      fetchTimeoutMs: MATERIALIZING_FETCH_TIMEOUT_MS,
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

  describe("an already-merged change request", () => {
    const target = { repository: "owner/repo", pullRequest: 42, baseRef: "main", headRef: "feat/example", headSha: oid("c") };
    const merged: ChangeRequestResolutionPort = { ...port(target.headSha), listByHead: async () => [{
      number: 42, url: "https://example.test/owner/repo/pull/42", state: "MERGED", baseRefName: "main",
      headRefName: "feat/example", headRefOid: target.headSha }] };
    const confirmation = (head: string) => async () => ({ stderr: "", stdout: JSON.stringify({ number: 42, merged: true,
      merge_commit_sha: oid("d"), base: { ref: "main" }, head: { ref: "feat/example", sha: head } }) });
    const unavailable = async () => { throw new Error("confirmation unavailable"); };
    const dependencies = async (run: () => Promise<{ stdout: string; stderr: string }>, native: boolean) => {
      const harness = createReviewHarness();
      const owner = native ? { store: harness.store, workItem: (await harness.seedMeta("example")).reference.owner } : {};
      return createIntegrationMergeDependencies({ cwd: "/candidate", exec: vi.fn() as unknown as GitExec,
        workUnit: "example", changeRequestPort: merged, hostedRunner: { run }, ...owner });
    };

    it("reads in-repo merged state from the change request alone, reporting no merge identity", async () => {
      await expect((await dependencies(confirmation(target.headSha), false)).readMerged(target))
        .resolves.toEqual({ merged: true, providerMergeId: null });
      await expect((await dependencies(unavailable, false)).readMerged(target))
        .resolves.toEqual({ merged: true, providerMergeId: null });
    });

    it("reads a native merge without confirming its identity when the caller records no landing link", async () => {
      const harness = createReviewHarness();
      const calls: string[][] = [];
      const dependencies = createIntegrationMergeDependencies({ cwd: "/candidate", exec: vi.fn() as unknown as GitExec,
        workUnit: "example", changeRequestPort: merged, store: harness.store, confirmMergeIdentity: false,
        hostedRunner: { run: async args => { calls.push([...args]); return await unavailable(); } } });
      await expect(dependencies.readMerged(target)).resolves.toEqual({ merged: true, providerMergeId: null });
      expect(calls).toEqual([]);
    });

    it("fills the native merge identity from exact confirmation", async () => {
      await expect((await dependencies(confirmation(target.headSha), true)).readMerged(target))
        .resolves.toEqual({ merged: true, providerMergeId: oid("d") });
    });

    it.each([
      ["unavailable", unavailable, "Exact merged-state confirmation was unavailable: confirmation unavailable"],
      ["reports a moved head", confirmation(oid("f")), "The change-request head moved before exact merge confirmation."],
    ] as const)(
      "keeps a native merge when its confirmation is %s, leaving the merge identity unknown and saying why",
      async (_case, run, confirmationDetail) => {
        await expect((await dependencies(run, true)).readMerged(target))
          .resolves.toEqual({ merged: true, providerMergeId: null, confirmationDetail });
      },
    );
  });
});

describe("the merge verbs' authoritative base read", () => {
  /** A repository whose base fetch answers after `fetchMs`, unless its own bound aborts it first. */
  function slowFetchGit(fetchMs: number): GitExec {
    const fetch = ({ options }: GitExecCall) => new Promise<{ stdout: string } | { failure: { isCanceled: true } }>(
      (resolve) => {
        const timer = setTimeout(() => { resolve({ stdout: "" }); }, fetchMs);
        options?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve({ failure: { isCanceled: true } });
        }, { once: true });
      });
    return scriptGitExec([
      { match: { prefix: ["check-ref-format"] }, responses: [{ stdout: "" }] },
      { match: ["rev-parse", "--abbrev-ref", "HEAD"], responses: [{ stdout: "feat/example\n" }] },
      { match: ["remote", "get-url", "origin"], responses: [{ stdout: "git@example/repo\n" }] },
      { match: { prefix: ["fetch"] }, responses: [fetch] },
      { match: ["rev-parse", "--is-shallow-repository"], responses: [{ stdout: "false" }] },
      { match: ["rev-parse", "--verify", "HEAD^{commit}"], responses: [{ stdout: `${oid("c")}\n` }] },
      { match: { prefix: ["rev-parse", "--verify"] }, responses: [{ stdout: `${oid("b")}\n` }] },
      { match: { prefix: ["rev-list"] }, responses: [{ stdout: "0\t0\n" }] },
      { match: { prefix: ["merge-base"] }, responses: [{ stdout: `${oid("b")}\n` }] },
      { match: { prefix: ["diff"] }, responses: [{ stdout: "" }] },
      { match: { prefix: ["log"] }, responses: [{ stdout: "" }] },
    ]).exec;
  }

  it.each([
    ["waits out a fetch slower than a status probe's bound", 10_000, { baseOid: oid("b"), headOid: oid("c") }],
    ["names the bound a fetch outlasts", MATERIALIZING_FETCH_TIMEOUT_MS + 10_000, {
      verdict: "unavailable",
      unavailableReason: "fetch-timeout",
      detail: expect.stringContaining(`bounded at ${MATERIALIZING_FETCH_TIMEOUT_MS / 1000} s`),
    }],
  ] as const)("%s", async (_label, fetchMs, expected) => {
    vi.useFakeTimers();
    try {
      const read = readMergeBaseDrift({ exec: slowFetchGit(fetchMs), baseBranch: "main", mode: "authoritative" });
      await vi.advanceTimersByTimeAsync(fetchMs);
      await expect(read).resolves.toMatchObject(expected);
    } finally {
      vi.useRealTimers();
    }
  });

  it("names the drift read's own cause when the final base movement is unavailable", () => {
    const timedOut = baseDistance.unavailableBaseDrift("fetch-timeout", "main", "The fetch was bounded at 30 s.");
    expect(finalBaseMovementUnavailableDetail(timedOut, oid("c"))).toBe("The final authoritative base movement could "
      + "not be established: Fetching origin/main timed out before drift evidence was available. The fetch was "
      + "bounded at 30 s.");
    expect(finalBaseMovementUnavailableDetail({ ...timedOut, headOid: oid("d") }, oid("c")))
      .toBe(`The authoritative drift head ${oid("d")} does not match the refreshed host head ${oid("c")}.`);
  });
});
