import { delimiter, join } from "node:path";
import {
  access,
  chmod,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  git,
  runArc,
  runArcWithStdin,
  type RunResult,
} from "./helpers.js";

interface ReviewTarget {
  schemaVersion: 2;
  semanticsVersion: "review-gate/v2";
  kind: "change-set";
  repositoryId: string;
  baseRef: string;
  diffBaseSha: string;
  diffBaseTree: string;
  targetId: string;
  headSha: string;
  headTree: string;
}

interface LocalPreparePayload {
  operationId: string;
  target: ReviewTarget;
  request: { evaluatorIdentity: string };
  reviewerPayload: {
    reviewRoot: string;
    sourceDigest: string;
    guidanceDigest: string;
    guidance: {
      rubricVersion: string;
      rubricDigest: string;
    };
  };
}

interface ReviewEnvelope {
  state: string;
  nextAction: string;
  payload: unknown;
}

interface ProposedDispositionState {
  schemaVersion: 2;
  semanticsVersion: "review-gate/v2";
  state: "proposed";
  dispositionSet: {
    schemaVersion: 2;
    semanticsVersion: "review-gate/v2";
    targetId: string;
    policyVersion: string;
    rubricVersion: string;
    rubricDigest: string;
    proposedBy: string;
    findings: unknown[];
    dispositionSetId: string;
  };
}

interface AwaitingApprovalPayload {
  proposal: ProposedDispositionState;
}

interface ReductionFindingsPayload {
  responseSource: {
    kind: "attested-local";
    receiptRef: string;
  };
}

interface FrontlineTerminalPayload {
  operationId: string;
}

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => cleanupTempDir(root)));
});

function envelope(result: RunResult): ReviewEnvelope {
  expect(result.exitCode, result.stderr || result.stdout).toBe(0);
  return JSON.parse(result.stdout.trim()) as ReviewEnvelope;
}

async function invoke(root: string, command: string[], request: unknown): Promise<ReviewEnvelope> {
  return envelope(await runArcWithStdin(command, root, `${JSON.stringify(request)}\n`));
}

async function fixture(): Promise<string> {
  const root = await createTempRepo("arc-review-protocol-");
  roots.push(root);
  const initialized = await runArc(["init", "--yes", "--name", "review-protocol"], root);
  expect(initialized.exitCode, initialized.stderr || initialized.stdout).toBe(0);
  await git(root, ["add", ".arc", ".gitignore"]);
  await git(root, ["commit", "-m", "install ARC"]);
  await git(root, ["switch", "-c", "feat/review-protocol"]);
  await mkdir(join(root, ".arc", "active"), { recursive: true });
  await writeFile(join(root, ".arc", "active", "meta-review-protocol.md"), [
    "# Metadata: review-protocol",
    "",
    "- **State:** Active",
    "- **Owner:** test-user",
    "- **Branch:** feat/review-protocol",
    "- **Class:** Light",
    "- **Priority:** P2",
    "- **Cohort:** [none]",
    "- **Depends On:** [none]",
    "",
    "- **Origin:** [internal]",
    "- **Design:** [none]",
    "- **Task List:** `tasks-review-protocol.md`",
    "- **Review Rubric:** [none]",
    "- **Candidate:** [none]",
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
  ].join("\n"), "utf8");
  await writeFile(
    join(root, ".arc", "active", "tasks-review-protocol.md"),
    "# Task List: Review Protocol\n\n- [x] Verification complete\n",
    "utf8",
  );
  await writeFile(join(root, "reviewed.txt"), "reviewed change\n", "utf8");
  await git(root, [
    "add",
    ".arc/active/meta-review-protocol.md",
    ".arc/active/tasks-review-protocol.md",
    "reviewed.txt",
  ]);
  await git(root, ["commit", "-m", "add reviewed change"]);
  const attested = await runArc(["attest", "review-protocol", "--json"], root);
  expect(attested.exitCode, attested.stderr || attested.stdout).toBe(0);
  await git(root, ["commit", "-m", "record verified Candidate"]);
  expect(await git(root, ["status", "--porcelain"])).toBe("");
  return root;
}

function localPrepareRequest(freshnessMs?: number) {
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
    ...(freshnessMs === undefined ? {} : { freshnessMs }),
  };
}

async function prepareLocal(root: string, freshnessMs?: number): Promise<LocalPreparePayload> {
  const prepared = await invoke(
    root,
    ["review", "local", "prepare", "-"],
    localPrepareRequest(freshnessMs),
  );
  expect(prepared).toMatchObject({ state: "ready", nextAction: "launch-review" });
  return prepared.payload as LocalPreparePayload;
}

function localResult(
  prepared: LocalPreparePayload,
  result: "clean" | "findings",
) {
  return {
    status: "complete",
    result,
    targetId: prepared.target.targetId,
    headSha: prepared.target.headSha,
    headTree: prepared.target.headTree,
    rubricVersion: prepared.reviewerPayload.guidance.rubricVersion,
    rubricDigest: prepared.reviewerPayload.guidance.rubricDigest,
    sourceDigest: prepared.reviewerPayload.sourceDigest,
    guidanceDigest: prepared.reviewerPayload.guidanceDigest,
    evaluatorIdentity: prepared.request.evaluatorIdentity,
    reviewRunId: `run-${result}`,
    applicabilityId: null,
    findings: result === "findings"
      ? [{
          findingId: "finding-1",
          severity: "major",
          locus: "reviewed.txt:1",
          evidenceUrlOrId: "review:finding-1",
        }]
      : [],
  };
}

async function approvedRejection(
  root: string,
  source: ReductionFindingsPayload["responseSource"],
) {
  const prepared = await invoke(root, ["review", "respond", "-"], {
    schemaVersion: 1,
    source,
    proposal: {
      findings: [{
        findingId: "finding-1",
        sourceVerification: "verified",
        verificationRefs: ["source:reviewed.txt:1"],
        disposition: "reject",
        rationale: "The reviewed source supports recording this disposition.",
        recommendation: "Record the rejected finding.",
        openQuestions: [],
      }],
    },
  });
  expect(prepared).toMatchObject({ state: "awaiting-approval", nextAction: "obtain-approval" });
  const proposal = (prepared.payload as AwaitingApprovalPayload).proposal;
  return {
    ...proposal,
    state: "approved" as const,
    approval: {
      schemaVersion: 2 as const,
      semanticsVersion: "review-gate/v2" as const,
      targetId: proposal.dispositionSet.targetId,
      dispositionSetId: proposal.dispositionSet.dispositionSetId,
      approvedBy: "test-user",
      approvedAt: "2026-07-23T21:00:00Z",
    },
  };
}

describe("built review protocol", () => {
  it("distinguishes the singleton status route from an unreadable boundary", async () => {
    const root = await fixture();
    const boundaryDir = join(root, ".arc", "system", ".internal", "candidates");
    const boundaryPath = join(boundaryDir, "review-protocol.boundary.json");
    expect(JSON.parse(await readFile(boundaryPath, "utf8"))).toMatchObject({
      locus: "candidate-review-pending",
    });

    const result = await runArc(["review", "status", "--work-unit", "review-protocol"], root);

    expect(result.exitCode).toBe(64);
    const refusal = JSON.parse(result.stdout) as { remedy: { text: string } };
    expect(refusal).toMatchObject({
      mode: "review-status",
      state: "blocked",
      nextAction: "stop",
      reason: "wrong-route",
      detail: expect.stringContaining("Use --target"),
      remedy: {
        argv: ["arc", "review", "status", "--help"],
        text: expect.stringContaining("use --target"),
      },
    });
    expect(refusal.remedy.text).not.toContain("Resolve the operational failure");

    await writeFile(boundaryPath, "not JSON", "utf8");
    const unreadable = await runArc(["review", "status", "--work-unit", "review-protocol"], root);
    expect(unreadable.exitCode).toBe(1);
    expect(JSON.parse(unreadable.stdout)).toMatchObject({
      state: "blocked",
      reason: "status-unavailable",
      remedy: {
        argv: ["arc", "review", "status", "--work-unit", "review-protocol"],
        text: expect.stringContaining("Resolve the operational failure"),
      },
    });
  });

  it("returns a typed refusal when exact-target status runs outside an ARC project", async () => {
    const root = await createTempRepo("arc-review-status-outside-");
    roots.push(root);
    const target = {
      repository: "owner/repo",
      headRef: "feat/review-status",
      headSha: "d".repeat(40),
    };

    const result = await runArc([
      "review",
      "status",
      "--target",
      JSON.stringify(target),
    ], root);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: "review-status",
      target,
      state: "blocked",
      nextAction: "stop",
      reason: "status-unavailable",
      remedy: { argv: ["arc", "review", "status", "--target", JSON.stringify(target)] },
    });
  });

  it("completes and re-enters a clean local review through the public verbs", async () => {
    const root = await fixture();
    const prepared = await prepareLocal(root);

    await expect(access(prepared.reviewerPayload.reviewRoot)).resolves.toBeUndefined();
    await expect(invoke(root, ["review", "local", "resume", "-"], {
      schemaVersion: 1,
      operationId: prepared.operationId,
    })).resolves.toMatchObject({ state: "suspended", nextAction: "wait" });

    const attested = await invoke(root, ["review", "local", "attest", "-"], {
      schemaVersion: 1,
      operationId: prepared.operationId,
      result: localResult(prepared, "clean"),
    });
    expect(attested).toMatchObject({ state: "attested-current", nextAction: "reduce" });
    await expect(access(prepared.reviewerPayload.reviewRoot)).rejects.toMatchObject({ code: "ENOENT" });

    await expect(invoke(
      root,
      ["review", "local", "prepare", "-"],
      localPrepareRequest(),
    )).resolves.toMatchObject({
      state: "review-complete",
      nextAction: "reduce",
      payload: { operationId: prepared.operationId },
    });
    await expect(invoke(root, ["review", "local", "resume", "-"], {
      schemaVersion: 1,
      operationId: prepared.operationId,
    })).resolves.toMatchObject({ state: "review-complete", nextAction: "reduce" });
    await expect(invoke(root, ["review", "reduce", "-"], {
      schemaVersion: 1,
      operationId: prepared.operationId,
    })).resolves.toMatchObject({ state: "advisory-complete", nextAction: "none" });
  });

  it("settles local findings and replays the approved disposition through public verbs", async () => {
    const root = await fixture();
    const prepared = await prepareLocal(root);
    await expect(invoke(root, ["review", "local", "attest", "-"], {
      schemaVersion: 1,
      operationId: prepared.operationId,
      result: localResult(prepared, "findings"),
    })).resolves.toMatchObject({ state: "attested-current", nextAction: "reduce" });

    await expect(invoke(
      root,
      ["review", "local", "prepare", "-"],
      localPrepareRequest(),
    )).resolves.toMatchObject({
      state: "review-complete",
      nextAction: "reduce",
      payload: { operationId: prepared.operationId },
    });
    const reduced = await invoke(root, ["review", "reduce", "-"], {
      schemaVersion: 1,
      operationId: prepared.operationId,
    });
    expect(reduced).toMatchObject({ state: "findings", nextAction: "respond" });
    const responseSource = (reduced.payload as ReductionFindingsPayload).responseSource;
    const request = {
      schemaVersion: 1,
      source: responseSource,
      dispositions: await approvedRejection(root, responseSource),
    };
    await expect(invoke(root, ["review", "respond", "-"], request))
      .resolves.toMatchObject({ state: "settled", nextAction: "reduce" });
    await expect(invoke(root, ["review", "respond", "-"], request))
      .resolves.toMatchObject({ state: "already-settled", nextAction: "reduce" });
    await expect(invoke(root, ["review", "local", "resume", "-"], {
      schemaVersion: 1,
      operationId: prepared.operationId,
    })).resolves.toMatchObject({ state: "review-complete", nextAction: "reduce" });
    await expect(invoke(root, ["review", "reduce", "-"], {
      schemaVersion: 1,
      operationId: prepared.operationId,
    })).resolves.toMatchObject({ state: "settled", nextAction: "none" });
  });

  it("serializes concurrent expiry sweeps and physically releases the source", async () => {
    const root = await fixture();
    const prepared = await prepareLocal(root, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const request = { schemaVersion: 1, operationId: prepared.operationId };

    const resumed = await Promise.all([
      invoke(root, ["review", "local", "resume", "-"], request),
      invoke(root, ["review", "local", "resume", "-"], request),
    ]);

    expect(resumed).toEqual([
      expect.objectContaining({ state: "expired", nextAction: "rerun-review" }),
      expect.objectContaining({ state: "expired", nextAction: "rerun-review" }),
    ]);
    await expect(access(prepared.reviewerPayload.reviewRoot)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(git(root, [
      "show-ref",
      "--verify",
      `refs/arc/review/local/${prepared.operationId}`,
    ])).rejects.toThrow();
  });

  it("renews an expired receipt-less operation when review reruns at the unchanged head", async () => {
    const root = await fixture();
    const expired = await prepareLocal(root, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));

    await expect(invoke(root, ["review", "local", "resume", "-"], {
      schemaVersion: 1,
      operationId: expired.operationId,
    })).resolves.toMatchObject({ state: "expired", nextAction: "rerun-review" });

    const renewed = await prepareLocal(root, 60_000);
    expect(renewed.operationId).toBe(expired.operationId);
    await expect(invoke(root, ["review", "local", "resume", "-"], {
      schemaVersion: 1,
      operationId: renewed.operationId,
    })).resolves.toMatchObject({ state: "suspended", nextAction: "wait" });
    await expect(invoke(root, ["review", "local", "attest", "-"], {
      schemaVersion: 1,
      operationId: renewed.operationId,
      result: localResult(renewed, "clean"),
    })).resolves.toMatchObject({ state: "attested-current", nextAction: "reduce" });
  });

  it("keeps a renewed source live while an expiry sweep runs concurrently", async () => {
    const root = await fixture();
    const expired = await prepareLocal(root, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const request = {
      schemaVersion: 1,
      operationId: expired.operationId,
    };

    const [renewed, resumed] = await Promise.all([
      prepareLocal(root, 60_000),
      invoke(root, ["review", "local", "resume", "-"], request),
    ]);

    expect(renewed.operationId).toBe(expired.operationId);
    expect(resumed).toMatchObject({
      state: expect.stringMatching(/^(expired|suspended)$/),
    });
    await expect(access(renewed.reviewerPayload.reviewRoot)).resolves.toBeUndefined();
    await expect(git(root, [
      "show-ref",
      "--verify",
      `refs/arc/review/local/${renewed.operationId}`,
    ])).resolves.toContain(renewed.operationId);
    await expect(invoke(root, ["review", "local", "resume", "-"], request))
      .resolves.toMatchObject({ state: "suspended", nextAction: "wait" });
  });

  it("accepts only one of two conflicting terminal results for one local operation", async () => {
    const root = await fixture();
    const prepared = await prepareLocal(root);
    const request = (result: "clean" | "findings") => ({
      schemaVersion: 1,
      operationId: prepared.operationId,
      result: localResult(prepared, result),
    });

    const results = await Promise.all([
      runArcWithStdin(["review", "local", "attest", "-"], root, `${JSON.stringify(request("clean"))}\n`),
      runArcWithStdin(["review", "local", "attest", "-"], root, `${JSON.stringify(request("findings"))}\n`),
    ]);

    expect(results.map((result) => result.exitCode).sort()).toEqual([0, 1]);
    const rejected = results.find((result) => result.exitCode === 1);
    expect(JSON.parse(rejected?.stdout.trim() ?? "{}")).toMatchObject({
      error: { code: "corrupt-state" },
    });
  });

  it("serializes overlapping exact-head frontline reviews through public verbs", async () => {
    const root = await fixture();
    const prepared = await prepareLocal(root);
    const bin = join(root, ".git", "provider-bin");
    const countFile = join(root, ".git", "coderabbit-runs");
    const executable = join(bin, "coderabbit");
    await mkdir(bin);
    await writeFile(executable, [
      "#!/bin/sh",
      "if [ \"${1:-}\" = \"--version\" ]; then",
      "  printf 'coderabbit 0.6.5\\n'",
      "  exit 0",
      "fi",
      "printf 'run\\n' >> \"$COUNT_FILE\"",
      "sleep 1",
      "printf '%s\\n' '{\"type\":\"complete\",\"status\":\"review_completed\",\"findings\":0,"
        + "\"reviewedFiles\":[\"reviewed.txt\"]}'",
      "",
    ].join("\n"), "utf8");
    await chmod(executable, 0o755);
    const environment = {
      COUNT_FILE: countFile,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
    };
    const resolved = await invoke(root, ["review", "frontline", "resolve", "-"], {
      schemaVersion: 1,
      changeSet: {
        schemaVersion: 1,
        changeSetState: "known",
        contentKind: "code-bearing",
        reviewRisk: "routine",
        changeDeterminacy: "ordinary",
        ownership: "self",
        surfaceAuthority: "ordinary",
        assurance: { workContext: "work-unit", workClass: "Light" },
        activity: { selfReview: true, frontlineReview: true },
      },
      invocation: { mode: "force", sourceId: "coderabbit-cli" },
      maxPasses: 2,
    });
    expect(resolved).toMatchObject({ state: "ready", nextAction: "run-frontline" });
    const { kind, baseRef, diffBaseSha, headSha } = prepared.target;
    const runRequest = {
      schemaVersion: 1,
      target: { kind, baseRef, diffBaseSha, headSha },
      resolution: resolved,
      timeoutMs: 5_000,
    };
    const [firstResult, secondResult] = await Promise.all([
      runArcWithStdin(
        ["review", "frontline", "run", "-"],
        root,
        `${JSON.stringify(runRequest)}\n`,
        { env: environment },
      ),
      runArcWithStdin(
        ["review", "frontline", "run", "-"],
        root,
        `${JSON.stringify(runRequest)}\n`,
        { env: environment },
      ),
    ]);
    const first = envelope(firstResult);
    expect(first).toMatchObject({ state: "clean", nextAction: "none" });
    const second = envelope(secondResult);
    expect(second).toMatchObject({ state: "clean", nextAction: "none" });
    expect((await readFile(countFile, "utf8")).trim().split("\n")).toHaveLength(1);

    const operationId = (first.payload as FrontlineTerminalPayload).operationId;
    await expect(invoke(root, ["review", "reduce", "-"], {
      schemaVersion: 1,
      operationId,
    })).resolves.toMatchObject({
      state: "advisory-complete",
      nextAction: "none",
      payload: {
        frontlineOutcomeRef: expect.any(String),
        frontlineFollowUp: { action: "stop" },
      },
    });
  });
});
