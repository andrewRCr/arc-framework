/**
 * Unit tests for the in-flight-work-unit sweep — classifying caller-enumerated
 * owned work units across the completion tail (awaiting-review / mergeable /
 * blocked / merged-needs-archival / stale), the WU-side analog of the errand
 * sweep. Archived WUs (meta swept to completed/) are terminal and excluded.
 */

import { describe, it, expect } from "vitest";

import {
  classifyInFlightWorkUnits,
  type InFlightWorkUnitFacts,
} from "../../../src/lib/session-init/in-flight-work-unit-sweep.js";

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
