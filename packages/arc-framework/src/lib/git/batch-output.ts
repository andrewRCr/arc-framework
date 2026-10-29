/** Bounded byte framing for successive requests to a native cat-file batch reader. */
import type { Readable } from "node:stream";
import { GitProcessError, type GitInvocation } from "./process-error.js";

/** Consume exactly one request's replies without closing the persistent output stream. */
export class GitBatchOutput {
  private readonly iterator: AsyncIterator<Uint8Array>;
  private pending = Buffer.alloc(0);
  private used = 0;
  private pieces: Buffer[] = [];

  /** Keep one stream cursor across serialized requests. */
  constructor(stream: Readable, private readonly maxBuffer: number, private readonly invocation: GitInvocation) {
    this.iterator = stream[Symbol.asyncIterator]();
  }

  /** Read missing-object headers or length-delimited object frames, retaining exact bytes. */
  async read(input: Uint8Array): Promise<Uint8Array> {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(input);
    if (!text.endsWith("\n")) throw new Error("A Git batch request must end with a newline");
    const queries = text.slice(0, -1).split("\n");
    this.used = 0;
    this.pieces = [];
    for (const query of queries) {
      const header = await this.line();
      if (header === `${query} missing`) continue;
      const match = /^(?:[0-9a-f]{40}|[0-9a-f]{64}) (?:blob|tree|commit|tag) (\d+)$/u.exec(header);
      const size = Number(match?.[1]);
      if (!match || !Number.isSafeInteger(size) || size < 0) throw new Error("Malformed Git batch header");
      await this.take(size);
      if ((await this.take(1))[0] !== 10) throw new Error("Malformed Git batch object terminator");
    }
    if (this.pending.length !== 0) throw new Error("Unexpected trailing Git batch output");
    return Buffer.concat(this.pieces, this.used);
  }

  /** Drain the final EOF so a closing child cannot retain an unread pipe handle. */
  async finish(): Promise<void> {
    if (this.pending.length !== 0 || !(await this.iterator.next()).done) {
      throw new Error("Unexpected trailing Git batch output");
    }
  }

  private async fill(): Promise<void> {
    if (this.pending.length !== 0) return;
    const chunk = await this.iterator.next();
    if (chunk.done) throw new Error("Truncated Git batch output");
    this.pending = Buffer.from(chunk.value);
  }

  private async line(): Promise<string> {
    const chunks: Buffer[] = [];
    for (;;) {
      await this.fill();
      const end = this.pending.indexOf(10);
      chunks.push(await this.take(end < 0 ? this.pending.length : end + 1));
      if (end >= 0) return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks).subarray(0, -1));
    }
  }

  private async take(length: number): Promise<Buffer> {
    if (length > this.maxBuffer - this.used) {
      throw new GitProcessError({ ...this.invocation, kind: "output-limit", isMaxBuffer: true });
    }
    const chunks: Buffer[] = [];
    while (length > 0) {
      await this.fill();
      const count = Math.min(length, this.pending.length);
      const bytes = this.pending.subarray(0, count);
      chunks.push(bytes); this.pieces.push(bytes); this.used += count;
      this.pending = this.pending.subarray(count);
      length -= count;
    }
    return Buffer.concat(chunks);
  }
}
