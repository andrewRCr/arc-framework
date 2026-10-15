/**
 * Unit tests for the destructive-flag detector consumed by the release
 * commit/push handlers. Asserts that the exported constants match the
 * documented refusal lists exactly and that detection returns the
 * matched identifier on first hit, including the `+refspec` push-side
 * pattern.
 */

import { describe, it, expect } from "vitest";

import {
  COMMIT_DESTRUCTIVE_FLAGS,
  PUSH_DESTRUCTIVE_FLAGS,
  PUSH_REFSPEC_FORCE_IDENTIFIER,
  detectCommitAmend,
  detectCommitDestructive,
  detectPushDestructive,
} from "../../../src/lib/release/destructive-flags.js";

describe("destructive-flags — commit refusal list", () => {
  it("exports the documented commit refusal list exactly", () => {
    expect([...COMMIT_DESTRUCTIVE_FLAGS]).toEqual([
      "--allow-empty",
      "--no-verify",
      "-n",
    ]);
  });
});

describe("destructive-flags — push refusal list", () => {
  it("exports the documented push refusal list exactly", () => {
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
    ["--allow-empty"],
    ["--no-verify"],
    ["-n"],
  ])("returns the flag identifier when %s is present", (flag) => {
    expect(detectCommitDestructive(["-m", "msg", flag])).toBe(flag);
  });

  it.each([
    ["--allow-empt", "--allow-empty"],
    ["--no-verif", "--no-verify"],
    ["--no-verif=true", "--no-verify"],
    ["--a", "--allow-empty"],
  ])("refuses the long-option prefix %s as %s", (token, flag) => {
    expect(detectCommitDestructive(["-m", "subject", token])).toBe(flag);
  });

  it("preserves the exact --all option before checking destructive prefixes", () => {
    expect(detectCommitDestructive(["--all", "-m", "subject"])).toBeNull();
    expect(detectCommitAmend(["--all", "-m", "subject"])).toBe(false);
  });

  it.each(["--no-verify", "--no-verif", "--allow-empty", "--allow-empt"])(
    "still detects %s after the exact --all option",
    (flag) => {
      const expected = flag.startsWith("--no-") ? "--no-verify" : "--allow-empty";
      expect(detectCommitDestructive(["--all", flag])).toBe(expected);
    },
  );

  it("keeps ambiguous prefixes conservative in both commit detectors", () => {
    expect(detectCommitDestructive(["--a"])).toBe("--allow-empty");
    expect(detectCommitAmend(["--a"])).toBe(true);
  });

  it("returns the first match when multiple destructive flags are present", () => {
    expect(detectCommitDestructive(["--no-verify", "--allow-empty"])).toBe("--no-verify");
  });

  it("leaves --amend to the pushed-HEAD check rather than refusing it outright", () => {
    expect(detectCommitDestructive(["--amend", "--no-edit"])).toBeNull();
  });

  it.each(["-qn", "-nq", "-qnmmessage"])(
    "returns -n when no-verify appears in short-option cluster %s",
    (flag) => {
      expect(detectCommitDestructive([flag])).toBe("-n");
    },
  );

  it("does not mistake an attached message operand for -n", () => {
    expect(detectCommitDestructive(["-mnarrative"])).toBeNull();
  });

  it.each([
    ["separated short message", ["-m", "-n"]],
    ["separated long message", ["--message", "--no-verify"]],
    ["separated file source", ["-F", "--allow-empty"]],
    ["ordinary required operand", ["--author", "--allow-empty"]],
    ["short message cluster", ["-qm", "-n"]],
    ["pathspec after terminator", ["--", "-n"]],
    ["long pathspec after terminator", ["--", "--no-verify"]],
    ["abbreviated message data", ["--message", "--no-verif"]],
    ["abbreviated pathspec data", ["--", "--no-verif"]],
    ["abbreviated pathspec-file operand", ["--pathspec-from-f", "--no-verif"]],
    ["abbreviated message-option operand", ["--mess", "--no-verif"]],
    ["abbreviated author-option operand", ["--auth", "--no-verif"]],
  ])("does not reinterpret destructive-looking %s data", (_label, args) => {
    expect(detectCommitDestructive(args)).toBeNull();
  });

  it("does not match destructive flags from the push list", () => {
    expect(detectCommitDestructive(["--force"])).toBeNull();
  });
});

describe("detectCommitAmend", () => {
  it.each([
    [["--amend"]],
    [["--amend", "--no-edit"]],
    [["--amen", "--no-edit"]],
    [["--ame"]],
    [["-m", "subject", "--amend"]],
  ])("reports an amend in %j", (args) => {
    expect(detectCommitAmend(args)).toBe(true);
  });

  it.each([
    ["no amend", ["-m", "subject"]],
    ["separated message operand", ["-m", "--amend"]],
    ["separated file operand", ["-F", "--amend"]],
    ["pathspec after terminator", ["--", "--amend"]],
    ["abbreviated message operand", ["-m", "--amen"]],
    ["abbreviated pathspec", ["--", "--amen"]],
    ["abbreviated pathspec-file operand", ["--pathspec-from-f", "--amen"]],
  ])("does not report an amend for %s", (_label, args) => {
    expect(detectCommitAmend(args)).toBe(false);
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

  it.each([
    ["--for", "--force"],
    ["--force-with-l=main:abc", "--force-with-lease"],
    ["--delet", "--delete"],
    ["--mirro", "--mirror"],
  ])("refuses the long-option prefix %s as %s", (token, flag) => {
    expect(detectPushDestructive([token])).toBe(flag);
  });

  it.each([
    ["--push-option", "--for"],
    ["-o", "--delet"],
    ["--push-opt", "--mirro"],
    ["--push-option", "+topic:topic"],
    ["--receive-p", "--for"],
    ["--ex", "--for"],
    ["--rep", "--for"],
    ["--", "--for"],
  ])("keeps the value in %j out of destructive matching", (...args) => {
    expect(detectPushDestructive(args)).toBeNull();
  });

  it.each(["--r", "--p", "--no-push-option", "--made-up"])(
    "does not hide a destructive flag after non-consuming %s",
    (option) => {
      expect(detectPushDestructive([option, "--for"])).toBe("--force");
    },
  );

  it("still refuses a destructive option after a push-option operand", () => {
    expect(detectPushDestructive(["--push-option", "--for", "--delet"])).toBe("--delete");
  });

  it.each([
    ["--push-option=--for", "--delet"],
    ["-o--for", "--delet"],
  ])("does not consume an extra operand after attached values in %j", (...args) => {
    expect(detectPushDestructive(args)).toBe("--delete");
  });

  it("still refuses a force refspec after an option terminator", () => {
    expect(detectPushDestructive(["--", "-o", "+topic:topic"])).toBe(PUSH_REFSPEC_FORCE_IDENTIFIER);
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

describe("destructive-looking option names", () => {
  it.each(["--allow-empty-message", "--no-verify-extra", "--", "-"])(
    "does not extend a refusal to the distinct token %s",
    (token) => {
      expect(detectCommitDestructive([token])).toBeNull();
      expect(detectCommitAmend([token])).toBe(false);
      expect(detectPushDestructive([token])).toBeNull();
    },
  );
});
