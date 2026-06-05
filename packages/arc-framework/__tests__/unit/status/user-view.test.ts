import { describe, it, expect, vi } from "vitest";

import { runStatusUserView } from "../../../src/lib/status/user-view.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";
import type { StatusViewRow } from "../../../src/lib/status/render.js";

/** Default ready-slice source — empty unless a test injects one. */
const noReady = (): Promise<StatusViewRow[]> => Promise.resolve([]);

/** A meta body carrying the fields the oracle reads. */
function metaContent(
  fields: { cohort?: string; class?: string; priority?: string; dependsOn?: string } = {},
): string {
  return [
    "# Metadata: x",
    "",
    "- **State:** Active",
    "- **Owner:** andrew",
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
}): GitExec {
  const metas = opts.metas ?? {};
  return vi.fn(async (_cmd, args): Promise<ExecResult> => {
    if (args[0] === "ls-remote") {
      if (opts.lsRemote === "throw") throw new Error("fatal: could not read from remote");
      return { stdout: opts.lsRemote ?? "", stderr: "" };
    }
    if (args[0] === "for-each-ref") return { stdout: opts.forEachRef ?? "", stderr: "" };
    if (args[0] === "worktree") return { stdout: "", stderr: "" };
    if (args[0] === "show") {
      const target = args[1] ?? "";
      if (target in metas) return { stdout: metas[target] ?? "", stderr: "" };
      throw new Error(`fatal: path does not exist in '${target}'`);
    }
    throw new Error(`unexpected git ${args.join(" ")}`);
  });
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
