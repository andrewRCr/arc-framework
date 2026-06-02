/**
 * Unit tests for runActiveInFlight — the oracle-backed in-flight set behind
 * `arc active in-flight`. Composes the reachability-aware branch-set resolver
 * with the in-flight oracle; the underlying ref-pruning and classification
 * behavior is covered by remote-ref-reader.test.ts and in-flight-derivation.test.ts.
 * These tests confirm the wiring — entries and the `reachable` flag pass through,
 * and `localOnly` skips the network read.
 */

import { describe, it, expect, vi } from "vitest";

import { runActiveInFlight } from "../../../../src/commands/active/in-flight.js";
import type { ExecResult, GitExec } from "../../../../src/lib/git/exec.js";

const META = [
  "# Metadata: x",
  "",
  "- **State:** Active",
  "- **Owner:** andrew",
  "- **Design:** spec-x.md",
  "",
  "---",
].join("\n");

/**
 * Exec stub answering the four reads the command makes: local remote-tracking
 * refs (`for-each-ref`), live membership (`ls-remote`), the worktree map
 * (`worktree list`), and meta content (`show`).
 */
function makeExec(opts: {
  localRefs: string[];
  liveBranches: string[] | "unreachable";
  metas?: Record<string, string>;
}): GitExec {
  const metas = opts.metas ?? {};
  return vi.fn(async (_cmd, args): Promise<ExecResult> => {
    if (args[0] === "for-each-ref") {
      return { stdout: opts.localRefs.map((b) => `origin/${b}`).join("\n"), stderr: "" };
    }
    if (args[0] === "ls-remote") {
      if (opts.liveBranches === "unreachable") throw new Error("fatal: unreachable");
      return {
        stdout: opts.liveBranches.map((b) => `deadbeef\trefs/heads/${b}`).join("\n"),
        stderr: "",
      };
    }
    if (args[0] === "worktree" && args[1] === "list") return { stdout: "", stderr: "" };
    if (args[0] === "show") {
      const target = args[1] ?? "";
      if (target in metas) return { stdout: metas[target] ?? "", stderr: "" };
      throw new Error(`fatal: path does not exist in '${target}'`);
    }
    throw new Error(`unexpected git ${args.join(" ")}`);
  });
}

describe("runActiveInFlight", () => {
  it("returns oracle entries (work units and errands) with reachable=true when online", async () => {
    const exec = makeExec({
      localRefs: ["feat/x", "chore/fix-typo"],
      liveBranches: ["feat/x", "chore/fix-typo"],
      metas: { "origin/feat/x:.arc/active/meta-x.md": META },
    });

    const result = await runActiveInFlight({ exec, identity: null, teamMode: false, localOnly: false });

    expect(result.reachable).toBe(true);
    expect(result.entries).toEqual([
      {
        kind: "work-unit",
        branch: "feat/x",
        name: "x",
        state: "Active",
        owner: "andrew",
        design: "spec-x.md",
        remoteOnly: true,
        dependsOn: [],
      },
      { kind: "errand", branch: "chore/fix-typo", slug: "fix-typo", remoteOnly: true },
    ]);
  });

  it("prunes a dead local ref absent from live membership", async () => {
    const exec = makeExec({
      localRefs: ["feat/x", "feat/shipped"],
      liveBranches: ["feat/x"],
      metas: {
        "origin/feat/x:.arc/active/meta-x.md": META,
        "origin/feat/shipped:.arc/active/meta-shipped.md": META,
      },
    });

    const result = await runActiveInFlight({ exec, identity: null, teamMode: false, localOnly: false });

    expect(result.entries.map((e) => e.branch)).toEqual(["feat/x"]);
  });

  it("skips the network read under localOnly and reports reachable=false", async () => {
    const exec = makeExec({
      localRefs: ["feat/x"],
      liveBranches: "unreachable",
      metas: { "origin/feat/x:.arc/active/meta-x.md": META },
    });

    const result = await runActiveInFlight({ exec, identity: null, teamMode: false, localOnly: true });

    expect(result.reachable).toBe(false);
    expect(result.entries.map((e) => e.branch)).toEqual(["feat/x"]);
    expect(exec).not.toHaveBeenCalledWith("git", expect.arrayContaining(["ls-remote"]));
  });
});
