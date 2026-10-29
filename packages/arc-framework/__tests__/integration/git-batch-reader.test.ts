/** Real native protocol framing, cancellation, request-local output bounds, reader isolation, and exchange order. */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GitBatchReadScope, type GitBatchReadInvocation } from "../../src/lib/git/batch-reader.js";
import { createExecaRawGitExec, sanitizeGitRepositoryEnvironment } from "../../src/lib/git/process-executor.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";

const bytes = (text: string) => Buffer.from(text);
const text = (output: Uint8Array) => new TextDecoder().decode(output);

async function writeBlob(root: string, content: string): Promise<string> {
  return text((await createExecaRawGitExec(root)(["hash-object", "-w", "--stdin"], { input: bytes(content) })).stdout).trim();
}

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
  it("keeps a native reader to one exact binding and reuses it only for an identical one", async () => {
    const [a, b] = [await createRefReadFixture(), await createRefReadFixture()];
    const [alpha, beta] = [await writeBlob(a.root, "alpha\n"), await writeBlob(b.root, "beta\n")];
    const scope = new GitBatchReadScope(), env = sanitizeGitRepositoryEnvironment(process.env);
    let started = 0;
    const read = async (binding: Partial<GitBatchReadInvocation> & Pick<GitBatchReadInvocation, "input">) => text((await scope.run({
      args: ["cat-file", "--batch"], cwd: a.root, env, maxBuffer: 1_000_000, onStart: () => { started += 1; }, ...binding })).stdout);
    try {
      expect(await read({ input: bytes(`${alpha}\n`) })).toContain("alpha\n");
      expect(await read({ input: bytes(`${beta}\n`) })).toBe(`${beta} missing\n`);
      expect(started).toBe(1);
      expect(await read({ cwd: b.root, input: bytes(`${alpha}\n${beta}\n`) })).toBe(`${alpha} missing\n${beta} blob 5\nbeta\n\n`);
      const alternate = { ...env, GIT_ALTERNATE_OBJECT_DIRECTORIES: join(b.root, ".git", "objects") };
      expect(await read({ env: alternate, input: bytes(`${beta}\n`) })).toBe(`${beta} blob 5\nbeta\n\n`);
      expect(await read({ args: [`--git-dir=${join(b.root, ".git")}`, "cat-file", "--batch"], input: bytes(`${beta}\n`) }))
        .toBe(`${beta} blob 5\nbeta\n\n`);
      expect(started).toBe(4);
      expect(await read({ input: bytes(`${alpha}\n`) })).toContain("alpha\n");
      expect(started).toBe(4);
    } finally { await scope.close(); }
  });
  it("completes concurrent exchanges in submission order, each with only its own output", async () => {
    const f = await createRefReadFixture();
    const raw = createExecaRawGitExec(f.root, 16_000_000), scope = new GitBatchReadScope();
    const [large, small] = [await writeBlob(f.root, "a".repeat(4_000_000)), await writeBlob(f.root, "small\n")];
    // The second binding names the same repository by argument, so its exchanges run on a separate native reader.
    const [own, named] = [[], [`--git-dir=${join(f.root, ".git")}`]];
    const requests = [[own, large], [named, small], [own, small], [named, large], [own, `${small}\n${large}`]] as const;
    const expected = requests.map(([, objects]) => objects.split("\n")
      .map(object => object === small ? `${small} blob 6\nsmall\n\n` : `${large} blob 4000000\n${"a".repeat(4_000_000)}\n`).join(""));
    const completed: number[] = [];
    try {
      const outputs = await Promise.all(requests.map(async ([prefix, objects], index) => {
        const result = await raw([...prefix, "cat-file", "--batch"], { input: bytes(`${objects}\n`), objectAccess: "local-only", batchReader: scope });
        completed.push(index);
        return text(result.stdout);
      }));
      expect(completed).toEqual([0, 1, 2, 3, 4]);
      expect(outputs).toEqual(expected);
    } finally { await scope.close(); }
  }, 30_000);
});
