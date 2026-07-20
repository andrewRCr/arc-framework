import { execPath } from "node:process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createUserIOContext,
  gitExec,
  prepareGitRefVerification,
  readGitBlobBytes,
} from "../../src/lib/io-context.js";
import {
  createExecaGitExec,
  createExecaGitExecInput,
  MAX_GIT_OUTPUT_BYTES,
} from "../../src/lib/git/process-executor.js";
import { isGitProcessError } from "../../src/lib/git/process-error.js";

const tempDirs: string[] = [];
const candidateExec = createExecaGitExec();
const candidateExecInput = createExecaGitExecInput();

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("candidate GitExec", () => {
  it("uses argument arrays, cwd, raw stderr, and compatible stdout normalization", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-execa-git-"));
    tempDirs.push(root);
    const script = [
      "process.stdout.write(`${process.cwd()}\\n${process.argv[1]}\\n\\n`);",
      "process.stderr.write('diagnostic\\n');",
    ].join("");

    const result = await candidateExec(execPath, ["-e", script, "argument with spaces"], { cwd: root });

    expect(result).toEqual({ stdout: `${root}\nargument with spaces`, stderr: "diagnostic\n" });
  });

  it("captures stdout beyond the execFile default buffer under the 64 MiB ceiling", async () => {
    expect(MAX_GIT_OUTPUT_BYTES).toBe(64 * 1024 * 1024);
    const outputBytes = (1024 * 1024) + 1;

    const result = await candidateExec(execPath, [
      "-e",
      `process.stdout.write("x".repeat(${outputBytes}))`,
    ]);

    expect(result.stdout).toHaveLength(outputBytes);
  });

  it("scrubs repository-local variables when cwd selects the repository", async () => {
    const localGitVariables = [
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
      "GIT_CONFIG",
      "GIT_CONFIG_PARAMETERS",
      "GIT_CONFIG_COUNT",
      "GIT_OBJECT_DIRECTORY",
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_IMPLICIT_WORK_TREE",
      "GIT_GRAFT_FILE",
      "GIT_INDEX_FILE",
      "GIT_NO_REPLACE_OBJECTS",
      "GIT_REPLACE_REF_BASE",
      "GIT_PREFIX",
      "GIT_SHALLOW_FILE",
      "GIT_COMMON_DIR",
    ];
    for (const variable of localGitVariables) vi.stubEnv(variable, `inherited-${variable}`);
    vi.stubEnv("ARC_TEST_SENTINEL", "preserved");

    const script = [
      `const keys = ${JSON.stringify(localGitVariables)};`,
      "const present = keys.filter((key) => process.env[key] !== undefined);",
      "process.stdout.write(JSON.stringify({ present, sentinel: process.env.ARC_TEST_SENTINEL }));",
    ].join("");
    const result = await candidateExec(execPath, ["-e", script], { cwd: process.cwd() });

    expect(JSON.parse(result.stdout)).toEqual({ present: [], sentinel: "preserved" });
  });

  it("preserves inherited environment when an alternate index is supplied without cwd", async () => {
    vi.stubEnv("ARC_TEST_SENTINEL", "preserved");
    const indexFile = "/tmp/arc-test-index";
    const script = [
      "process.stdout.write(JSON.stringify({",
      "sentinel: process.env.ARC_TEST_SENTINEL,",
      "indexFile: process.env.GIT_INDEX_FILE",
      "}));",
    ].join("");

    const result = await candidateExec(execPath, ["-e", script], { indexFile });

    expect(JSON.parse(result.stdout)).toEqual({ sentinel: "preserved", indexFile });
  });

  it("normalizes non-zero, canceled, output-limit, and spawn failures", async () => {
    await expect(candidateExec("git", ["not-a-command"])).rejects.toMatchObject({
      kind: "nonzero-exit",
      exitCode: 1,
    });

    const controller = new AbortController();
    const canceled = candidateExec(execPath, ["-e", "setInterval(() => {}, 1_000)"], {
      signal: controller.signal,
    });
    controller.abort();
    await expect(canceled).rejects.toMatchObject({ kind: "canceled", isCanceled: true });

    const limitedExec = createExecaGitExec(128);
    const limited = limitedExec(execPath, ["-e", "process.stdout.write('x'.repeat(1_024))"]);
    await expect(limited).rejects.toSatisfy((error: unknown) => {
      return isGitProcessError(error)
        && error.kind === "output-limit"
        && error.isMaxBuffer
        && error.stdout.length > 0
        && error.stdout.length <= 128;
    });

    await expect(candidateExec("arc-command-that-does-not-exist", []))
      .rejects.toMatchObject({ kind: "spawn-failure" });
  });
});

describe("candidate GitExecInput", () => {
  it("feeds stdin unchanged and preserves raw stdout", async () => {
    const input = "payload with spaces\nand a final newline\n";

    const stdout = await candidateExecInput(["hash-object", "--stdin"], input);
    const second = await candidateExecInput(["hash-object", "--stdin"], input);

    expect(stdout).toMatch(/^[0-9a-f]{40,64}\n$/u);
    expect(second).toBe(stdout);
  });

  it("retains partial process-capped output in typed output-limit failures", async () => {
    const limitedInput = createExecaGitExecInput(256);
    const input = "HEAD\n".repeat(100);

    await expect(limitedInput(["cat-file", "--batch-check"], input)).rejects.toSatisfy((error: unknown) => {
      return isGitProcessError(error)
        && error.kind === "output-limit"
        && error.stdout.length > 0
        && error.diagnosticStdout.length <= error.stdout.length
        && error.expectedOutcome === undefined;
    });
  });
});

describe("process-backed IO adapters", () => {
  it("holds a prepared ref verification lock until release", async () => {
    const root = await createGitRepo("arc-ref-verification-");
    const { stdout: first } = await gitExec("git", ["rev-parse", "HEAD"], { cwd: root });
    await writeFile(join(root, "seed.txt"), "next", "utf8");
    await gitExec("git", ["commit", "-am", "next"], { cwd: root });
    const { stdout: second } = await gitExec("git", ["rev-parse", "HEAD"], { cwd: root });
    const { stdout: ref } = await gitExec("git", ["symbolic-ref", "HEAD"], { cwd: root });
    await gitExec("git", ["reset", "--hard", first], { cwd: root });

    const lease = await prepareGitRefVerification(root, ref, first);
    try {
      await expect(gitExec("git", ["update-ref", ref, second, first], { cwd: root })).rejects.toThrow();
      await expect(gitExec("git", ["rev-parse", ref], { cwd: root })).resolves.toMatchObject({ stdout: first });
    } finally {
      await lease.release();
    }

    await expect(gitExec("git", ["update-ref", ref, second, first], { cwd: root })).resolves.toBeDefined();
    await expect(gitExec("git", ["rev-parse", ref], { cwd: root })).resolves.toMatchObject({ stdout: second });
  });

  it("preserves arbitrary index and tree blob bytes while distinguishing absence from invalid refs", async () => {
    const root = await createGitRepo("arc-read-git-blob-");
    const bytes = new Uint8Array([0, 1, 2, 10, 13, 127, 128, 254, 255]);
    await writeFile(join(root, "binary.dat"), bytes);
    await gitExec("git", ["add", "binary.dat"], { cwd: root });

    await expect(readGitBlobBytes(root, null, "binary.dat")).resolves.toEqual(bytes);
    await gitExec("git", ["commit", "-m", "binary"], { cwd: root });
    await expect(readGitBlobBytes(root, "HEAD", "binary.dat")).resolves.toEqual(bytes);

    await expect(readGitBlobBytes(root, "HEAD", "missing.txt")).resolves.toBeNull();
    await expect(readGitBlobBytes(root, "missing-ref", "seed.txt")).rejects.toSatisfy(isGitProcessError);
  });

  it("returns null when a notes ref is corrupt", async () => {
    const root = await createGitRepo("arc-read-note-");
    const { stdout: head } = await gitExec("git", ["rev-parse", "HEAD"], { cwd: root });
    const notesDir = join(root, ".git", "refs", "notes");
    await mkdir(notesDir, { recursive: true });
    await writeFile(join(notesDir, "corrupt"), "not-an-object\n", "utf8");

    await expect(createUserIOContext().readNote("refs/notes/corrupt", head)).resolves.toBeNull();
  });

  it("writes and reads large note content through execa stdin without interpolation", async () => {
    const ref = `refs/notes/arc-execa-test-${process.pid}`;
    const content = `literal $() and spaces\n${"payload\n".repeat(32_768)}`;
    const context = createUserIOContext();

    try {
      await context.writeNote(ref, content, "HEAD");
      await expect(context.readNote(ref, "HEAD")).resolves.toBe(content.trimEnd());
    } finally {
      await gitExec("git", ["update-ref", "-d", ref]);
    }
  });
});

async function createGitRepo(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(root);
  await gitExec("git", ["init"], { cwd: root });
  await gitExec("git", ["config", "user.email", "test@example.com"], { cwd: root });
  await gitExec("git", ["config", "user.name", "Test"], { cwd: root });
  await writeFile(join(root, "seed.txt"), "seed", "utf8");
  await gitExec("git", ["add", "seed.txt"], { cwd: root });
  await gitExec("git", ["commit", "-m", "seed"], { cwd: root });
  return root;
}
