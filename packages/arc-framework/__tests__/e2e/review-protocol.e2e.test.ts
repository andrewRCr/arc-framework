import { createHash } from "node:crypto";
import { delimiter, join } from "node:path";
import {
  access,
  chmod,
  mkdir,
  readdir,
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

interface LocalOperationRecord {
  state: {
    policyVersion: string;
    requirement: {
      rubricVersion: string;
      rubricDigest: string;
    };
    request: {
      evaluatorIdentity: string;
    };
    attestation: {
      runtimeIdentity: string;
    };
  };
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

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalize(record[key])}`
  )).join(",")}}`;
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalize(value), "utf8").digest("hex")}`;
}

async function readLocalOperation(root: string): Promise<LocalOperationRecord> {
  const common = await git(root, ["rev-parse", "--git-common-dir"]);
  const directory = join(root, common, "arc", "review-gate", "operations");
  const names = await readdir(directory);
  expect(names).toHaveLength(1);
  const name = names[0];
  if (name === undefined) throw new Error("review operation record is unavailable");
  return JSON.parse(await readFile(join(directory, name), "utf8")) as LocalOperationRecord;
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
    "",
  ].join("\n"), "utf8");
  await writeFile(join(root, "reviewed.txt"), "reviewed change\n", "utf8");
  await git(root, ["add", ".arc/active/meta-review-protocol.md", "reviewed.txt"]);
  await git(root, ["commit", "-m", "add reviewed change"]);
  expect(await git(root, ["status", "--porcelain"])).toBe("");
  return root;
}

async function prepareLocal(root: string, freshnessMs?: number): Promise<LocalPreparePayload> {
  const prepared = await invoke(root, ["review", "local", "prepare", "-"], {
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
  });
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

async function approvedRejection(root: string, prepared: LocalPreparePayload) {
  const operation = (await readLocalOperation(root)).state;
  const finding = localResult(prepared, "findings").findings[0];
  if (finding === undefined) throw new Error("finding fixture is unavailable");
  const fields = {
    schemaVersion: 2 as const,
    semanticsVersion: "review-gate/v2" as const,
    targetId: prepared.target.targetId,
    policyVersion: operation.policyVersion,
    rubricVersion: operation.requirement.rubricVersion,
    rubricDigest: operation.requirement.rubricDigest,
    proposedBy: operation.attestation.runtimeIdentity,
    findings: [{
      findingId: finding.findingId,
      sourceIdentity: operation.request.evaluatorIdentity,
      locus: finding.locus,
      sourceVerification: "verified",
      verificationRefs: ["source:reviewed.txt:1"],
      severity: finding.severity,
      disposition: "reject",
      gating: "blocking",
      rationale: "The reviewed source supports recording this disposition.",
      recommendation: "Record the rejected finding.",
      openQuestions: [],
    }],
  };
  const dispositionSetId = digest({
    domain: "arc.review-gate.disposition-set/v2",
    ...fields,
  });
  return {
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    state: "approved",
    dispositionSet: { ...fields, dispositionSetId },
    approval: {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: prepared.target.targetId,
      dispositionSetId,
      approvedBy: "test-user",
      approvedAt: "2026-07-23T21:00:00Z",
    },
  };
}

describe("built review protocol", () => {
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

    const reduced = await invoke(root, ["review", "reduce", "-"], {
      schemaVersion: 1,
      operationId: prepared.operationId,
    });
    expect(reduced).toMatchObject({ state: "findings", nextAction: "respond" });
    const responseSource = (reduced.payload as ReductionFindingsPayload).responseSource;
    const request = {
      schemaVersion: 1,
      source: responseSource,
      dispositions: await approvedRejection(root, prepared),
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

  it("executes and re-enters an exact-head frontline review through public verbs", async () => {
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
    const runRequest = {
      schemaVersion: 1,
      target: prepared.target,
      resolution: resolved,
      timeoutMs: 5_000,
    };
    const first = envelope(await runArcWithStdin(
      ["review", "frontline", "run", "-"],
      root,
      `${JSON.stringify(runRequest)}\n`,
      { env: environment },
    ));
    expect(first).toMatchObject({ state: "clean", nextAction: "none" });
    const second = envelope(await runArcWithStdin(
      ["review", "frontline", "run", "-"],
      root,
      `${JSON.stringify(runRequest)}\n`,
      { env: environment },
    ));
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
