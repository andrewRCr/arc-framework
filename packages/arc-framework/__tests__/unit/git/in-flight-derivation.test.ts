import { describe, it, expect, vi } from "vitest";

import { deriveInFlight } from "../../../src/lib/git/in-flight-derivation.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";
import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";

/** A meta-file body carrying the fields the derivation reads (Owner, Design, Cohort, Priority, Depends On). */
function metaContent(
  fields: { owner?: string; design?: string; cohort?: string; priority?: string; dependsOn?: string } = {},
): string {
  return [
    "# Metadata: x",
    "",
    "- **State:** Active",
    `- **Owner:** ${fields.owner ?? "andrew"}`,
    `- **Design:** ${fields.design ?? "[none]"}`,
    `- **Depends On:** ${fields.dependsOn ?? "[none]"}`,
    `- **Cohort:** ${fields.cohort ?? "[none]"}`,
    `- **Priority:** ${fields.priority ?? "[none]"}`,
    "",
    "---",
  ].join("\n");
}

/**
 * Build an exec stub that answers the two reads the derivation makes:
 * `git worktree list --porcelain` (branch → local worktree path) and
 * `git show <ref>:<path>` (meta content, or a not-found throw when absent).
 */
function makeExec(opts: {
  worktrees?: Array<{ path: string; branch: string }>;
  /** Keyed by the `git show` target `"<ref>:<path>"`; present keys resolve, absent keys throw. */
  metas?: Record<string, string>;
}): GitExec {
  const worktrees = opts.worktrees ?? [];
  const metas = opts.metas ?? {};
  return vi.fn(async (_cmd, args): Promise<ExecResult> => {
    if (args[0] === "worktree" && args[1] === "list") {
      const stdout = worktrees
        .map((wt) => `worktree ${wt.path}\nbranch refs/heads/${wt.branch}\n`)
        .join("\n");
      return { stdout, stderr: "" };
    }
    if (args[0] === "show") {
      const target = args[1] ?? "";
      if (target in metas) return { stdout: metas[target] ?? "", stderr: "" };
      throw new Error(`fatal: path does not exist in '${target}'`);
    }
    throw new Error(`unexpected git ${args.join(" ")}`);
  });
}

describe("deriveInFlight", () => {
  it("derives an in-flight work unit with Active state from a meta on a type-prefixed remote branch", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/in-flight-awareness:.arc/active/meta-in-flight-awareness.md": metaContent({
          owner: "andrew",
        }),
      },
    });

    const entries = await deriveInFlight({
      exec,
      branches: ["feat/in-flight-awareness"],
      identity: null,
      teamMode: false,
    });

    expect(entries).toEqual([
      {
        kind: "work-unit",
        branch: "feat/in-flight-awareness",
        name: "in-flight-awareness",
        state: "Active",
        owner: "andrew",
        remoteOnly: true,
        dependsOn: [],
      },
    ]);
  });

  it("derives a plan/-prefixed branch as an in-flight planning work unit", async () => {
    const exec = makeExec({
      metas: {
        "origin/plan/new-thing:.arc/active/meta-new-thing.md": metaContent(),
      },
    });

    const entries = await deriveInFlight({
      exec,
      branches: ["plan/new-thing"],
      identity: null,
      teamMode: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "work-unit", name: "new-thing", state: "Planning" });
  });

  it("classifies a chore/<slug> branch with no backing meta as an in-flight errand, not a work unit", async () => {
    const exec = makeExec({ metas: {} });

    const entries = await deriveInFlight({
      exec,
      branches: ["chore/fix-typo"],
      identity: null,
      teamMode: false,
    });

    expect(entries).toEqual([
      { kind: "errand", branch: "chore/fix-typo", slug: "fix-typo", remoteOnly: true },
    ]);
  });

  it("filters to the current identity (owner-matched), passing through unattributed entries", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/mine:.arc/active/meta-mine.md": metaContent({ owner: "andrew" }),
        "origin/feat/theirs:.arc/active/meta-theirs.md": metaContent({ owner: "blair" }),
        // chore/loose has no meta → an unattributed errand.
      },
    });

    const entries = await deriveInFlight({
      exec,
      branches: ["feat/mine", "feat/theirs", "chore/loose"],
      identity: "andrew",
      teamMode: true,
    });

    expect(entries.map((e) => e.branch)).toEqual(["feat/mine", "chore/loose"]);
  });

  it("resolves the worktree path live for a locally-checked-out WU and omits it for a remote-only WU", async () => {
    const exec = makeExec({
      worktrees: [{ path: "/repos/local", branch: "feat/local" }],
      metas: {
        "origin/feat/local:.arc/active/meta-local.md": metaContent(),
        "origin/feat/remote:.arc/active/meta-remote.md": metaContent(),
      },
    });

    const entries = await deriveInFlight({
      exec,
      branches: ["feat/local", "feat/remote"],
      identity: null,
      teamMode: false,
    });

    const local = entries.find((e) => e.branch === "feat/local");
    const remote = entries.find((e) => e.branch === "feat/remote");
    expect(local).toMatchObject({ worktreePath: "/repos/local", remoteOnly: false });
    expect(remote?.worktreePath).toBeUndefined();
    expect(remote?.remoteOnly).toBe(true);
  });

  it("produces a refs-only view when no PR adapter is injected", async () => {
    const exec = makeExec({
      metas: { "origin/feat/x:.arc/active/meta-x.md": metaContent() },
    });

    const entries = await deriveInFlight({
      exec,
      branches: ["feat/x"],
      identity: null,
      teamMode: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).not.toHaveProperty("pr");
  });

  it("enriches in-flight entries with open-PR state when an adapter is present", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/has-pr:.arc/active/meta-has-pr.md": metaContent(),
        "origin/feat/no-pr:.arc/active/meta-no-pr.md": metaContent(),
      },
    });
    const prSource = vi.fn(async (branches: readonly string[]) => {
      expect(branches).toContain("feat/has-pr");
      return new Map([["feat/has-pr", { number: 42, url: "https://example/pr/42" }]]);
    });

    const entries = await deriveInFlight({
      exec,
      branches: ["feat/has-pr", "feat/no-pr"],
      identity: null,
      teamMode: false,
      prSource,
    });

    const hasPr = entries.find((e) => e.branch === "feat/has-pr");
    const noPr = entries.find((e) => e.branch === "feat/no-pr");
    expect(hasPr?.pr).toEqual({ number: 42, url: "https://example/pr/42" });
    expect(noPr).not.toHaveProperty("pr");
  });

  it("degrades to refs-only without throwing when the PR adapter errors", async () => {
    const exec = makeExec({
      metas: { "origin/feat/x:.arc/active/meta-x.md": metaContent() },
    });
    const prSource = vi.fn(async () => {
      throw new Error("gh: rate limited");
    });

    const entries = await deriveInFlight({
      exec,
      branches: ["feat/x"],
      identity: null,
      teamMode: false,
      prSource,
    });

    expect(prSource).toHaveBeenCalled();
    expect(entries).toHaveLength(1);
    expect(entries[0]).not.toHaveProperty("pr");
  });

  it("surfaces Priority and a parsed Depends On list from the meta", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/x:.arc/active/meta-x.md": metaContent({
          priority: "P1",
          dependsOn: "alpha, bravo",
        }),
      },
    });

    const entries = await deriveInFlight({
      exec,
      branches: ["feat/x"],
      identity: null,
      teamMode: false,
    });

    expect(entries[0]).toMatchObject({ priority: "P1", dependsOn: ["alpha", "bravo"] });
  });

  it("carries Design as the WU's stated scope when the meta sets it", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/x:.arc/active/meta-x.md": metaContent({ design: "spec-x.md" }),
      },
    });

    const entries = await deriveInFlight({
      exec,
      branches: ["feat/x"],
      identity: null,
      teamMode: false,
    });

    expect(entries[0]).toMatchObject({ design: "spec-x.md" });
  });

  it("omits Design when the meta leaves it unset (`[none]`)", async () => {
    const exec = makeExec({
      metas: { "origin/feat/x:.arc/active/meta-x.md": metaContent() },
    });

    const entries = await deriveInFlight({
      exec,
      branches: ["feat/x"],
      identity: null,
      teamMode: false,
    });

    expect(entries[0]).not.toHaveProperty("design");
  });

  it("omits Priority and yields an empty Depends On for an all-default meta", async () => {
    const exec = makeExec({
      metas: { "origin/feat/x:.arc/active/meta-x.md": metaContent() },
    });

    const entries = await deriveInFlight({
      exec,
      branches: ["feat/x"],
      identity: null,
      teamMode: false,
    });

    expect(entries[0]).not.toHaveProperty("priority");
    expect(entries[0]).toMatchObject({ dependsOn: [] });
  });

  it("flags remote-only in-flight WUs as the materialize-candidate signal", async () => {
    const exec = makeExec({
      worktrees: [{ path: "/repos/here", branch: "feat/here" }],
      metas: {
        "origin/feat/here:.arc/active/meta-here.md": metaContent(),
        "origin/feat/elsewhere:.arc/active/meta-elsewhere.md": metaContent(),
      },
    });

    const entries = await deriveInFlight({
      exec,
      branches: ["feat/here", "feat/elsewhere"],
      identity: null,
      teamMode: false,
    });

    const materializable = entries.filter((e) => e.kind === "work-unit" && e.remoteOnly);
    expect(materializable.map((e) => e.branch)).toEqual(["feat/elsewhere"]);
  });
});

describe("deriveInFlight — shared-reader field recovery", () => {
  it("recovers fields from a table-rendered, backticked meta", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/x:.arc/active/meta-x.md": renderMetaFile("x", {
          State: "Active",
          Owner: "andrew",
          Cohort: "core/sub",
          Priority: "P1",
          Design: "spec-x.md",
        }),
      },
    });

    const entries = await deriveInFlight({
      exec,
      branches: ["feat/x"],
      identity: null,
      teamMode: false,
    });

    expect(entries[0]).toMatchObject({
      name: "x",
      owner: "andrew",
      cohort: "core/sub",
      priority: "P1",
      design: "spec-x.md",
    });
  });

  it("degrades a malformed-core-table meta to a WU with absent fields (no crash)", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/x:.arc/active/meta-x.md":
          "# Metadata: x\n\n| State | Owner |\n| --- | --- |\n| `Active` |\n",
      },
    });

    const entries = await deriveInFlight({
      exec,
      branches: ["feat/x"],
      identity: null,
      teamMode: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "work-unit", name: "x" });
    expect(entries[0]).not.toHaveProperty("owner");
  });
});
