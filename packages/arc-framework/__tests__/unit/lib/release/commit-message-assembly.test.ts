/** Unit tests for deterministic commit-message paragraph assembly. */

import { describe, expect, it, vi } from "vitest";

import {
  assembleCommitMessageParagraphs,
  captureCommitMessageFileSource,
  wrapCommitMessageBody,
} from "../../../../src/lib/release/commit-message-assembly.js";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

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

describe("commit message body wrapping", () => {
  it("wraps a plain paragraph longer than width greedily at word boundaries", () => {
    const input = encoder.encode("subject\n\naaa bbb ccc ddd eee\n");

    expect(decoder.decode(wrapCommitMessageBody(input, 11))).toBe(
      "subject\n\naaa bbb ccc\nddd eee\n",
    );
  });

  it("joins a paragraph's existing internal line breaks before re-wrapping", () => {
    const input = encoder.encode("subject\n\naaa bbb\nccc ddd\neee\n");

    expect(decoder.decode(wrapCommitMessageBody(input, 11))).toBe(
      "subject\n\naaa bbb ccc\nddd eee\n",
    );
  });

  it("wraps a flat unordered list item with hanging indent at the marker's content column", () => {
    const input = encoder.encode("subject\n\n- aaa bbb ccc ddd eee\n");

    expect(decoder.decode(wrapCommitMessageBody(input, 13))).toBe(
      "subject\n\n- aaa bbb ccc\n  ddd eee\n",
    );
  });

  it("wraps a flat ordered list item with hanging indent at its marker's content column", () => {
    const input = encoder.encode("subject\n\n1. aaa bbb ccc ddd eee\n");

    expect(decoder.decode(wrapCommitMessageBody(input, 14))).toBe(
      "subject\n\n1. aaa bbb ccc\n   ddd eee\n",
    );
  });

  it("keeps an unbreakable token longer than width on its own line without force-splitting", () => {
    const input = encoder.encode("subject\n\nstart averylongwordthatexceedswidth end\n");

    expect(decoder.decode(wrapCommitMessageBody(input, 10))).toBe(
      "subject\n\nstart\naverylongwordthatexceedswidth\nend\n",
    );
  });

  it("never wraps the subject regardless of its length", () => {
    const subject = "subject line that is definitely much longer than the given width value";
    const input = encoder.encode(`${subject}\n`);

    expect(decoder.decode(wrapCommitMessageBody(input, 10))).toBe(`${subject}\n`);
  });

  it("passes footer/trailer lines through verbatim", () => {
    const input = encoder.encode(
      "subject\n\nContext: this is a very long trailer value that would exceed the width if wrapped\n\nSigned-off-by: Jane Doe <jane@example.com>\n",
    );

    expect(decoder.decode(wrapCommitMessageBody(input, 10))).toBe(decoder.decode(input));
  });

  it("passes a fenced code block through verbatim", () => {
    const input = encoder.encode(
      "subject\n\n```\ncode line that is quite long and would normally wrap here\n  indented inside fence\n```\n",
    );

    expect(decoder.decode(wrapCommitMessageBody(input, 10))).toBe(decoder.decode(input));
  });

  it("passes an indented code block through verbatim", () => {
    const input = encoder.encode(
      "subject\n\n    code that is indented and quite long across the line\n",
    );

    expect(decoder.decode(wrapCommitMessageBody(input, 10))).toBe(decoder.decode(input));
  });

  it("passes table rows through verbatim", () => {
    const input = encoder.encode("subject\n\n| a | b | c that is quite long here maybe |\n");

    expect(decoder.decode(wrapCommitMessageBody(input, 10))).toBe(decoder.decode(input));
  });

  it("passes nested (indented) list items through verbatim", () => {
    const input = encoder.encode(
      "subject\n\n  - nested item text that is quite long and would wrap otherwise\n",
    );

    expect(decoder.decode(wrapCommitMessageBody(input, 10))).toBe(decoder.decode(input));
  });

  it("is idempotent when re-wrapping already-wrapped output, including a wide ordered marker", () => {
    const input = encoder.encode("subject\n\n10. aaa bbb ccc ddd eee fff ggg\n");

    const wrappedOnce = wrapCommitMessageBody(input, 13);
    expect(decoder.decode(wrappedOnce)).toBe(
      "subject\n\n10. aaa bbb\n    ccc ddd\n    eee fff\n    ggg\n",
    );

    const wrappedTwice = wrapCommitMessageBody(wrappedOnce, 13);
    expect(wrappedTwice).toEqual(wrappedOnce);
  });

  it("wraps eligible blocks at a non-default width", () => {
    const words = Array.from({ length: 20 }, () => "word");
    const input = encoder.encode(`subject\n\n${words.join(" ")}\n`);

    const expectedFirst = words.slice(0, 16).join(" ");
    const expectedSecond = words.slice(16).join(" ");
    expect(decoder.decode(wrapCommitMessageBody(input, 80))).toBe(
      `subject\n\n${expectedFirst}\n${expectedSecond}\n`,
    );
  });

  it("threads width through assembleCommitMessageParagraphs and preserves no-width output", () => {
    const values = ["subject", "aaa bbb ccc ddd eee"];

    expect(assembleCommitMessageParagraphs(values, undefined)).toEqual(
      assembleCommitMessageParagraphs(values),
    );
    expect(decoder.decode(assembleCommitMessageParagraphs(values, 11))).toBe(
      "subject\n\naaa bbb ccc\nddd eee\n",
    );
  });
});
