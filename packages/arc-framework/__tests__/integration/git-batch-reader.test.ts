/** Real native protocol framing, cancellation, and request-local output bounds. */
import { describe, expect, it } from "vitest";
import { GitBatchReadScope } from "../../src/lib/git/batch-reader.js";
import { createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";

const bytes = (text: string) => Buffer.from(text);

describe("native Git batch reader", () => {
  it("preserves binary framing across consecutive requests and missing objects", async () => {
    const f = await createRefReadFixture();
    const raw = createExecaRawGitExec(f.root);
    const content = Buffer.concat([bytes("雪\r\n\0"), Buffer.alloc(200_000, 255)]);
    const blob = new TextDecoder().decode((await raw(["hash-object", "-w", "--stdin"], { input: content })).stdout).trim();
    const scope = new GitBatchReadScope();
    try {
      for (const input of [bytes("HEAD\n"), bytes(`${blob}\n${"0".repeat(40)}\nHEAD^{tree}\n`), bytes(`${blob}\n`)]) {
        const expected = await raw(["cat-file", "--batch"], { input, objectAccess: "local-only" });
        const actual = await raw(["cat-file", "--batch"], { input, objectAccess: "local-only", batchReader: scope });
        expect(Buffer.from(actual.stdout)).toEqual(Buffer.from(expected.stdout));
      }
    } finally { await scope.close(); }
    await expect(raw(["cat-file", "--batch"], { input: bytes("HEAD\n"), objectAccess: "local-only", batchReader: scope }))
      .rejects.toMatchObject({ kind: "unexpected" });
  });
  it("applies output limits to each request and reopens safely after overflow", async () => {
    const f = await createRefReadFixture();
    const raw = createExecaRawGitExec(f.root, 128);
    const blob = new TextDecoder().decode((await f.ports.rawExec(["hash-object", "-w", "--stdin"], { input: bytes("short\r\n") })).stdout).trim();
    const scope = new GitBatchReadScope();
    const request = (input: string) => raw(["cat-file", "--batch"], { input: bytes(input), objectAccess: "local-only", batchReader: scope });
    try {
      for (let i = 0; i < 4; i += 1) expect(new TextDecoder().decode((await request(`${blob}\n`)).stdout)).toContain("short\r\n");
      await expect(request(`${blob}\n`.repeat(4))).rejects.toMatchObject({ kind: "output-limit", isMaxBuffer: true });
      expect(new TextDecoder().decode((await request(`${blob}\n`)).stdout)).toContain("short\r\n");
    } finally { await scope.close(); }
  });
  it("ends an in-flight native reader on cancellation and permits a fresh exchange", async () => {
    const f = await createRefReadFixture();
    const raw = createExecaRawGitExec(f.root);
    const scope = new GitBatchReadScope(), controller = new AbortController();
    try {
      const pending = raw(["cat-file", "--batch"], { input: bytes("HEAD\n"), objectAccess: "local-only", batchReader: scope, signal: controller.signal });
      // The scope's queued exchange spawns before this continuation; no output event has run yet.
      await Promise.resolve();
      controller.abort();
      await expect(pending).rejects.toMatchObject({ kind: "canceled", isCanceled: true });
      expect(new TextDecoder().decode((await raw(["cat-file", "--batch"], {
        input: bytes("HEAD\n"), objectAccess: "local-only", batchReader: scope,
      })).stdout)).toContain(" commit ");
    } finally { await scope.close(); }
  }, 10_000);
  it("retains native failure diagnostics and permits another repository request", async () => {
    const f = await createRefReadFixture();
    const raw = createExecaRawGitExec(f.root), scope = new GitBatchReadScope();
    try {
      await expect(raw(["--git-dir=missing-store", "cat-file", "--batch"], {
        input: bytes("HEAD\n"), objectAccess: "local-only", batchReader: scope,
      })).rejects.toMatchObject({ kind: "nonzero-exit", exitCode: 128, stderr: expect.stringContaining("not a git repository") });
      expect(new TextDecoder().decode((await raw(["cat-file", "--batch"], {
        input: bytes("HEAD\n"), objectAccess: "local-only", batchReader: scope,
      })).stdout)).toContain(" commit ");
    } finally { await scope.close(); }
  });

});
