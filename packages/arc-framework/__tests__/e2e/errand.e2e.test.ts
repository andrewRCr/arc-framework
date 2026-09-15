/**
 * `arc errand check` E2E.
 *
 * Exercises the built CLI end-to-end: `arc errand check` reports which in-flight
 * work units touch the target path(s), emitting the overlap facts as JSON for
 * skill consumption. This covers the real path resolution that unit tests stub.
 */

import { execFile, spawn } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CLI_PATH } from "../helpers/cli-spawn.js";
import {
  cleanupTempDir,
  createTempRepo,
  runArc,
  runArcAnchored,
  runArcAnchoredSequence,
  runArcWithStdin,
} from "./helpers.js";
import { advanceBaseStep, movementPaths } from "../helpers/base-advance.js";
import { renderMetaFile } from "../../src/lib/active/meta-reader.js";

const execFileAsync = promisify(execFile);

/** Run a git command in `cwd` and return its stdout. */
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout;
}

/** Run a git plumbing command whose payload is supplied on stdin. */
async function gitWithInput(cwd: string, args: string[], input: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`git ${args.join(" ")} exited ${String(code)}: ${stderr}`));
    });
    child.stdin.end(input);
  });
}

/** Commit the staged fixture snapshot through Git plumbing, outside the workflow behavior under test. */
async function commitFixture(cwd: string, message: string): Promise<void> {
  let parent: string | null = null;
  try {
    parent = (await git(cwd, ["rev-parse", "--verify", "HEAD"])).trim();
  } catch {
    // An initialized fixture may still be on its unborn base branch.
  }
  const tree = (await git(cwd, ["write-tree"])).trim();
  const commit = (await git(cwd, [
    "commit-tree", tree, ...(parent === null ? [] : ["-p", parent]), "-m", message,
  ])).trim();
  await git(cwd, ["update-ref", "HEAD", commit, ...(parent === null ? [] : [parent])]);
}

/** Seed one exact v3 awaiting tail for command-boundary refusal coverage. */
async function seedAwaitingV3Errand(cwd: string, slug: string): Promise<void> {
  const headSha = (await git(cwd, ["rev-parse", "HEAD"])).trim();
  const record = {
    version: 3,
    slug,
    claimId: "c".repeat(32),
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:01:00.000Z",
    kind: "errand",
    purpose: "errand",
    intent: slug,
    branch: `chore/${slug}`,
    origin: "description",
    originEntry: null,
    state: "awaiting-merge",
    savedHead: null,
    changeRequest: {
      repositoryRef: "owner/repo",
      hostRef: "github.com",
      baseRef: "main",
      headRef: `chore/${slug}`,
      headSha,
    },
  };
  const blob = (await gitWithInput(cwd, ["hash-object", "-w", "--stdin"], `${JSON.stringify(record)}\n`)).trim();
  const tree = (await gitWithInput(cwd, ["mktree"], `100644 blob ${blob}\t${slug}\n`)).trim();
  const commit = (await git(cwd, ["commit-tree", tree, "-m", `seed v3 errand ${slug}`])).trim();
  await git(cwd, ["update-ref", "refs/arc/user/test-user/errands", commit]);
}

/** Seed one identity-only ordinary v3 open claim whose branch is preserved in base. */
async function seedOpenV3Errand(cwd: string, slug: string): Promise<void> {
  const headSha = (await git(cwd, ["rev-parse", "HEAD"])).trim();
  const branch = `chore/${slug}`;
  await git(cwd, ["branch", branch, headSha]);
  const record = {
    version: 3,
    slug,
    claimId: "d".repeat(32),
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:01:00.000Z",
    kind: "errand",
    purpose: "errand",
    intent: slug,
    branch,
    origin: "description",
    originEntry: null,
    state: "open",
    savedHead: null,
    changeRequest: null,
  };
  const blob = (await gitWithInput(cwd, ["hash-object", "-w", "--stdin"], `${JSON.stringify(record)}\n`)).trim();
  const tree = (await gitWithInput(cwd, ["mktree"], `100644 blob ${blob}\t${slug}\n`)).trim();
  const commit = (await git(cwd, ["commit-tree", tree, "-m", `seed v3 errand ${slug}`])).trim();
  await git(cwd, ["update-ref", "refs/arc/user/test-user/errands", commit]);
}

/** Flip the installed config's branch.protection (default `partial`) to `full`. */
async function setFullProtection(cwd: string): Promise<void> {
  const path = join(cwd, ".arc", "system", "arc-config.yml");
  const yaml = await readFile(path, "utf-8");
  const updated = yaml.replace("branch.protection: partial", "branch.protection: full");
  if (updated === yaml) {
    throw new Error("setFullProtection: expected `branch.protection: partial` in arc-config.yml");
  }
  await writeFile(path, updated, "utf-8");
}

async function setBasePullAlways(cwd: string): Promise<void> {
  const path = join(cwd, ".arc", "system", "arc-config.yml");
  const yaml = await readFile(path, "utf-8");
  const updated = yaml.replace("session.init_pull.base: prompt", "session.init_pull.base: always");
  if (updated === yaml) throw new Error("setBasePullAlways: expected prompt base-pull policy");
  await writeFile(path, updated, "utf-8");
}

async function setPartialProtection(cwd: string): Promise<void> {
  const path = join(cwd, ".arc", "system", "arc-config.yml");
  const yaml = await readFile(path, "utf-8");
  const updated = yaml.replace("branch.protection: full", "branch.protection: partial");
  if (updated === yaml) throw new Error("setPartialProtection: expected full protection");
  await writeFile(path, updated, "utf-8");
}

async function createBareRemote(cwd: string, suffix: string): Promise<string> {
  const remoteDir = `${cwd}-${suffix}.git`;
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remoteDir]);
  await git(cwd, ["remote", "add", "origin", remoteDir]);
  await git(cwd, ["push", "-u", "origin", "main"]);
  return remoteDir;
}

interface ReviewEnvelope {
  state: string;
  nextAction: string;
  payload: Record<string, unknown>;
}

async function invokeReview(cwd: string, command: string[], request: unknown): Promise<ReviewEnvelope> {
  const result = await runArcWithStdin(command, cwd, `${JSON.stringify(request)}\n`);
  expect(result.exitCode, result.stderr || result.stdout).toBe(0);
  return JSON.parse(result.stdout.trim()) as ReviewEnvelope;
}

function inspectIdentityCommand(slug: string): readonly string[] {
  return [
    process.execPath,
    "-e",
    "const {execFileSync}=require('node:child_process');"
      + `const value=JSON.parse(execFileSync('git',['cat-file','-p',`
      + `'refs/arc/user/test-user/errands:${slug}'],{encoding:'utf8'}));`
      + "process.stdout.write(JSON.stringify(value));",
  ];
}

describe("arc errand merge", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("refuses an invalid lane through the built destructive command boundary", async () => {
    const result = await runArcWithStdin(
      ["errand", "merge", "example", "-", "--json"],
      tmpDir,
      `${JSON.stringify({
        schemaVersion: 1,
        identity: {
          slug: "example",
          claimId: "1".repeat(32),
          branch: "chore/example",
          generation: `errand-v1/example/${"1".repeat(32)}`,
        },
        approvedTarget: {
          repository: "owner/repo",
          pullRequest: 42,
          baseRef: "main",
          headRef: "chore/example",
          headSha: "c".repeat(40),
        },
        lane: "native-auto-merge",
        mergeMethod: { method: "merge", policyFingerprint: `sha256:${"d".repeat(64)}` },
      })}\n`,
    );

    expect(result.exitCode, result.stderr || result.stdout).toBe(64);
    expect(JSON.parse(result.stdout) as unknown).toMatchObject({
      mode: "errand-merge",
      state: "refused",
      nextAction: "stop",
      reason: "invalid-input",
      lane: null,
    });
  });
});

async function createMergedGhFixture(cwd: string, slug: string, exactHead?: string): Promise<{
  ghDir: string;
  remoteDir: string;
  env: Record<string, string>;
}> {
  const remoteDir = `${cwd}-${slug}-remote.git`;
  const ghDir = await mkdtemp(join(tmpdir(), "arc-gh-"));
  const branch = `chore/${slug}`;
  const headSha = exactHead ?? (await git(cwd, ["rev-parse", "HEAD"])).trim();
  const repositoryUrl = "https://github.com/owner/repo.git";
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remoteDir]);
  await git(cwd, ["config", `url.file://${remoteDir}.insteadOf`, repositoryUrl]);
  await git(cwd, ["remote", "add", "origin", repositoryUrl]);
  await git(cwd, ["push", "-u", "origin", "main"]);
  const exactArgs = [
    "pr", "list", "--repo", "owner/repo", "--state", "merged", "--head", branch,
    "--limit", "2", "--json", "baseRefName,headRefName,headRefOid",
  ].join(" ");
  const lifecycleArgs = [
    "pr", "list", "--repo", "owner/repo", "--state", "all", "--head", branch,
    "--limit", "100", "--json", "number,state,baseRefName,headRefName,headRefOid,reviewDecision",
  ].join(" ");
  const coordinates = { baseRefName: "main", headRefName: branch, headRefOid: headSha };
  const script = [
    "#!/bin/sh",
    "set -eu",
    'case "$*" in',
    `  ${JSON.stringify(exactArgs)}) printf '%s\\n' ${JSON.stringify(JSON.stringify([coordinates]))} ;;`,
    `  ${JSON.stringify(lifecycleArgs)}) printf '%s\\n' ${JSON.stringify(JSON.stringify([{
      number: 1, state: "MERGED", ...coordinates, reviewDecision: "APPROVED",
    }]))} ;;`,
    '  *) printf \'unexpected gh invocation: %s\\n\' "$*" >&2; exit 2 ;;',
    "esac",
    "",
  ].join("\n");
  await writeFile(join(ghDir, "gh"), script, "utf-8");
  await chmod(join(ghDir, "gh"), 0o755);
  return { ghDir, remoteDir, env: { PATH: `${ghDir}:${process.env.PATH ?? ""}` } };
}

describe("arc errand check", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("reports no overlap as JSON when no other work unit is in flight", async () => {
    const result = await runArc(
      ["errand", "check", "--target", "docs/x.md", "--json"],
      tmpDir,
    );

    expect(result.exitCode).toBe(0);
    // `reachable` reflects the oracle's remote read; the sandbox repo has no
    // reachable remote, so the no-overlap result carries `reachable: false`.
    expect(JSON.parse(result.stdout.trim())).toEqual({ overlaps: [], warnings: [], reachable: false });
  });
});

describe("arc review respond for an Errand", () => {
  it("persists and idempotently replays a verified fix without Candidate lineage", async () => {
    const repository = await createTempRepo("arc-errand-review-response-");
    let remoteDir: string | null = null;
    try {
      const initialized = await runArc(["init", "--yes", "--name", "errand-review"], repository);
      expect(initialized.exitCode, initialized.stderr || initialized.stdout).toBe(0);
      await setFullProtection(repository);
      await git(repository, ["add", "-A"]);
      await commitFixture(repository, "initialize fixture");
      remoteDir = await createBareRemote(repository, "review-response");

      const opened = await runArcAnchored([
        "errand", "open", "repair-review-state", "--json",
      ], repository, { timeout: 60_000 });
      expect(opened.exitCode, opened.stderr || opened.stdout).toBe(0);
      await writeFile(join(repository, "reviewed.txt"), "reviewed change\n", "utf8");
      await git(repository, ["add", "reviewed.txt"]);
      await commitFixture(repository, "add reviewed change");

      const prepared = await invokeReview(repository, ["review", "local", "prepare", "-"], {
        schemaVersion: 1,
        evaluatorIdentity: "reviewer-1",
        routingFacts: {
          contentKind: "code-bearing",
          reviewRisk: "routine",
          changeDeterminacy: "ordinary",
          ownership: "self",
          surfaceAuthority: "ordinary",
        },
      });
      const preparePayload = prepared.payload as {
        operationId: string;
        target: { targetId: string; headSha: string; headTree: string };
        request: { evaluatorIdentity: string };
        reviewerPayload: {
          sourceDigest: string;
          guidanceDigest: string;
          guidance: { rubricVersion: string; rubricDigest: string };
        };
      };
      await invokeReview(repository, ["review", "local", "attest", "-"], {
        schemaVersion: 1,
        operationId: preparePayload.operationId,
        result: {
          status: "complete",
          result: "findings",
          targetId: preparePayload.target.targetId,
          headSha: preparePayload.target.headSha,
          headTree: preparePayload.target.headTree,
          rubricVersion: preparePayload.reviewerPayload.guidance.rubricVersion,
          rubricDigest: preparePayload.reviewerPayload.guidance.rubricDigest,
          sourceDigest: preparePayload.reviewerPayload.sourceDigest,
          guidanceDigest: preparePayload.reviewerPayload.guidanceDigest,
          evaluatorIdentity: preparePayload.request.evaluatorIdentity,
          reviewRunId: "run-findings",
          applicabilityId: null,
          findings: [{
            findingId: "finding-1",
            severity: "major",
            locus: "reviewed.txt:1",
            evidenceUrlOrId: "review:finding-1",
          }],
        },
      });
      const reduced = await invokeReview(repository, ["review", "reduce", "-"], {
        schemaVersion: 1,
        operationId: preparePayload.operationId,
      });
      const source = (reduced.payload as {
        responseSource: { kind: "attested-local"; receiptRef: string };
      }).responseSource;
      const proposed = await invokeReview(repository, ["review", "respond", "-"], {
        schemaVersion: 1,
        source,
        proposal: {
          findings: [{
            findingId: "finding-1",
            sourceVerification: "verified",
            verificationRefs: ["source:reviewed.txt:1"],
            disposition: "fix",
            rationale: "The reviewed source supports applying this fix.",
            recommendation: "Apply the fix.",
            openQuestions: [],
          }],
        },
      });
      const proposal = (proposed.payload as {
        proposal: {
          state: "proposed";
          dispositionSet: { targetId: string; dispositionSetId: string };
        };
      }).proposal;
      const dispositions = {
        ...proposal,
        state: "approved" as const,
        approval: {
          schemaVersion: 2 as const,
          semanticsVersion: "review-gate/v2" as const,
          targetId: proposal.dispositionSet.targetId,
          dispositionSetId: proposal.dispositionSet.dispositionSetId,
          approvedBy: "test-user",
          approvedAt: "2026-08-15T21:00:00Z",
        },
      };
      await expect(invokeReview(repository, ["review", "respond", "-"], {
        schemaVersion: 1,
        source,
        dispositions,
      })).resolves.toMatchObject({ state: "ready-to-fix", nextAction: "apply-fix" });

      await writeFile(join(repository, "reviewed.txt"), "reviewed change, fixed\n", "utf8");
      await git(repository, ["add", "reviewed.txt"]);
      await commitFixture(repository, "apply approved fix");
      const verifiedRequest = {
        schemaVersion: 1,
        source,
        dispositions,
        verifiedFix: {
          applicability: "focused",
          verificationEvidenceRefs: ["verification://focused-fix"],
        },
      };
      await expect(invokeReview(repository, ["review", "respond", "-"], verifiedRequest))
        .resolves.toMatchObject({ state: "errand-advanced", nextAction: "continue-review" });
      await expect(invokeReview(repository, ["review", "respond", "-"], verifiedRequest))
        .resolves.toMatchObject({ state: "errand-current", nextAction: "continue-review" });
    } finally {
      await cleanupTempDir(repository);
      if (remoteDir !== null) await cleanupTempDir(remoteDir);
    }
  });
});

describe("arc errand JSON topology failures", () => {
  it.each([
    {
      operation: "errand-leave",
      args: ["errand", "leave", "anything", "--state", "paused", "--json"],
      code: "locus.errand-leave.topology",
    },
    {
      operation: "errand-materialize",
      args: ["errand", "materialize", "anything", "--json"],
      code: "locus.errand-materialize.topology",
    },
  ])("emits a $operation error envelope outside an ARC project", async ({ operation, args, code }) => {
    const outsideProject = await mkdtemp(join(tmpdir(), "arc-outside-project-"));
    try {
      const result = await runArc(args, outsideProject);

      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stdout.trim())).toMatchObject({
        outcome: "error",
        operation,
        error: { code },
      });
    } finally {
      await cleanupTempDir(outsideProject);
    }
  });
});

describe("arc errand leave", () => {
  let repository: string;

  beforeEach(async () => {
    repository = await createTempRepo();
    const initialized = await runArc(["init", "--yes", "--name", "test-project"], repository);
    expect(initialized.exitCode).toBe(0);
    await git(repository, ["commit", "--allow-empty", "--no-verify", "-m", "init"]);
  });

  afterEach(async () => {
    await cleanupTempDir(repository);
  });

  it("exposes exact foreign-generation confirmation on the owning verb", async () => {
    const result = await runArc(["errand", "leave", "--help"], repository);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--confirm-foreign-generation <generation>");
  });

  it("refuses partial mode through the shared JSON result", async () => {
    const result = await runArc([
      "errand", "leave", "anything", "--state", "paused", "--json",
    ], repository);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      outcome: "refused",
      operation: "errand-leave",
      reason: "full-protection-required",
    });
  });

  it("refuses a blank base before attempting to leave", async () => {
    await setFullProtection(repository);
    const configPath = join(repository, ".arc", "system", "arc-config.yml");
    const config = await readFile(configPath, "utf-8");
    const updated = config.replace("branch.base: main", "branch.base: '   '");
    expect(updated).not.toBe(config);
    await writeFile(configPath, updated, "utf-8");

    const result = await runArc([
      "errand", "leave", "anything", "--state", "paused", "--json",
    ], repository);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      outcome: "error",
      operation: "errand-leave",
      error: { code: "locus.errand-leave.config" },
    });
    expect(result.stderr).toBe("");
  });
});

describe("arc errand open", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "init"]);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("exposes JSON output without retaining the legacy nature-type option", async () => {
    const result = await runArc(["errand", "open", "--help"], tmpDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--json");
    expect(result.stdout).not.toContain("--type");
  });

  it("redirects a nested Errand open through the active Errand's leave boundary", async () => {
    await setFullProtection(tmpDir);
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    const remoteDir = await createBareRemote(tmpDir, "nested-open-remote");
    try {
      const opened = await runArc(["errand", "open", "first-errand", "--json"], tmpDir);
      expect(opened.exitCode, opened.stdout + opened.stderr).toBe(0);

      const refused = await runArc(["errand", "open", "blocking-errand", "--json"], tmpDir);

      expect(refused.exitCode).toBe(1);
      expect(JSON.parse(refused.stdout.trim())).toMatchObject({
        outcome: "refused",
        operation: "errand-open",
        reason: "role-conflict",
        recommendedPromptText: expect.stringMatching(
          /arc errand leave first-errand --state (?:paused|awaiting-merge) --json/u,
        ),
      });
    } finally {
      await cleanupTempDir(remoteDir);
    }
  });

  it.each([
    { operation: "errand-open", args: ["errand", "open", "bad slug", "--json"] },
    {
      operation: "errand-link",
      args: ["errand", "link", "bad slug", "--from-inbox", "Any capture", "--json"],
    },
    { operation: "errand-close", args: ["errand", "close", "bad slug", "--json"] },
  ])("returns one JSON $operation result when command input is invalid", async ({ operation, args }) => {
    const result = await runArc(args, tmpDir);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      outcome: "error",
      operation,
      error: { code: `locus.${operation}.input` },
    });
    expect(result.stderr).toBe("");
  });

  it("does not flag a just-opened errand branch as no-record-or-meta residue on status <slug>", async () => {
    await setFullProtection(tmpDir);
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    const remoteDir = await createBareRemote(tmpDir, "status-remote");
    try {
      const opened = await runArcAnchoredSequence([
        ["errand", "open", "residue-probe", "--json"],
      ], tmpDir);
      expect(opened.exitCode, opened.stdout + opened.stderr).toBe(0);
      expect(opened.results[0]).toMatchObject({
        outcome: "applied",
        operation: "errand-open",
        identity: { kind: "errand", key: "residue-probe", claimId: expect.any(String), state: "open" },
      });
      expect(JSON.parse(
        await git(tmpDir, ["cat-file", "-p", "refs/arc/user/test-user/errands:residue-probe"]),
      )).toMatchObject({ version: 3, slug: "residue-probe", state: "open" });

      const status = await runArc(["status", "residue-probe", "--json"], tmpDir);
      expect(status.exitCode).toBe(0);
      const payload = JSON.parse(status.stdout.trim()) as { warnings?: string[] };
      const residueWarnings = (payload.warnings ?? []).filter((line) =>
        /no errand record or active work-unit meta/i.test(line),
      );
      expect(residueWarnings).toEqual([]);
    } finally {
      await cleanupTempDir(remoteDir);
    }
  });

  it("cuts a warm continuation Errand from the freshly synchronized remote base", async () => {
    await setFullProtection(tmpDir);
    await setBasePullAlways(tmpDir);
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    const remoteDir = await createBareRemote(tmpDir, "warm-continuation-remote");
    try {
      const first = await runArcAnchoredSequence([
        ["errand", "open", "first-warm-errand", "--json"],
        ["errand", "close", "first-warm-errand", "--json"],
      ], tmpDir);
      expect(first.exitCode, first.stdout + first.stderr).toBe(0);

      const localBase = (await git(tmpDir, ["rev-parse", "main"])).trim();
      const remoteHead = (await git(tmpDir, [
        "commit-tree", "main^{tree}", "-p", localBase, "-m", "advance remote base",
      ])).trim();
      await git(tmpDir, ["push", "origin", `${remoteHead}:refs/heads/main`]);
      expect((await git(tmpDir, ["rev-parse", "main"])).trim()).toBe(localBase);

      const continued = await runArcAnchoredSequence([
        ["errand", "open", "continued-warm-errand", "--json"],
      ], tmpDir);
      expect(continued.exitCode, continued.stdout + continued.stderr).toBe(0);
      expect((await git(tmpDir, ["branch", "--show-current"])).trim())
        .toBe("chore/continued-warm-errand");
      expect((await git(tmpDir, ["rev-parse", "HEAD"])).trim()).toBe(remoteHead);
    } finally {
      await cleanupTempDir(remoteDir);
    }
  });

  it("rejects the removed legacy nature-type option before mutation", async () => {
    await setFullProtection(tmpDir);

    const result = await runArc(["errand", "open", "new-thing", "--type", "feat"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(await git(tmpDir, ["branch", "--list", "feat/new-thing"])).toBe("");
  });
});

describe("tracked ROADMAP regen with errand records", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(
      ["init", "--yes", "--name", "test-project", "--pm-mode", "arc-in-git"],
      tmpDir,
    );
    expect(init.exitCode).toBe(0);
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "init"]);
    await setFullProtection(tmpDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("does not flag a just-opened errand branch as residue in the regen advisory", async () => {
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    const remoteDir = await createBareRemote(tmpDir, "roadmap-remote");
    try {
      const opened = await runArcAnchoredSequence([
        ["errand", "open", "residue-probe", "--json"],
      ], tmpDir);
      expect(opened.exitCode, opened.stdout + opened.stderr).toBe(0);
      expect(opened.results[0]).toMatchObject({
        outcome: "applied",
        operation: "errand-open",
        identity: { kind: "errand", key: "residue-probe", claimId: expect.any(String), state: "open" },
      });
      expect(JSON.parse(
        await git(tmpDir, ["cat-file", "-p", "refs/arc/user/test-user/errands:residue-probe"]),
      )).toMatchObject({ version: 3, slug: "residue-probe", state: "open" });

      const stub = await runArc(
        ["stub", "advisory-probe", "--commitment", "provisional", "--priority", "P3"],
        tmpDir,
      );
      expect(stub.exitCode).toBe(0);
      expect(stub.stdout + stub.stderr).not.toMatch(/no errand record or active work-unit meta/i);
    } finally {
      await cleanupTempDir(remoteDir);
    }
  });

  it("still flags a record-less typed branch as residue (fail-safe preserved)", async () => {
    await git(tmpDir, ["switch", "-c", "chore/no-record"]);

    const stub = await runArc(
      ["stub", "advisory-probe", "--commitment", "provisional", "--priority", "P3"],
      tmpDir,
    );
    expect(stub.exitCode).toBe(0);
    expect(stub.stdout + stub.stderr).toMatch(/no errand record or active work-unit meta/i);
  });
});

describe("arc errand close", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "init"]);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("completes a clean full-protection Errand that has no tracked change", async () => {
    const slug = "operational-only";
    const offeredTitle = "Run the next queued Errand";
    await setFullProtection(tmpDir);
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    const inboxDir = join(tmpDir, ".arc", "user", "test-user");
    await mkdir(inboxDir, { recursive: true });
    await writeFile(
      join(inboxDir, "USER-INBOX.md"),
      `# User Inbox\n\n## Errand\n\n### \`[ ]\` **${offeredTitle}**\n\n`
        + "- _Disposition:_ `execute-bound`\n\n---\n",
      "utf-8",
    );
    const remoteDir = await createBareRemote(tmpDir, slug);
    try {
      const result = await runArcAnchoredSequence([
        ["errand", "open", slug, "--json"],
        ["errand", "close", slug, "--json"],
      ], tmpDir, { timeout: 60_000 });

      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.results.at(-1)).toMatchObject({
        outcome: "applied",
        operation: "errand-close",
        recommendedPromptText: expect.stringContaining("without a tracked change"),
        nextOffer: { kind: "errand", key: offeredTitle, parentCheckoutPath: null },
      });
      expect((await git(tmpDir, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim()).toBe("main");
      expect((await git(tmpDir, ["branch", "--list", `chore/${slug}`])).trim()).toBe("");
      await expect(git(tmpDir, ["cat-file", "-p", `refs/arc/user/test-user/errands:${slug}`]))
        .rejects.toThrow();
    } finally {
      await cleanupTempDir(remoteDir);
    }
  });

  it("retains the merged-change-request requirement when a full-protection Errand has a commit", async () => {
    const slug = "tracked-change";
    await setFullProtection(tmpDir);
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    const remoteDir = await createBareRemote(tmpDir, slug);
    try {
      const result = await runArcAnchoredSequence([
        ["errand", "open", slug, "--json"],
        { command: ["git", "commit", "--allow-empty", "--no-verify", "-m", "tracked errand change"] },
        ["errand", "close", slug, "--json"],
      ], tmpDir, { timeout: 60_000 });

      expect(result.exitCode).toBe(1);
      expect(result.results.at(-1)).toMatchObject({
        outcome: "refused",
        operation: "errand-close",
        reason: "change-request-unverifiable",
      });
      expect(await git(tmpDir, ["branch", "--list", `chore/${slug}`])).toContain(`chore/${slug}`);
      expect(await git(tmpDir, ["cat-file", "-p", `refs/arc/user/test-user/errands:${slug}`]))
        .toContain('"state": "open"');
    } finally {
      await cleanupTempDir(remoteDir);
    }
  });

  it("closes a pushed partial Errand and releases its primary occupancy", async () => {
    const remoteDir = `${tmpDir}-remote.git`;
    const offeredTitle = "Run the next partial-mode Errand";
    await execFileAsync("git", ["init", "--bare", remoteDir]);
    try {
      await git(tmpDir, ["add", "-A"]);
      await git(tmpDir, ["commit", "--no-verify", "-m", "track initialized project"]);
      await git(tmpDir, ["remote", "add", "origin", remoteDir]);
      await git(tmpDir, ["push", "-u", "origin", "main"]);
      const inboxDir = join(tmpDir, ".arc", "user", "test-user");
      await mkdir(inboxDir, { recursive: true });
      await writeFile(
        join(inboxDir, "USER-INBOX.md"),
        `# User Inbox\n\n## Errand\n\n### \`[ ]\` **${offeredTitle}**\n\n`
          + "- _Disposition:_ `execute-bound`\n\n---\n",
        "utf-8",
      );
      const result = await runArcAnchoredSequence([
        { command: [process.execPath, CLI_PATH, "errand", "open", "direct-fix", "--json"] },
        { command: ["git", "commit", "--allow-empty", "--no-verify", "-m", "fix direct"] },
        { command: ["git", "push", "origin", "main"] },
        { command: [process.execPath, CLI_PATH, "errand", "close", "direct-fix", "--json"] },
      ], tmpDir);

      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const settled = result.results.at(-1);
      expect(settled).toMatchObject({
        outcome: "applied",
        operation: "errand-close",
        subject: { kind: "partial-errand", slug: "direct-fix", claimId: null },
        generation: expect.stringMatching(/^sha256:/u),
        checkoutPath: tmpDir,
        settlement: { kind: "capture", disposition: "absent", originEntry: null },
        nextOffer: { kind: "errand", key: offeredTitle, parentCheckoutPath: null },
      });
      expect(settled).not.toHaveProperty("recordId");
      expect(settled).not.toHaveProperty("leaseId");
      expect(settled).not.toHaveProperty("sessionHomePath");
    } finally {
      await cleanupTempDir(remoteDir);
    }
  });

  it("finalizes an ordinary v3 Errand from exact merged host truth", async () => {
    const slug = "merged-v3";
    const branch = `chore/${slug}`;
    await setFullProtection(tmpDir);
    await git(tmpDir, ["add", ".arc/system/arc-config.yml"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    await seedOpenV3Errand(tmpDir, slug);
    await git(tmpDir, ["switch", branch]);
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "tracked Errand change"]);
    const head = (await git(tmpDir, ["rev-parse", "HEAD"])).trim();
    await git(tmpDir, ["switch", "main"]);
    const host = await createMergedGhFixture(tmpDir, slug, head);
    try {
      const result = await runArcAnchoredSequence([
        [
          "errand", "close", slug,
          "--confirm-foreign-generation", `errand-v1/${slug}/${"d".repeat(32)}`,
          "--json",
        ],
      ], tmpDir, { env: host.env });

      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(result.results[0]).toMatchObject({ outcome: "applied", operation: "errand-close" });
      expect(await git(tmpDir, ["branch", "--list", `chore/${slug}`])).toBe("");
      await expect(
        git(tmpDir, ["cat-file", "-p", `refs/arc/user/test-user/errands:${slug}`]),
      ).rejects.toThrow();
    } finally {
      await cleanupTempDir(host.ghDir);
      await cleanupTempDir(host.remoteDir);
    }
  });

  it("prunes a stale remote-tracking ref when the merged Errand head is already gone", async () => {
    const slug = "merged-v3-host-deleted-head";
    const branch = `chore/${slug}`;
    const trackingRef = `refs/remotes/origin/${branch}`;
    await setFullProtection(tmpDir);
    await git(tmpDir, ["add", ".arc/system/arc-config.yml"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    const host = await createMergedGhFixture(tmpDir, slug);
    try {
      await seedOpenV3Errand(tmpDir, slug);
      await git(tmpDir, ["push", "-u", "origin", branch]);
      await git(host.remoteDir, ["update-ref", "-d", `refs/heads/${branch}`]);
      expect((await git(tmpDir, ["show-ref", "--verify", trackingRef])).trim()).not.toBe("");
      expect((await git(tmpDir, ["ls-remote", "--heads", "origin", `refs/heads/${branch}`])).trim()).toBe("");

      const result = await runArcAnchoredSequence([
        [
          "errand", "close", slug,
          "--confirm-foreign-generation", `errand-v1/${slug}/${"d".repeat(32)}`,
          "--json",
        ],
      ], tmpDir, { env: host.env });

      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(result.results[0]).toMatchObject({ outcome: "applied", operation: "errand-close" });
      expect((await git(tmpDir, ["branch", "--list", branch])).trim()).toBe("");
      await expect(git(tmpDir, ["show-ref", "--verify", trackingRef])).rejects.toThrow();
    } finally {
      await cleanupTempDir(host.ghDir);
      await cleanupTempDir(host.remoteDir);
    }
  });

  it("refuses an occupied Errand after its checkout leaves the exact branch", async () => {
    const slug = "merged-v3-from-base";
    await setFullProtection(tmpDir);
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    const host = await createMergedGhFixture(tmpDir, slug);
    try {
      const result = await runArcAnchoredSequence([
        ["errand", "open", slug, "--json"],
        { command: ["git", "switch", "main"] },
        ["errand", "close", slug, "--json"],
      ], tmpDir, { env: host.env, timeout: 60_000 });

      expect(result.exitCode, result.stdout + result.stderr).toBe(1);
      expect(result.results).toHaveLength(2);
      expect(result.results.at(-1)).toMatchObject({ outcome: "refused", operation: "errand-close" });
      expect(await git(tmpDir, ["branch", "--list", `chore/${slug}`])).toContain(`chore/${slug}`);
    } finally {
      await cleanupTempDir(host.ghDir);
      await cleanupTempDir(host.remoteDir);
    }
  });

  it("settles its occupied primary checkout before terminal finalization", async () => {
    const slug = "merged-v3-occupied-primary";
    await setFullProtection(tmpDir);
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    const host = await createMergedGhFixture(tmpDir, slug);
    try {
      const result = await runArcAnchoredSequence([
        ["errand", "open", slug, "--json"],
        ["errand", "close", slug, "--json"],
      ], tmpDir, { env: host.env, timeout: 60_000 });

      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.results.at(-1)).toMatchObject({ outcome: "applied", operation: "errand-close" });
      expect((await git(tmpDir, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim()).toBe("main");
      expect((await git(tmpDir, ["rev-parse", "--verify", "HEAD"])).trim()).toMatch(/^[0-9a-f]{40}$/u);
      expect(await git(tmpDir, ["status", "--porcelain"])).toBe("");

    } finally {
      await cleanupTempDir(host.ghDir);
      await cleanupTempDir(host.remoteDir);
    }
  });

  it("retains terminal state when its occupied checkout is dirty", async () => {
    const slug = "merged-v3-dirty-primary";
    await setFullProtection(tmpDir);
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    const host = await createMergedGhFixture(tmpDir, slug);
    try {
      const result = await runArcAnchoredSequence([
        ["errand", "open", slug, "--json"],
        {
          command: [
            process.execPath,
            "-e",
            `require("node:fs").writeFileSync(${JSON.stringify(join(tmpDir, "uncommitted.txt"))}, "retain me")`,
          ],
        },
        ["errand", "close", slug, "--json"],
      ], tmpDir, { env: host.env, timeout: 60_000 });

      expect(result.exitCode).toBe(1);
      expect(result.results.at(-1)).toMatchObject({
        outcome: "refused",
        operation: "errand-close",
        reason: "preservation-unproven",
      });
      expect((await git(tmpDir, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim())
        .toBe(`chore/${slug}`);
      expect(await git(tmpDir, ["cat-file", "-p", `refs/arc/user/test-user/errands:${slug}`]))
        .toContain('"state": "open"');
    } finally {
      await cleanupTempDir(host.ghDir);
      await cleanupTempDir(host.remoteDir);
    }
  });

  it("removes its occupied spawned checkout before terminal finalization", async () => {
    const slug = "merged-v3-occupied-spawn";
    let spawnedPath: string | null = null;
    await setFullProtection(tmpDir);
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    const host = await createMergedGhFixture(tmpDir, slug);
    await git(tmpDir, ["switch", "-c", "feat/spawn-parent-unit"]);
    await mkdir(join(tmpDir, ".arc", "active"), { recursive: true });
    await writeFile(
      join(tmpDir, ".arc", "active", "meta-spawn-parent-unit.md"),
      renderMetaFile("spawn-parent-unit", {
        state: "Active",
        owner: "test-user",
        branch: "feat/spawn-parent-unit",
        workClass: "Light",
      }),
      "utf8",
    );
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "establish parent work unit"]);
    try {
      const result = await runArcAnchoredSequence([
        ["errand", "open", slug, "--json"],
        { args: ["errand", "close", slug, "--json"], cwdFromPreviousJson: "allocation.checkoutPath" },
      ], tmpDir, { env: host.env, timeout: 60_000 });

      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(result.results).toHaveLength(2);
      const opened = result.results[0] as { allocation?: { checkoutPath?: unknown } };
      expect(opened, JSON.stringify(result.results)).toMatchObject({
        outcome: "applied",
        operation: "errand-open",
        allocation: { kind: "spawned", checkoutPath: expect.any(String) },
      });
      spawnedPath = typeof opened.allocation?.checkoutPath === "string" ? opened.allocation.checkoutPath : null;
      expect(spawnedPath).not.toBeNull();
      expect(result.results[1], JSON.stringify(result.results)).toMatchObject({
        outcome: "applied",
        operation: "errand-close",
        subject: { kind: "errand", slug, claimId: expect.any(String) },
        checkoutPath: spawnedPath,
        parentCheckoutPath: tmpDir,
        settlement: { kind: "capture", disposition: "absent", originEntry: null },
      });
      if (spawnedPath === null) throw new Error("Errand open returned no spawned checkout path.");
      await expect(access(spawnedPath)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(git(tmpDir, ["cat-file", "-p", `refs/arc/user/test-user/errands:${slug}`]))
        .rejects.toThrow();
    } finally {
      if (spawnedPath !== null) {
        await git(tmpDir, ["worktree", "remove", "--force", spawnedPath]).catch(() => undefined);
        await cleanupTempDir(spawnedPath);
      }
      await cleanupTempDir(host.ghDir);
      await cleanupTempDir(host.remoteDir);
    }
  });

  it.runIf(process.platform !== "win32")(
    "prevents the checkout from leaving base during ref teardown",
    async () => {
      const slug = "merged-v3-displaced-during-teardown";
      const branch = `chore/${slug}`;
      const gitDir = await mkdtemp(join(tmpdir(), "arc-e2e-git-teardown-displacement-"));
      const triggerPath = join(gitDir, "switch-after-ref-fetch");
      const blockedPath = `${triggerPath}.blocked`;
      const switchedPath = `${triggerPath}.switched`;
      const realGit = (await execFileAsync("sh", ["-c", "command -v git"])).stdout.trim();
      const gitWrapper = [
        "#!/bin/sh",
        "set -eu",
        "if [ -f \"$ARC_TEST_GIT_SWITCH_TRIGGER\" ] && [ \"$#\" -eq 4 ] \\",
        "    && [ \"$1\" = fetch ] && [ \"$2\" = -- ] && [ \"$3\" = origin ]; then",
        "  case \"$4\" in",
        "    +refs/heads/$ARC_TEST_ERRAND_BRANCH:refs/arc/tmp/errand-close/*)",
        "      \"$ARC_TEST_REAL_GIT\" \"$@\"",
        "      if \"$ARC_TEST_REAL_GIT\" switch feat/displaced >/dev/null 2>&1; then",
        "        mv \"$ARC_TEST_GIT_SWITCH_TRIGGER\" \"$ARC_TEST_GIT_SWITCHED\"",
        "      else",
        "        mv \"$ARC_TEST_GIT_SWITCH_TRIGGER\" \"$ARC_TEST_GIT_SWITCH_BLOCKED\"",
        "      fi",
        "      exit 0",
        "      ;;",
        "  esac",
        "fi",
        "exec \"$ARC_TEST_REAL_GIT\" \"$@\"",
        "",
      ].join("\n");
      await writeFile(join(gitDir, "git"), gitWrapper, "utf-8");
      await chmod(join(gitDir, "git"), 0o755);
      await setFullProtection(tmpDir);
      await git(tmpDir, ["add", "-A"]);
      await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
      await git(tmpDir, ["branch", "feat/displaced"]);
      const host = await createMergedGhFixture(tmpDir, slug);
      try {
        const result = await runArcAnchoredSequence([
          ["errand", "open", slug, "--json"],
          { command: ["git", "push", "-u", "origin", branch] },
          {
            command: [
              process.execPath,
              "-e",
              `require("node:fs").writeFileSync(${JSON.stringify(triggerPath)}, "")`,
            ],
          },
          ["errand", "close", slug, "--json"],
        ], tmpDir, {
          env: {
            ...host.env,
            PATH: `${gitDir}:${host.env.PATH}`,
            ARC_TEST_GIT_SWITCH_TRIGGER: triggerPath,
            ARC_TEST_GIT_SWITCH_BLOCKED: blockedPath,
            ARC_TEST_GIT_SWITCHED: switchedPath,
            ARC_TEST_ERRAND_BRANCH: branch,
            ARC_TEST_REAL_GIT: realGit,
          },
          timeout: 60_000,
        });

        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        expect(result.results.at(-1)).toMatchObject({ outcome: "applied", operation: "errand-close" });
        await expect(readFile(blockedPath, "utf-8")).resolves.toBe("");
        expect((await git(tmpDir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()).toBe("main");
        expect((await git(tmpDir, ["branch", "--list", branch])).trim()).toBe("");
        expect((await git(tmpDir, ["ls-remote", "--heads", "origin", `refs/heads/${branch}`])).trim()).toBe("");
        await expect(git(tmpDir, ["cat-file", "-p", `refs/arc/user/test-user/errands:${slug}`]))
          .rejects.toThrow();
      } finally {
        await cleanupTempDir(gitDir);
        await cleanupTempDir(host.ghDir);
        await cleanupTempDir(host.remoteDir);
      }
    },
  );

  it.runIf(process.platform !== "win32")(
    "prevents a linked checkout switch at the local branch deletion boundary",
    async () => {
      const slug = "merged-v3-switch-at-local-delete";
      const branch = `chore/${slug}`;
      const linkedBranch = "feat/local-delete-race";
      const linkedDir = `${tmpDir}-local-delete-race`;
      const gitDir = await mkdtemp(join(tmpdir(), "arc-e2e-git-local-delete-switch-"));
      const triggerPath = join(gitDir, "switch-before-local-delete");
      const blockedPath = `${triggerPath}.blocked`;
      const switchedPath = `${triggerPath}.switched`;
      const realGit = (await execFileAsync("sh", ["-c", "command -v git"])).stdout.trim();
      const gitWrapper = [
        "#!/bin/sh",
        "set -eu",
        "if [ -f \"$ARC_TEST_GIT_SWITCH_TRIGGER\" ] && [ \"$#\" -eq 4 ] \\",
        "    && [ \"$1\" = update-ref ] && [ \"$2\" = -d ] \\",
        "    && [ \"$3\" = refs/heads/$ARC_TEST_ERRAND_BRANCH ]; then",
        "  if \"$ARC_TEST_REAL_GIT\" -C \"$ARC_TEST_LINKED_DIR\" switch \"$ARC_TEST_ERRAND_BRANCH\" >/dev/null 2>&1; then",
        "    mv \"$ARC_TEST_GIT_SWITCH_TRIGGER\" \"$ARC_TEST_GIT_SWITCHED\"",
        "  else",
        "    mv \"$ARC_TEST_GIT_SWITCH_TRIGGER\" \"$ARC_TEST_GIT_SWITCH_BLOCKED\"",
        "  fi",
        "fi",
        "exec \"$ARC_TEST_REAL_GIT\" \"$@\"",
        "",
      ].join("\n");
      await writeFile(join(gitDir, "git"), gitWrapper, "utf-8");
      await chmod(join(gitDir, "git"), 0o755);
      await setFullProtection(tmpDir);
      await git(tmpDir, ["add", "-A"]);
      await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
      await git(tmpDir, ["branch", linkedBranch]);
      await git(tmpDir, ["worktree", "add", linkedDir, linkedBranch]);
      const host = await createMergedGhFixture(tmpDir, slug);
      try {
        const result = await runArcAnchoredSequence([
          ["errand", "open", slug, "--json"],
          { command: ["git", "push", "-u", "origin", branch] },
          {
            command: [
              process.execPath,
              "-e",
              `require("node:fs").writeFileSync(${JSON.stringify(triggerPath)}, "")`,
            ],
          },
          ["errand", "close", slug, "--json"],
        ], tmpDir, {
          env: {
            ...host.env,
            PATH: `${gitDir}:${host.env.PATH}`,
            ARC_TEST_GIT_SWITCH_TRIGGER: triggerPath,
            ARC_TEST_GIT_SWITCH_BLOCKED: blockedPath,
            ARC_TEST_GIT_SWITCHED: switchedPath,
            ARC_TEST_ERRAND_BRANCH: branch,
            ARC_TEST_LINKED_DIR: linkedDir,
            ARC_TEST_REAL_GIT: realGit,
          },
          timeout: 60_000,
        });

        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        expect(result.results.at(-1)).toMatchObject({ outcome: "applied", operation: "errand-close" });
        await expect(readFile(blockedPath, "utf-8")).resolves.toBe("");
        expect((await git(tmpDir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()).toBe("main");
        expect((await git(linkedDir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()).toBe(linkedBranch);
        expect((await git(tmpDir, ["branch", "--list", branch])).trim()).toBe("");
        expect((await git(tmpDir, ["ls-remote", "--heads", "origin", `refs/heads/${branch}`])).trim()).toBe("");
        await expect(git(tmpDir, ["cat-file", "-p", `refs/arc/user/test-user/errands:${slug}`]))
          .rejects.toThrow();
      } finally {
        await git(tmpDir, ["worktree", "remove", "--force", linkedDir]).catch(async () => {
          await cleanupTempDir(linkedDir);
          await git(tmpDir, ["worktree", "prune"]);
        });
        await cleanupTempDir(gitDir);
        await cleanupTempDir(host.ghDir);
        await cleanupTempDir(host.remoteDir);
      }
    },
  );

  it.runIf(process.platform !== "win32")(
    "retains a merged Errand checked out by a registered linked worktree",
    async () => {
      const slug = "merged-v3-linked-worktree-occupancy";
      const branch = `chore/${slug}`;
      const captureTitle = "Retain linked worktree occupancy";
      const inboxDir = join(tmpDir, ".arc", "user", "test-user");
      const inboxPath = join(inboxDir, "USER-INBOX.md");
      const linkedDir = `${tmpDir}-errand-occupancy`;
      await setFullProtection(tmpDir);
      await mkdir(inboxDir, { recursive: true });
      await writeFile(
        inboxPath,
        `# User Inbox\n\n## Errand\n\n### \`[ ]\` **${captureTitle}**\n\n- _Observation:_ keep this.\n\n---\n`,
        "utf-8",
      );
      await git(tmpDir, ["add", "-A"]);
      await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
      const host = await createMergedGhFixture(tmpDir, slug);
      try {
        const result = await runArcAnchoredSequence([
          ["errand", "open", slug, "--from-inbox", captureTitle, "--json"],
          { command: ["git", "push", "-u", "origin", branch] },
          { command: ["git", "switch", "main"] },
          { command: ["git", "worktree", "add", linkedDir, branch] },
          ["errand", "close", slug, "--json"],
        ], tmpDir, { env: host.env, timeout: 60_000 });

        expect(result.exitCode, result.stdout + result.stderr).toBe(1);
        expect(result.results.at(-1)).toMatchObject({
          outcome: "refused", operation: "errand-close", reason: "authority-unresolved",
        });
        expect(await git(tmpDir, ["branch", "--list", branch])).toContain(branch);
        expect(await git(linkedDir, ["rev-parse", "--abbrev-ref", "HEAD"])).toContain(branch);
        expect(await git(tmpDir, ["cat-file", "-p", `refs/arc/user/test-user/errands:${slug}`]))
          .toContain('"state": "open"');
        expect(await readFile(inboxPath, "utf-8")).toContain(`**${captureTitle}**`);
      } finally {
        await git(tmpDir, ["worktree", "remove", "--force", linkedDir]).catch(async () => {
          await cleanupTempDir(linkedDir);
          await git(tmpDir, ["worktree", "prune"]);
        });
        await cleanupTempDir(host.ghDir);
        await cleanupTempDir(host.remoteDir);
      }
    },
  );

  it("refuses base-context finalization when the checkout marker is malformed", async () => {
    const slug = "merged-v3-malformed-marker";
    const markerPath = join(tmpDir, ".arc", "system", ".internal", "worktree-marker.json");
    await setFullProtection(tmpDir);
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    const host = await createMergedGhFixture(tmpDir, slug);
    try {
      const result = await runArcAnchoredSequence([
        ["errand", "open", slug, "--json"],
        { command: ["git", "switch", "main"] },
        { command: [process.execPath, "-e", `require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "{")`] },
        ["errand", "close", slug, "--json"],
      ], tmpDir, { env: host.env, timeout: 60_000 });

      expect(result.exitCode, result.stdout + result.stderr).toBe(1);
      expect(result.results.at(-1)).toMatchObject({
        outcome: "refused", operation: "errand-close", reason: "authority-unresolved",
      });
      expect(await git(tmpDir, ["branch", "--list", `chore/${slug}`])).toContain(`chore/${slug}`);
      expect(await git(tmpDir, ["cat-file", "-p", `refs/arc/user/test-user/errands:${slug}`]))
        .toContain('"state": "open"');
    } finally {
      await cleanupTempDir(host.ghDir);
      await cleanupTempDir(host.remoteDir);
    }
  });

  it("refuses merged v3 finalization from outside its occupied checkout", async () => {
    const slug = "occupied-v3";
    const observerDir = `${tmpDir}-observer`;
    await setFullProtection(tmpDir);
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    await git(tmpDir, ["branch", "feat/observer"]);
    await git(tmpDir, ["worktree", "add", observerDir, "feat/observer"]);
    const host = await createMergedGhFixture(tmpDir, slug);
    try {
      const opened = await runArcAnchoredSequence([
        ["errand", "open", slug, "--json"],
      ], tmpDir, { env: host.env });
      expect(opened.exitCode).toBe(0);
      const result = await runArcAnchoredSequence([
        ["errand", "close", slug, "--json"],
      ], observerDir, { env: host.env });

      expect(result.exitCode, JSON.stringify(result.results)).toBe(1);
      expect(result.results[0]).toMatchObject({
        outcome: "confirmation-required",
        operation: "errand-close",
        subject: { kind: "errand", slug, claimId: expect.any(String) },
        generation: expect.stringMatching(new RegExp(`^errand-v1/${slug}/`, "u")),
        destructiveEffect: "close and retire this Errand",
      });
      expect(await git(tmpDir, ["cat-file", "-p", `refs/arc/user/test-user/errands:${slug}`]))
        .toContain('"state": "open"');
    } finally {
      await git(tmpDir, ["worktree", "remove", "--force", observerDir]);
      await cleanupTempDir(host.ghDir);
      await cleanupTempDir(host.remoteDir);
    }
  });

  it("is a clean no-op when no record exists for the slug", async () => {
    await setFullProtection(tmpDir);

    const result = await runArc(["errand", "close", "never-opened"], tmpDir);

    expect(result.exitCode).toBe(0);
  });

  it("rejects the removed --force option before mutating a v3 tail", async () => {
    await setFullProtection(tmpDir);
    await seedAwaitingV3Errand(tmpDir, "exact-tail");

    const result = await runArc(["errand", "close", "exact-tail", "--force", "--json"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/unknown option '--force'/u);
    expect(JSON.parse(
      await git(tmpDir, ["cat-file", "-p", "refs/arc/user/test-user/errands:exact-tail"]),
    )).toMatchObject({ state: "awaiting-merge" });
  });

  it("refuses an awaiting v3 tail before host access when origin is absent", async () => {
    const ghDir = await mkdtemp(join(tmpdir(), "arc-gh-unexpected-"));
    const marker = join(ghDir, "called");
    await writeFile(join(ghDir, "gh"), "#!/bin/sh\nprintf called > \"$GH_CALLED\"\nexit 99\n", "utf-8");
    await chmod(join(ghDir, "gh"), 0o755);
    await setFullProtection(tmpDir);
    await seedAwaitingV3Errand(tmpDir, "unconfigured-tail");
    try {
      const result = await runArc(
        ["errand", "close", "unconfigured-tail", "--json"],
        tmpDir,
        { env: { PATH: `${ghDir}:${process.env.PATH ?? ""}`, GH_CALLED: marker } },
      );

      expect(result.exitCode, result.stdout + result.stderr).toBe(1);
      expect(JSON.parse(result.stdout.trim())).toMatchObject({
        outcome: "refused",
        operation: "errand-close",
        reason: "change-request-unverifiable",
        recommendedPromptText: expect.stringContaining("Origin repository coordinates are unsupported"),
      });
      await expect(readFile(marker, "utf-8")).rejects.toThrow();
    } finally {
      await cleanupTempDir(ghDir);
    }
  });

  it("drops the originating capture at close when opened with --from-inbox (the producer→drain leg)", async () => {
    await setFullProtection(tmpDir);
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    const inboxDir = join(tmpDir, ".arc", "user", "test-user");
    const inboxPath = join(inboxDir, "USER-INBOX.md");
    const inbox = "# User Inbox\n\n## Errand\n\n### `[ ]` **Drain me**\n\n- _Observation:_ adopt this.\n\n---\n";
    await mkdir(inboxDir, { recursive: true });
    await writeFile(inboxPath, inbox, "utf-8");
    const host = await createMergedGhFixture(tmpDir, "adopt-it");
    try {
      const sequence = await runArcAnchoredSequence([
        ["errand", "open", "adopt-it", "--from-inbox", "Drain me", "--json"],
        { command: inspectIdentityCommand("adopt-it") },
        ["errand", "close", "adopt-it", "--json"],
      ], tmpDir, { env: host.env });

      expect(sequence.exitCode, sequence.stdout + sequence.stderr).toBe(0);
      expect(sequence.results[0]).toMatchObject({
        outcome: "applied",
        operation: "errand-open",
        identity: { kind: "errand", key: "adopt-it", origin: "inbox", originEntry: "Drain me" },
      });
      expect(sequence.results[1]).toMatchObject({
        version: 3,
        slug: "adopt-it",
        origin: "inbox",
        originEntry: "Drain me",
        originEntrySourceDigest: "sha256:4a0d074260a0d810948c1fb0829829bd48d802896460f53e41c20f8aea0479bd",
      });
      expect(sequence.results[2]).toMatchObject({ outcome: "applied", operation: "errand-close" });
      expect(await readFile(inboxPath, "utf-8")).not.toContain("**Drain me**");
    } finally {
      await cleanupTempDir(host.ghDir);
      await cleanupTempDir(host.remoteDir);
    }
  });

  it("adopts a Markdown-bearing capture title from a file operand", async () => {
    await setFullProtection(tmpDir);
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    const title = "Run `arc user inbox-remove` after $(capture)";
    const inboxDir = join(tmpDir, ".arc", "user", "test-user");
    const inboxPath = join(inboxDir, "USER-INBOX.md");
    const operandPath = join(inboxDir, "capture-title.txt");
    const inbox = `# User Inbox\n\n## Errand\n\n### \`[ ]\` **${title}**\n\n- _Observation:_ adopt safely.\n\n---\n`;
    await mkdir(inboxDir, { recursive: true });
    await writeFile(inboxPath, inbox, "utf-8");
    await writeFile(operandPath, `${title}\n`, "utf-8");
    const host = await createMergedGhFixture(tmpDir, "safe-title");
    try {
      const sequence = await runArcAnchoredSequence([
        ["errand", "open", "safe-title", "--inbox-title-file", operandPath, "--json"],
        { command: inspectIdentityCommand("safe-title") },
        ["errand", "close", "safe-title", "--json"],
      ], tmpDir, { env: host.env });

      expect(sequence.exitCode, sequence.stdout + sequence.stderr).toBe(0);
      expect(sequence.results[0]).toMatchObject({
        outcome: "applied",
        operation: "errand-open",
        identity: { kind: "errand", key: "safe-title", origin: "inbox", originEntry: title },
      });
      expect(sequence.results[1]).toMatchObject({
        version: 3,
        slug: "safe-title",
        origin: "inbox",
        originEntry: title,
        originEntrySourceDigest: "sha256:81e1ea6ef85bb4bd08028c2e0fb0288548450e5d3d479dd6e233599d04c24035",
      });
      expect(sequence.results[2]).toMatchObject({ outcome: "applied", operation: "errand-close" });
      expect(await readFile(inboxPath, "utf-8")).not.toContain(title);
    } finally {
      await cleanupTempDir(host.ghDir);
      await cleanupTempDir(host.remoteDir);
    }
  });

  it("returns pure JSON errors for missing and malformed inbox link evidence", async () => {
    await setFullProtection(tmpDir);
    const inboxDir = join(tmpDir, ".arc", "user", "test-user");
    const inboxPath = join(inboxDir, "USER-INBOX.md");
    await mkdir(inboxDir, { recursive: true });
    await writeFile(
      inboxPath,
      "# User Inbox\n\n## Errand\n\n### `[ ]` **Other capture**\n\n- _Observation:_ unrelated.\n\n---\n",
      "utf-8",
    );

    const missing = await runArc([
      "errand", "link", "ghost", "--from-inbox", "Missing capture", "--json",
    ], tmpDir);
    expect(missing.exitCode).toBe(1);
    expect(JSON.parse(missing.stdout.trim())).toMatchObject({
      outcome: "error",
      operation: "errand-link",
      error: { code: "locus.errand-link.inbox" },
    });

    await writeFile(
      inboxPath,
      "# User Inbox\n\n## Errand\n\n### `[ ]` **Broken capture**\n\n"
        + "- _Disposition:_ execute-bound\n\n---\n",
      "utf-8",
    );
    const malformed = await runArc([
      "errand", "link", "ghost", "--from-inbox", "Broken capture", "--json",
    ], tmpDir);
    expect(malformed.exitCode).toBe(1);
    expect(JSON.parse(malformed.stdout.trim())).toMatchObject({
      outcome: "error",
      operation: "errand-link",
      error: { code: "locus.errand-link.inbox" },
    });
  });
});

describe("arc errand abandon", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "init"]);
    await setFullProtection(tmpDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("retires a preserved identity-only claim while retaining its branch", async () => {
    await seedOpenV3Errand(tmpDir, "discard");

    const result = await runArc([
      "errand", "abandon", "discard",
      "--confirm-foreign-generation", `errand-v1/discard/${"d".repeat(32)}`,
      "--json",
    ], tmpDir);

    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      outcome: "applied",
      operation: "errand-abandon",
    });
    expect(result.stderr).toBe("");
    expect(await git(tmpDir, ["branch", "--list", "chore/discard"])).toContain("chore/discard");
    await expect(git(tmpDir, ["cat-file", "-p", "refs/arc/user/test-user/errands:discard"]))
      .rejects.toThrow();
  });

  it("returns one JSON error when the configured base is empty", async () => {
    const configPath = join(tmpDir, ".arc", "system", "arc-config.yml");
    const config = await readFile(configPath, "utf-8");
    const updated = config.replace("branch.base: main", "branch.base: '   '");
    expect(updated).not.toBe(config);
    await writeFile(configPath, updated, "utf-8");

    const result = await runArc(["errand", "abandon", "discard", "--json"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      outcome: "error",
      operation: "errand-abandon",
      error: { code: "locus.errand-abandon.base" },
    });
    expect(result.stderr).toBe("");
  });

  it("returns one JSON error when abandon input is invalid", async () => {
    const result = await runArc(["errand", "abandon", "bad slug", "--json"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      outcome: "error",
      operation: "errand-abandon",
      error: { code: "locus.errand-abandon.input" },
    });
    expect(result.stderr).toBe("");
  });

  it("abandons a clean partial Errand and releases its primary occupancy", async () => {
    const remoteDir = `${tmpDir}-remote.git`;
    await execFileAsync("git", ["init", "--bare", remoteDir]);
    try {
      await setPartialProtection(tmpDir);
      await git(tmpDir, ["add", "-A"]);
      await git(tmpDir, ["commit", "--no-verify", "-m", "track initialized project"]);
      await git(tmpDir, ["remote", "add", "origin", remoteDir]);
      await git(tmpDir, ["push", "-u", "origin", "main"]);

      const result = await runArcAnchoredSequence([
        { command: [process.execPath, CLI_PATH, "errand", "open", "discard-direct", "--json"] },
        { command: [process.execPath, CLI_PATH, "errand", "abandon", "discard-direct", "--json"] },
      ], tmpDir);

      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const settled = result.results.at(-1);
      expect(settled).toMatchObject({
        outcome: "applied",
        operation: "errand-abandon",
        subject: { kind: "partial-errand", slug: "discard-direct", claimId: null },
        generation: expect.stringMatching(/^sha256:/u),
        checkoutPath: tmpDir,
        settlement: { kind: "capture", disposition: "absent", originEntry: null },
      });
      expect(settled).not.toHaveProperty("recordId");
      expect(settled).not.toHaveProperty("leaseId");
      expect(settled).not.toHaveProperty("sessionHomePath");
    } finally {
      await cleanupTempDir(remoteDir);
    }
  });
});

describe("arc errand retire", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "init"]);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("is no longer a registered independent identity transition", async () => {
    const result = await runArc(["errand", "retire", "anything"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("unknown command 'retire'");
  });
});

describe("arc errand promote", () => {
  let tmpDir: string;
  let remoteDir: string | null;

  beforeEach(async () => {
    remoteDir = null;
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "init"]);
  });

  afterEach(async () => {
    if (remoteDir !== null) await cleanupTempDir(remoteDir);
    await cleanupTempDir(tmpDir);
  });

  it("exposes exact foreign-generation confirmation on promotion", async () => {
    const result = await runArc(["errand", "promote", "--help"], tmpDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--confirm-foreign-generation <generation>");
  });

  it("refuses under partial protection", async () => {
    const result = await runArc(["errand", "promote", "anything", "--floor", "scale", "--json"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      outcome: "refused",
      operation: "errand-promote",
      reason: "full-protection-required",
    });
  });

  it("requires --floor — the crossed floor is the agent's judgment", async () => {
    await setFullProtection(tmpDir);

    const result = await runArc(["errand", "promote", "growing", "--name", "growth"], tmpDir);

    expect(result.exitCode).toBe(1);
  });

  it("returns one typed JSON error when --floor is missing", async () => {
    await setFullProtection(tmpDir);

    const result = await runArc(["errand", "promote", "growing", "--name", "growth", "--json"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    const lines = result.stdout.trim().split(/\r?\n/u);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      outcome: "error",
      operation: "errand-promote",
      error: { code: "locus.errand-promote.input" },
    });
  });

  it("commits its exact receipt before retiring identity and primary occupancy", async () => {
    const slug = "growing";
    const promote = [
      "errand", "promote", slug, "--name", "growth", "--type", "feat", "--floor", "scale", "--json",
    ];
    await setFullProtection(tmpDir);
    await git(tmpDir, ["add", "-A"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    remoteDir = await createBareRemote(tmpDir, "promotion");

    const prepared = await runArcAnchoredSequence([
      ["errand", "open", slug, "--json"],
      { args: promote, cwdFromPreviousJson: "allocation.checkoutPath" },
    ], tmpDir, { timeout: 60_000 });

    expect(prepared.exitCode, prepared.stdout + prepared.stderr).toBe(0);
    expect(prepared.results).toHaveLength(2);
    const first = prepared.results[1] as {
      checkoutPath?: unknown;
      metaPath?: unknown;
      subject?: unknown;
      generation?: unknown;
    };
    expect(first).toMatchObject({
      outcome: "applied",
      operation: "errand-promote",
      subject: { kind: "errand", slug, claimId: expect.any(String) },
      generation: expect.stringMatching(/^errand-v1\/growing\/[a-f0-9]{32}$/u),
      branch: "feat/growth",
      metaPath: ".arc/active/meta-growth.md",
      checkoutPath: tmpDir,
      allocation: "primary",
      settlement: { state: "commit-required", identity: "retained" },
    });
    expect(first).not.toHaveProperty("recordId");
    expect(first).not.toHaveProperty("activeLocusPath");
    if (typeof first.checkoutPath !== "string" || typeof first.metaPath !== "string") {
      throw new Error("Promotion preparation returned no exact checkout/meta path.");
    }
    await git(first.checkoutPath, ["add", first.metaPath]);
    await git(first.checkoutPath, ["commit", "--no-verify", "-m", "commit promotion receipt"]);

    const replay = await runArcAnchored(promote, first.checkoutPath, { timeout: 60_000 });
    expect(replay.exitCode, replay.stdout + replay.stderr).toBe(0);
    const settled = JSON.parse(replay.stdout);
    expect(settled).toMatchObject({
      outcome: "applied",
      operation: "errand-promote",
      subject: first.subject,
      generation: first.generation,
      branch: "feat/growth",
      metaPath: first.metaPath,
      checkoutPath: first.checkoutPath,
      allocation: "primary",
      settlement: { state: "settled", identity: "retired" },
    });
    await expect(access(join(tmpDir, ".arc", "system", ".internal", "worktree-marker.json")))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(git(tmpDir, ["cat-file", "-p", `refs/arc/user/test-user/errands:${slug}`]))
      .rejects.toThrow();
  });
});

describe("the Errand close boundary over a base that moves under it", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "init"]);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  /**
   * An ordinary Errand standing at its close boundary, its change request merged at the exact head.
   *
   * The branch carries a commit, which is what puts the close on its ordinary path: the base pin sits behind a
   * no-op shortcut that only an Errand level with its base ever reaches.
   */
  async function errandAwaitingClose(slug: string): Promise<{
    ghDir: string;
    remoteDir: string;
    env: Record<string, string>;
  }> {
    await setFullProtection(tmpDir);
    await git(tmpDir, ["add", ".arc/system/arc-config.yml"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    await seedOpenV3Errand(tmpDir, slug);
    await git(tmpDir, ["switch", `chore/${slug}`]);
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "tracked Errand change"]);
    const head = (await git(tmpDir, ["rev-parse", "HEAD"])).trim();
    await git(tmpDir, ["switch", "main"]);
    return await createMergedGhFixture(tmpDir, slug, head);
  }

  function closeArgs(slug: string): readonly string[] {
    return [
      "errand", "close", slug,
      "--confirm-foreign-generation", `errand-v1/${slug}/${"d".repeat(32)}`,
      "--json",
    ];
  }

  it("closes the Errand when the base holds still", async () => {
    const slug = "close-base-still";
    const host = await errandAwaitingClose(slug);
    try {
      const result = await runArcAnchoredSequence([closeArgs(slug)], tmpDir, { env: host.env });

      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(result.results.at(-1)).toMatchObject({ outcome: "applied", operation: "errand-close" });
      expect(await git(tmpDir, ["branch", "--list", `chore/${slug}`])).toBe("");
    } finally {
      await cleanupTempDir(host.ghDir);
      await cleanupTempDir(host.remoteDir);
    }
  });

  it("closes the Errand after an advance sharing no path with it", async () => {
    const slug = "close-base-advanced";
    const host = await errandAwaitingClose(slug);
    const before = await git(tmpDir, ["rev-parse", "refs/remotes/origin/main"]);
    try {
      // The advance rides inside the anchored sequence, between the close's precondition and the close
      // itself — the only place it can land, since the lane closes under one shell.
      const result = await runArcAnchoredSequence([
        advanceBaseStep({ cwd: tmpDir, paths: movementPaths("disjoint", slug).base }),
        closeArgs(slug),
      ], tmpDir, { env: host.env });

      expect(await git(host.remoteDir, ["rev-parse", "refs/heads/main"])).not.toBe(before);
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(result.results.at(-1)).toMatchObject({ outcome: "applied", operation: "errand-close" });
      expect(await git(tmpDir, ["branch", "--list", `chore/${slug}`])).toBe("");
    } finally {
      await cleanupTempDir(host.ghDir);
      await cleanupTempDir(host.remoteDir);
    }
  });
});
