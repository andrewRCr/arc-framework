/**
 * Unit tests for the session-init errand-state composer — oracle-backed for
 * presence/merge/age and record-backed for identity: it resolves each errand's
 * slug from the injected records (a branch→slug index), classifies the oracle's
 * in-flight errand entries, and selects the remote-only ones as materialize
 * candidates, while resume and nudge stay independent of discovery. A branch
 * with no identity degrades to its branch-derived slug.
 */

import { describe, it, expect, vi } from "vitest";

import { runErrandState } from "../../../src/lib/session-init/errand-state.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import type {
  InFlightEntry,
  InFlightErrand,
  InFlightResidue,
  InFlightWorkUnit,
} from "../../../src/lib/git/in-flight-derivation.js";
import {
  TransientIdentityRecordV3Schema,
  type TransientIdentityRecord,
} from "../../../src/lib/errand/identity-record.js";
import type { OrdinaryErrandRecord } from "../../../src/lib/errand/identity-transitions.js";
import { locusStateFixture } from "../../fixtures/locus-state.js";

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

type OrdinaryRecordOverrides = Omit<Partial<OrdinaryErrandRecord>, "slug"> & { slug?: string };

const record = (over: OrdinaryRecordOverrides = {}): TransientIdentityRecord =>
  TransientIdentityRecordV3Schema.parse({
  version: 3,
  kind: "errand",
  slug: "fix-typo",
  claimId: "b".repeat(32),
  purpose: "errand",
  origin: "description",
  originEntry: null,
  intent: "fix the typo",
  branch: "chore/fix-typo",
  state: "open",
  savedHead: null,
  changeRequest: null,
  createdAt: "2026-06-01T09:00:00.000Z",
  updatedAt: "2026-06-01T09:00:00.000Z",
    ...over,
  });

const paused = (over: OrdinaryRecordOverrides = {}): TransientIdentityRecord =>
  TransientIdentityRecordV3Schema.parse({
  version: 3,
  slug: "fix-typo",
  claimId: "c".repeat(32),
  createdAt: "2026-06-01T09:00:00.000Z",
  updatedAt: "2026-06-01T10:00:00.000Z",
  kind: "errand",
  purpose: "errand",
  intent: "fix typo",
  branch: "chore/fix-typo",
  origin: "inbox",
  originEntry: "Fix typo",
  originEntrySourceDigest: `sha256:${"d".repeat(64)}`,
  state: "paused",
  savedHead: "a".repeat(40),
  changeRequest: null,
    ...over,
  });

/**
 * Git mock: `for-each-ref` returns the supplied ref/committerdate lines;
 * `cherry <base> <ref>` reports landed (empty output) when the ref is in the
 * `merged` set, else lists an unmerged commit (`+ <sha>`). No `fetch` — the prune
 * is decoupled.
 */
function buildExec(options: { refs?: string; merged?: readonly string[] } = {}): GitExec {
  const merged = new Set(options.merged ?? []);
  return vi.fn(async (cmd: string, args: string[]) => {
    if (cmd !== "git") throw new Error(`unexpected command: ${cmd}`);
    if (args[0] === "for-each-ref") {
      return { stdout: options.refs ?? "", stderr: "" };
    }
    if (args[0] === "cherry") {
      const ref = args[2];
      if (ref !== undefined && merged.has(ref)) return { stdout: "", stderr: "" };
      return { stdout: "+ deadbeef\n", stderr: "" };
    }
    throw new Error(`unexpected git ${args.join(" ")}`);
  });
}

describe("runErrandState", () => {
  it("surfaces locus identity tails in their fixed reader-owned action order", async () => {
    const identity = {
      kind: "errand" as const,
      key: "fix-typo",
      claimId: "c".repeat(32),
      protection: "full" as const,
      branch: "chore/fix-typo",
      purpose: "errand" as const,
      origin: "inbox" as const,
      originEntry: "Fix typo",
      originEntrySourceDigest: `sha256:${"d".repeat(64)}`,
      state: "paused" as const,
      savedHead: "a".repeat(40),
      changeRequest: null,
    };
    const locusState = locusStateFixture({
      rows: [],
      inFlightIdentities: [{ identity, actions: ["resume", "abandon"] }],
    });
    const result = await runErrandState({
      exec: buildExec(), currentBranch: "main", hasBackingMeta: false, includeDiscovery: false,
      entries: null, records: [], remoteTips: new Map(), recordsComplete: true,
      baseBranch: "main", staleThresholdDays: 1, nudge: nudge(false), locusState,
    });

    expect(result.identities).toEqual([{ identity, actions: ["resume", "abandon"] }]);
  });

  it("resolves a resumable current branch from its record, without running discovery", async () => {
    const exec = buildExec();

    const result = await runErrandState({
      exec,
      currentBranch: "chore/extract-helper",
      hasBackingMeta: false,
      includeDiscovery: false,
      entries: null,
      records: [record({ slug: "extract-helper", branch: "chore/extract-helper" })],
      remoteTips: new Map(),
      recordsComplete: true,
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(false),
      now: NOW,
    });

    expect(result.resume).toEqual({ resumable: true, slug: "extract-helper" });
    expect(result.inFlight.errands).toEqual([]);
    expect(result.materializable.candidates).toEqual([]);
    expect(result.nudge).toEqual(nudge(false));
    expect(exec).not.toHaveBeenCalled();
  });

  it("preserves oracle warnings when discovery is disabled", async () => {
    const exec = buildExec();

    const result = await runErrandState({
      exec,
      currentBranch: "main",
      hasBackingMeta: false,
      includeDiscovery: false,
      entries: null,
      oracleWarnings: ["Unable to list git worktrees; local checkout status is degraded."],
      records: [],
      remoteTips: new Map(),
      recordsComplete: true,
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(false),
      now: NOW,
    });

    expect(result.inFlight.errands).toEqual([]);
    expect(result.materializable.candidates).toEqual([]);
    expect(result.warnings).toEqual([
      "Unable to list git worktrees; local checkout status is degraded.",
    ]);
    expect(exec).not.toHaveBeenCalled();
  });

  it("does not flag a record-less current branch as resumable (identity is record-only)", async () => {
    const exec = buildExec();

    const result = await runErrandState({
      exec,
      currentBranch: "chore/fix-typo",
      hasBackingMeta: false,
      includeDiscovery: false,
      entries: null,
      records: [],
      remoteTips: new Map(),
      recordsComplete: true,
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(false),
      now: NOW,
    });

    expect(result.resume).toEqual({ resumable: false, slug: null });
    expect(exec).not.toHaveBeenCalled();
  });

  it("reports a meta-backed current branch as not resumable (a promoted errand → WU)", async () => {
    const result = await runErrandState({
      exec: buildExec(),
      currentBranch: "chore/promoted",
      hasBackingMeta: true,
      includeDiscovery: false,
      entries: null,
      records: [record({ slug: "promoted", branch: "chore/promoted" })],
      remoteTips: new Map(),
      recordsComplete: true,
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
      records: [],
      remoteTips: new Map(),
      recordsComplete: true,
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

  it("takes in-flight and materialize identity from the record, not the entry's branch-derived slug", async () => {
    const exec = buildExec({
      refs: [`refs/remotes/origin/chore/record-slug\t${RECENT}`].join("\n"),
    });

    // The entry carries a stale branch-derived slug; the record is authoritative.
    const entries: InFlightEntry[] = [errand({ slug: "branch-derived", branch: "chore/record-slug" })];

    const result = await runErrandState({
      exec,
      currentBranch: "main",
      hasBackingMeta: false,
      includeDiscovery: true,
      entries,
      records: [paused({ slug: "record-slug", branch: "chore/record-slug" })],
      remoteTips: new Map([["chore/record-slug", "a".repeat(40)]]),
      recordsComplete: true,
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(),
      now: NOW,
    });

    expect(result.inFlight.errands).toEqual([
      { slug: "record-slug", branch: "chore/record-slug", state: "in-progress", ageDays: 0 },
    ]);
    expect(result.materializable.candidates).toEqual([
      {
        slug: "record-slug", claimId: "c".repeat(32), branch: "chore/record-slug",
        expectedHead: "a".repeat(40), state: "paused", originEntry: "Fix typo",
      },
    ]);
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
      records: [paused({ slug: "remote-a", branch: "chore/remote-a" })],
      remoteTips: new Map([["chore/remote-a", "a".repeat(40)]]),
      recordsComplete: true,
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(),
      now: NOW,
    });

    expect(result.materializable.candidates).toEqual([
      {
        slug: "remote-a", claimId: "c".repeat(32), branch: "chore/remote-a",
        expectedHead: "a".repeat(40), state: "paused", originEntry: "Fix typo",
      },
    ]);
  });

  it("uses an unoccupied local errand head for merge and timestamp classification", async () => {
    const exec = buildExec({
      refs: [
        `refs/heads/chore/local-unpushed\t${OLD}`,
        `refs/remotes/origin/chore/local-unpushed\t${RECENT}`,
      ].join("\n"),
      merged: ["chore/local-unpushed"],
    });

    const result = await runErrandState({
      exec,
      currentBranch: "main",
      hasBackingMeta: false,
      includeDiscovery: true,
      entries: [
        errand({
          slug: "local-unpushed",
          branch: "chore/local-unpushed",
          remoteOnly: false,
        }),
      ],
      records: [record({ slug: "local-unpushed", branch: "chore/local-unpushed" })],
      remoteTips: new Map(),
      recordsComplete: true,
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(),
      now: NOW,
    });

    expect(result.inFlight.errands).toEqual([
      {
        slug: "local-unpushed",
        branch: "chore/local-unpushed",
        state: "merged-cleanup",
        ageDays: 7,
      },
    ]);
    expect(result.materializable.candidates).toEqual([]);
  });

  it("skips discovery with a warning when discovery is requested but the oracle was unavailable", async () => {
    const exec = buildExec();
    const residue: InFlightResidue[] = [
      {
        branch: "chore/local-residue",
        slug: "local-residue",
        reason: "no-record-or-meta",
        marks: ["degraded"],
      },
    ];

    const result = await runErrandState({
      exec,
      currentBranch: "main",
      hasBackingMeta: false,
      includeDiscovery: true,
      entries: null,
      residue,
      oracleWarnings: ["Meta `.arc/active/meta-x.md` at `origin/feat/x` has unrecognized State `Paused`."],
      records: [],
      remoteTips: new Map(),
      recordsComplete: true,
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(),
      now: NOW,
    });

    expect(result.inFlight.errands).toEqual([]);
    expect(result.materializable.candidates).toEqual([]);
    expect(result.residue).toEqual(residue);
    expect(result.warnings).toContain(
      "Meta `.arc/active/meta-x.md` at `origin/feat/x` has unrecognized State `Paused`.",
    );
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
      oracleWarnings: ["Unable to list git worktrees; local checkout status is degraded."],
      records: [],
      remoteTips: new Map(),
      recordsComplete: true,
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(),
      now: NOW,
    });

    expect(result.inFlight.errands).toEqual([]);
    expect(result.materializable.candidates).toEqual([]);
    expect(result.warnings).toEqual([
      "Unable to list git worktrees; local checkout status is degraded.",
    ]);
    expect(exec).not.toHaveBeenCalled();
  });

  it("suppresses materialization when the transient identity snapshot is incomplete", async () => {
    const result = await runErrandState({
      exec: buildExec({ refs: `refs/remotes/origin/chore/fix-typo\t${RECENT}` }),
      currentBranch: "main",
      hasBackingMeta: false,
      includeDiscovery: true,
      entries: [errand()],
      records: [paused()],
      remoteTips: new Map([["chore/fix-typo", "a".repeat(40)]]),
      recordsComplete: false,
      oracleWarnings: ["Transient identity discovery is incomplete."],
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(),
      now: NOW,
    });

    expect(result.materializable.candidates).toEqual([]);
    expect(result.warnings).toContain("Transient identity discovery is incomplete.");
  });
});
