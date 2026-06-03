import { describe, it, expect, vi } from "vitest";

import {
  fetchRefBounded,
  listLiveRemoteBranches,
  listPrunedRemoteTrackingBranches,
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

describe("resolveInFlightBranchSet", () => {
  it("returns the pruned set and reachable: true when live membership is read", async () => {
    const exec = execBySubcommand({
      forEachRef: ["origin/feat/a", "origin/chore/old-merged"].join("\n"),
      lsRemote: ["sha1\trefs/heads/feat/a", "sha2\trefs/heads/feat/b"].join("\n"),
    });

    const result = await resolveInFlightBranchSet({ exec });

    expect(result).toEqual({ branches: ["feat/a"], reachable: true });
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

    expect(result).toEqual({ branches: ["feat/a", "chore/old"], reachable: false });
  });

  it("skips the network read entirely in localOnly mode", async () => {
    const exec = execBySubcommand({
      forEachRef: ["origin/feat/a", "origin/feat/b"].join("\n"),
    });

    const result = await resolveInFlightBranchSet({ exec, localOnly: true });

    expect(result).toEqual({ branches: ["feat/a", "feat/b"], reachable: false });
    // No `ls-remote` call — the offline view never touches the network.
    const calledLsRemote = vi.mocked(exec).mock.calls.some(([, args]) => args[0] === "ls-remote");
    expect(calledLsRemote).toBe(false);
  });
});
