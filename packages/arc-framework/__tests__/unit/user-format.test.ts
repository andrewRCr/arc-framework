/**
 * Unit tests for user-command summary formatters.
 *
 * Covers `buildLoadSummary`'s ancestor-distance line (emitted only when
 * distance > 0) and its grouping of load messages by register — routine
 * cleanups, advisory notices, and genuine warnings under distinct headings.
 */

import { describe, it, expect } from "vitest";

import { buildLoadSummary } from "../../src/commands/user/format.js";
import type { LoadMessage, UserLoadResult } from "../../src/commands/user/types.js";

function baseResult(overrides: Partial<UserLoadResult>): UserLoadResult {
  return {
    kind: "loaded",
    identity: "andrew",
    commit: "abc1234",
    fileCount: 2,
    fromAncestor: false,
    ancestorDistance: 0,
    messages: [],
    ...overrides,
  };
}

describe("buildLoadSummary — ancestor distance reporting", () => {
  it("omits the ancestor-distance line when distance is 0", () => {
    const summary = buildLoadSummary(baseResult({ ancestorDistance: 0, fromAncestor: false }));

    expect(summary).not.toContain("Loaded from");
    expect(summary).not.toContain("commits back");
  });

  it("emits 'Loaded from N commits back' when distance is greater than 0", () => {
    const summary = buildLoadSummary(baseResult({ ancestorDistance: 7, fromAncestor: true }));

    expect(summary).toContain("Loaded from 7 commit(s) back.");
  });

  it("does not emit the legacy 'loaded from a reachable ancestor' phrasing", () => {
    const summary = buildLoadSummary(baseResult({ ancestorDistance: 3, fromAncestor: true }));

    expect(summary).not.toContain("loaded from a reachable ancestor");
    expect(summary).not.toContain("behind HEAD");
  });

  it("names the current branch for a note loaded off its history", () => {
    const summary = buildLoadSummary(baseResult({
      ancestorDistance: 0,
      fromAncestor: false,
      reachableFromHead: false,
      currentBranch: "fix/state-ref-write-safety",
    }));

    expect(summary).toContain("not in branch `fix/state-ref-write-safety`'s history");
    expect(summary).toContain("continued or integrated on another branch or machine");
    expect(summary).not.toContain("outside current HEAD ancestry");
    expect(summary).not.toContain("Loaded from 0 commit(s) back");
  });

  it("falls back to a detached-HEAD phrasing when no branch is named", () => {
    const summary = buildLoadSummary(baseResult({
      ancestorDistance: 0,
      fromAncestor: false,
      reachableFromHead: false,
      currentBranch: null,
    }));

    expect(summary).toContain("not in this checkout's history (detached HEAD)");
    expect(summary).not.toContain("branch `");
  });
});

describe("buildLoadSummary — message register grouping", () => {
  function summaryWith(messages: LoadMessage[]): string {
    return buildLoadSummary(baseResult({ messages }));
  }

  /** Heading-scoped slice of the summary, for asserting a line falls under the right group. */
  function section(summary: string, heading: string): string {
    const lines = summary.split("\n");
    const start = lines.indexOf(heading);
    if (start === -1) return "";
    let end = start + 1;
    while (end < lines.length && !lines[end]!.endsWith(":")) end += 1;
    return lines.slice(start, end).join("\n");
  }

  it("groups a routine reconcile under 'Cleaned up:', never 'Warnings:'", () => {
    const summary = summaryWith([{ level: "cleanup", text: 'Retired WU subdir "old-wu" — removed' }]);

    expect(summary).toContain("Cleaned up:");
    expect(section(summary, "Cleaned up:")).toContain("old-wu");
    expect(summary).not.toContain("Warnings:");
  });

  it("groups a preserved orphan under 'Notices:'", () => {
    const summary = summaryWith([{ level: "notice", text: 'Local file "stray.txt" not in saved manifest' }]);

    expect(summary).toContain("Notices:");
    expect(section(summary, "Notices:")).toContain("stray.txt");
    expect(summary).not.toContain("Warnings:");
    expect(summary).not.toContain("Cleaned up:");
  });

  it("keeps a genuine warning under 'Warnings:'", () => {
    const summary = summaryWith([{ level: "warning", text: "Malformed note skipped" }]);

    expect(summary).toContain("Warnings:");
    expect(section(summary, "Warnings:")).toContain("Malformed note skipped");
    expect(summary).not.toContain("Cleaned up:");
  });

  it("separates registers into their own headings when all are present", () => {
    const summary = summaryWith([
      { level: "cleanup", text: "reconciled-line" },
      { level: "notice", text: "notice-line" },
      { level: "warning", text: "warning-line" },
    ]);

    expect(section(summary, "Cleaned up:")).toContain("reconciled-line");
    expect(section(summary, "Notices:")).toContain("notice-line");
    expect(section(summary, "Warnings:")).toContain("warning-line");
    expect(section(summary, "Cleaned up:")).not.toContain("warning-line");
  });

  it("emits no message headings for a clean load", () => {
    const summary = summaryWith([]);

    expect(summary).not.toContain("Cleaned up:");
    expect(summary).not.toContain("Notices:");
    expect(summary).not.toContain("Warnings:");
  });
});
