import { describe, it, expect, vi } from "vitest";

import {
  deriveInFlight,
  renderInFlightWarning,
  type InFlightWarning,
} from "../../../src/lib/git/in-flight-derivation.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";
import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";

/** A meta-file body carrying the fields the derivation reads (Owner, Design, Cohort, Class, Priority, Depends On). */
function metaContent(
  fields: {
    owner?: string;
    design?: string;
    cohort?: string;
    class?: string;
    priority?: string;
    dependsOn?: string;
  } = {},
): string {
  return [
    "# Metadata: x",
    "",
    "- **State:** Active",
    `- **Owner:** ${fields.owner ?? "andrew"}`,
    `- **Design:** ${fields.design ?? "[none]"}`,
    `- **Depends On:** ${fields.dependsOn ?? "[none]"}`,
    `- **Cohort:** ${fields.cohort ?? "[none]"}`,
    // Class line is omitted unless provided — exercises the field-absent path.
    ...(fields.class !== undefined ? [`- **Class:** ${fields.class}`] : []),
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
  it("returns entries with no warnings and reachable true for a healthy derivation", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/in-flight-awareness:.arc/active/meta-in-flight-awareness.md": metaContent({
          owner: "andrew",
        }),
      },
    });

    const result = await deriveInFlight({
      exec,
      branches: ["feat/in-flight-awareness"],
      identity: null,
      teamMode: false,
      reachable: true,
    });

    expect(result.reachable).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).not.toHaveProperty("marks");
  });

  it("keeps reachability as a result fact instead of warning on an unreachable branch set", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/last-known:.arc/active/meta-last-known.md": metaContent(),
      },
    });

    const result = await deriveInFlight({
      exec,
      branches: ["feat/last-known"],
      identity: null,
      teamMode: false,
      reachable: false,
    });

    expect(result.reachable).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.entries).toHaveLength(1);
  });

  it("renders warnings to a stable string while keeping structured fields", () => {
    const warning: InFlightWarning = {
      code: "meta-enumeration-failed",
      branch: "feat/x",
      workUnit: "x",
      rendered: "Unable to enumerate active metas at `origin/feat/x`.",
    };

    expect(renderInFlightWarning(warning)).toBe("Unable to enumerate active metas at `origin/feat/x`.");
    expect(warning).toMatchObject({
      code: "meta-enumeration-failed",
      branch: "feat/x",
      workUnit: "x",
    });
  });

  it("classifies parked work units without marking them as degraded", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/shelved:.arc/active/meta-shelved.md": metaContent(),
      },
    });

    const { entries, warnings } = await deriveInFlight({
      exec,
      branches: ["feat/shelved"],
      identity: null,
      teamMode: false,
      parkedSlugs: new Set(["shelved"]),
    });

    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "work-unit", name: "shelved", scheduling: "parked" });
    expect(entries[0]).not.toHaveProperty("marks");
  });

  it("derives an in-flight work unit with Active state from a meta on a type-prefixed remote branch", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/in-flight-awareness:.arc/active/meta-in-flight-awareness.md": metaContent({
          owner: "andrew",
        }),
      },
    });

    const { entries } = await deriveInFlight({
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

  it("surfaces the raw Class field on a work unit, keeping [TBD] but dropping an absent field", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/heavy-wu:.arc/active/meta-heavy-wu.md": metaContent({ class: "heavy" }),
        "origin/feat/tbd-wu:.arc/active/meta-tbd-wu.md": metaContent({ class: "[TBD]" }),
        "origin/feat/bare-wu:.arc/active/meta-bare-wu.md": metaContent(),
      },
    });

    const { entries } = await deriveInFlight({
      exec,
      branches: ["feat/heavy-wu", "feat/tbd-wu", "feat/bare-wu"],
      identity: null,
      teamMode: false,
    });

    const byName = new Map(entries.map((e) => [e.kind === "work-unit" ? e.name : e.slug, e]));
    expect(byName.get("heavy-wu")).toMatchObject({ class: "heavy" });
    expect(byName.get("tbd-wu")).toMatchObject({ class: "[TBD]" });
    expect(byName.get("bare-wu")).not.toHaveProperty("class");
  });

  it("derives a plan/-prefixed branch as an in-flight planning work unit", async () => {
    const exec = makeExec({
      metas: {
        "origin/plan/new-thing:.arc/active/meta-new-thing.md": metaContent(),
      },
    });

    const { entries } = await deriveInFlight({
      exec,
      branches: ["plan/new-thing"],
      identity: null,
      teamMode: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "work-unit", name: "new-thing", state: "Planning" });
  });

  it("classifies a branch carrying an errand record as an in-flight errand (slug from the record)", async () => {
    const exec = makeExec({ metas: {} });

    const { entries } = await deriveInFlight({
      exec,
      branches: ["chore/fix-typo"],
      identity: null,
      teamMode: false,
      errandSlugByBranch: new Map([["chore/fix-typo", "fix-typo"]]),
    });

    expect(entries).toEqual([
      { kind: "errand", branch: "chore/fix-typo", slug: "fix-typo", remoteOnly: true },
    ]);
  });

  it("classifies a nature-typed branch (fix/, refactor/) with a record as an errand, not a work unit", async () => {
    const exec = makeExec({ metas: {} });

    const { entries } = await deriveInFlight({
      exec,
      branches: ["fix/login-bug", "refactor/extract-helper"],
      identity: null,
      teamMode: false,
      errandSlugByBranch: new Map([
        ["fix/login-bug", "login-bug"],
        ["refactor/extract-helper", "extract-helper"],
      ]),
    });

    expect(entries).toEqual([
      { kind: "errand", branch: "fix/login-bug", slug: "login-bug", remoteOnly: true },
      { kind: "errand", branch: "refactor/extract-helper", slug: "extract-helper", remoteOnly: true },
    ]);
  });

  it("classifies a record-less branch with a backing meta as a work unit (a promoted errand → WU)", async () => {
    const exec = makeExec({
      metas: {
        "origin/chore/promoted:.arc/active/meta-promoted.md": metaContent({ owner: "andrew" }),
      },
    });

    const { entries } = await deriveInFlight({
      exec,
      branches: ["chore/promoted"],
      identity: null,
      teamMode: false,
      errandSlugByBranch: new Map(),
    });

    expect(entries).toEqual([
      {
        kind: "work-unit",
        branch: "chore/promoted",
        name: "promoted",
        state: "Active",
        owner: "andrew",
        remoteOnly: true,
        dependsOn: [],
      },
    ]);
  });

  it("drops a branch with neither an errand record nor a backing meta (not in flight)", async () => {
    const exec = makeExec({ metas: {} });

    const { entries } = await deriveInFlight({
      exec,
      branches: ["chore/orphan"],
      identity: null,
      teamMode: false,
      errandSlugByBranch: new Map(),
    });

    expect(entries).toEqual([]);
  });

  it("filters to the current identity (owner-matched), passing through unattributed entries", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/mine:.arc/active/meta-mine.md": metaContent({ owner: "andrew" }),
        "origin/feat/theirs:.arc/active/meta-theirs.md": metaContent({ owner: "blair" }),
        // chore/loose has no meta → an unattributed errand.
      },
    });

    const { entries } = await deriveInFlight({
      exec,
      branches: ["feat/mine", "feat/theirs", "chore/loose"],
      identity: "andrew",
      teamMode: true,
      errandSlugByBranch: new Map([["chore/loose", "loose"]]),
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

    const { entries } = await deriveInFlight({
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

    const { entries } = await deriveInFlight({
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

    const { entries } = await deriveInFlight({
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

    const { entries } = await deriveInFlight({
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

    const { entries } = await deriveInFlight({
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

    const { entries } = await deriveInFlight({
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

    const { entries } = await deriveInFlight({
      exec,
      branches: ["feat/x"],
      identity: null,
      teamMode: false,
    });

    expect(entries[0]).not.toHaveProperty("design");
  });

  it("tolerates a two-value Design (per-element render form) as the comma-joined scope string", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/x:.arc/active/meta-x.md": metaContent({ design: "`spec-a.md`, `spec-b.md`" }),
      },
    });

    const { entries } = await deriveInFlight({
      exec,
      branches: ["feat/x"],
      identity: null,
      teamMode: false,
    });

    // The single-string reader carries two refs unchanged — parse strips the
    // per-element backticks globally, leaving the comma-joined value for display.
    expect(entries[0]).toMatchObject({ design: "spec-a.md, spec-b.md" });
  });

  it("omits Priority and yields an empty Depends On for an all-default meta", async () => {
    const exec = makeExec({
      metas: { "origin/feat/x:.arc/active/meta-x.md": metaContent() },
    });

    const { entries } = await deriveInFlight({
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

    const { entries } = await deriveInFlight({
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

    const { entries } = await deriveInFlight({
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

  it("skips a malformed-core-table meta rather than treating it as unattributed", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/x:.arc/active/meta-x.md":
          "# Metadata: x\n\n| State | Owner | Branch | Class | Priority |\n| --- | --- | --- | --- | --- |\n| `Active` |\n",
      },
    });

    const { entries } = await deriveInFlight({
      exec,
      branches: ["feat/x"],
      identity: null,
      teamMode: false,
    });

    expect(entries).toEqual([]);
  });
});
