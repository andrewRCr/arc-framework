/**
 * Unit tests for the reminder-nudge rate limit — gating the batched advisory to
 * once per calendar day from a per-user last-nudge marker.
 */

import { describe, it, expect } from "vitest";

import { shouldNudge } from "../../../src/lib/session-init/nudge-rate-limit.js";

describe("shouldNudge", () => {
  it("nudges when there is no prior marker (never nudged)", () => {
    expect(shouldNudge({ lastNudge: null, today: "2026-05-31" })).toBe(true);
  });

  it("nudges when the last nudge was an earlier calendar day", () => {
    expect(shouldNudge({ lastNudge: "2026-05-30", today: "2026-05-31" })).toBe(true);
  });

  it("suppresses a second nudge on the same calendar day", () => {
    expect(shouldNudge({ lastNudge: "2026-05-31", today: "2026-05-31" })).toBe(false);
  });

  it("compares the calendar day of a full ISO timestamp marker", () => {
    expect(shouldNudge({ lastNudge: "2026-05-31T08:00:00.000Z", today: "2026-05-31" })).toBe(false);
    expect(shouldNudge({ lastNudge: "2026-05-30T23:59:00.000Z", today: "2026-05-31" })).toBe(true);
  });

  it("suppresses when the marker is dated ahead of today (clock skew — defensive)", () => {
    expect(shouldNudge({ lastNudge: "2026-06-01", today: "2026-05-31" })).toBe(false);
  });

  it("nudges (fail-open) when the marker is unparseable", () => {
    expect(shouldNudge({ lastNudge: "not-a-date", today: "2026-05-31" })).toBe(true);
  });
});
