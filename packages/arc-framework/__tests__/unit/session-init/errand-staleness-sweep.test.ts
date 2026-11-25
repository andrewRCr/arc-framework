/**
 * Unit tests for the errand-staleness sweep — ageing caller-supplied dated
 * entries against a threshold and flagging those pending past it for
 * execute-or-demote.
 */

import { describe, it, expect } from "vitest";
import { assertSchemaRefuses } from "../../helpers/schema-assertion.js";

import {
  ErrandStalenessSweepResultSchema,
  StaleErrandReportSchema,
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

  it.each(["2026-02-30", "2025-02-29", "2026-04-31", "2026-13-01", "2026-00-01"])(
    "skips an impossible calendar date (%s)",
    (created) => {
      const result = runErrandStalenessSweep({
        entries: [entry("invalid-date", created)],
        thresholdDays: 3,
        now: NOW,
      });

      expect(result.stale).toEqual([]);
    },
  );

  it("accepts a valid leap day", () => {
    const result = runErrandStalenessSweep({
      entries: [entry("leap-day", "2024-02-29")],
      thresholdDays: 3,
      now: "2024-03-05T12:00:00.000Z",
    });

    expect(result.stale).toEqual([{ slug: "leap-day", created: "2024-02-29", ageDays: 5 }]);
  });

  it("returns no stale entries when there are no candidates", () => {
    const result = runErrandStalenessSweep({ entries: [], thresholdDays: 3, now: NOW });

    expect(result.stale).toEqual([]);
  });
});

describe("ErrandStalenessSweepResultSchema", () => {
  it("accepts producer reports including legacy non-slug titles", () => {
    expect(
      ErrandStalenessSweepResultSchema.parse({
        stale: [{ slug: "Fix the release docs", created: "2026-05-18", ageDays: 7 }],
      }),
    ).toEqual({ stale: [{ slug: "Fix the release docs", created: "2026-05-18", ageDays: 7 }] });
  });

  it("rejects an impossible calendar date", () => {
    assertSchemaRefuses(StaleErrandReportSchema, { slug: "legacy title", created: "2026-02-30", ageDays: 84 });
  });

  it.each([
    { slug: "", created: "2026-05-18", ageDays: 7 },
    { slug: "title", created: "not-a-date", ageDays: 7 },
    { slug: "title", created: "2026-05-18", ageDays: -1 },
    { slug: "title", created: "2026-05-18", ageDays: 1.5 },
    { slug: "title", created: "2026-05-18", ageDays: 7, leaked: true },
  ])("rejects a malformed stale report", (report) => {
    assertSchemaRefuses(StaleErrandReportSchema, report);
  });
});
