/** Built-CLI proof that later same-head review reopens publication readiness. */

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, git, runArc, runArcWithStdin } from "./helpers.js";

const OFFLINE_ORIGIN = "https://arc-fixture.example/arc-framework/example.git";
const OFFLINE_ENV = { GIT_TERMINAL_PROMPT: "0" };

const META = [
  "# Metadata: example",
  "",
  "| **State** | **Owner**   | **Branch**     | **Class** | **Priority** |",
  "| --------- | ----------- | -------------- | --------- | ------------ |",
  "| `Active`  | `test-user` | `feat/example` | `Light`   | `P2`         |",
  "",
  "- **Cohort:** [none]",
  "- **Depends On:** [none]",
  "",
  "- **Origin:** [internal]",
  "- **Design:** [none]",
  "- **Task List:** `tasks-example.md`",
  "- **Review Rubric:** [none]",
  "- **Promotion Receipt:** [none]",
  "",
  "- **Current Workflow:** [none]",
  "- **Last Completed:** verification",
  "- **Next Task:** [none]",
  "- **Blockers:** [none]",
  "",
  "- **Next Action:** verification complete",
  "",
  "- **PR URL:** [none]",
  "- **Completed:** [none]",
  "",
  "---",
  "",
].join("\n");

interface Envelope {
  state: string;
  nextAction: string;
  payload: Record<string, unknown>;
}

interface PreparedLocalReview {
  operationId: string;
  target: { targetId: string; headSha: string; headTree: string };
  request: { evaluatorIdentity: string };
  reviewerPayload: {
    sourceDigest: string;
    guidanceDigest: string;
    guidance: { rubricVersion: string; rubricDigest: string };
  };
}

async function invoke(
  root: string,
  args: string[],
  request: unknown,
  env?: Record<string, string>,
): Promise<Envelope> {
  const result = await runArcWithStdin(args, root, `${JSON.stringify(request)}\n`, { env });
  expect(result.exitCode, JSON.stringify(result)).toBe(0);
  return JSON.parse(result.stdout) as Envelope;
}

async function createReviewRepo(): Promise<string> {
  const root = await createTempRepo("arc-post-ready-pass-");
  const initialized = await runArc(["init", "--yes", "--name", "example"], root);
  expect(initialized.exitCode, JSON.stringify(initialized)).toBe(0);
  const configPath = join(root, ".arc", "system", "arc-config.yml");
  const config = await readFile(configPath, "utf8");
  await writeFile(configPath, config.replace(
    "review.standard_sources: []",
    "review.standard_sources: [delegated-agent]",
  ));
  await git(root, ["add", ".arc", ".gitignore"]);
  await git(root, ["commit", "-m", "install ARC"]);
  await git(root, ["switch", "-c", "feat/example"]);
  await mkdir(join(root, ".arc", "active"), { recursive: true });
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, ".arc", "active", "meta-example.md"), META);
  await writeFile(join(root, ".arc", "active", "tasks-example.md"),
    "# Task List: Example\n\n- [x] Verification complete\n");
  await writeFile(join(root, "src", "example.ts"), "export const example = true;\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "implementation"]);
  const attested = await runArc(["attest", "example", "--json"], root);
  expect(attested.exitCode, JSON.stringify(attested)).toBe(0);
  await git(root, ["commit", "-m", "verification"]);
  return root;
}

async function attachOriginWithoutPr(root: string): Promise<Record<string, string>> {
  const remote = join(root, ".git", "fixture-origin.git");
  const bin = join(root, ".git", "fixture-bin");
  await git(root, ["init", "--bare", remote]);
  await git(root, ["remote", "add", "origin", OFFLINE_ORIGIN]);
  await git(root, ["config", `url.file://${remote}.insteadOf`, OFFLINE_ORIGIN]);
  await mkdir(bin);
  const gh = join(bin, "gh");
  await writeFile(gh, "#!/bin/sh\nprintf '[]\\n'\n");
  await chmod(gh, 0o755);
  return { ...OFFLINE_ENV, PATH: `${bin}:${process.env.PATH ?? ""}` };
}

function localPrepareRequest(policyJudgment?: Record<string, unknown>) {
  return {
    schemaVersion: 1,
    evaluatorIdentity: "reviewer-1",
    routingFacts: {
      contentKind: "code-bearing",
      reviewRisk: "routine",
      changeDeterminacy: "ordinary",
      ownership: "self",
      surfaceAuthority: "ordinary",
    },
    ...(policyJudgment === undefined ? {} : { policyJudgment }),
  };
}

async function prepareLocal(
  root: string,
  policyJudgment?: Record<string, unknown>,
  env?: Record<string, string>,
): Promise<PreparedLocalReview> {
  const request = localPrepareRequest(policyJudgment);
  let result = await invoke(root, ["review", "local", "prepare", "-"], request, env);
  if (result.state === "coverage-required") {
    const action = result.payload.coverageSelectionAction as {
      choices: readonly { requestedCoverage: "complete" | "incremental" }[];
    };
    const complete = action.choices.find((choice) => choice.requestedCoverage === "complete");
    expect(complete).toBeDefined();
    result = await invoke(root, ["review", "local", "prepare", "-"], {
      ...request,
      coverageAdmission: complete,
    }, env);
  }
  expect(result).toMatchObject({ state: "ready", nextAction: "launch-review" });
  return result.payload as unknown as PreparedLocalReview;
}

async function finishClean(root: string, prepared: PreparedLocalReview, runId: string): Promise<void> {
  await invoke(root, ["review", "local", "attest", "-"], {
    schemaVersion: 1,
    operationId: prepared.operationId,
    result: {
      status: "complete",
      result: "clean",
      targetId: prepared.target.targetId,
      headSha: prepared.target.headSha,
      headTree: prepared.target.headTree,
      rubricVersion: prepared.reviewerPayload.guidance.rubricVersion,
      rubricDigest: prepared.reviewerPayload.guidance.rubricDigest,
      sourceDigest: prepared.reviewerPayload.sourceDigest,
      guidanceDigest: prepared.reviewerPayload.guidanceDigest,
      evaluatorIdentity: prepared.request.evaluatorIdentity,
      reviewRunId: runId,
      applicabilityId: null,
      findings: [],
    },
  });
  const reduced = await invoke(root, ["review", "reduce", "-"], {
    schemaVersion: 1,
    operationId: prepared.operationId,
  });
  expect(reduced).toMatchObject({ state: "advisory-complete", nextAction: "none" });
}

function prePublication(root: string, env: Record<string, string>) {
  return runArc([
    "review", "pre-publication", "example", "--self-review", "settled",
    "--change-set", join(root, ".git", "prepublication-change-set.json"),
    "--lanes", join(root, ".git", "prepublication-lanes.json"),
  ], root, { env });
}

function publish(root: string, env: Record<string, string>) {
  return runArc([
    "publish", "example", "--last-completed", "verification",
    "--action", "push and open the PR", "--json",
  ], root, { env });
}

describe("publication after an authorized same-head standard pass", () => {
  let root: string | null = null;

  afterEach(async () => {
    if (root !== null) await cleanupTempDir(root);
    root = null;
  });

  it("refuses ready replay and publish while the new pass is pending, then reopens after it settles", async () => {
    root = await createReviewRepo();
    const env = await attachOriginWithoutPr(root);
    await writeFile(join(root, ".git", "prepublication-change-set.json"), JSON.stringify({
      changeSetState: "known",
      contentKind: "code-bearing",
      reviewRisk: "routine",
      changeDeterminacy: "ordinary",
      ownership: "self",
      surfaceAuthority: "ordinary",
    }));
    await writeFile(join(root, ".git", "prepublication-lanes.json"), JSON.stringify({
      frontline: { scopeMode: "whole-target", invocation: { mode: "skip" } },
      standard: { scopeMode: "whole-target", terminus: { mode: "owner-accepted" } },
    }));

    const ready = await prePublication(root, env);
    expect(ready.exitCode, JSON.stringify(ready)).toBe(0);
    expect(JSON.parse(ready.stdout)).toMatchObject({ locus: "candidate-publish-ready" });
    await git(root, ["commit", "-m", "record publication readiness"]);
    const currentHead = await git(root, ["rev-parse", "HEAD"]);
    const operationalReplay = await runArc(["review", "pre-publication", "example"], root, { env });
    expect(operationalReplay.exitCode, JSON.stringify(operationalReplay)).toBe(0);
    expect(JSON.parse(operationalReplay.stdout)).toMatchObject({ locus: "candidate-publish-ready" });

    const first = await prepareLocal(root, { invocation: { mode: "force", sourceId: "delegated-agent" } }, env);
    expect(first.target.headSha).toBe(currentHead);
    await finishClean(root, first, "run-clean-pass-1");

    const second = await prepareLocal(root, {
      additionalPassAuthorization: {
        headSha: currentHead,
        precedingProducerId: first.operationId,
        completedPasses: 1,
        nextPass: 2,
      },
    }, env);
    expect(second.target.headSha).toBe(currentHead);
    expect(second.operationId).not.toBe(first.operationId);

    const refused = await publish(root, env);
    expect(refused.exitCode, JSON.stringify(refused)).toBe(1);
    expect(JSON.parse(refused.stdout)).toMatchObject({
      reason: expect.stringContaining("Standard review progress changed after publication readiness was recorded."),
    });
    const replay = await runArc(["review", "pre-publication", "example"], root, { env });
    expect(replay.exitCode, JSON.stringify(replay)).toBe(1);
    expect(JSON.parse(replay.stdout)).toMatchObject({
      error: {
        code: "review-in-progress",
        message: expect.stringContaining(second.operationId),
      },
      remedy: { argv: ["arc", "review", "local", "resume", "-"] },
    });

    await finishClean(root, second, "run-clean-pass-2");
    const settled = await prePublication(root, env);
    expect(settled.exitCode, JSON.stringify(settled)).toBe(0);
    expect(JSON.parse(settled.stdout)).toMatchObject({ locus: "candidate-publish-ready" });
    const submitted = await publish(root, env);
    expect(submitted.exitCode, JSON.stringify(submitted)).toBe(0);
    expect(JSON.parse(submitted.stdout)).toMatchObject({
      status: "published",
      boundary: { locus: "publication-pending" },
    });
  }, 120_000);
});
