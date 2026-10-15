/** Unit tests for release-commit message-source classification. */

import { describe, expect, it } from "vitest";

import {
  classifyCommitMessageInput,
  commitOptionConsumesNext,
  rewriteCommitFileSource,
  replaceCommitMessageSource,
  reusesCommitMessage,
  rewriteCommitMessagesToFile,
} from "../../../../src/lib/release/commit-message-source.js";

function classify(
  args: readonly string[],
  options: {
    stdinIsTTY?: boolean;
    commitCleanup?: string | null;
    commitEncoding?: string | null;
  } = {},
) {
  return classifyCommitMessageInput({
    args,
    stdinIsTTY: options.stdinIsTTY ?? false,
    commitCleanup: options.commitCleanup,
    commitEncoding: options.commitEncoding,
  });
}

describe("message source recognition", () => {
  it("normalizes separated and attached message forms in order", () => {
    expect(classify(["-m", "first", "--message=second", "-mthird"])).toEqual({
      kind: "assembled",
      source: { kind: "messages", values: ["first", "second", "third"] },
    });
  });

  it.each([
    { args: ["-am", "subject"], value: "subject" },
    { args: ["-amsubject"], value: "subject" },
    { args: ["-qamsubject"], value: "subject" },
  ])("recognizes a message source in the $args cluster", ({ args, value }) => {
    expect(classify(args)).toEqual({
      kind: "assembled",
      source: { kind: "messages", values: [value] },
    });
  });

  it("recognizes one separated or attached file source", () => {
    expect(classify(["-F", "message.txt"])).toEqual({
      kind: "assembled",
      source: { kind: "file", path: "message.txt" },
    });
    expect(classify(["--file=message.txt"])).toEqual({
      kind: "assembled",
      source: { kind: "file", path: "message.txt" },
    });
  });

  it("stops a short cluster at an earlier operand-taking option", () => {
    expect(classify(["-Cmessage"], { stdinIsTTY: false })).toMatchObject({
      kind: "pass-through",
    });
    expect(classify(["-C", "amsecret"], { stdinIsTTY: false })).toMatchObject({
      kind: "pass-through",
    });
  });

  it.each([{ args: ["-xmsecret"] }, { args: ["-Smsecret"] }])(
    "passes unsupported short grammar through",
    ({ args }) => {
      expect(classify(args, { stdinIsTTY: true })).toMatchObject({
        kind: "pass-through",
        reason: "unsupported-grammar",
      });
    },
  );

  it("honors the option terminator", () => {
    expect(classify(["-m", "subject", "--", "-m", "pathspec"])).toEqual({
      kind: "assembled",
      source: { kind: "messages", values: ["subject"] },
    });
  });

  it.each([
    { args: ["-m", "subject", "-F", "message.txt"] },
    { args: ["-F", "one", "--file=two"] },
    { args: ["-m"] },
    { args: ["--file"] },
    { args: ["--no-message", "subject"] },
  ])("leaves invalid or unrecognized source grammar to Git", ({ args }) => {
    expect(classify(args, { stdinIsTTY: true })).toMatchObject({ kind: "pass-through" });
  });
});

describe("message-affecting options", () => {
  it.each([
    { args: ["-m", "subject", "--trailer", "Reviewed-by: Person"] },
    { args: ["-sm", "subject"] },
    { args: ["-m", "subject", "--cleanup=strip"] },
  ])("demotes assembled input when Git changes the resulting message", ({ args }) => {
    expect(classify(args)).toMatchObject({
      kind: "pass-through",
      reason: "message-modifier",
    });
  });

  it("demotes an implicit non-default commit.cleanup setting", () => {
    expect(classify(["-m", "subject"], { commitCleanup: "strip" })).toMatchObject({
      kind: "pass-through",
      reason: "message-modifier",
    });
    expect(classify(["-m", "subject"], { commitCleanup: "default" })).toMatchObject({
      kind: "assembled",
    });
  });

  it("refuses editor-bound explicit messages only without a TTY", () => {
    expect(classify(["--edit", "-m", "subject"])).toEqual({
      kind: "refused",
      reason: "editor-required",
    });
    expect(classify(["--edit", "-m", "subject"], { stdinIsTTY: true })).toMatchObject({
      kind: "pass-through",
    });
  });

  it("passes a template with an explicit source without inferring an editor", () => {
    expect(classify(["--template", "template.txt", "-m", "subject"])).toMatchObject({
      kind: "pass-through",
    });
  });

  it("assembles message argv only when Git's encoding resolves to UTF-8", () => {
    expect(classify(["-m", "subject"], { commitEncoding: "UTF8" })).toMatchObject({
      kind: "assembled",
    });
    expect(classify(["-m", "subject"], { commitEncoding: "iso-8859-1" })).toEqual({
      kind: "pass-through",
      reason: "unsupported-encoding",
    });
    expect(classify(["-m", "subject"], { commitEncoding: "not-an-encoding" })).toEqual({
      kind: "pass-through",
      reason: "unsupported-encoding",
    });
  });

  it("demotes replacement-bearing message argv without affecting file sources", () => {
    expect(classify(["-m", "subject \uFFFD"])).toEqual({
      kind: "pass-through",
      reason: "unsupported-encoding",
    });
    expect(classify(["-F", "message.txt"], { commitEncoding: "iso-8859-1" })).toMatchObject({
      kind: "assembled",
    });
  });

  it.each([
    { args: ["-c", "HEAD", "-m", "subject"] },
    { args: ["--fixup=amend:HEAD", "-m", "subject"] },
    { args: ["--fixup=reword:HEAD", "-F", "message.txt"] },
  ])("leaves incompatible explicit-source combinations to Git", ({ args }) => {
    expect(classify(args)).toMatchObject({
      kind: "pass-through",
      reason: "unsupported-grammar",
    });
  });
});

describe("amend forms", () => {
  it("assembles an amend's explicit message like any commit's", () => {
    expect(classify(["--amend", "-m", "subject"])).toEqual({
      kind: "assembled",
      source: { kind: "messages", values: ["subject"] },
    });
  });

  it("refuses an amend that would open the editor without a TTY and passes it with one", () => {
    expect(classify(["--amend"])).toEqual({ kind: "refused", reason: "editor-required" });
    expect(classify(["--amend"], { stdinIsTTY: true })).toMatchObject({ kind: "pass-through" });
  });

  it("leaves an amend that keeps HEAD's message to Git without an editor", () => {
    expect(classify(["--amend", "--no-edit"])).toEqual({
      kind: "pass-through",
      reason: "git-managed-message",
    });
  });

  it("still assembles an explicit message beside --no-edit", () => {
    expect(classify(["-m", "subject", "--no-edit"])).toMatchObject({ kind: "assembled" });
  });
});

describe("editor-bound and reuse forms", () => {
  it("refuses a source-free editor path without a TTY and passes it with one", () => {
    expect(classify([])).toEqual({ kind: "refused", reason: "editor-required" });
    expect(classify([], { stdinIsTTY: true })).toMatchObject({ kind: "pass-through" });
  });

  it.each([
    { args: ["-c", "HEAD"] },
    { args: ["-t", "template.txt"] },
    { args: ["--fixup=amend:HEAD"] },
    { args: ["--fixup=reword:HEAD"] },
    { args: ["--squash=HEAD"] },
  ])("refuses source-free editor form $args without a TTY", ({ args }) => {
    expect(classify(args)).toEqual({ kind: "refused", reason: "editor-required" });
    expect(classify(args, { stdinIsTTY: true })).toMatchObject({ kind: "pass-through" });
  });

  it.each([
    { args: ["-C", "HEAD"] },
    { args: ["--reuse-message=HEAD"] },
    { args: ["--fixup=HEAD"] },
  ])("keeps editor-free reuse form $args as pass-through", ({ args }) => {
    expect(classify(args)).toMatchObject({ kind: "pass-through" });
  });

  it.each([
    { args: ["--dry-run"] },
    { args: ["--short"] },
    { args: ["--porcelain"] },
    { args: ["--long"] },
    { args: ["--null"] },
    { args: ["-z"] },
    { args: ["--dry-run", "-m", "subject"] },
  ])("keeps report-only form $args as pass-through without a TTY", ({ args }) => {
    expect(classify(args)).toEqual({ kind: "pass-through", reason: "git-managed-message" });
  });

  it("does not refuse squash when an explicit message source is present", () => {
    expect(classify(["--squash=HEAD", "-m", "subject"])).toMatchObject({
      kind: "pass-through",
    });
  });
});

describe("file-source rewriting", () => {
  it.each([
    { args: ["-F", "caller"], expected: ["-F", "snapshot"] },
    { args: ["-Fcaller"], expected: ["-Fsnapshot"] },
    { args: ["-aF", "caller"], expected: ["-aF", "snapshot"] },
    { args: ["-aFcaller"], expected: ["-aFsnapshot"] },
    { args: ["--file", "caller"], expected: ["--file", "snapshot"] },
    { args: ["--file=caller"], expected: ["--file=snapshot"] },
  ])("preserves the option shape for $args", ({ args, expected }) => {
    expect(rewriteCommitFileSource(args, "snapshot")).toEqual(expected);
  });
});

describe("replaceCommitMessageSource", () => {
  it.each([
    {
      label: "messages, keeping every other argument",
      args: ["--amend", "--reset-author", "-m", "subject", "-m", "body", "--", "file-a"],
      expected: ["--amend", "--reset-author", "-F", "/retry", "--", "file-a"],
    },
    { label: "a separated file source", args: ["--amend", "-F", "message.txt"], expected: ["--amend", "-F", "/retry"] },
    { label: "an attached clustered file source", args: ["-qFmessage.txt"], expected: ["-q", "-F", "/retry"] },
    { label: "a long file source", args: ["--file=message.txt", "-a"], expected: ["-a", "-F", "/retry"] },
    { label: "a retry of a retry", args: ["-F", "/retry"], expected: ["-F", "/retry"] },
    {
      label: "messages beside a long option whose operand reads like a message option",
      args: ["--pathspec-from-file", "--message", "-m", "subject"],
      expected: ["--pathspec-from-file", "--message", "-F", "/retry"],
    },
    { label: "a template", args: ["--template", "t.txt", "-a"], expected: ["-a", "-F", "/retry"] },
    { label: "no source", args: ["--amend", "--no-edit"], expected: ["--amend", "--no-edit", "-F", "/retry"] },
  ])("routes $label through the one file", ({ args, expected }) => {
    expect(replaceCommitMessageSource(args, "/retry")).toEqual(expected);
  });

  it("leaves a reused message in place, since it also carries that commit's authorship", () => {
    expect(replaceCommitMessageSource(["-C", "HEAD"], "/retry")).toEqual(["-C", "HEAD", "-F", "/retry"]);
  });
});

describe("reusesCommitMessage", () => {
  it.each([
    [["-C", "HEAD"]],
    [["-qcHEAD"]],
    [["--reuse-message=HEAD"]],
    [["--reedit-message", "HEAD", "--", "file-a"]],
  ])("reports a reused message in %j", (args) => {
    expect(reusesCommitMessage(args)).toBe(true);
  });

  it.each([
    ["no reuse", ["-m", "subject"]],
    ["a message operand", ["-m", "-C"]],
    ["a long option's operand", ["--author", "-C"]],
    ["a pathspec", ["-m", "subject", "--", "-C"]],
  ])("reports none for %s", (_label, args) => {
    expect(reusesCommitMessage(args)).toBe(false);
  });
});

describe("commit-message rewriting to file", () => {
  it("strips a single -m <value> operand pair and appends -F <snapshot>", () => {
    expect(rewriteCommitMessagesToFile(["commit", "-m", "hi"], "/snap")).toEqual([
      "commit",
      "-F",
      "/snap",
    ]);
  });

  it("strips multiple -m operands, appending -F once", () => {
    expect(rewriteCommitMessagesToFile(["commit", "-m", "first", "-m", "second"], "/snap")).toEqual([
      "commit",
      "-F",
      "/snap",
    ]);
  });

  it("strips both --message <value> and --message=<value> long forms", () => {
    expect(
      rewriteCommitMessagesToFile(["commit", "--message", "first", "--message=second"], "/snap"),
    ).toEqual(["commit", "-F", "/snap"]);
  });

  it("strips a clustered -m member while preserving the sibling flag", () => {
    expect(rewriteCommitMessagesToFile(["commit", "-am", "msg"], "/snap")).toEqual([
      "commit",
      "-a",
      "-F",
      "/snap",
    ]);
  });

  it("strips a clustered attached -amVALUE member while preserving the sibling flag", () => {
    expect(rewriteCommitMessagesToFile(["commit", "-amVALUE"], "/snap")).toEqual([
      "commit",
      "-a",
      "-F",
      "/snap",
    ]);
  });

  it("preserves the order and content of non-message arguments", () => {
    expect(
      rewriteCommitMessagesToFile(
        ["commit", "--author", "name", "-m", "msg", "--", "file.txt"],
        "/snap",
      ),
    ).toEqual(["commit", "--author", "name", "-F", "/snap", "--", "file.txt"]);
  });

  it("keeps a long option's separate operand even when it reads like a message option", () => {
    expect(rewriteCommitMessagesToFile(["commit", "--author", "-m", "-m", "subject"], "/snap")).toEqual([
      "commit",
      "--author",
      "-m",
      "-F",
      "/snap",
    ]);
  });

  it("leaves an argv with no -m/--message operands unchanged apart from the appended -F", () => {
    expect(rewriteCommitMessagesToFile(["commit", "--author", "name", "-a"], "/snap")).toEqual([
      "commit",
      "--author",
      "name",
      "-a",
      "-F",
      "/snap",
    ]);
  });
});

describe("abbreviated long-option operands", () => {
  it.each([
    "--mess", "--fil", "--auth", "--dat", "--pathspec-from-f", "--clea",
    "--trai", "--reuse-m", "--reedit-m", "--templ", "--fix", "--squ",
  ])("consumes the required operand after %s", (option) => {
    expect(commitOptionConsumesNext(option, "--no-verif")).toBe(true);
  });

  it.each([
    "--all", "--s", "--f", "--p", "--no-v", "--untracked-f", "--made-up", "--",
    "--pathspec-from-f=paths",
  ])("does not consume an extra operand after %s", (option) => {
    expect(commitOptionConsumesNext(option, "--no-verif")).toBe(false);
  });
});
