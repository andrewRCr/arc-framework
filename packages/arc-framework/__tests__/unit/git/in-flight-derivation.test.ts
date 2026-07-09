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
    state?: string;
    branch?: string;
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
    `- **State:** ${fields.state ?? "Active"}`,
    `- **Owner:** ${fields.owner ?? "andrew"}`,
    `- **Branch:** ${fields.branch ?? "__BRANCH__"}`,
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
  worktreeSnapshots?: Array<Array<{ path: string; branch: string }>>;
  worktreeError?: boolean;
  localRefs?: string[];
  refSnapshots?: Array<{
    remoteTracking?: Record<string, string>;
    localHeads?: Record<string, string>;
  }>;
  liveBranches?: string[] | "unreachable";
  ancestors?: Array<[ancestor: string, descendant: string]>;
  commitTimes?: Record<string, number>;
  listedPaths?: Record<string, string[]>;
  /** Keyed by the `git show` target `"<ref>:<path>"`; present keys resolve, absent keys throw. */
  metas?: Record<string, string>;
  transientMetaReadFailures?: Record<string, number>;
}): GitExec {
  const worktrees = opts.worktrees ?? [];
  const worktreeSnapshots = opts.worktreeSnapshots ?? null;
  const localRefs = opts.localRefs ?? [];
  const refSnapshots = opts.refSnapshots ?? null;
  const ancestors = new Set((opts.ancestors ?? []).map(([ancestor, descendant]) => `${ancestor}\0${descendant}`));
  const commitTimes = opts.commitTimes ?? {};
  const listedPaths = opts.listedPaths ?? {};
  const metas = opts.metas ?? {};
  const transientMetaReadFailures = { ...(opts.transientMetaReadFailures ?? {}) };
  let refReadCount = 0;
  let worktreeReadCount = 0;
  return vi.fn(async (_cmd, args): Promise<ExecResult> => {
    if (args[0] === "for-each-ref") {
      if (refSnapshots !== null) {
        const snapshot = refSnapshots[Math.min(refReadCount, refSnapshots.length - 1)] ?? {};
        refReadCount += 1;
        const remote = Object.entries(snapshot.remoteTracking ?? {})
          .map(([branch, sha]) => `refs/remotes/origin/${branch}\t${sha}`);
        const local = Object.entries(snapshot.localHeads ?? {})
          .map(([branch, sha]) => `refs/heads/${branch}\t${sha}`);
        return { stdout: [...remote, ...local].join("\n"), stderr: "" };
      }
      return { stdout: localRefs.map((branch) => `origin/${branch}`).join("\n"), stderr: "" };
    }
    if (args[0] === "ls-remote") {
      if (opts.liveBranches === "unreachable") throw new Error("fatal: unreachable");
      return {
        stdout: (opts.liveBranches ?? []).map((branch) => `deadbeef\trefs/heads/${branch}`).join("\n"),
        stderr: "",
      };
    }
    if (args[0] === "worktree" && args[1] === "list") {
      if (opts.worktreeError) throw new Error("fatal: cannot list worktrees");
      const selected = worktreeSnapshots === null
        ? worktrees
        : (worktreeSnapshots[Math.min(worktreeReadCount, worktreeSnapshots.length - 1)] ?? []);
      worktreeReadCount += 1;
      const stdout = selected
        .map((wt) => `worktree ${wt.path}\nbranch refs/heads/${wt.branch}\n`)
        .join("\n");
      return { stdout, stderr: "" };
    }
    if (args[0] === "merge-base" && args[1] === "--is-ancestor") {
      const ancestor = args[2] ?? "";
      const descendant = args[3] ?? "";
      if (ancestors.has(`${ancestor}\0${descendant}`)) return { stdout: "", stderr: "" };
      throw new Error(`${ancestor} is not an ancestor of ${descendant}`);
    }
    if (args[0] === "show") {
      if (args[1] === "-s" && args[2] === "--format=%ct") {
        const ref = args[3] ?? "";
        return { stdout: `${commitTimes[ref] ?? 0}\n`, stderr: "" };
      }
      const target = args[1] ?? "";
      const remainingFailures = transientMetaReadFailures[target] ?? 0;
      if (remainingFailures > 0) {
        transientMetaReadFailures[target] = remainingFailures - 1;
        throw new Error(`fatal: transient read failure for '${target}'`);
      }
      if (target in metas) {
        const ref = target.slice(0, target.indexOf(":"));
        const branch = ref.startsWith("origin/") ? ref.slice("origin/".length) : ref;
        return { stdout: (metas[target] ?? "").replaceAll("__BRANCH__", branch), stderr: "" };
      }
      throw new Error(`fatal: path does not exist in '${target}'`);
    }
    if (args[0] === "ls-tree") {
      const ref = args[3] ?? "";
      const paths = listedPaths[ref] ?? Object.keys(metas)
        .filter((target) => target.startsWith(`${ref}:`))
        .map((target) => target.slice(target.indexOf(":") + 1));
      return { stdout: paths.join("\n"), stderr: "" };
    }
    throw new Error(`unexpected git ${args.join(" ")}`);
  });
}

function expectWorkUnit(entries: Awaited<ReturnType<typeof deriveInFlight>>["entries"], name: string) {
  const entry = entries.find((item) => item.kind === "work-unit" && item.name === name);
  expect(entry).toBeDefined();
  return entry as Extract<(typeof entries)[number], { kind: "work-unit" }>;
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

  it("derives normally from an agreeing double-read input snapshot", async () => {
    const refs = { remoteTracking: { "feat/x": "aaa111" } };
    const exec = makeExec({
      refSnapshots: [refs, refs],
      liveBranches: ["feat/x"],
      metas: {
        "origin/feat/x:.arc/active/meta-x.md": metaContent({ branch: "feat/x" }),
      },
    });

    const result = await deriveInFlight({
      exec,
      identity: null,
      teamMode: false,
    });

    expect(result.snapshot).toEqual({
      refs: { "origin/feat/x": "aaa111" },
      worktrees: {},
    });
    expect(result).not.toHaveProperty("marks");
    expect(result.entries[0]).not.toHaveProperty("marks");
    expect(result.warnings).toEqual([]);
  });

  it("marks the affected entry indeterminate when a ref tip changes between reads", async () => {
    const exec = makeExec({
      refSnapshots: [
        { remoteTracking: { "feat/x": "aaa111" } },
        { remoteTracking: { "feat/x": "bbb222" } },
      ],
      liveBranches: ["feat/x"],
      metas: {
        "origin/feat/x:.arc/active/meta-x.md": metaContent({ branch: "feat/x" }),
      },
    });

    const result = await deriveInFlight({
      exec,
      identity: null,
      teamMode: false,
    });

    expect(result).not.toHaveProperty("marks");
    expect(result.entries[0]).toMatchObject({ kind: "work-unit", name: "x", marks: ["indeterminate"] });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "input-snapshot-disagreement", branch: "feat/x" }),
      ]),
    );
  });

  it("marks the affected entry indeterminate when a worktree path changes between reads", async () => {
    const refs = { localHeads: { "feat/local": "ccc333" } };
    const exec = makeExec({
      refSnapshots: [refs, refs],
      worktreeSnapshots: [
        [{ path: "/repo-a", branch: "feat/local" }],
        [{ path: "/repo-b", branch: "feat/local" }],
      ],
      liveBranches: [],
      metas: {
        "feat/local:.arc/active/meta-local.md": metaContent({ branch: "feat/local" }),
      },
    });

    const result = await deriveInFlight({
      exec,
      identity: null,
      teamMode: false,
    });

    expect(result).not.toHaveProperty("marks");
    expect(result.entries[0]).toMatchObject({
      kind: "work-unit",
      name: "local",
      worktreePath: "/repo-a",
      marks: ["indeterminate"],
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "input-snapshot-disagreement", branch: "feat/local" }),
      ]),
    );
  });

  it("marks the whole result indeterminate when the input key set changes between reads", async () => {
    const exec = makeExec({
      refSnapshots: [
        { remoteTracking: { "feat/x": "aaa111" } },
        { remoteTracking: { "feat/x": "aaa111", "feat/y": "bbb222" } },
      ],
      liveBranches: ["feat/x", "feat/y"],
      metas: {
        "origin/feat/x:.arc/active/meta-x.md": metaContent({ branch: "feat/x" }),
      },
    });

    const result = await deriveInFlight({
      exec,
      identity: null,
      teamMode: false,
    });

    expect(result.marks).toEqual(["indeterminate"]);
    expect(result.entries[0]).not.toHaveProperty("marks");
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "input-snapshot-disagreement" }),
      ]),
    );
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

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "work-unit",
      branch: "feat/in-flight-awareness",
      name: "in-flight-awareness",
      state: "Active",
      owner: "andrew",
      remoteOnly: true,
      dependsOn: [],
    });
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

  it("uses the meta State field instead of the plan/ branch prefix for work-unit state", async () => {
    const exec = makeExec({
      metas: {
        "origin/plan/new-thing:.arc/active/meta-new-thing.md": metaContent({
          state: "Active",
          branch: "plan/new-thing",
        }),
      },
    });

    const { entries } = await deriveInFlight({
      exec,
      branches: ["plan/new-thing"],
      identity: null,
      teamMode: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "work-unit", name: "new-thing", state: "Active" });
  });

  it("keeps an Integrating meta as a roster entry with its State intact", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/review-me:.arc/active/meta-review-me.md": metaContent({
          state: "Integrating",
          branch: "feat/review-me",
        }),
      },
    });

    const { entries } = await deriveInFlight({
      exec,
      branches: ["feat/review-me"],
      identity: null,
      teamMode: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "work-unit",
      branch: "feat/review-me",
      name: "review-me",
      state: "Integrating",
      owner: "andrew",
      remoteOnly: true,
      dependsOn: [],
    });
  });

  it("excludes the configured base branch even when lifecycle residue carries active metas", async () => {
    const exec = makeExec({
      metas: {
        "origin/main:.arc/active/meta-merged.md": metaContent({
          state: "Active",
          branch: "feat/merged",
        }),
      },
    });

    const { entries, warnings } = await deriveInFlight({
      exec,
      branches: ["main"],
      identity: null,
      teamMode: false,
      baseBranch: "main",
    });

    expect(entries).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("treats a single meta whose Branch points elsewhere as a stale-location candidate, not an entry", async () => {
    const exec = makeExec({
      metas: {
        "origin/plan/renamed:.arc/active/meta-renamed.md": metaContent({
          branch: "feat/renamed",
        }),
      },
    });

    const { entries, warnings } = await deriveInFlight({
      exec,
      branches: ["plan/renamed"],
      identity: null,
      teamMode: false,
    });

    expect(entries).toEqual([]);
    expect(warnings).toMatchObject([
      {
        code: "stale-location-dropped",
        branch: "plan/renamed",
        workUnit: "renamed",
      },
    ]);
  });

  it("keeps a degraded entry when a meta has no usable Branch field", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/no-branch:.arc/active/meta-no-branch.md": metaContent({
          branch: "[none]",
        }),
      },
    });

    const { entries, warnings } = await deriveInFlight({
      exec,
      branches: ["feat/no-branch"],
      identity: null,
      teamMode: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "work-unit",
      name: "no-branch",
      branch: "feat/no-branch",
      marks: ["degraded"],
    });
    expect(warnings).toMatchObject([
      {
        code: "branch-field-missing",
        branch: "feat/no-branch",
        workUnit: "no-branch",
      },
    ]);
  });

  it("marks an unrecognized State value instead of silently dropping the work unit", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/odd-state:.arc/active/meta-odd-state.md": metaContent({
          state: "Paused",
          branch: "feat/odd-state",
        }),
      },
    });

    const { entries, warnings } = await deriveInFlight({
      exec,
      branches: ["feat/odd-state"],
      identity: null,
      teamMode: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "work-unit",
      name: "odd-state",
      state: "unknown",
      marks: ["degraded"],
    });
    expect(warnings).toMatchObject([
      {
        code: "state-unrecognized",
        branch: "feat/odd-state",
        workUnit: "odd-state",
      },
    ]);
  });

  it("resolves a multi-meta ref by Branch field match and warns on unmatched metas", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/live:.arc/active/meta-live.md": metaContent({
          branch: "feat/live",
        }),
        "origin/feat/live:.arc/active/meta-shadow.md": metaContent({
          branch: "feat/shadow",
        }),
      },
    });

    const { entries, warnings } = await deriveInFlight({
      exec,
      branches: ["feat/live"],
      identity: null,
      teamMode: false,
    });

    expect(entries.map((entry) => entry.kind === "work-unit" ? entry.name : entry.slug)).toEqual(["live"]);
    expect(warnings).toMatchObject([
      {
        code: "stale-location-shadow",
        branch: "feat/live",
        workUnit: "shadow",
      },
    ]);
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

  it("keeps errand-record identity authoritative even when the branch carries a meta", async () => {
    const exec = makeExec({
      metas: {
        "origin/chore/fix-typo:.arc/active/meta-fix-typo.md": metaContent(),
      },
    });

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

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "work-unit",
      branch: "chore/promoted",
      name: "promoted",
      state: "Active",
      owner: "andrew",
      remoteOnly: true,
      dependsOn: [],
    });
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
        "feat/local:.arc/active/meta-local.md": metaContent({ branch: "feat/local" }),
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

describe("deriveInFlight input union", () => {
  it("derives a local worktree branch that is absent from the remote", async () => {
    const exec = makeExec({
      worktrees: [{ path: "/repo.local-only", branch: "feat/local-only" }],
      localRefs: [],
      liveBranches: [],
      metas: {
        "feat/local-only:.arc/active/meta-local-only.md": metaContent({
          branch: "feat/local-only",
        }),
      },
    });

    const { entries, reachable } = await deriveInFlight({
      exec,
      localOnly: false,
      identity: null,
      teamMode: false,
    });

    expect(reachable).toBe(true);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "work-unit",
      branch: "feat/local-only",
      name: "local-only",
      state: "Active",
      owner: "andrew",
      worktreePath: "/repo.local-only",
      remoteOnly: false,
      dependsOn: [],
    });
  });

  it("derives a branch present in both sources once", async () => {
    const exec = makeExec({
      worktrees: [{ path: "/repo.x", branch: "feat/x" }],
      localRefs: ["feat/x"],
      liveBranches: ["feat/x"],
      metas: {
        "feat/x:.arc/active/meta-x.md": metaContent({ branch: "feat/x" }),
        "origin/feat/x:.arc/active/meta-x.md": metaContent({ branch: "feat/x" }),
      },
    });

    const { entries } = await deriveInFlight({
      exec,
      localOnly: false,
      identity: null,
      teamMode: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "work-unit",
      branch: "feat/x",
      worktreePath: "/repo.x",
      remoteOnly: false,
    });
  });

  it("keeps remote-only behavior for refs with no local worktree", async () => {
    const exec = makeExec({
      localRefs: ["feat/remote"],
      liveBranches: ["feat/remote"],
      metas: {
        "origin/feat/remote:.arc/active/meta-remote.md": metaContent({
          branch: "feat/remote",
        }),
      },
    });

    const { entries } = await deriveInFlight({
      exec,
      localOnly: false,
      identity: null,
      teamMode: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "work-unit",
      branch: "feat/remote",
      remoteOnly: true,
    });
  });

  it("classifies a preserved parked branch through the injected parked slug set", async () => {
    const exec = makeExec({
      worktrees: [{ path: "/repo.shelved", branch: "feat/shelved" }],
      metas: {
        "feat/shelved:.arc/active/meta-shelved.md": metaContent({
          state: "Active",
          branch: "feat/shelved",
        }),
      },
    });

    const { entries } = await deriveInFlight({
      exec,
      localOnly: true,
      identity: null,
      teamMode: false,
      parkedSlugs: new Set(["shelved"]),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "work-unit",
      name: "shelved",
      scheduling: "parked",
      remoteOnly: false,
    });
  });
});

describe("deriveInFlight candidate dedupe", () => {
  it("prefers a location-consistent local worktree over a stale remote ref with provenance", async () => {
    const exec = makeExec({
      worktrees: [{ path: "/repo.renamed", branch: "chore/renamed" }],
      localRefs: ["plan/renamed"],
      liveBranches: ["plan/renamed"],
      metas: {
        "origin/plan/renamed:.arc/active/meta-renamed.md": metaContent({
          branch: "chore/renamed",
        }),
        "chore/renamed:.arc/active/meta-renamed.md": metaContent({
          branch: "chore/renamed",
        }),
      },
    });

    const { entries, warnings } = await deriveInFlight({
      exec,
      localOnly: false,
      identity: null,
      teamMode: false,
    });

    expect(entries).toHaveLength(1);
    const entry = expectWorkUnit(entries, "renamed");
    expect(entry).toMatchObject({
      branch: "chore/renamed",
      worktreePath: "/repo.renamed",
      remoteOnly: false,
      provenance: [
        {
          branch: "plan/renamed",
          ref: "origin/plan/renamed",
          source: "remote-live",
          relation: "stale",
          selected: false,
        },
        {
          branch: "chore/renamed",
          ref: "chore/renamed",
          source: "worktree",
          relation: "consistent",
          selected: true,
        },
      ],
    });
    expect(warnings).toMatchObject([
      {
        code: "stale-location-shadow",
        branch: "plan/renamed",
        workUnit: "renamed",
      },
    ]);
  });

  it("dedupes two live remote refs for the same WU and warns on the shadowed ref", async () => {
    const exec = makeExec({
      localRefs: ["feat/old", "feat/new"],
      liveBranches: ["feat/old", "feat/new"],
      commitTimes: {
        "origin/feat/old": 10,
        "origin/feat/new": 20,
      },
      metas: {
        "origin/feat/old:.arc/active/meta-widget.md": metaContent({ branch: "feat/old" }),
        "origin/feat/new:.arc/active/meta-widget.md": metaContent({ branch: "feat/new" }),
      },
    });

    const { entries, warnings } = await deriveInFlight({
      exec,
      localOnly: false,
      identity: null,
      teamMode: false,
    });

    expect(entries).toHaveLength(1);
    const entry = expectWorkUnit(entries, "widget");
    expect(entry.branch).toBe("feat/new");
    expect(entry.provenance?.map((candidate) => ({
      branch: candidate.branch,
      source: candidate.source,
      selected: candidate.selected,
    }))).toEqual([
      { branch: "feat/old", source: "remote-live", selected: false },
      { branch: "feat/new", source: "remote-live", selected: true },
    ]);
    expect(warnings).toMatchObject([
      {
        code: "candidate-shadowed",
        branch: "feat/old",
        workUnit: "widget",
      },
    ]);
  });

  it("uses worktree content when a branch is present in both sources with divergent metas", async () => {
    const exec = makeExec({
      worktrees: [{ path: "/repo.x", branch: "feat/x" }],
      localRefs: ["feat/x"],
      liveBranches: ["feat/x"],
      metas: {
        "origin/feat/x:.arc/active/meta-x.md": metaContent({
          state: "Planning",
          branch: "feat/x",
          owner: "remote-owner",
        }),
        "feat/x:.arc/active/meta-x.md": metaContent({
          state: "Active",
          branch: "feat/x",
          owner: "local-owner",
        }),
      },
    });

    const { entries } = await deriveInFlight({
      exec,
      localOnly: false,
      identity: null,
      teamMode: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "work-unit",
      branch: "feat/x",
      state: "Active",
      owner: "local-owner",
      worktreePath: "/repo.x",
      remoteOnly: false,
    });
  });

  it("keeps distinct WUs on similarly named branches as separate entries", async () => {
    const exec = makeExec({
      localRefs: ["feat/shared", "plan/shared"],
      liveBranches: ["feat/shared", "plan/shared"],
      metas: {
        "origin/feat/shared:.arc/active/meta-alpha.md": metaContent({ branch: "feat/shared" }),
        "origin/plan/shared:.arc/active/meta-beta.md": metaContent({ branch: "plan/shared" }),
      },
    });

    const { entries } = await deriveInFlight({
      exec,
      localOnly: false,
      identity: null,
      teamMode: false,
    });

    expect(entries.map((entry) => entry.kind === "work-unit" ? entry.name : entry.slug)).toEqual([
      "alpha",
      "beta",
    ]);
  });
});

describe("deriveInFlight offline candidate collapse", () => {
  it("prefers a descendant tip before State and marks the survivor location-ambiguous", async () => {
    const exec = makeExec({
      localRefs: ["feat/widget", "plan/widget"],
      liveBranches: "unreachable",
      ancestors: [["origin/feat/widget", "origin/plan/widget"]],
      metas: {
        "origin/feat/widget:.arc/active/meta-widget.md": metaContent({
          state: "Active",
          branch: "feat/widget",
        }),
        "origin/plan/widget:.arc/active/meta-widget.md": metaContent({
          state: "Planning",
          branch: "plan/widget",
        }),
      },
    });

    const { entries, warnings, reachable } = await deriveInFlight({
      exec,
      localOnly: false,
      identity: null,
      teamMode: false,
    });

    expect(reachable).toBe(false);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "work-unit",
      branch: "plan/widget",
      state: "Planning",
      marks: ["location-ambiguous"],
    });
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "location-ambiguous",
          branch: "plan/widget",
          workUnit: "widget",
        }),
      ]),
    );
  });

  it("uses furthest-along State for genuine offline forks", async () => {
    const exec = makeExec({
      localRefs: ["plan/widget", "feat/widget"],
      liveBranches: "unreachable",
      metas: {
        "origin/plan/widget:.arc/active/meta-widget.md": metaContent({
          state: "Planning",
          branch: "plan/widget",
        }),
        "origin/feat/widget:.arc/active/meta-widget.md": metaContent({
          state: "Active",
          branch: "feat/widget",
        }),
      },
    });

    const { entries } = await deriveInFlight({
      localOnly: false,
      exec,
      identity: null,
      teamMode: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "work-unit", branch: "feat/widget", state: "Active" });
  });

  it("breaks full offline ties by newest commit and then lexicographic branch name", async () => {
    const exec = makeExec({
      localRefs: ["feat/older", "feat/newer", "feat/zulu", "feat/alpha"],
      liveBranches: "unreachable",
      commitTimes: {
        "origin/feat/older": 10,
        "origin/feat/newer": 20,
        "origin/feat/zulu": 30,
        "origin/feat/alpha": 30,
      },
      metas: {
        "origin/feat/older:.arc/active/meta-clock.md": metaContent({ branch: "feat/older" }),
        "origin/feat/newer:.arc/active/meta-clock.md": metaContent({ branch: "feat/newer" }),
        "origin/feat/zulu:.arc/active/meta-name.md": metaContent({ branch: "feat/zulu" }),
        "origin/feat/alpha:.arc/active/meta-name.md": metaContent({ branch: "feat/alpha" }),
      },
    });

    const { entries } = await deriveInFlight({
      localOnly: false,
      exec,
      identity: null,
      teamMode: false,
    });

    const byName = new Map(entries.map((entry) => [entry.kind === "work-unit" ? entry.name : entry.slug, entry]));
    expect(byName.get("clock")).toMatchObject({ branch: "feat/newer" });
    expect(byName.get("name")).toMatchObject({ branch: "feat/alpha" });
  });
});

describe("deriveInFlight degradation warnings", () => {
  it("marks entries degraded when the worktree list cannot be read", async () => {
    const exec = makeExec({
      worktreeError: true,
      metas: {
        "origin/feat/x:.arc/active/meta-x.md": metaContent({ branch: "feat/x" }),
      },
    });

    const { entries, warnings } = await deriveInFlight({
      exec,
      branches: ["feat/x"],
      identity: null,
      teamMode: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "work-unit",
      name: "x",
      marks: ["degraded"],
    });
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "worktree-list-failed",
        }),
      ]),
    );
  });

  it("retries a failed meta read once before degrading the entry", async () => {
    const target = "origin/feat/flaky:.arc/active/meta-flaky.md";
    const exec = makeExec({
      metas: {
        [target]: metaContent({ branch: "feat/flaky" }),
      },
      transientMetaReadFailures: {
        [target]: 1,
      },
    });

    const { entries, warnings } = await deriveInFlight({
      exec,
      branches: ["feat/flaky"],
      identity: null,
      teamMode: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).not.toHaveProperty("marks");
    expect(warnings).toEqual([]);
    const metaReads = vi.mocked(exec).mock.calls.filter(([, args]) => args[0] === "show" && args[1] === target);
    expect(metaReads).toHaveLength(2);
  });

  it("warns and marks an unreadable meta at a ref instead of dropping it", async () => {
    const exec = makeExec({
      listedPaths: {
        "origin/feat/broken": [".arc/active/meta-broken.md"],
      },
    });

    const { entries, warnings } = await deriveInFlight({
      exec,
      branches: ["feat/broken"],
      identity: null,
      teamMode: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "work-unit",
      name: "broken",
      state: "unknown",
      marks: ["degraded"],
    });
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "meta-read-failed",
          branch: "feat/broken",
          workUnit: "broken",
        }),
      ]),
    );
  });
});

describe("deriveInFlight — shared-reader field recovery", () => {
  it("recovers fields from a table-rendered, backticked meta", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/x:.arc/active/meta-x.md": renderMetaFile("x", {
          State: "Active",
          Owner: "andrew",
          Branch: "feat/x",
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

  it("warns and marks a malformed-core-table meta rather than dropping it", async () => {
    const exec = makeExec({
      metas: {
        "origin/feat/x:.arc/active/meta-x.md":
          "# Metadata: x\n\n| State | Owner | Branch | Class | Priority |\n| --- | --- | --- | --- | --- |\n| `Active` |\n",
      },
    });

    const { entries, warnings } = await deriveInFlight({
      exec,
      branches: ["feat/x"],
      identity: null,
      teamMode: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "work-unit",
      name: "x",
      state: "unknown",
      marks: ["degraded"],
    });
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "meta-malformed",
          branch: "feat/x",
          workUnit: "x",
        }),
      ]),
    );
  });
});
