import { describe, it, expect, vi } from "vitest";

import {
  fetchRefBounded,
  listLiveRemoteBranches,
  listMetaPathsAtRef,
  listPrunedRemoteTrackingBranches,
  readLocalInFlightRefSnapshot,
  readMetaAtRef,
  resolveInFlightBranchSet,
} from "../../../src/lib/git/remote-ref-reader.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";

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

describe("listLiveRemoteBranches", () => {
  it("enumerates live remote branch names from git ls-remote --heads origin", async () => {
    const exec = execReturning(
      [
        "abc123\trefs/heads/main",
        "def456\trefs/heads/feat/in-flight-awareness",
        "789aaa\trefs/heads/chore/fix-typo",
      ].join("\n"),
    );

    const result = await listLiveRemoteBranches({ exec });

    expect(result).toEqual(["main", "feat/in-flight-awareness", "chore/fix-typo"]);
  });

  it("uses the configured remote for live membership", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      expect(args).toEqual(["ls-remote", "--heads", "upstream"]);
      return { stdout: "abc123\trefs/heads/feat/x\n", stderr: "" };
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

describe("fetchRefBounded", () => {
  it("fetches the candidate ref with an abort signal and reports success", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args, options): Promise<ExecResult> => {
      expect(args).toEqual(["fetch", "origin", "feat/remote-only"]);
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      return { stdout: "", stderr: "" };
    });

    const result = await fetchRefBounded({ exec, branch: "feat/remote-only", timeoutMs: 2000 });

    expect(result).toBe(true);
  });

  it("uses the configured remote for bounded fetches", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      expect(args).toEqual(["fetch", "upstream", "feat/remote-only"]);
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
      expect(args).toEqual(["ls-tree", "-r", "--name-only", "origin/feat/x", ".arc/active/"]);
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
      lsRemote: ["sha1\trefs/heads/feat/a", "sha2\trefs/heads/feat/b"].join("\n"),
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
      lsRemote: ["live-a\trefs/heads/feat/a", "live-b\trefs/heads/feat/b"].join("\n"),
    });

    const result = await resolveInFlightBranchSet({ exec });

    expect(result).toEqual({
      branches: ["feat/a"],
      refs: { "origin/feat/a": "local-a" },
      liveRefs: { "origin/feat/a": "live-a", "origin/feat/b": "live-b" },
      reachable: true,
    });
  });

  it("keys selected refs and live refs with the configured remote", async () => {
    const exec = execBySubcommand({
      forEachRef: "refs/remotes/upstream/feat/a\tlocal-a",
      lsRemote: "live-a\trefs/heads/feat/a",
    });

    const result = await resolveInFlightBranchSet({ exec, remote: "upstream" });

    expect(result).toEqual({
      branches: ["feat/a"],
      refs: { "upstream/feat/a": "local-a" },
      liveRefs: { "upstream/feat/a": "live-a" },
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
