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
    expect(reviewHelp.stdout).toContain("resolve");
    expect(reviewHelp.stdout).toContain("hosted");
    expect(hostedHelp.exitCode).toBe(0);
    expect(hostedHelp.stdout).toContain("request");
    expect(hostedHelp.stdout).toContain("await");
    expect(hostedHelp.stdout).toContain("settle");
  });

  it.each([
    [["review", "resolve"], "review-resolve"],
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
