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
  "- **State:** __STATE__",
  "- **Owner:** andrew",
  "- **Branch:** __BRANCH__",
  "- **Design:** spec-x.md",
  "",
  "---",
].join("\n");

function meta(state = "Active"): string {
  return META.replaceAll("__STATE__", state);
}

/**
 * Exec stub answering the reads the command makes: local remote-tracking refs
 * (`for-each-ref`), live membership (`ls-remote`), the worktree map (`worktree
 * list`), meta content (`show`), and the errand records keying errand-ness
 * (`ls-tree` + `cat-file` over `refs/arc/user/{identity}/errands`).
 */
function makeExec(opts: {
  localRefs: string[];
  liveBranches: string[] | "unreachable";
  metas?: Record<string, string>;
  errandRecords?: Array<{ slug: string; branch: string }>;
}): GitExec {
  const metas = opts.metas ?? {};
  const errandRecords = opts.errandRecords ?? [];
  const DUMMY_SHA = "0".repeat(40);
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
    if (args[0] === "ls-tree" && args[1] === "-r") {
      const ref = args[3] ?? "";
      const paths = Object.keys(metas)
        .filter((target) => target.startsWith(`${ref}:`))
        .map((target) => target.slice(target.indexOf(":") + 1));
      return { stdout: paths.join("\n"), stderr: "" };
    }
    if (args[0] === "ls-tree") {
      return { stdout: errandRecords.map((r) => `100644 blob ${DUMMY_SHA}\t${r.slug}`).join("\n"), stderr: "" };
    }
    if (args[0] === "cat-file") {
      const target = args[2] ?? "";
      const slug = target.slice(target.lastIndexOf(":") + 1);
      const rec = errandRecords.find((r) => r.slug === slug);
      if (rec === undefined) throw new Error(`fatal: not found ${target}`);
      return {
        stdout: JSON.stringify({
          version: 1,
          slug: rec.slug,
          origin: "description",
          intent: rec.slug,
          branch: rec.branch,
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        stderr: "",
      };
    }
    if (args[0] === "show") {
      const target = args[1] ?? "";
      if (target in metas) {
        const ref = target.slice(0, target.indexOf(":"));
        const branch = ref.startsWith("origin/") ? ref.slice("origin/".length) : ref;
        return { stdout: (metas[target] ?? "").replaceAll("__BRANCH__", branch), stderr: "" };
      }
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
      metas: { "origin/feat/x:.arc/active/meta-x.md": meta() },
      errandRecords: [{ slug: "fix-typo", branch: "chore/fix-typo" }],
    });

    const result = await runActiveInFlight({ exec, identity: "andrew", teamMode: false, localOnly: false });

    expect(result.reachable).toBe(true);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      kind: "work-unit",
      branch: "feat/x",
      name: "x",
      state: "Active",
      owner: "andrew",
      design: "spec-x.md",
      remoteOnly: true,
      dependsOn: [],
    });
    expect(result.entries[1]).toEqual({ kind: "errand", branch: "chore/fix-typo", slug: "fix-typo", remoteOnly: true });
    expect(result.warnings).toEqual([]);
  });

  it("prunes a dead local ref absent from live membership", async () => {
    const exec = makeExec({
      localRefs: ["feat/x", "feat/shipped"],
      liveBranches: ["feat/x"],
      metas: {
        "origin/feat/x:.arc/active/meta-x.md": meta(),
        "origin/feat/shipped:.arc/active/meta-shipped.md": meta(),
      },
    });

    const result = await runActiveInFlight({ exec, identity: null, teamMode: false, localOnly: false });

    expect(result.entries.map((e) => e.branch)).toEqual(["feat/x"]);
  });

  it("passes oracle warnings through with the in-flight result", async () => {
    const exec = makeExec({
      localRefs: ["feat/x"],
      liveBranches: ["feat/x"],
      metas: { "origin/feat/x:.arc/active/meta-x.md": meta("Paused") },
    });

    const result = await runActiveInFlight({ exec, identity: "andrew", teamMode: false, localOnly: false });

    expect(result.entries[0]).toMatchObject({ kind: "work-unit", state: "unknown" });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      code: "state-unrecognized",
      branch: "feat/x",
      workUnit: "x",
    });
  });

  it("skips the network read under localOnly and reports reachable=false", async () => {
    const exec = makeExec({
      localRefs: ["feat/x"],
      liveBranches: "unreachable",
      metas: { "origin/feat/x:.arc/active/meta-x.md": meta() },
    });

    const result = await runActiveInFlight({ exec, identity: null, teamMode: false, localOnly: true });

    expect(result.reachable).toBe(false);
    expect(result.entries.map((e) => e.branch)).toEqual(["feat/x"]);
    expect(exec).not.toHaveBeenCalledWith("git", expect.arrayContaining(["ls-remote"]));
  });
});
