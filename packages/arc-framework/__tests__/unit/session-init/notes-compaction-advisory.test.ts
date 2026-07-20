/** Unit coverage for the schema-backed session notes-compaction advisory. */

import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  NotesCompactionSessionAdvisoryResultSchema,
  runNotesCompactionSessionAdvisory,
} from "../../../src/lib/session-init/notes-compaction-advisory.js";

const validResult = {
  historyCommitCount: 2001,
  threshold: 2000,
  shouldSuggest: true,
  nudge: {
    shouldNudge: true,
    markerPath: ".arc/user/andrew/.internal/notes-compaction-last-nudge.txt",
    today: "2026-07-20",
  },
};

describe("runNotesCompactionSessionAdvisory", () => {
  it("combines notes history with the resolved nudge state", async () => {
    const exec: GitExec = async () => ({ stdout: "2001\n" });

    await expect(
      runNotesCompactionSessionAdvisory({ exec, identity: "andrew", nudge: validResult.nudge }),
    ).resolves.toEqual(validResult);
  });
});

describe("NotesCompactionSessionAdvisoryResultSchema", () => {
  it("accepts the exact session advisory view", () => {
    expect(NotesCompactionSessionAdvisoryResultSchema.parse(validResult)).toEqual(validResult);
  });

  it.each([
    { ...validResult, historyCommitCount: -1 },
    { ...validResult, historyCommitCount: 1.5 },
    { ...validResult, threshold: -1 },
    { ...validResult, shouldSuggest: "yes" },
    { ...validResult, nudge: { ...validResult.nudge, shouldNudge: "yes" } },
    { ...validResult, nudge: { ...validResult.nudge, markerPath: "../outside" } },
    { ...validResult, nudge: { ...validResult.nudge, today: "2026-02-30" } },
  ])("rejects a malformed advisory value", (value) => {
    expect(NotesCompactionSessionAdvisoryResultSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    { historyCommitCount: 2000, threshold: 2000, shouldSuggest: true },
    { historyCommitCount: 2001, threshold: 2000, shouldSuggest: false },
  ])("rejects an inconsistent suggestion flag", (advisory) => {
    expect(NotesCompactionSessionAdvisoryResultSchema.safeParse({ ...validResult, ...advisory }).success).toBe(false);
  });

  it("accepts a null marker path when nudge resolution is unavailable", () => {
    expect(
      NotesCompactionSessionAdvisoryResultSchema.safeParse({
        ...validResult,
        nudge: { ...validResult.nudge, shouldNudge: false, markerPath: null },
      }).success,
    ).toBe(true);
  });
});
