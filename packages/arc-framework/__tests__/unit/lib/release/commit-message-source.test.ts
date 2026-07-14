/** Unit tests for release-commit message-source classification. */

import { describe, expect, it } from "vitest";

import { classifyCommitMessageInput } from "../../../../src/lib/release/commit-message-source.js";

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

  it("does not refuse squash when an explicit message source is present", () => {
    expect(classify(["--squash=HEAD", "-m", "subject"])).toMatchObject({
      kind: "pass-through",
    });
  });
});
