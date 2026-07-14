/** Unit tests for deterministic commit-message paragraph assembly. */

import { describe, expect, it } from "vitest";

import { assembleCommitMessageParagraphs } from "../../../../src/lib/release/commit-message-assembly.js";

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
