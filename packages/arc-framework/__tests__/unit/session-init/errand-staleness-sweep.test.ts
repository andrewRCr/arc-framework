/**
 * Unit tests for the errand-staleness sweep — ageing caller-supplied dated
 * entries against a threshold and flagging those pending past it for
 * execute-or-demote.
 */

import { describe, it, expect } from "vitest";

import {
  runErrandStalenessSweep,
  type DatedErrandEntry,
} from "../../../src/lib/session-init/errand-staleness-sweep.js";

const NOW = "2026-05-25T12:00:00.000Z";

const entry = (key: string, created: string): DatedErrandEntry => ({ key, created });

describe("runErrandStalenessSweep", () => {
  it("does not flag an entry younger than the threshold", () => {
    const result = runErrandStalenessSweep({
      entries: [entry("fresh", "2026-05-24")], // 1 day before NOW
      thresholdDays: 3,
      now: NOW,
    });

    expect(result.stale).toEqual([]);
  });

  it("flags an entry older than the threshold for execute-or-demote", () => {
    const result = runErrandStalenessSweep({
      entries: [entry("stale-errand", "2026-05-18")], // 7 days before NOW
      thresholdDays: 3,
      now: NOW,
    });

    expect(result.stale).toEqual([{ slug: "stale-errand", created: "2026-05-18", ageDays: 7 }]);
  });

  it("honors the configured threshold rather than a fixed window", () => {
    const entries = [entry("week-old", "2026-05-18")]; // 7 days before NOW

    expect(runErrandStalenessSweep({ entries, thresholdDays: 10, now: NOW }).stale).toEqual([]);
    expect(runErrandStalenessSweep({ entries, thresholdDays: 5, now: NOW }).stale).toHaveLength(1);
  });

  it("skips an entry with no parseable created date (cannot be aged)", () => {
    const result = runErrandStalenessSweep({
      entries: [entry("undated", "not-a-date")],
      thresholdDays: 3,
      now: NOW,
    });

    expect(result.stale).toEqual([]);
  });

  it("returns no stale entries when there are no candidates", () => {
    const result = runErrandStalenessSweep({ entries: [], thresholdDays: 3, now: NOW });

    expect(result.stale).toEqual([]);
  });
});
