/** Terminal presentation keeps stdout for a machine-readable command's document. */
import { Writable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runWithMachineOutput } from "../../src/lib/machine-output-scope.js";
import * as p from "../../src/lib/terminal.js";

function captureStandardStreams(): { stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
  return { stdout, stderr };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("terminal presentation", () => {
  it("writes to stdout outside a machine-output scope", () => {
    const streams = captureStandardStreams();

    p.log.error("refused here");

    expect(streams.stdout.join("")).toContain("refused here");
    expect(streams.stderr).toEqual([]);
  });

  it("writes every presentation call to stderr inside a machine-output scope, across awaits", async () => {
    const streams = captureStandardStreams();

    await runWithMachineOutput(async () => {
      await Promise.resolve();
      p.intro("arc command");
      p.log.error("refused here");
      p.log.warn("warned here");
      p.note("note body", "Note title");
      p.outro("done here");
    });

    expect(streams.stdout).toEqual([]);
    const written = streams.stderr.join("");
    for (const text of ["arc command", "refused here", "warned here", "note body", "Note title", "done here"]) {
      expect(written).toContain(text);
    }
  });

  it("keeps an output the caller names inside a machine-output scope", () => {
    const named: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, done) {
        named.push(String(chunk));
        done();
      },
    });
    const streams = captureStandardStreams();

    runWithMachineOutput(() => p.log.warn("named output", { output: sink }));

    expect(named.join("")).toContain("named output");
    expect(streams.stdout).toEqual([]);
    expect(streams.stderr).toEqual([]);
  });
});
