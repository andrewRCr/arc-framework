/** Unit tests for standalone commit-message validation orchestration. */

import { describe, expect, it, vi } from "vitest";

import { runCheckCommitMessage } from "../../../../src/handlers/check/commit-msg.js";
import {
  COMMIT_CHECK_DEFAULTS,
  createCommitCheckContext,
} from "../../../../src/lib/commit-check/index.js";
import type { CommitCheckContext } from "../../../../src/lib/commit-check/index.js";

function repository(encoding = "utf-8"): { encoding: string; context: CommitCheckContext } {
  return {
    encoding,
    context: createCommitCheckContext({
      configuration: {
        ...COMMIT_CHECK_DEFAULTS,
        "commit.format": "any",
        "commit.context_footer": "disabled",
      },
      mergeInProgress: false,
      resolveArtifact: () => "found",
    }),
  };
}

describe("runCheckCommitMessage", () => {
  it.each([
    { source: "message.txt", expectedRead: "file" },
    { source: "-", expectedRead: "stdin" },
  ])("preserves raw bytes from $expectedRead input", async ({ source, expectedRead }) => {
    const bytes = Uint8Array.from(Buffer.from("A sufficiently long subject\n", "utf8"));
    const readFile = vi.fn().mockResolvedValue(bytes);
    const readStdin = vi.fn().mockResolvedValue(bytes);

    const outcome = await runCheckCommitMessage(source, {
      readFile,
      readStdin,
      setupRepository: async () => repository(),
    });

    expect(outcome).toMatchObject({
      kind: "result",
      exitCode: 0,
      result: { kind: "validated", verdict: "pass" },
    });
    if (outcome.kind !== "result") throw new Error("expected validation result");
    expect(outcome.sourceBytes).toEqual(bytes);
    expect(readFile).toHaveBeenCalledTimes(expectedRead === "file" ? 1 : 0);
    expect(readStdin).toHaveBeenCalledTimes(expectedRead === "stdin" ? 1 : 0);
  });

  it.each([
    { encoding: "utf-8", bytes: Buffer.from("A sufficiently long subject\n", "utf8") },
    { encoding: "windows-1252", bytes: Uint8Array.from(Buffer.from("A sufficiently long café\n", "latin1")) },
  ])("decodes $encoding input in fatal mode", async ({ encoding, bytes }) => {
    const outcome = await runCheckCommitMessage("message.txt", {
      readFile: async () => bytes,
      readStdin: async () => new Uint8Array(),
      setupRepository: async () => repository(encoding),
    });

    expect(outcome).toMatchObject({
      kind: "result",
      exitCode: 0,
      result: { kind: "validated", verdict: "pass" },
    });
  });

  it("rejects an unsupported repository encoding", async () => {
    const outcome = await runCheckCommitMessage("message.txt", {
      readFile: async () => Buffer.from("A sufficiently long subject\n"),
      readStdin: async () => new Uint8Array(),
      setupRepository: async () => repository("not-a-real-encoding"),
    });

    expect(outcome).toEqual({
      kind: "error",
      exitCode: 2,
      error: {
        kind: "infrastructure",
        code: "encoding.unsupported",
        message: "Git i18n.commitEncoding names unsupported encoding: not-a-real-encoding",
      },
    });
  });

  it("rejects malformed bytes for the configured encoding", async () => {
    const outcome = await runCheckCommitMessage("message.txt", {
      readFile: async () => Uint8Array.from([0xc3, 0x28]),
      readStdin: async () => new Uint8Array(),
      setupRepository: async () => repository(),
    });

    expect(outcome).toEqual({
      kind: "error",
      exitCode: 2,
      error: {
        kind: "infrastructure",
        code: "encoding.malformed",
        message: "Commit-message input is not valid utf-8.",
      },
    });
  });

  it.each([
    {
      label: "validation failure",
      bytes: Buffer.from("short\n"),
      repo: {
        encoding: "utf-8",
        context: createCommitCheckContext({
          configuration: {
            ...COMMIT_CHECK_DEFAULTS,
            "commit.context_footer": "disabled",
          },
          mergeInProgress: false,
          resolveArtifact: () => "found",
        }),
      },
      expected: { kind: "result", exitCode: 1, result: { kind: "validated", verdict: "fail" } },
    },
    {
      label: "validation warning",
      bytes: Buffer.from("feat(check): a sufficiently long subject\n"),
      repo: {
        encoding: "utf-8",
        context: createCommitCheckContext({
          configuration: {
            ...COMMIT_CHECK_DEFAULTS,
            "commit.context_footer": "recommended",
          },
          mergeInProgress: false,
          resolveArtifact: () => "not-found",
        }),
      },
      expected: {
        kind: "result",
        exitCode: 0,
        result: { kind: "validated", verdict: "pass-with-warnings" },
      },
    },
  ])("maps $label to its stable exit code", async ({ bytes, repo, expected }) => {
    const outcome = await runCheckCommitMessage("message.txt", {
      readFile: async () => bytes,
      readStdin: async () => new Uint8Array(),
      setupRepository: async () => repo,
    });

    expect(outcome).toMatchObject(expected);
  });

  it("returns a usage error when the input is missing", async () => {
    const setupRepository = vi.fn().mockResolvedValue(repository());

    const outcome = await runCheckCommitMessage(undefined, {
      readFile: async () => new Uint8Array(),
      readStdin: async () => new Uint8Array(),
      setupRepository,
    });

    expect(outcome).toMatchObject({
      kind: "error",
      exitCode: 2,
      error: { kind: "usage", code: "input.required" },
    });
    expect(setupRepository).not.toHaveBeenCalled();
  });

  it("returns an infrastructure error when the input is unreadable", async () => {
    const outcome = await runCheckCommitMessage("missing\u001b[31m.txt", {
      readFile: async () => {
        throw new Error(`permission denied \u001b[31m${"x".repeat(200)}`);
      },
      readStdin: async () => new Uint8Array(),
      setupRepository: async () => repository(),
    });

    expect(outcome).toMatchObject({
      kind: "error",
      exitCode: 2,
      error: {
        kind: "infrastructure",
        code: "input.unreadable",
        message: expect.stringMatching(/^Could not read commit-message input missing\\u001b\[31m\.txt: /),
      },
    });
    if (outcome.kind !== "error") throw new Error("expected infrastructure error");
    expect(outcome.error.message).toContain("permission denied \\u001b");
    expect(outcome.error.message).not.toContain("\u001b");
    expect(outcome.error.message).toMatch(/…$/);
  });

  it("returns an infrastructure error when repository setup fails", async () => {
    const outcome = await runCheckCommitMessage("message.txt", {
      readFile: async () => Buffer.from("A sufficiently long subject\n"),
      readStdin: async () => new Uint8Array(),
      setupRepository: async () => {
        throw new Error(`not a git repository \u001b[31m${"x".repeat(200)}`);
      },
    });

    expect(outcome).toMatchObject({
      kind: "error",
      exitCode: 2,
      error: {
        kind: "infrastructure",
        code: "repository.setup-failed",
        message: expect.stringContaining("not a git repository \\u001b"),
      },
    });
    if (outcome.kind !== "error") throw new Error("expected infrastructure error");
    expect(outcome.error.message).not.toContain("\u001b");
    expect(outcome.error.message).toMatch(/…$/);
  });
});
