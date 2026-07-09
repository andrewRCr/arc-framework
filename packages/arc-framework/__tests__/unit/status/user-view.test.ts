import { describe, it, expect, vi } from "vitest";

import { runStatusUserView } from "../../../src/lib/status/user-view.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";
import type { StatusViewRow } from "../../../src/lib/status/render.js";

/** Default ready-slice source — empty unless a test injects one. */
const noReady = (): Promise<StatusViewRow[]> => Promise.resolve([]);

/** A meta body carrying the fields the oracle reads. */
function metaContent(
  fields: {
    state?: string;
    owner?: string;
    branch?: string;
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
    `- **Depends On:** ${fields.dependsOn ?? "[none]"}`,
    `- **Cohort:** ${fields.cohort ?? "[none]"}`,
    ...(fields.class !== undefined ? [`- **Class:** ${fields.class}`] : []),
    `- **Priority:** ${fields.priority ?? "[none]"}`,
    "",
    "---",
  ].join("\n");
}

/**
 * Exec stub answering every read the view makes: `ls-remote` (membership),
 * `for-each-ref` (local tracking refs), `worktree list`, and `git show` (meta).
 */
function makeExec(opts: {
  lsRemote?: string | "throw";
  forEachRef?: string;
  metas?: Record<string, string>;
  worktrees?: Array<{ path: string; branch: string }>;
}): GitExec {
  const metas = opts.metas ?? {};
  const worktreeList = (opts.worktrees ?? [])
    .map((wt) => [
      `worktree ${wt.path}`,
      "HEAD 1111111111111111111111111111111111111111",
      `branch refs/heads/${wt.branch}`,
    ].join("\n"))
    .join("\n\n");
  return vi.fn(async (_cmd, args): Promise<ExecResult> => {
    if (args[0] === "ls-remote") {
      if (opts.lsRemote === "throw") throw new Error("fatal: could not read from remote");
      return { stdout: opts.lsRemote ?? "", stderr: "" };
    }
    if (args[0] === "for-each-ref") return { stdout: opts.forEachRef ?? "", stderr: "" };
    if (args[0] === "worktree") return { stdout: worktreeList, stderr: "" };
    if (args[0] === "ls-tree" && args[1] === "-r") {
      const ref = args[3] ?? "";
      const paths = Object.keys(metas)
        .filter((target) => target.startsWith(`${ref}:`))
        .map((target) => target.slice(target.indexOf(":") + 1));
      return { stdout: paths.join("\n"), stderr: "" };
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

function renderedRowCount(output: string, workUnit: string): number {
  const row = new RegExp(`^\\|\\s+${workUnit}\\s+\\|`, "u");
  return output.split("\n").filter((line) => row.test(line)).length;
}

function renderedRow(workUnit: string, state: string): RegExp {
  return new RegExp(`\\|\\s+${workUnit}\\s+\\|\\s+${state}\\s+\\|`, "u");
}

describe("runStatusUserView", () => {
  it("renders the in-flight-mine table from the oracle for a reachable remote", async () => {
    const exec = makeExec({
      forEachRef: "origin/feat/in-flight-awareness",
      lsRemote: "sha\trefs/heads/feat/in-flight-awareness",
      metas: {
        "origin/feat/in-flight-awareness:.arc/active/meta-in-flight-awareness.md": metaContent({
          cohort: "agile-parallelism",
          class: "heavy",
        }),
      },
    });

    const result = await runStatusUserView({
      exec,
      identity: "andrew",
      teamMode: false,
      localOnly: false,
      readLastRendered: () => Promise.resolve(null),
      readReadyMine: noReady,
    });

    expect(result.source).toBe("rendered");
    expect(result.output).toContain("## In Flight");
    expect(result.output).toContain("| in-flight-awareness | Active | Heavy | —          | agile-parallelism |");
    // No ready WUs injected — the Ready section renders its empty note.
    expect(result.output).toContain("## Ready");
    expect(result.output).toContain("No ready work units for `andrew`.");
  });

  it("merges the local ready slice into a Ready section alongside In Flight", async () => {
    const exec = makeExec({
      forEachRef: "origin/feat/in-flight-awareness",
      lsRemote: "sha\trefs/heads/feat/in-flight-awareness",
      metas: {
        "origin/feat/in-flight-awareness:.arc/active/meta-in-flight-awareness.md": metaContent({
          cohort: "agile-parallelism",
          class: "heavy",
        }),
      },
    });
    const ready: StatusViewRow[] = [
      { workUnit: "ready-thing", state: "Planning", class: "Light", cohort: "ranger", dependsOn: [] },
    ];

    const result = await runStatusUserView({
      exec,
      identity: "andrew",
      teamMode: false,
      localOnly: false,
      readLastRendered: () => Promise.resolve(null),
      readReadyMine: () => Promise.resolve(ready),
    });

    expect(result.source).toBe("rendered");
    expect(result.output).toContain("in-flight-awareness");
    // The ready row renders in the Ready section under its own column set
    // (no State / Depends-on columns — those are constant for ready work).
    expect(result.output).toContain("## Ready");
    expect(result.output).toContain("| ready-thing | Light");
  });

  it("renders a local worktree WU once through the oracle input union", async () => {
    const exec = makeExec({
      forEachRef: "",
      lsRemote: "",
      worktrees: [{ path: "/repo-local", branch: "feat/local" }],
      metas: {
        "feat/local:.arc/active/meta-local.md": metaContent(),
      },
    });

    const result = await runStatusUserView({
      exec,
      identity: "andrew",
      teamMode: false,
      localOnly: false,
      readLastRendered: () => Promise.resolve(null),
      readReadyMine: noReady,
    });

    expect(result.source).toBe("rendered");
    expect(renderedRowCount(result.output, "local")).toBe(1);
  });

  it("renders one row when a renamed local branch shadows a stale tracking twin", async () => {
    const exec = makeExec({
      forEachRef: "origin/plan/renamed",
      lsRemote: "sha\trefs/heads/plan/renamed",
      worktrees: [{ path: "/repo-renamed", branch: "chore/renamed" }],
      metas: {
        "origin/plan/renamed:.arc/active/meta-renamed.md": metaContent({
          branch: "chore/renamed",
          class: "Heavy",
        }),
        "chore/renamed:.arc/active/meta-renamed.md": metaContent({
          class: "Novel",
        }),
      },
    });

    const result = await runStatusUserView({
      exec,
      identity: "andrew",
      teamMode: false,
      localOnly: false,
      readLastRendered: () => Promise.resolve(null),
      readReadyMine: noReady,
    });

    expect(result.source).toBe("rendered");
    expect(renderedRowCount(result.output, "renamed")).toBe(1);
    expect(result.output).toMatch(renderedRow("renamed", "Active"));
    expect(result.output).toContain("Novel");
    expect(result.output).not.toContain("Heavy");
  });

  it("renders parked, integrating, and unknown roster states without clamping them to Active", async () => {
    const exec = makeExec({
      forEachRef: [
        "origin/feat/shelved",
        "origin/feat/integrating",
        "origin/feat/mystery",
      ].join("\n"),
      lsRemote: [
        "sha\trefs/heads/feat/shelved",
        "sha\trefs/heads/feat/integrating",
        "sha\trefs/heads/feat/mystery",
      ].join("\n"),
      metas: {
        "origin/feat/shelved:.arc/active/meta-shelved.md": metaContent(),
        "origin/feat/integrating:.arc/active/meta-integrating.md": metaContent({ state: "Integrating" }),
        "origin/feat/mystery:.arc/active/meta-mystery.md": metaContent({ state: "Paused" }),
      },
    });

    const result = await runStatusUserView({
      exec,
      identity: "andrew",
      teamMode: false,
      localOnly: false,
      parkedSlugs: new Set(["shelved"]),
      readLastRendered: () => Promise.resolve(null),
      readReadyMine: noReady,
    });

    expect(result.source).toBe("rendered");
    expect(result.output).toMatch(renderedRow("shelved", "Parked"));
    expect(result.output).toMatch(renderedRow("integrating", "Integrating"));
    expect(result.output).toMatch(renderedRow("mystery", "unknown"));
    expect(result.output).not.toMatch(renderedRow("shelved", "Active"));
    expect(result.output).not.toMatch(renderedRow("integrating", "Active"));
    expect(result.output).not.toMatch(renderedRow("mystery", "Active"));
    expect(result.warnings.some((line) => line.includes("unrecognized State"))).toBe(true);
  });

  it("renders the Ready section even when no work is in flight", async () => {
    const exec = makeExec({ forEachRef: "", lsRemote: "" });
    const ready: StatusViewRow[] = [
      { workUnit: "ready-thing", state: "Planning", class: "Heavy", dependsOn: [] },
    ];

    const result = await runStatusUserView({
      exec,
      identity: "andrew",
      teamMode: false,
      localOnly: false,
      readLastRendered: () => Promise.resolve(null),
      readReadyMine: () => Promise.resolve(ready),
    });

    expect(result.source).toBe("rendered");
    expect(result.output).toContain("No in-flight work units for `andrew`.");
    expect(result.output).toContain("| ready-thing | Heavy");
  });

  it("degrades to the last-rendered cache when an online remote is unreachable", async () => {
    const exec = makeExec({ lsRemote: "throw", forEachRef: "origin/feat/in-flight-awareness" });
    const cache = "# Status (User): `andrew`\n\n(cached table)\n";

    const result = await runStatusUserView({
      exec,
      identity: "andrew",
      teamMode: false,
      localOnly: false,
      readLastRendered: () => Promise.resolve(cache),
      readReadyMine: noReady,
    });

    expect(result.source).toBe("cache");
    expect(result.output).toBe(cache.trimEnd());
  });

  it("reports when the remote is unreachable and no cache exists", async () => {
    const exec = makeExec({ lsRemote: "throw", forEachRef: "" });

    const result = await runStatusUserView({
      exec,
      identity: "andrew",
      teamMode: false,
      localOnly: false,
      readLastRendered: () => Promise.resolve(null),
      readReadyMine: noReady,
    });

    expect(result.source).toBe("cache-missing");
  });

  it("renders from local refs without a network read in localOnly mode", async () => {
    const exec = makeExec({
      forEachRef: "origin/feat/in-flight-awareness",
      metas: {
        "origin/feat/in-flight-awareness:.arc/active/meta-in-flight-awareness.md": metaContent({
          cohort: "agile-parallelism",
        }),
      },
    });

    const result = await runStatusUserView({
      exec,
      identity: "andrew",
      teamMode: false,
      localOnly: true,
      readLastRendered: () => Promise.resolve(null),
      readReadyMine: noReady,
    });

    expect(result.source).toBe("rendered");
    expect(result.output).toContain("in-flight-awareness");
    const calledLsRemote = vi.mocked(exec).mock.calls.some(([, args]) => args[0] === "ls-remote");
    expect(calledLsRemote).toBe(false);
  });

  it("short-circuits with a status message when identity is unset", async () => {
    const exec = makeExec({});

    const result = await runStatusUserView({
      exec,
      identity: null,
      teamMode: false,
      localOnly: false,
      readLastRendered: () => Promise.resolve(null),
      readReadyMine: noReady,
    });

    expect(result.source).toBe("no-identity");
    expect(vi.mocked(exec)).not.toHaveBeenCalled();
  });
});
