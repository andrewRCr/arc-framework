/** Byte framing and malformed-stream refusal without native processes. */
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { GitBatchOutput } from "../../../src/lib/git/batch-output.js";

const query = Buffer.from("HEAD\n");
const header = `${"a".repeat(40)} blob `;
const framing = (chunks: Uint8Array[]) => new GitBatchOutput(Readable.from(chunks), 1024, { command: "git", args: ["cat-file", "--batch"] });

describe("Git batch output", () => {
  it.each([1, 3, 64])("retains exact binary bytes across %i-byte stream chunks", async (width) => {
    const reply = Buffer.concat([Buffer.from(header + "5\n"), Buffer.from([104, 0, 255, 10, 111, 10])]);
    const chunks = Array.from({ length: Math.ceil(reply.length / width) }, (_, index) => reply.subarray(index * width, (index + 1) * width));
    const output = framing(chunks);
    expect(Buffer.from(await output.read(query))).toEqual(reply);
    await output.finish();
  });
  it.each([
    ["header", "not an object\n"], ["unsafe size", header + "9007199254740992\n"],
    ["terminator", header + "1\nxy"], ["truncated bytes", header + "5\nabc"],
    ["trailing bytes", header + "1\nx\nextra"], ["unterminated header", header + "1"],
  ])("refuses %s without returning a usable reply", async (_kind, reply) => {
    const output = framing([Buffer.from(reply)]);
    await expect(output.read(query)).rejects.toThrow();
  });
});
