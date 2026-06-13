/**
 * Unit tests for the in-flight-work-unit sweep — classifying caller-enumerated
 * owned work units across the completion tail (awaiting-review / mergeable /
 * blocked / merged-needs-archival / stale), the WU-side analog of the errand
 * sweep. Archived WUs (meta swept to completed/) are terminal and excluded.
 */

import { describe, it, expect } from "vitest";

import {
  classifyInFlightWorkUnits,
  enumerateOwnedIntegratingWorkUnits,
  projectWorkUnitPresenceFacts,
  type InFlightWorkUnitFacts,
} from "../../../src/lib/session-init/in-flight-work-unit-sweep.js";
import type { WorktreeRosterEntry } from "../../../src/lib/git/worktree-roster.js";

const NOW = "2026-06-13T00:00:00.000Z";
const NOW_SEC = Math.floor(Date.parse(NOW) / 1000);
const daysAgo = (n: number): number => NOW_SEC - n * 86400;

const rosterEntry = (over: Partial<WorktreeRosterEntry> = {}): WorktreeRosterEntry => ({
  worktreePath: "/repo",
  branch: "feat/widget",
  identity: "andrew",
  metaFilePath: "/repo/.arc/active/meta-widget.md",
  state: "Integrating",
  ...over,
});

const facts = (over: Partial<InFlightWorkUnitFacts> = {}): InFlightWorkUnitFacts => ({
  name: "widget-refactor",
  branch: "feat/widget-refactor",
  archived: false,
  merged: false,
  hasOpenPr: true,
  approved: false,
  changesRequested: false,
  checksFailed: false,
  ageDays: 0,
  ...over,
});

describe("classifyInFlightWorkUnits", () => {
  it("classifies a merged WU whose archival is still pending as merged-needs-archival", () => {
    const result = classifyInFlightWorkUnits({
      workUnits: [facts({ merged: true })],
      staleThresholdDays: 3,
    });

    expect(result.workUnits).toEqual([
      {
        name: "widget-refactor",
        branch: "feat/widget-refactor",
        state: "merged-needs-archival",
        ageDays: 0,
      },
    ]);
  });

  it("excludes an archived WU as terminal (meta swept to completed/)", () => {
    const result = classifyInFlightWorkUnits({
      workUnits: [facts({ merged: true, archived: true })],
      staleThresholdDays: 3,
    });

    expect(result.workUnits).toEqual([]);
  });

  it("classifies an open PR with passing checks and approval as mergeable", () => {
    const result = classifyInFlightWorkUnits({
      workUnits: [facts({ approved: true })],
      staleThresholdDays: 3,
    });

    expect(result.workUnits[0]?.state).toBe("mergeable");
  });

  it("classifies an open PR with changes requested as blocked", () => {
    const result = classifyInFlightWorkUnits({
      workUnits: [facts({ changesRequested: true })],
      staleThresholdDays: 3,
    });

    expect(result.workUnits[0]?.state).toBe("blocked");
  });

  it("classifies an open PR with failing checks as blocked", () => {
    const result = classifyInFlightWorkUnits({
      workUnits: [facts({ checksFailed: true })],
      staleThresholdDays: 3,
    });

    expect(result.workUnits[0]?.state).toBe("blocked");
  });

  it("classifies blocked over mergeable when both signals are present", () => {
    const result = classifyInFlightWorkUnits({
      workUnits: [facts({ approved: true, changesRequested: true })],
      staleThresholdDays: 3,
    });

    expect(result.workUnits[0]?.state).toBe("blocked");
  });

  it("classifies an Integrating WU under the stale threshold as awaiting-review", () => {
    const result = classifyInFlightWorkUnits({
      workUnits: [facts({ ageDays: 1 })],
      staleThresholdDays: 3,
    });

    expect(result.workUnits[0]?.state).toBe("awaiting-review");
  });

  it("classifies an Integrating WU past the stale threshold as stale", () => {
    const result = classifyInFlightWorkUnits({
      workUnits: [facts({ ageDays: 7 })],
      staleThresholdDays: 3,
    });

    expect(result.workUnits[0]).toEqual({
      name: "widget-refactor",
      branch: "feat/widget-refactor",
      state: "stale",
      ageDays: 7,
    });
  });

  it("classifies a WU with no open PR yet as awaiting-review (Integrating, pre-PR)", () => {
    const result = classifyInFlightWorkUnits({
      workUnits: [facts({ hasOpenPr: false })],
      staleThresholdDays: 3,
    });

    expect(result.workUnits[0]?.state).toBe("awaiting-review");
  });

  it("classifies merged over the stale overlay (merged state beats stale-age facts)", () => {
    const result = classifyInFlightWorkUnits({
      workUnits: [facts({ merged: true, ageDays: 99 })],
      staleThresholdDays: 3,
    });

    expect(result.workUnits[0]?.state).toBe("merged-needs-archival");
  });

  it("classifies mergeable over the stale overlay (event-driven bypasses the threshold)", () => {
    const result = classifyInFlightWorkUnits({
      workUnits: [facts({ approved: true, ageDays: 99 })],
      staleThresholdDays: 3,
    });

    expect(result.workUnits[0]?.state).toBe("mergeable");
  });

  it("classifies each work unit independently", () => {
    const result = classifyInFlightWorkUnits({
      workUnits: [
        facts({ name: "a", branch: "feat/a", ageDays: 0 }),
        facts({ name: "b", branch: "feat/b", approved: true }),
        facts({ name: "c", branch: "feat/c", changesRequested: true }),
        facts({ name: "d", branch: "feat/d", merged: true }),
        facts({ name: "e", branch: "feat/e", ageDays: 9 }),
      ],
      staleThresholdDays: 3,
    });

    expect(result.workUnits.map((w) => [w.name, w.state])).toEqual([
      ["a", "awaiting-review"],
      ["b", "mergeable"],
      ["c", "blocked"],
      ["d", "merged-needs-archival"],
      ["e", "stale"],
    ]);
  });

  it("returns no work units for an empty set", () => {
    expect(
      classifyInFlightWorkUnits({ workUnits: [], staleThresholdDays: 3 }).workUnits,
    ).toEqual([]);
  });
});

describe("enumerateOwnedIntegratingWorkUnits", () => {
  it("keeps owned Integrating WUs, deriving the name from the meta path and carrying branch + committer date", () => {
    const result = enumerateOwnedIntegratingWorkUnits({
      roster: [rosterEntry({ branch: "feat/widget", metaFilePath: "/repo/.arc/active/meta-widget.md" })],
      identity: "andrew",
      committerDates: new Map([["feat/widget", daysAgo(2)]]),
    });

    expect(result).toEqual([{ name: "widget", branch: "feat/widget", committerDate: daysAgo(2) }]);
  });

  it("excludes WUs not in the Integrating state", () => {
    const result = enumerateOwnedIntegratingWorkUnits({
      roster: [rosterEntry({ state: "Active" })],
      identity: "andrew",
      committerDates: new Map(),
    });

    expect(result).toEqual([]);
  });

  it("excludes meta-less roster entries (admin / main checkouts)", () => {
    const result = enumerateOwnedIntegratingWorkUnits({
      roster: [rosterEntry({ metaFilePath: undefined, state: undefined })],
      identity: "andrew",
      committerDates: new Map(),
    });

    expect(result).toEqual([]);
  });

  it("excludes WUs owned by a different identity but keeps unattributed ones", () => {
    const result = enumerateOwnedIntegratingWorkUnits({
      roster: [
        rosterEntry({ branch: "feat/mine", metaFilePath: "/r/.arc/active/meta-mine.md", identity: "andrew" }),
        rosterEntry({ branch: "feat/theirs", metaFilePath: "/r/.arc/active/meta-theirs.md", identity: "blair" }),
        rosterEntry({ branch: "feat/orphan", metaFilePath: "/r/.arc/active/meta-orphan.md", identity: undefined }),
      ],
      identity: "andrew",
      committerDates: new Map(),
    });

    expect(result.map((w) => w.name)).toEqual(["mine", "orphan"]);
  });

  it("includes every Integrating WU when no identity is configured", () => {
    const result = enumerateOwnedIntegratingWorkUnits({
      roster: [
        rosterEntry({ branch: "feat/a", metaFilePath: "/r/.arc/active/meta-a.md", identity: "andrew" }),
        rosterEntry({ branch: "feat/b", metaFilePath: "/r/.arc/active/meta-b.md", identity: "blair" }),
      ],
      identity: null,
      committerDates: new Map(),
    });

    expect(result.map((w) => w.name)).toEqual(["a", "b"]);
  });

  it("carries a null committer date when the branch ref is absent from the map", () => {
    const result = enumerateOwnedIntegratingWorkUnits({
      roster: [rosterEntry({ branch: "feat/widget" })],
      identity: "andrew",
      committerDates: new Map(),
    });

    expect(result[0]?.committerDate).toBeNull();
  });
});

describe("projectWorkUnitPresenceFacts", () => {
  it("projects the classifier fact shape with PR facts left false for the sharpening tier", () => {
    const facts = projectWorkUnitPresenceFacts({
      workUnits: [{ name: "widget", branch: "feat/widget", committerDate: daysAgo(2) }],
      now: NOW,
    });

    expect(facts).toEqual([
      {
        name: "widget",
        branch: "feat/widget",
        archived: false,
        merged: false,
        hasOpenPr: false,
        approved: false,
        changesRequested: false,
        checksFailed: false,
        ageDays: 2,
      },
    ]);
  });

  it("computes whole-day age from the committer date against now", () => {
    const facts = projectWorkUnitPresenceFacts({
      workUnits: [{ name: "w", branch: "feat/w", committerDate: daysAgo(9) }],
      now: NOW,
    });

    expect(facts[0]?.ageDays).toBe(9);
  });

  it("treats a null committer date as age 0", () => {
    const facts = projectWorkUnitPresenceFacts({
      workUnits: [{ name: "w", branch: "feat/w", committerDate: null }],
      now: NOW,
    });

    expect(facts[0]?.ageDays).toBe(0);
  });
});

describe("presence-tier pipeline (enumerate → project → classify)", () => {
  const presenceFacts = (committerDate: number | null): InFlightWorkUnitFacts[] =>
    projectWorkUnitPresenceFacts({
      workUnits: enumerateOwnedIntegratingWorkUnits({
        roster: [rosterEntry({ branch: "feat/widget", metaFilePath: "/r/.arc/active/meta-widget.md" })],
        identity: "andrew",
        committerDates: committerDate === null ? new Map() : new Map([["feat/widget", committerDate]]),
      }),
      now: NOW,
    });

  it("classifies a fresh owned Integrating WU as awaiting-review", () => {
    const result = classifyInFlightWorkUnits({
      workUnits: presenceFacts(daysAgo(1)),
      staleThresholdDays: 3,
    });

    expect(result.workUnits[0]?.state).toBe("awaiting-review");
  });

  it("classifies an aged owned Integrating WU past the threshold as stale", () => {
    const result = classifyInFlightWorkUnits({
      workUnits: presenceFacts(daysAgo(10)),
      staleThresholdDays: 3,
    });

    expect(result.workUnits[0]?.state).toBe("stale");
  });
});
