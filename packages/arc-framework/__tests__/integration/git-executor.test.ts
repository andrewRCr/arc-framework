import { execPath } from "node:process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createUserIOContext,
  gitExec,
  gitExecInput,
  prepareGitRefVerification,
  readGitBlobBytes,
} from "../../src/lib/io-context.js";
import { boundedFetch, boundedGitInvocation } from "../../src/lib/git/exec.js";
import { deleteRemoteBranch } from "../../src/lib/work-unit/mutators/reconcile-branch.js";
import {
  createExecaGitExec,
  createExecaGitExecInput,
  MAX_GIT_OUTPUT_BYTES,
} from "../../src/lib/git/process-executor.js";
import { isGitProcessError } from "../../src/lib/git/process-error.js";
import { realGitDiff } from "../../src/handlers/installation.js";

const tempDirs: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("production GitExec", () => {
  it("uses argument arrays, cwd, raw stderr, and compatible stdout normalization", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-execa-git-"));
    tempDirs.push(root);
    const canonicalRoot = await realpath(root);
    const script = [
      "process.stdout.write(`${process.cwd()}\\n${process.argv[1]}\\n\\n`);",
      "process.stderr.write('diagnostic\\n');",
    ].join("");

    const result = await gitExec(execPath, ["-e", script, "argument with spaces"], { cwd: root });

    expect(result).toEqual({ stdout: `${canonicalRoot}\nargument with spaces`, stderr: "diagnostic\n" });
  });

  it("captures stdout beyond the execFile default buffer under the 64 MiB ceiling", async () => {
    expect(MAX_GIT_OUTPUT_BYTES).toBe(64 * 1024 * 1024);
    const outputBytes = (1024 * 1024) + 1;

    const result = await gitExec(execPath, [
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
    const result = await gitExec(execPath, ["-e", script], { cwd: process.cwd() });

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

    const result = await gitExec(execPath, ["-e", script], { indexFile });

    expect(JSON.parse(result.stdout)).toEqual({ sentinel: "preserved", indexFile });
  });

  it("normalizes non-zero, canceled, output-limit, and spawn failures", async () => {
    await expect(gitExec("git", ["not-a-command"])).rejects.toMatchObject({
      kind: "nonzero-exit",
      exitCode: 1,
    });

    const controller = new AbortController();
    const canceled = gitExec(execPath, ["-e", "setInterval(() => {}, 1_000)"], {
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

    await expect(gitExec("arc-command-that-does-not-exist", []))
      .rejects.toMatchObject({ kind: "spawn-failure" });
  });

  it("classifies a missing branch fetched from a local bare remote", async () => {
    const root = await createGitRepo("arc-absent-ref-");
    const remote = await mkdtemp(join(tmpdir(), "arc-absent-ref-remote-"));
    tempDirs.push(remote);
    await gitExec("git", ["init", "--bare"], { cwd: remote });
    await gitExec("git", ["remote", "add", "origin", remote], { cwd: root });
    const boundExec = (command: string, args: string[], options = {}) =>
      gitExec(command, args, { ...options, cwd: root });

    const result = await boundedFetch(boundExec, "missing-branch", 1_000);

    expect(result.outcome).toBe("error");
    if (result.outcome !== "error") return;
    expect(result.error).toMatchObject({
      kind: "nonzero-exit",
      exitCode: 128,
      expectedOutcome: "absent-remote-ref",
    });
  });

  it("relabels only a caller-aborted production invocation as timeout", async () => {
    const root = await createGitRepo("arc-bounded-timeout-");
    const boundExec = (command: string, args: string[], options = {}) =>
      gitExec(command, args, { ...options, cwd: root });

    const result = await boundedGitInvocation(boundExec, ["cat-file", "--batch"], 25);

    expect(result).toEqual({ outcome: "timeout" });
  });

  it("classifies a real rejected production lease as stale", async () => {
    const root = await createGitRepo("arc-stale-lease-");
    const remote = await mkdtemp(join(tmpdir(), "arc-stale-lease-remote-"));
    tempDirs.push(remote);
    await gitExec("git", ["init", "--bare"], { cwd: remote });
    await gitExec("git", ["remote", "add", "origin", remote], { cwd: root });
    const { stdout: expectedOid } = await gitExec("git", ["rev-parse", "HEAD"], { cwd: root });
    await gitExec("git", ["push", "origin", `HEAD:refs/heads/lease-race`], { cwd: root });
    await writeFile(join(root, "seed.txt"), "advanced", "utf8");
    await gitExec("git", ["commit", "-am", "advance lease target"], { cwd: root });
    await gitExec("git", ["push", "origin", `HEAD:refs/heads/lease-race`], { cwd: root });
    const boundExec = (command: string, args: string[], options = {}) =>
      gitExec(command, args, { ...options, cwd: root });

    const outcome = await deleteRemoteBranch(boundExec, "origin", "lease-race", expectedOid);

    expect(outcome).toBe("stale");
  });
});

describe("production GitExecInput", () => {
  it("feeds stdin unchanged and preserves raw stdout", async () => {
    const input = "payload with spaces\nand a final newline\n";

    const stdout = await gitExecInput(["hash-object", "--stdin"], input);
    const second = await gitExecInput(["hash-object", "--stdin"], input);

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

describe("installation diff adapter", () => {
  it("keeps no-change and changed exit statuses as domain results", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-execa-diff-"));
    tempDirs.push(root);
    const left = join(root, "left.txt");
    const right = join(root, "right.txt");
    await writeFile(left, "same\n", "utf8");
    await writeFile(right, "same\n", "utf8");

    await expect(realGitDiff(left, right)).resolves.toBe("");
    await writeFile(right, "different\n", "utf8");
    await expect(realGitDiff(left, right)).resolves.toContain("different");
  });

  it("rejects spawn failures through the typed taxonomy", async () => {
    vi.stubEnv("PATH", "");
    await expect(realGitDiff("left", "right"))
      .rejects.toSatisfy((error: unknown) => isGitProcessError(error) && error.kind === "spawn-failure");
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
