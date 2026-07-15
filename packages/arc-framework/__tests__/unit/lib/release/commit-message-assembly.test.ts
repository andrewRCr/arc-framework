/** Unit tests for deterministic commit-message paragraph assembly. */

import { describe, expect, it, vi } from "vitest";

import {
  assembleCommitMessageParagraphs,
  captureCommitMessageFileSource,
} from "../../../../src/lib/release/commit-message-assembly.js";

const decoder = new TextDecoder();

describe("commit message paragraph assembly", () => {
  it("joins repeated message values as paragraphs with a terminal newline", () => {
    expect(decoder.decode(assembleCommitMessageParagraphs(["subject"]))).toBe("subject\n");
    expect(decoder.decode(assembleCommitMessageParagraphs(["subject", "body"]))).toBe(
      "subject\n\nbody\n",
    );
  });

  it("applies whitespace cleanup to paragraph content", () => {
    const values = ["\r\nsubject  \r\nline\t \r\n\r\n\r\nbody \n\n", "tail   "];

    expect(decoder.decode(assembleCommitMessageParagraphs(values))).toBe(
      "subject\nline\n\nbody\n\ntail\n",
    );
  });

  it("removes empty edge paragraphs and collapses interior blank lines", () => {
    expect(decoder.decode(assembleCommitMessageParagraphs(["", "", "body", ""]))).toBe(
      "body\n",
    );
    expect(decoder.decode(assembleCommitMessageParagraphs(["subject", "", "body"]))).toBe(
      "subject\n\nbody\n",
    );
    expect(assembleCommitMessageParagraphs([""])).toEqual(new Uint8Array());
  });

  it("keeps literal backslashes and shell metacharacters as data", () => {
    const message = "literal \\n $HOME $(command) 'single' \"double\" \\";

    expect(decoder.decode(assembleCommitMessageParagraphs([message]))).toBe(`${message}\n`);
  });
});

describe("commit message file capture", () => {
  it.each([
    { path: "message.txt", expectedInput: "file" },
    { path: "-", expectedInput: "stdin" },
  ])("captures and cleans $expectedInput bytes once", async ({ path, expectedInput }) => {
    const source = Buffer.from("subject   \n\n\nbody");
    const readFile = vi.fn().mockResolvedValue(source);
    const readStdin = vi.fn().mockResolvedValue(source);

    const result = await captureCommitMessageFileSource(path, { readFile, readStdin });

    expect(result).toEqual({
      kind: "captured",
      input: expectedInput,
      rawBytes: Uint8Array.from(source),
      messageBytes: Uint8Array.from(Buffer.from("subject\n\nbody\n")),
    });
    expect(readFile).toHaveBeenCalledTimes(expectedInput === "file" ? 1 : 0);
    expect(readStdin).toHaveBeenCalledTimes(expectedInput === "stdin" ? 1 : 0);
  });

  it("preserves non-UTF-8 source bytes in an immutable capture", async () => {
    const source = Uint8Array.from([0x63, 0x61, 0x66, 0xe9, 0x20]);
    const result = await captureCommitMessageFileSource("message.txt", {
      readFile: async () => source,
      readStdin: async () => new Uint8Array(),
    });
    source.fill(0);

    expect(result).toEqual({
      kind: "captured",
      input: "file",
      rawBytes: Uint8Array.from([0x63, 0x61, 0x66, 0xe9, 0x20]),
      messageBytes: Uint8Array.from([0x63, 0x61, 0x66, 0xe9, 0x0a]),
    });
  });

  it.each(["subject", "subject\n\n\n"])(
    "normalizes file sources with or without terminal newlines",
    async (source) => {
      const result = await captureCommitMessageFileSource("message.txt", {
        readFile: async () => Buffer.from(source),
        readStdin: async () => new Uint8Array(),
      });

      expect(result).toMatchObject({
        kind: "captured",
        messageBytes: Uint8Array.from(Buffer.from("subject\n")),
      });
    },
  );

  it.each([
    { path: "message.txt", expectedInput: "file" },
    { path: "-", expectedInput: "stdin" },
  ])("returns a bounded input error when $expectedInput capture fails", async ({ path, expectedInput }) => {
    const failure = new Error(`\u001b[31m${"x".repeat(500)}`);
    const result = await captureCommitMessageFileSource(path, {
      readFile: async () => Promise.reject(failure),
      readStdin: async () => Promise.reject(failure),
    });

    expect(result).toMatchObject({ kind: "error", input: expectedInput, reason: "input" });
    if (result.kind !== "error") throw new Error("expected capture error");
    expect(result.message.length).toBeLessThanOrEqual(240);
    expect(result.message).not.toContain("x".repeat(500));
    expect(result.message).toContain("\\u001b");
    expect(result.message).not.toContain("\u001b");
  });
});
