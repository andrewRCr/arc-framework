import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CLI_PATH } from "../helpers/cli-spawn.js";
import { runCli } from "../helpers/run-cli.js";

const roots: string[] = [];

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
    .map(([key, member]) => `${JSON.stringify(key)}:${canonical(member)}`).join(",")}}`;
}

function request() {
  const fields = {
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: "a".repeat(40),
    diffBaseTree: "b".repeat(40),
    headSha: "c".repeat(40),
    headTree: "d".repeat(40),
  };
  const preimage = { domain: "arc.review-gate.target-id/v2", ...fields };
  const targetId = `sha256:${createHash("sha256").update(canonical(preimage)).digest("hex")}`;
  return JSON.stringify({ schemaVersion: 1, target: { ...fields, targetId } });
}

function runStdin(cwd: string, input: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, "review", "chunking", "resolve", "-"], {
      cwd,
      stdio: "pipe",
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
      exitCode: code ?? 1,
    }));
    child.stdin.end(input);
  });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("arc review chunking resolve", () => {
  it("supports file success and stdin error with one JSON envelope each", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-review-chunking-e2e-"));
    roots.push(root);
    execFileSync("git", ["init", "-q"], { cwd: root });
    await mkdir(join(root, ".arc/system"), { recursive: true });
    await writeFile(
      join(root, ".arc/system/arc-config.yml"),
      "review.chunking_threshold_lines: 0\nreview.chunking_threshold_files: 0\n",
    );
    const inputPath = join(root, "request.json");
    await writeFile(inputPath, request());

    const success = await runCli(["review", "chunking", "resolve", inputPath], { cwd: root });
    expect(success.exitCode).toBe(0);
    expect(success.stderr).not.toMatch(/prompt|review provider/iu);
    expect(success.stdout.trim().split("\n"), success.stdout).toHaveLength(1);
    expect(JSON.parse(success.stdout)).toMatchObject({
      mode: "review-chunking-resolve",
      state: "disabled",
    });

    const failure = await runStdin(root, "{}");
    expect(failure.exitCode).not.toBe(0);
    expect(failure.stderr).not.toMatch(/prompt|review provider/iu);
    expect(failure.stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(failure.stdout)).toMatchObject({
      mode: "review-chunking-resolve",
      error: { code: "invalid-input" },
    });
  });
});
