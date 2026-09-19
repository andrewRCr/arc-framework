/** E2E coverage for the packaged review CLI surface. */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";

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
    expect(reviewHelp.stdout).toContain("planning-grooming");
    expect(reviewHelp.stdout).toContain("change-request");
    expect(reviewHelp.stdout).toContain("merge-method");
    expect(reviewHelp.stdout).toContain("checks");
    expect(reviewHelp.stdout).toMatch(/^\s+resolve(?:\s|\[)/mu);
    expect(reviewHelp.stdout).toContain("hosted");
    expect(reviewHelp.stdout).not.toContain("unlock");
    expect(hostedHelp.exitCode).toBe(0);
    expect(hostedHelp.stdout).toContain("request");
    expect(hostedHelp.stdout).toContain("await");
    expect(hostedHelp.stdout).toContain("settle");
  });

  it.each([
    [
      ["review", "chunking", "resolve"],
      "review-chunking-resolve-request.schema.json",
      ["review-chunking-resolve-request"],
    ],
    [
      ["review", "planning-grooming", "resolve"],
      "review-planning-grooming-resolve-request.schema.json",
      ["review-planning-grooming-resolve-request"],
    ],
    [
      ["review", "frontline", "run"],
      "review-frontline-run-request.schema.json",
      [
        "review-assurance-input",
        "review-frontline-resolve-envelope",
        "review-frontline-run-request",
        "review-method-activity",
        "review-routing-decision",
        "review-routing-facts",
        "slug",
      ],
    ],
    [
      ["review", "resolve"],
      "review-resolve-request.schema.json",
      ["review-resolve-request", "standard-review-obligation-projection"],
    ],
    [
      ["review", "hosted", "await"],
      "review-hosted-await-request.schema.json",
      ["review-hosted-await-request", "slug", "standard-review-obligation-projection"],
    ],
    [
      ["review", "reduce"],
      "review-reduce-request.schema.json",
      ["review-reduce-request"],
    ],
    [
      ["review", "respond"],
      "review-respond-request.schema.json",
      [
        "approved-disposition-set",
        "disposition-approval",
        "disposition-report-item",
        "disposition-set",
        "finding-disposition",
        "review-respond-request",
        "review-severity",
        "review-target",
      ],
    ],
    [
      ["review", "hosted", "request"],
      "review-hosted-request-request.schema.json",
      ["review-hosted-request-request", "slug", "standard-review-obligation-projection"],
    ],
    [
      ["review", "readiness"],
      "review-readiness-request.schema.json",
      ["review-readiness-request"],
    ],
    [
      ["review", "frontline", "resolve"],
      "review-frontline-resolve-request.schema.json",
      ["review-frontline-resolve-request"],
    ],
    [
      ["review", "hosted", "settle"],
      "review-hosted-settle-request.schema.json",
      ["review-hosted-settle-request"],
    ],
    [
      ["review", "local", "prepare"],
      "review-local-prepare-request.schema.json",
      ["review-local-prepare-request", "slug"],
    ],
    [
      ["review", "local", "attest"],
      "review-local-attest-request.schema.json",
      ["normalized-review-finding", "review-local-attest-request", "review-severity"],
    ],
    [
      ["review", "local", "resume"],
      "review-local-resume-request.schema.json",
      ["review-local-resume-request"],
    ],
    [
      ["review", "terminus", "accept"],
      "review-terminus-accept-request.schema.json",
      ["review-terminus-accept-request", "slug"],
    ],
  ] as const)("emits a dependency-complete public request schema at %s", async (
    command,
    rootId,
    expectedSchemaIds,
  ) => {
    const outsideProject = await mkdtemp(join(tmpdir(), "arc-review-schema-"));
    const [result, help] = await Promise.all([
      runCli([...command, "--schema"], { cwd: outsideProject }),
      runCli([...command, "--help"], { cwd: outsideProject }),
    ]).finally(async () => rm(outsideProject, { recursive: true, force: true }));

    expect(result.exitCode, result.stderr).toBe(0);
    expect(help.stdout).toContain("--schema");
    const output = JSON.parse(result.stdout) as {
      rootId: string;
      schemas: Record<string, AnySchema>;
    };
    expect(output.rootId).toBe(rootId);
    // The production bundle contains a pre-existing empty-tuple projection Ajv rejects as a
    // metaschema defect; compilation still proves every public-root ref resolves in the bundle.
    const validator = new Ajv2020({ strict: false, validateSchema: false });
    for (const schema of Object.values(output.schemas)) validator.addSchema(schema);
    expect(validator.getSchema(rootId)).toBeDefined();
    expect(Object.keys(output.schemas)).toEqual(expectedSchemaIds);
  });

  it("documents schema discovery at a request boundary reached only by hand", async () => {
    // `readiness` is invoked ad hoc rather than by a workflow step, so its help text is the only
    // place a caller learns the option exists.
    const help = await runCli(["review", "readiness", "--help"], { cwd: fixtureRoot });

    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("--schema");
  });

  it("documents the directly invokable planning-grooming request at command help", async () => {
    const help = await runCli(["review", "planning-grooming", "resolve", "--help"], {
      cwd: fixtureRoot,
    });

    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("diffBaseSha");
    expect(help.stdout).toContain("routingFacts");
    expect(help.stdout).toContain("contentKind");
    expect(help.stdout).toContain("reviewRisk");
    expect(help.stdout).toContain("changeDeterminacy");
    expect(help.stdout).toContain("ownership");
    expect(help.stdout).toContain("surfaceAuthority");
  });

  it("rejects combining schema discovery with a request source", async () => {
    const result = await runCli([
      "review", "chunking", "resolve", invalidInputPath, "--schema",
    ], { cwd: fixtureRoot });

    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      rootId: "review-chunking-resolve-request.schema.json",
      schemas: {},
    });
  });

  it("refuses a bare schema-discoverable verb through its own typed contract", async () => {
    // Opting a verb into `--schema` makes its request operand optional to Commander, so the
    // typed layer — not the parser — has to be what still demands a request source.
    const result = await runCli(["review", "reduce"], { cwd: fixtureRoot });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).not.toMatch(/missing required argument/iu);
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: "review-reduce",
      error: { code: "invalid-input" },
    });
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

  it("closes stdin and disables prompts for machine-readable change-request Git reads", async () => {
    const realGit = (await run("which", ["git"])).stdout.trim();
    const bin = join(fixtureRoot, "bin");
    await mkdir(bin);
    const fakeGit = join(bin, "git");
    await writeFile(fakeGit, `#!/bin/sh
if [ "$1" = "ls-remote" ]; then
  if [ "$GIT_TERMINAL_PROMPT" != "0" ]; then
    echo git-prompt-enabled >&2
    exit 91
  fi
  if IFS= read -r unexpected; then
    echo inherited-stdin >&2
    exit 92
  fi
  echo noninteractive-boundary-ok >&2
  exit 93
fi
exec "${realGit}" "$@"
`);
    await chmod(fakeGit, 0o755);
    await run("git", ["config", "remote.origin.url", "https://github.com/arc-framework/example.git"], {
      cwd: fixtureRoot,
    });

    const result = await runCli([
      "review",
      "change-request",
      "resolve",
      "--head-ref",
      "feat/example",
      "--head-sha",
      "a".repeat(40),
    ], {
      cwd: fixtureRoot,
      env: { PATH: `${bin}:${process.env.PATH ?? ""}` },
      timeout: 2_000,
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "host-failure",
    });
    expect(result.stdout).toContain("noninteractive-boundary-ok");
    expect(result.stdout).not.toContain("git-prompt-enabled");
  });

  it("advertises only the accepted author self-review state", async () => {
    const result = await runCli(["review", "pre-publication", "--help"], { cwd: fixtureRoot });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Report completed author self-review: settled");
    expect(result.stdout).not.toMatch(/author self-review:.*(?:inactive|pending)/iu);
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
