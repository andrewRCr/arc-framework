/**
 * Unit tests for the session-init errand-state composer — now oracle-backed: it
 * classifies the oracle's in-flight errand entries (enriched with merged + age)
 * and selects the remote-only ones as materialize candidates, while resume and
 * nudge stay independent of discovery.
 */

import { describe, it, expect, vi } from "vitest";

import { runErrandState } from "../../../src/lib/session-init/errand-state.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import type {
  InFlightEntry,
  InFlightErrand,
  InFlightWorkUnit,
} from "../../../src/lib/git/in-flight-derivation.js";

const NOW = "2026-06-01T12:00:00.000Z";
const TODAY = "2026-06-01";
const RECENT = Math.floor(Date.parse("2026-06-01T10:00:00.000Z") / 1000);
const OLD = Math.floor(Date.parse("2026-05-25T10:00:00.000Z") / 1000);

function nudge(shouldNudge = true) {
  return {
    shouldNudge,
    markerPath: ".arc/user/andrew/.internal/errand-reminder-last-nudge.txt",
    today: TODAY,
  };
}

const errand = (over: Partial<InFlightErrand> = {}): InFlightErrand => ({
  kind: "errand",
  slug: "fix-typo",
  branch: "chore/fix-typo",
  remoteOnly: true,
  ...over,
});

const wu = (over: Partial<InFlightWorkUnit> = {}): InFlightWorkUnit => ({
  kind: "work-unit",
  name: "feature-x",
  branch: "feat/feature-x",
  state: "Active",
  remoteOnly: true,
  dependsOn: [],
  ...over,
});

/**
 * Git mock: `for-each-ref` returns the supplied ref/committerdate lines;
 * `merge-base --is-ancestor <ref> <target>` succeeds (merged) when the ref is in
 * the `merged` set, else throws (not merged). No `fetch` — the prune is decoupled.
 */
function buildExec(options: { refs?: string; merged?: readonly string[] } = {}): GitExec {
  const merged = new Set(options.merged ?? []);
  return vi.fn(async (cmd: string, args: string[]) => {
    if (cmd !== "git") throw new Error(`unexpected command: ${cmd}`);
    if (args[0] === "for-each-ref") {
      return { stdout: options.refs ?? "", stderr: "" };
    }
    if (args[0] === "merge-base") {
      const ref = args[2];
      if (ref !== undefined && merged.has(ref)) return { stdout: "", stderr: "" };
      throw new Error("not merged");
    }
    throw new Error(`unexpected git ${args.join(" ")}`);
  });
}

describe("runErrandState", () => {
  it("detects a resumable chore branch without running discovery", async () => {
    const exec = buildExec();

    const result = await runErrandState({
      exec,
      currentBranch: "chore/fix-typo",
      hasBackingMeta: false,
      includeDiscovery: false,
      entries: null,
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(false),
      now: NOW,
    });

    expect(result.resume).toEqual({ resumable: true, slug: "fix-typo" });
    expect(result.inFlight.errands).toEqual([]);
    expect(result.materializable.candidates).toEqual([]);
    expect(result.nudge).toEqual(nudge(false));
    expect(exec).not.toHaveBeenCalled();
  });

  it("reports a meta-backed current chore branch as not resumable (a promoted errand → WU)", async () => {
    const result = await runErrandState({
      exec: buildExec(),
      currentBranch: "chore/promoted",
      hasBackingMeta: true,
      includeDiscovery: false,
      entries: null,
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(false),
      now: NOW,
    });

    expect(result.resume).toEqual({ resumable: false, slug: null });
  });

  it("classifies the oracle's in-flight errand entries (state + age preserved)", async () => {
    const exec = buildExec({
      refs: [
        `refs/heads/chore/local\t${RECENT}`,
        `refs/remotes/origin/chore/review\t${RECENT}`,
        `refs/remotes/origin/chore/done\t${OLD}`,
        `refs/remotes/origin/chore/stale\t${OLD}`,
      ].join("\n"),
      merged: ["origin/chore/done"],
    });

    const entries: InFlightEntry[] = [
      errand({ slug: "local", branch: "chore/local", remoteOnly: false, worktreePath: "/repo" }),
      errand({ slug: "review", branch: "chore/review", pr: { number: 7 } }),
      errand({ slug: "done", branch: "chore/done" }),
      errand({ slug: "stale", branch: "chore/stale" }),
      wu(),
    ];

    const result = await runErrandState({
      exec,
      currentBranch: "main",
      hasBackingMeta: false,
      includeDiscovery: true,
      entries,
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(),
      now: NOW,
    });

    expect(result.inFlight.errands).toEqual([
      { slug: "local", branch: "chore/local", state: "in-progress", ageDays: 0 },
      { slug: "review", branch: "chore/review", state: "awaiting-merge", ageDays: 0 },
      { slug: "done", branch: "chore/done", state: "merged-cleanup", ageDays: 7 },
      { slug: "stale", branch: "chore/stale", state: "stale", ageDays: 7 },
    ]);
    expect(result.nudge).toEqual(nudge());
  });

  it("selects remote-only errand entries as materialize candidates (work units excluded)", async () => {
    const exec = buildExec({
      refs: [
        `refs/remotes/origin/chore/remote-a\t${RECENT}`,
        `refs/heads/chore/local-b\t${RECENT}`,
      ].join("\n"),
    });

    const entries: InFlightEntry[] = [
      errand({ slug: "remote-a", branch: "chore/remote-a" }),
      errand({ slug: "local-b", branch: "chore/local-b", remoteOnly: false, worktreePath: "/wt/b" }),
      wu({ name: "feature-x", branch: "feat/feature-x" }),
    ];

    const result = await runErrandState({
      exec,
      currentBranch: "main",
      hasBackingMeta: false,
      includeDiscovery: true,
      entries,
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(),
      now: NOW,
    });

    expect(result.materializable.candidates).toEqual([
      { slug: "remote-a", branch: "chore/remote-a" },
    ]);
  });

  it("skips discovery with a warning when discovery is requested but the oracle was unavailable", async () => {
    const exec = buildExec();

    const result = await runErrandState({
      exec,
      currentBranch: "main",
      hasBackingMeta: false,
      includeDiscovery: true,
      entries: null,
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(),
      now: NOW,
    });

    expect(result.inFlight.errands).toEqual([]);
    expect(result.materializable.candidates).toEqual([]);
    expect(result.warnings).toContain(
      "Errand discovery skipped because the in-flight oracle was unavailable.",
    );
    expect(exec).not.toHaveBeenCalled();
  });

  it("returns empty discovery with no git reads when the oracle surfaced no errands", async () => {
    const exec = buildExec();

    const result = await runErrandState({
      exec,
      currentBranch: "main",
      hasBackingMeta: false,
      includeDiscovery: true,
      entries: [wu()],
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(),
      now: NOW,
    });

    expect(result.inFlight.errands).toEqual([]);
    expect(result.materializable.candidates).toEqual([]);
    expect(exec).not.toHaveBeenCalled();
  });
});
