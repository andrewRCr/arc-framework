/**
 * Unit tests for the relative-time formatter used by user-status output.
 *
 * Covers bucket boundaries (seconds → minutes → hours → days),
 * singular/plural phrasing, and future-date clamping.
 */

import { describe, it, expect } from "vitest";

import { formatRelativeTime } from "../../src/commands/user/relative-time.js";

const NOW = new Date("2026-04-22T12:00:00.000Z");

function ago(seconds: number): Date {
  return new Date(NOW.getTime() - seconds * 1000);
}

describe("formatRelativeTime", () => {
  it("renders 'just now' for sub-minute differences", () => {
    expect(formatRelativeTime(ago(0), NOW)).toBe("just now");
    expect(formatRelativeTime(ago(59), NOW)).toBe("just now");
  });

  it("renders minute phrasing between 1 and 59 minutes", () => {
    expect(formatRelativeTime(ago(60), NOW)).toBe("1 minute ago");
    expect(formatRelativeTime(ago(120), NOW)).toBe("2 minutes ago");
    expect(formatRelativeTime(ago(59 * 60), NOW)).toBe("59 minutes ago");
  });

  it("renders hour phrasing between 1 and 23 hours", () => {
    expect(formatRelativeTime(ago(60 * 60), NOW)).toBe("1 hour ago");
    expect(formatRelativeTime(ago(11 * 3600), NOW)).toBe("11 hours ago");
    expect(formatRelativeTime(ago(23 * 3600), NOW)).toBe("23 hours ago");
  });

  it("renders day phrasing at 24 hours and beyond", () => {
    expect(formatRelativeTime(ago(24 * 3600), NOW)).toBe("1 day ago");
    expect(formatRelativeTime(ago(2 * 86400), NOW)).toBe("2 days ago");
    expect(formatRelativeTime(ago(365 * 86400), NOW)).toBe("365 days ago");
  });

  it("clamps future timestamps to 'just now'", () => {
    const future = new Date(NOW.getTime() + 60 * 60 * 1000);
    expect(formatRelativeTime(future, NOW)).toBe("just now");
  });
});
