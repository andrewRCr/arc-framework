/**
 * Unit tests for the destructive-flag detector consumed by the release
 * commit/push handlers (R5). Asserts that the constants match the PRD's
 * refusal lists exactly and that detection returns the matched
 * identifier on first hit, including the `+refspec` push-side pattern.
 */

import { describe, it, expect } from "vitest";

import {
  COMMIT_DESTRUCTIVE_FLAGS,
  PUSH_DESTRUCTIVE_FLAGS,
  PUSH_REFSPEC_FORCE_IDENTIFIER,
  detectCommitDestructive,
  detectPushDestructive,
} from "../../../src/lib/release/destructive-flags.js";

describe("destructive-flags — R5 commit list", () => {
  it("matches the PRD R5 commit list exactly", () => {
    expect([...COMMIT_DESTRUCTIVE_FLAGS]).toEqual([
      "--amend",
      "--allow-empty",
      "--no-verify",
    ]);
  });
});

describe("destructive-flags — R5 push list", () => {
  it("matches the PRD R5 push list exactly", () => {
    expect([...PUSH_DESTRUCTIVE_FLAGS]).toEqual([
      "--force",
      "-f",
      "--force-with-lease",
      "--delete",
      "-d",
      "--mirror",
    ]);
  });
});

describe("detectCommitDestructive", () => {
  it("returns null on empty argv", () => {
    expect(detectCommitDestructive([])).toBeNull();
  });

  it("returns null when no destructive flag is present", () => {
    expect(detectCommitDestructive(["-m", "subject"])).toBeNull();
  });

  it.each([
    ["--amend"],
    ["--allow-empty"],
    ["--no-verify"],
  ])("returns the flag identifier when %s is present", (flag) => {
    expect(detectCommitDestructive(["-m", "msg", flag])).toBe(flag);
  });

  it("returns the first match when multiple destructive flags are present", () => {
    expect(detectCommitDestructive(["--no-verify", "--amend"])).toBe("--no-verify");
  });

  it("does not match destructive flags from the push list", () => {
    expect(detectCommitDestructive(["--force"])).toBeNull();
  });
});

describe("detectPushDestructive", () => {
  it("returns null on empty argv", () => {
    expect(detectPushDestructive([])).toBeNull();
  });

  it("returns null when no destructive flag is present", () => {
    expect(detectPushDestructive(["origin", "main"])).toBeNull();
  });

  it.each([
    ["--force"],
    ["-f"],
    ["--force-with-lease"],
    ["--delete"],
    ["-d"],
    ["--mirror"],
  ])("returns the flag identifier when %s is present", (flag) => {
    expect(detectPushDestructive(["origin", flag])).toBe(flag);
  });

  it("returns the canonical refspec identifier when an argv element starts with '+'", () => {
    expect(detectPushDestructive(["origin", "+main:main"])).toBe(
      PUSH_REFSPEC_FORCE_IDENTIFIER,
    );
  });

  it("does not match plain refspec syntax without the leading '+'", () => {
    expect(detectPushDestructive(["origin", "main:main"])).toBeNull();
  });

  it("does not match a bare '+' token without a refspec body", () => {
    expect(detectPushDestructive(["origin", "+"])).toBeNull();
  });

  it("returns the first match when multiple destructive flags are present", () => {
    expect(detectPushDestructive(["--force", "-f"])).toBe("--force");
  });

  it("does not match destructive flags from the commit list", () => {
    expect(detectPushDestructive(["--amend"])).toBeNull();
  });

  it("matches a +refspec even when destructive flags follow", () => {
    expect(detectPushDestructive(["origin", "+feat:dev", "--force"])).toBe(
      PUSH_REFSPEC_FORCE_IDENTIFIER,
    );
  });
});
