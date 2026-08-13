import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { runCli } from "../helpers/run-cli.js";

const root = resolve(import.meta.dirname, "../../../..");
const run = promisify(execFile);

describe("packaged review CLI surfaces", () => {
  let fixtureRoot: string;
  let invalidInputPath: string;

  beforeEach(async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), "arc-review-cli-"));
    await run("git", ["init", "-q"], { cwd: fixtureRoot });
    const systemRoot = join(fixtureRoot, ".arc", "system");
    await mkdir(systemRoot, { recursive: true });
    await writeFile(
      join(systemRoot, "arc-config.yml"),
      await readFile(
        resolve(root, "packages/arc-framework/arc/system/arc-config.yml"),
        "utf8",
      ),
    );
    invalidInputPath = join(fixtureRoot, "invalid.json");
    await writeFile(invalidInputPath, "{}\n");
  });

  afterEach(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  it("exposes every public review verb through packaged help", async () => {
    const [reviewHelp, hostedHelp] = await Promise.all([
      runCli(["review", "--help"], { cwd: fixtureRoot }),
      runCli(["review", "hosted", "--help"], { cwd: fixtureRoot }),
    ]);

    expect(reviewHelp.exitCode).toBe(0);
    expect(reviewHelp.stdout).toContain("readiness");
    expect(reviewHelp.stdout).toContain("planning-lane");
    expect(reviewHelp.stdout).toContain("change-request");
    expect(reviewHelp.stdout).toContain("merge-method");
    expect(reviewHelp.stdout).toMatch(/^\s+resolve(?:\s|\[)/mu);
    expect(reviewHelp.stdout).toContain("hosted");
    expect(reviewHelp.stdout).not.toContain("unlock");
    expect(hostedHelp.exitCode).toBe(0);
    expect(hostedHelp.stdout).toContain("request");
    expect(hostedHelp.stdout).toContain("await");
    expect(hostedHelp.stdout).toContain("settle");
  });

  it("rejects a malformed exact head before change-request lookup", async () => {
    const result = await runCli([
      "review",
      "change-request",
      "resolve",
      "--head-ref",
      "feat/example",
      "--head-sha",
      "not-an-oid",
      "--json",
    ], { cwd: fixtureRoot });

    expect(result.exitCode).toBe(64);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      mode: "review-change-request-resolve",
      state: "blocked",
      nextAction: "stop",
      reason: "invalid-input",
    });
  });

  it("exposes every merge-lock verb through packaged help, under lock alone", async () => {
    const [mergeHelp, lockHelp] = await Promise.all([
      runCli(["merge", "--help"], { cwd: fixtureRoot }),
      runCli(["merge", "lock", "--help"], { cwd: fixtureRoot }),
    ]);

    expect(mergeHelp.exitCode).toBe(0);
    expect(mergeHelp.stdout).toContain("lock");
    expect(lockHelp.exitCode).toBe(0);
    expect(lockHelp.stdout).toMatch(/^\s+resolve(?:\s|\[)/mu);
    expect(lockHelp.stdout).toContain("hold");
    expect(lockHelp.stdout).toContain("release");
  });

  it("no longer resolves the retired review unlock verb", async () => {
    const result = await runCli(["review", "unlock", invalidInputPath], { cwd: fixtureRoot });

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/unknown command/iu);
  });

  it("classifies an exact planning change through the packaged CLI", async () => {
    await run("git", ["config", "user.email", "arc@example.invalid"], { cwd: fixtureRoot });
    await run("git", ["config", "user.name", "ARC Test"], { cwd: fixtureRoot });
    await run("git", ["add", "."], { cwd: fixtureRoot });
    await run("git", ["commit", "-qm", "base"], { cwd: fixtureRoot });
    const base = (await run("git", ["rev-parse", "HEAD"], { cwd: fixtureRoot })).stdout.trim();
    const planningPath = join(fixtureRoot, ".arc", "active", "spec-demo.md");
    await mkdir(join(fixtureRoot, ".arc", "active"), { recursive: true });
    await writeFile(planningPath, "# Spec: Demo\n");
    await run("git", ["add", "."], { cwd: fixtureRoot });
    await run("git", ["commit", "-qm", "planning"], { cwd: fixtureRoot });
    const head = (await run("git", ["rev-parse", "HEAD"], { cwd: fixtureRoot })).stdout.trim();

    const result = await runCli([
      "review",
      "planning-lane",
      base,
      head,
      "--repository",
      fixtureRoot,
    ], { cwd: fixtureRoot });

    expect(result).toMatchObject({ exitCode: 0, stdout: "planning\n" });
  });

  it.each([
    [["review", "readiness"], "review-readiness"],
    [["review", "resolve"], "review-resolve"],
    [["merge", "lock", "resolve"], "merge-lock-resolve"],
    [["merge", "lock", "hold"], "merge-lock-hold"],
    [["merge", "lock", "release"], "merge-lock-release"],
    [["review", "hosted", "request"], "review-hosted-request"],
    [["review", "hosted", "await"], "review-hosted-await"],
    [["review", "hosted", "settle"], "review-hosted-settle"],
  ] as const)("rejects malformed JSON contracts at %s", async (command, mode) => {
    const result = await runCli([...command, invalidInputPath], { cwd: fixtureRoot });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      mode,
      error: { code: "invalid-input" },
    });
  });

  it("no-ops from package defaults without touching a review carrier", async () => {
    const inputPath = join(fixtureRoot, "resolve.json");
    await writeFile(inputPath, `${JSON.stringify({
      schemaVersion: 1,
      target: {
        repository: "arc-framework/example",
        pullRequest: 42,
        headSha: "a".repeat(40),
      },
      lane: "standard",
      standardReview: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"b".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
      completedPasses: 0,
      attempts: [],
    })}\n`);

    const result = await runCli(["review", "resolve", inputPath], {
      cwd: fixtureRoot,
      env: {
        GH_TOKEN: "",
        GITHUB_TOKEN: "",
      },
    });

    expect(result, `${result.stderr}\n${result.stdout}`).toMatchObject({ exitCode: 0 });
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: "review-resolve",
      state: "no-op",
      nextAction: "none",
      payload: {
        lane: "standard",
        consumedPass: false,
        attemptedSources: [],
      },
    });
  });
});
