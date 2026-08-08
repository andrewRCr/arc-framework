import { describe, it, expect, vi } from "vitest";

import {
  CANDIDATE_FETCH_CONCURRENCY,
  DEFAULT_NETWORK_TIMEOUT_MS,
  fetchRefBounded,
  fetchRefsBounded,
  listLiveRemoteBranches,
  listMetaPathsAtRef,
  listPrunedRemoteTrackingBranches,
  readLiveRemoteBranchTip,
  readLiveRemoteHeads,
  readLocalInFlightRefSnapshot,
  readMetaAtRef,
  readRemoteHeadSnapshot,
  resolveInFlightBranchSet,
  roundScaledFetchBudgetMs,
} from "../../../src/lib/git/remote-ref-reader.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";
import { GitProcessError } from "../../../src/lib/git/process-error.js";

const oid = (seed: string): string => seed.padEnd(40, "0");
const oid256 = (seed: string): string => seed.padEnd(64, "0");

/**
 * Build an exec stub that dispatches on the git subcommand — `ls-remote`
 * (live membership) and `for-each-ref` (local remote-tracking refs) return
 * distinct payloads in one reader call.
 */
function execBySubcommand(payloads: { lsRemote?: string; forEachRef?: string }): GitExec {
  return vi.fn(async (_cmd, args): Promise<ExecResult> => {
    if (args[0] === "ls-remote") return { stdout: payloads.lsRemote ?? "", stderr: "" };
    if (args[0] === "for-each-ref") return { stdout: payloads.forEachRef ?? "", stderr: "" };
    throw new Error(`unexpected git ${args.join(" ")}`);
  });
}

/** Build an exec stub that returns a fixed payload (or throws). */
function execReturning(stdout: string): GitExec {
  return vi.fn(async (): Promise<ExecResult> => ({ stdout, stderr: "" }));
}

/** A `git show <ref>:<path>` failure when the path is absent on that ref. */
function pathAbsentError(): Error {
  const err = new Error("fatal: path '.arc/active/meta-x.md' does not exist in 'ref'");
  Object.assign(err, { code: 128 });
  return err;
}

describe("readRemoteHeadSnapshot", () => {
  it("treats successful exact omission as authoritative branch absence", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      if (args.join(" ") !== "ls-remote --heads origin refs/heads/missing") {
        throw new Error("unexpected remote query");
      }
      return { stdout: "", stderr: "" };
    });

    await expect(readRemoteHeadSnapshot({
      exec,
      scope: { kind: "exact", branch: "missing" },
    })).resolves.toEqual({ kind: "available", scope: "exact", tips: {} });
  });

  it("rejects an exact query that over-responds with a different branch", async () => {
    const exec = execReturning(`${oid("a2")}\trefs/heads/other\n`);

    await expect(readRemoteHeadSnapshot({
      exec,
      scope: { kind: "exact", branch: "main" },
    })).resolves.toEqual({ kind: "unreachable", failureReason: "error" });
  });

  it("preserves every advertised branch from one complete all-heads response", async () => {
    const main = oid("a1");
    const feature = oid256("b2");
    const exec = execReturning([
      `${main}\trefs/heads/main`,
      `${feature}\trefs/heads/feat/remote-proof`,
    ].join("\n"));

    await expect(readRemoteHeadSnapshot({
      exec,
      scope: { kind: "all-heads" },
    })).resolves.toEqual({
      kind: "available",
      scope: "all-heads",
      tips: { main, "feat/remote-proof": feature },
    });
  });

  it("classifies a reader-owned timeout without exposing process diagnostics", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args, options): Promise<ExecResult> => {
      await new Promise<void>((resolve) => options?.signal?.addEventListener("abort", () => resolve(), {
        once: true,
      }));
      throw new GitProcessError({
        kind: "canceled",
        command: "git",
        args,
        stderr: "https://secret-token@example.invalid/private.git",
      });
    });

    await expect(readRemoteHeadSnapshot({
      exec,
      scope: { kind: "all-heads" },
      timeoutMs: 1,
    })).resolves.toEqual({ kind: "unreachable", failureReason: "timeout" });
  });

  it("classifies stable network diagnostics", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      throw new GitProcessError({
        kind: "nonzero-exit",
        command: "git",
        args,
        exitCode: 128,
        stderr: "fatal: unable to access 'https://example.invalid/repo': Could not resolve host: example.invalid",
      });
    });

    await expect(readRemoteHeadSnapshot({
      exec,
      scope: { kind: "all-heads" },
    })).resolves.toEqual({ kind: "unreachable", failureReason: "network" });
  });

  it("classifies stable authentication diagnostics", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      throw new GitProcessError({
        kind: "nonzero-exit",
        command: "git",
        args,
        exitCode: 128,
        stderr: "fatal: Authentication failed for 'https://token@example.invalid/private.git'",
      });
    });

    await expect(readRemoteHeadSnapshot({
      exec,
      scope: { kind: "exact", branch: "private" },
    })).resolves.toEqual({ kind: "unreachable", failureReason: "auth" });
  });

  it("requires closed input, forbidden prompts, and stable diagnostics", async () => {
    const tip = oid("c3");
    const exec: GitExec = vi.fn(async (_cmd, _args, options): Promise<ExecResult> => {
      if (
        options?.interaction?.ambientStdin !== "closed"
        || options.interaction.terminalPrompts !== "forbidden"
        || options.interaction.presenters !== "forbidden"
        || options.diagnosticLocale !== "stable"
      ) {
        throw new Error("unsafe remote process policy");
      }
      return { stdout: `${tip}\trefs/heads/main\n`, stderr: "" };
    });

    await expect(readRemoteHeadSnapshot({
      exec,
      scope: { kind: "exact", branch: "main" },
    })).resolves.toEqual({ kind: "available", scope: "exact", tips: { main: tip } });
  });

  it("rejects malformed output instead of publishing a partial snapshot", async () => {
    const main = oid("d4");
    const exec = execReturning(`${main}\trefs/heads/main\nmalformed\n`);

    await expect(readRemoteHeadSnapshot({
      exec,
      scope: { kind: "all-heads" },
    })).resolves.toEqual({ kind: "unreachable", failureReason: "error" });
  });

  it("bounds unclassified failures to the public error value", async () => {
    const exec: GitExec = vi.fn(async () => {
      throw new Error("credential-bearing diagnostic that must not escape");
    });

    await expect(readRemoteHeadSnapshot({
      exec,
      scope: { kind: "all-heads" },
    })).resolves.toEqual({ kind: "unreachable", failureReason: "error" });
  });

  it("completes one bounded all-heads process and refuses every mutation", async () => {
    const main = oid("e5");
    let processCount = 0;
    const exec: GitExec = async (_cmd, args, options): Promise<ExecResult> => {
      processCount += 1;
      if (
        args.join(" ") !== "ls-remote --heads origin"
        || options?.signal === undefined
        || options.interaction?.terminalPrompts !== "forbidden"
      ) {
        throw new Error("unexpected or mutating Git process");
      }
      return { stdout: `${main}\trefs/heads/main\n`, stderr: "" };
    };

    await expect(readRemoteHeadSnapshot({
      exec,
      scope: { kind: "all-heads" },
    })).resolves.toEqual({ kind: "available", scope: "all-heads", tips: { main } });
    expect(processCount).toBe(1);
  });
});

describe("listLiveRemoteBranches", () => {
  it("enumerates live remote branch names from git ls-remote --heads origin", async () => {
    const exec = execReturning(
      [
        `${oid("abc123")}\trefs/heads/main`,
        `${oid("def456")}\trefs/heads/feat/in-flight-awareness`,
        `${oid("789aaa")}\trefs/heads/chore/fix-typo`,
      ].join("\n"),
    );

    const result = await listLiveRemoteBranches({ exec });

    expect(result).toEqual(["main", "feat/in-flight-awareness", "chore/fix-typo"]);
  });

  it("uses the configured remote for live membership", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      expect(args).toEqual(["ls-remote", "--heads", "upstream"]);
      return { stdout: `${oid("abc123")}\trefs/heads/feat/x\n`, stderr: "" };
    });

    const result = await listLiveRemoteBranches({ exec, remote: "upstream" });

    expect(result).toEqual(["feat/x"]);
  });

  it("degrades to an empty membership list when ls-remote is unreachable", async () => {
    const exec: GitExec = vi.fn(async () => {
      throw new Error("fatal: could not read from remote repository");
    });

    const result = await listLiveRemoteBranches({ exec });

    expect(result).toEqual([]);
  });
});

describe("readLiveRemoteHeads", () => {
  it("returns reachable live branch names and exact object ids", async () => {
    const main = oid("a1");
    const feature = oid256("b2");
    const exec = execReturning([
      `${main}\trefs/heads/main`,
      `${feature}\trefs/heads/feat/proof`,
    ].join("\n"));

    await expect(readLiveRemoteHeads({ exec })).resolves.toEqual({
      reachable: true,
      complete: true,
      tips: { main, "feat/proof": feature },
    });
  });

  it("distinguishes an empty reachable remote from an unavailable query", async () => {
    const empty = execReturning("");
    const unavailable: GitExec = vi.fn(async () => {
      throw new Error("timed out");
    });

    await expect(readLiveRemoteHeads({ exec: empty })).resolves.toEqual({
      reachable: true,
      complete: true,
      tips: {},
    });
    await expect(readLiveRemoteHeads({ exec: unavailable })).resolves.toEqual({
      reachable: false,
      complete: false,
      tips: {},
    });
  });

  it("retains valid SHA-1 and SHA-256 tips while marking mixed output incomplete", async () => {
    const sha1 = oid("a1");
    const sha256 = oid256("b2");
    const exec = execReturning([
      `${sha1}\trefs/heads/main`,
      `${sha256}\trefs/heads/feat/sha256`,
      "ABCDEF\trefs/heads/uppercase",
      `${oid("c3")}\trefs/tags/not-a-head`,
      `${oid("d4")}\trefs/heads/`,
      "malformed",
    ].join("\n"));

    await expect(readLiveRemoteHeads({ exec })).resolves.toEqual({
      reachable: true,
      complete: false,
      tips: { main: sha1, "feat/sha256": sha256 },
    });
  });
});

describe("readLiveRemoteBranchTip", () => {
  it("queries one explicit remote branch and returns its exact tip", async () => {
    const tip = oid("a1");
    const exec: GitExec = vi.fn(async (_cmd, args, options): Promise<ExecResult> => {
      expect(args).toEqual(["ls-remote", "--heads", "origin", "refs/heads/plan/origin"]);
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      return { stdout: `${tip}\trefs/heads/plan/origin\n`, stderr: "" };
    });

    await expect(readLiveRemoteBranchTip({ exec, branch: "plan/origin" })).resolves.toEqual({
      reachable: true,
      tip,
    });
  });

  it.each([
    ["absent", ""],
    ["malformed", "not-a-ref\n"],
    ["wrong ref", `${oid("a1")}\trefs/heads/plan/other\n`],
    ["duplicate", `${oid("a1")}\trefs/heads/plan/origin\n${oid("b2")}\trefs/heads/plan/origin\n`],
  ])("fails closed for %s output", async (_label, stdout) => {
    await expect(readLiveRemoteBranchTip({
      exec: execReturning(stdout),
      branch: "plan/origin",
    })).resolves.toEqual({ reachable: true, tip: null });
  });

  it("distinguishes an unreadable remote", async () => {
    const exec: GitExec = vi.fn(async () => {
      throw new Error("timed out");
    });

    await expect(readLiveRemoteBranchTip({ exec, branch: "plan/origin" })).resolves.toEqual({
      reachable: false,
      tip: null,
    });
  });
});

describe("fetchRefBounded", () => {
  it("fetches the candidate ref with an abort signal and reports success", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args, options): Promise<ExecResult> => {
      expect(args).toEqual(["fetch", "--no-filter", "origin", "feat/remote-only"]);
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      return { stdout: "", stderr: "" };
    });

    const result = await fetchRefBounded({ exec, branch: "feat/remote-only", timeoutMs: 2000 });

    expect(result).toBe(true);
  });

  it("uses the configured remote for bounded fetches", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      expect(args).toEqual(["fetch", "--no-filter", "upstream", "feat/remote-only"]);
      return { stdout: "", stderr: "" };
    });

    const result = await fetchRefBounded({ exec, remote: "upstream", branch: "feat/remote-only" });

    expect(result).toBe(true);
  });

  it("degrades to false when the candidate-ref fetch is unreachable", async () => {
    const exec: GitExec = vi.fn(async () => {
      throw new Error("timed out");
    });

    const result = await fetchRefBounded({ exec, branch: "feat/x", timeoutMs: 2000 });

    expect(result).toBe(false);
  });
});

describe("fetchRefsBounded", () => {
  it("fetches every branch in its own invocation and reports the successes", async () => {
    const branches = ["feat/a", "feat/b", "feat/c"];
    const fetched: string[] = [];
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      expect(args[0]).toBe("fetch");
      expect(args).toHaveLength(4);
      fetched.push(String(args[3]));
      return { stdout: "", stderr: "" };
    });

    // Compared as sets: the returned order reflects completion, which the contract
    // explicitly declines to promise.
    const result = await fetchRefsBounded({ exec, branches, timeoutMs: 2000 });
    expect([...result].sort()).toEqual([...branches].sort());
    expect([...fetched].sort()).toEqual([...branches].sort());
  });

  it("returns only the branches whose fetch succeeded", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      if (args[3] === "feat/unreachable") throw new Error("timed out");
      return { stdout: "", stderr: "" };
    });

    const result = await fetchRefsBounded({
      exec,
      branches: ["feat/a", "feat/unreachable", "feat/b"],
      timeoutMs: 2000,
    });
    expect([...result].sort()).toEqual(["feat/a", "feat/b"]);
  });

  it("runs exactly the configured number of fetches at once", async () => {
    let live = 0;
    let peak = 0;
    const exec: GitExec = vi.fn(async (): Promise<ExecResult> => {
      live += 1;
      peak = Math.max(peak, live);
      // Yield past the microtask queue so every worker the pool starts is in flight
      // before any of them completes; a microtask yield would let each fetch finish
      // before the next begins and hide a serial implementation.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      live -= 1;
      return { stdout: "", stderr: "" };
    });

    await fetchRefsBounded({
      exec,
      branches: Array.from({ length: 12 }, (_value, index) => `feat/${index}`),
      timeoutMs: 2000,
    });

    // Exact, not an upper bound: a pool that degraded to one fetch at a time would
    // still satisfy `<= 4` while losing the parallelism the cap exists to bound.
    expect(peak).toBe(4);
    expect(vi.mocked(exec)).toHaveBeenCalledTimes(12);
  });

  it("stops claiming branches once the request deadline passes", async () => {
    // Every fetch consumes its full per-fetch bound, as an unreachable remote would.
    let clock = 0;
    const exec: GitExec = vi.fn(async (): Promise<ExecResult> => {
      clock += 1000;
      throw new Error("timed out");
    });

    const fetched = await fetchRefsBounded({
      exec,
      branches: Array.from({ length: 40 }, (_value, index) => `feat/${index}`),
      timeoutMs: 1000,
      totalTimeoutMs: 3000,
      now: () => clock,
    });

    // Without an aggregate deadline this would charge ceil(40 / 4) rounds of the
    // per-fetch bound; the deadline caps the whole request instead. A 3000 ms budget
    // against a 1000 ms per-fetch bound buys less than one full round, so no worker
    // claims a second branch — bounded by the concurrency cap rather than pinned to
    // an exact count, which would encode when each worker happens to read the clock.
    expect(fetched).toEqual([]);
    expect(vi.mocked(exec).mock.calls.length).toBeLessThanOrEqual(CANDIDATE_FETCH_CONCURRENCY);
  });

  it("runs no fetch for an empty branch list", async () => {
    const exec: GitExec = vi.fn();

    await expect(fetchRefsBounded({ exec, branches: [], timeoutMs: 2000 })).resolves.toEqual([]);
    expect(vi.mocked(exec)).not.toHaveBeenCalled();
  });

  it("attempts every pending branch under a round-scaled budget", async () => {
    // Same slow remote as the deadline case above — every fetch consumes its full
    // per-fetch bound — but the clock advances per concurrent round rather than per
    // fetch, which is what elapsed wall time actually does when the pool overlaps
    // `CANDIDATE_FETCH_CONCURRENCY` fetches. Sized by `roundScaledFetchBudgetMs`,
    // the explicit acquisition path must reach every branch; under the passive
    // default it would stop after the first round and leave the rest pending.
    let started = 0;
    const branches = Array.from({ length: 10 }, (_value, index) => `feat/${index}`);
    const exec: GitExec = vi.fn(async (): Promise<ExecResult> => {
      started += 1;
      throw new Error("timed out");
    });
    const now = (): number => Math.floor(started / CANDIDATE_FETCH_CONCURRENCY) * 1000;

    await fetchRefsBounded({
      exec,
      branches,
      timeoutMs: 1000,
      totalTimeoutMs: roundScaledFetchBudgetMs(branches.length, 1000),
      now,
    });

    expect(started).toBe(branches.length);
  });

  it("stops after one round under the passive default budget", async () => {
    // The counterpart to the case above, at the defaults both bounds actually take:
    // the aggregate deadline and the per-fetch bound are the same constant, so a
    // slow remote buys exactly one round however many branches are pending. That is
    // correct for a passive probe, which owes one bounded read — and is precisely
    // what the explicit acquisition path must not inherit.
    let started = 0;
    const exec: GitExec = vi.fn(async (): Promise<ExecResult> => {
      started += 1;
      throw new Error("timed out");
    });

    await fetchRefsBounded({
      exec,
      branches: Array.from({ length: 10 }, (_value, index) => `feat/${index}`),
      now: () => Math.floor(started / CANDIDATE_FETCH_CONCURRENCY) * DEFAULT_NETWORK_TIMEOUT_MS,
    });

    expect(started).toBe(CANDIDATE_FETCH_CONCURRENCY);
  });
});

describe("roundScaledFetchBudgetMs", () => {
  it.each([
    [0, 1],
    [1, 1],
    [CANDIDATE_FETCH_CONCURRENCY, 1],
    [CANDIDATE_FETCH_CONCURRENCY + 1, 2],
    [CANDIDATE_FETCH_CONCURRENCY * 3, 3],
  ])("budgets %i pending branches as %i bounded round(s)", (pending, rounds) => {
    expect(roundScaledFetchBudgetMs(pending, 1000)).toBe(1000 * rounds);
  });

  it("defaults the per-fetch bound to the shared network timeout", () => {
    expect(roundScaledFetchBudgetMs(1)).toBe(DEFAULT_NETWORK_TIMEOUT_MS);
  });
});

describe("readMetaAtRef", () => {
  it("reads meta content off a remote ref via git show, no checkout", async () => {
    const content = "# Metadata: x\n\n- **State:** Active\n";
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      expect(args).toEqual(["show", "refs/remotes/origin/feat/x:.arc/active/meta-x.md"]);
      return { stdout: content, stderr: "" };
    });

    const result = await readMetaAtRef({
      exec,
      ref: "refs/remotes/origin/feat/x",
      metaPath: ".arc/active/meta-x.md",
    });

    expect(result).toBe(content);
  });

  it("returns null when the meta path is absent on that ref", async () => {
    const exec: GitExec = vi.fn(async () => {
      throw pathAbsentError();
    });

    const result = await readMetaAtRef({
      exec,
      ref: "refs/remotes/origin/chore/fix-typo",
      metaPath: ".arc/active/meta-fix-typo.md",
    });

    expect(result).toBeNull();
  });
});

describe("listMetaPathsAtRef", () => {
  it("lists active meta paths present at a ref", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      expect(args).toEqual(["ls-tree", "--full-tree", "-r", "--name-only", "origin/feat/x", ".arc/active/"]);
      return {
        stdout: [
          ".arc/active/meta-x.md",
          ".arc/active/notes-x.md",
          ".arc/active/meta-y.md",
          ".arc/active/nested/meta-z.md",
        ].join("\n"),
        stderr: "",
      };
    });

    const result = await listMetaPathsAtRef({ exec, ref: "origin/feat/x" });

    expect(result).toEqual({
      ok: true,
      paths: [".arc/active/meta-x.md", ".arc/active/meta-y.md"],
    });
  });

  it("returns an empty successful result when the ref carries no active metas", async () => {
    const exec = execReturning(".arc/active/notes-x.md\n");

    const result = await listMetaPathsAtRef({ exec, ref: "origin/chore/no-meta" });

    expect(result).toEqual({ ok: true, paths: [] });
  });

  it("distinguishes enumeration failure from an empty active directory", async () => {
    const exec: GitExec = vi.fn(async () => {
      throw new Error("fatal: not a tree object");
    });

    const result = await listMetaPathsAtRef({ exec, ref: "origin/feat/x" });

    expect(result).toEqual({ ok: false, paths: [] });
  });
});

describe("listPrunedRemoteTrackingBranches", () => {
  it("excludes a local remote-tracking ref absent from live membership", async () => {
    const exec = execBySubcommand({
      // A merged-and-deleted branch lingers as a local remote-tracking ref...
      forEachRef: ["origin", "origin/HEAD", "origin/feat/a", "origin/chore/old-merged"].join("\n"),
      // ...but is gone from live `ls-remote` membership.
      lsRemote: [`${oid("a1")}\trefs/heads/feat/a`, `${oid("b2")}\trefs/heads/feat/b`].join("\n"),
    });

    const result = await listPrunedRemoteTrackingBranches({ exec });

    // chore/old-merged pruned (dead upstream); origin/HEAD + bare origin filtered;
    // feat/b is live-only (no local ref), so it is not a tracking-ref candidate here.
    expect(result).toEqual(["feat/a"]);
  });

  it("degrades to the last-known local refs when live membership is unreachable", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      if (args[0] === "ls-remote") throw new Error("fatal: could not read from remote repository");
      if (args[0] === "for-each-ref") {
        return { stdout: ["origin/HEAD", "origin/feat/a", "origin/chore/old"].join("\n"), stderr: "" };
      }
      throw new Error(`unexpected git ${args.join(" ")}`);
    });

    const result = await listPrunedRemoteTrackingBranches({ exec });

    // Membership unknown → can't prune → fall back to all local tracking refs
    // (last-known view) rather than nuking everything to empty.
    expect(result).toEqual(["feat/a", "chore/old"]);
  });
});

describe("readLocalInFlightRefSnapshot", () => {
  it("reads remote-tracking and local branch tips into separate maps", async () => {
    const exec = execReturning([
      "refs/remotes/origin/HEAD\tignored",
      "refs/remotes/origin/feat/a\t1111",
      "refs/heads/feat/local\t2222",
    ].join("\n"));

    const result = await readLocalInFlightRefSnapshot(exec);

    expect(result).toEqual({
      ok: true,
      refs: {
        remoteTracking: { "feat/a": "1111" },
        localHeads: { "feat/local": "2222" },
      },
    });
  });

  it("reports read failure distinctly from an empty local snapshot", async () => {
    const exec: GitExec = vi.fn(async () => {
      throw new Error("fatal: bad ref namespace");
    });

    const result = await readLocalInFlightRefSnapshot(exec);

    expect(result).toEqual({
      ok: false,
      refs: { remoteTracking: {}, localHeads: {} },
    });
  });

  it("reads from the named repository root when one is supplied", async () => {
    // The production executor is not bound to a root: without this the read would
    // resolve against the process directory and could describe a different
    // repository than the snapshot it is joined with.
    const exec: GitExec = vi.fn(async (): Promise<ExecResult> => ({ stdout: "", stderr: "" }));

    await readLocalInFlightRefSnapshot(exec, undefined, "/repo/root");

    expect(vi.mocked(exec).mock.calls[0]?.[2]).toEqual({ cwd: "/repo/root" });
  });

  it("passes no directory option when no root is supplied", async () => {
    const exec: GitExec = vi.fn(async (): Promise<ExecResult> => ({ stdout: "", stderr: "" }));

    await readLocalInFlightRefSnapshot(exec);

    expect(vi.mocked(exec).mock.calls[0]?.[2]).toEqual({});
  });

  it("uses the configured remote namespace", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      expect(args).toEqual([
        "for-each-ref",
        "--format=%(refname)\t%(objectname)",
        "refs/remotes/upstream",
        "refs/heads",
      ]);
      return {
        stdout: [
          "refs/remotes/upstream/feat/a\t1111",
          "refs/remotes/origin/feat/ignored\t2222",
        ].join("\n"),
        stderr: "",
      };
    });

    const result = await readLocalInFlightRefSnapshot(exec, "upstream");

    expect(result).toEqual({
      ok: true,
      refs: {
        remoteTracking: { "feat/a": "1111" },
        localHeads: {},
      },
    });
  });

  it("ignores unexpected bare ref names instead of treating them as remote-tracking refs", async () => {
    const exec = execReturning([
      "feat/legacy\t1111",
      "refs/tags/v1.0.0\t2222",
      "refs/remotes/origin/feat/a\t3333",
    ].join("\n"));

    const result = await readLocalInFlightRefSnapshot(exec);

    expect(result).toEqual({
      ok: true,
      refs: {
        remoteTracking: { "feat/a": "3333" },
        localHeads: {},
      },
    });
  });
});

describe("resolveInFlightBranchSet", () => {
  it("returns the pruned set and reachable: true when live membership is read", async () => {
    const exec = execBySubcommand({
      forEachRef: [
        "refs/remotes/origin/feat/a\tlocal-a",
        "refs/remotes/origin/chore/old-merged\tlocal-old",
      ].join("\n"),
      lsRemote: [`${oid("a1")}\trefs/heads/feat/a`, `${oid("b2")}\trefs/heads/feat/b`].join("\n"),
    });

    const result = await resolveInFlightBranchSet({ exec });

    expect(result).toEqual({
      branches: ["feat/a"],
      refs: { "origin/feat/a": "local-a" },
      liveRefs: { "origin/feat/a": oid("a1"), "origin/feat/b": oid("b2") },
      reachable: true,
    });
  });

  it("keys selected refs and live refs with the configured remote", async () => {
    const exec = execBySubcommand({
      forEachRef: "refs/remotes/upstream/feat/a\tlocal-a",
      lsRemote: `${oid("a1")}\trefs/heads/feat/a`,
    });

    const result = await resolveInFlightBranchSet({ exec, remote: "upstream" });

    expect(result).toEqual({
      branches: ["feat/a"],
      refs: { "upstream/feat/a": "local-a" },
      liveRefs: { "upstream/feat/a": oid("a1") },
      reachable: true,
    });
  });

  it("degrades to local refs with reachable: false when live membership is unreachable", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      if (args[0] === "ls-remote") throw new Error("fatal: could not read from remote repository");
      if (args[0] === "for-each-ref") {
        return { stdout: ["origin/feat/a", "origin/chore/old"].join("\n"), stderr: "" };
      }
      throw new Error(`unexpected git ${args.join(" ")}`);
    });

    const result = await resolveInFlightBranchSet({ exec });

    expect(result).toEqual({
      branches: ["feat/a", "chore/old"],
      refs: { "origin/feat/a": "", "origin/chore/old": "" },
      liveRefs: {},
      reachable: false,
    });
  });

  it("degrades to local refs when live membership is incomplete", async () => {
    const exec = execBySubcommand({
      forEachRef: [
        "refs/remotes/origin/feat/a\tlocal-a",
        "refs/remotes/origin/chore/maybe-live\tlocal-maybe",
      ].join("\n"),
      lsRemote: [`${oid("a1")}\trefs/heads/feat/a`, "malformed"].join("\n"),
    });

    const result = await resolveInFlightBranchSet({ exec });

    expect(result).toEqual({
      branches: ["feat/a", "chore/maybe-live"],
      refs: {
        "origin/feat/a": "local-a",
        "origin/chore/maybe-live": "local-maybe",
      },
      liveRefs: {},
      reachable: false,
    });
  });

  it("skips the network read entirely in localOnly mode", async () => {
    const exec = execBySubcommand({
      forEachRef: ["origin/feat/a", "origin/feat/b"].join("\n"),
    });

    const result = await resolveInFlightBranchSet({ exec, localOnly: true });

    expect(result).toEqual({
      branches: ["feat/a", "feat/b"],
      refs: { "origin/feat/a": "", "origin/feat/b": "" },
      liveRefs: {},
      reachable: false,
    });
    // No `ls-remote` call — the offline view never touches the network.
    const calledLsRemote = vi.mocked(exec).mock.calls.some(([, args]) => args[0] === "ls-remote");
    expect(calledLsRemote).toBe(false);
  });
});
