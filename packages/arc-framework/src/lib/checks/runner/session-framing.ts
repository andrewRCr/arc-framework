/** Strict UTF-8 NDJSON framing independent of stream chunk boundaries. */
import { parseRunnerMessage, type RunnerMessage } from "./contract.js";

/** Largest protocol line ARC buffers from an adapter, far above any valid message. */
export const MAX_RUNNER_FRAME_BYTES = 128 * 1024 * 1024;

/** Preserve partial byte sequences until a complete newline-delimited message arrives. */
export class RunnerMessageFramer {
  private parts: Uint8Array[] = [];
  private bytes = 0;
  private readonly limit: number;

  constructor(limit = MAX_RUNNER_FRAME_BYTES) { this.limit = limit; }

  /** Deliver complete frames in order, including required asynchronous consumers. */
  async accept(chunk: Uint8Array, consume: (message: RunnerMessage) => Promise<void>): Promise<void> {
    let start = 0;
    for (let index = 0; index < chunk.length; index++) {
      if (chunk[index] !== 10) continue;
      this.append(chunk.subarray(start, index));
      const frame = Buffer.concat(this.parts, this.bytes);
      this.parts = [];
      this.bytes = 0;
      const line = frame.at(-1) === 13 ? frame.subarray(0, -1) : frame;
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(line); }
      catch { throw new Error("Runner emitted invalid UTF-8; repair the runner and retry the check request."); }
      await consume(parseRunnerMessage(text));
      start = index + 1;
    }
    this.append(chunk.subarray(start));
  }

  /** Refuse an unterminated final frame, including an incomplete UTF-8 sequence. */
  finish(): void {
    if (this.bytes !== 0) throw new Error("Runner ended with an incomplete JSON-RPC line; repair the runner and retry the check request.");
  }

  private append(part: Uint8Array): void {
    if (part.length === 0) return;
    if (this.bytes + part.length > this.limit) {
      throw new Error(`Runner emitted a JSON-RPC line longer than ${this.limit} bytes; repair the runner and retry the check request.`);
    }
    this.parts.push(part);
    this.bytes += part.length;
  }
}
