import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { GitExec } from "../../src/lib/git/exec.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import {
  ReviewReceiptV2Schema,
} from "../../src/scripts/review-gate/core/gate-contract-v2-schema.js";
import { parseEvidence } from "../../src/scripts/review-gate/core/evidence.js";
import type { ReviewOperationStateStore } from "../../src/scripts/review-gate/core/ports.js";
import {
  RepositoryGitCommonStatePublisher,
  type GitCommonStatePublisher,
} from "../../src/lib/git-common-state.js";
import {
  LocalReviewOperationStateStore,
} from "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import {
  acknowledgeHostedRequest,
  bindHostedAttemptDisposition,
  hostedLaneAttemptId,
  recordHostedAwaitAttempt,
  recordHostedRequestAdmission,
  readHostedAwaitReplay,
  resolveHostedAwaitResult,
  supersedeHostedAttemptDisposition,
} from "../../src/scripts/review-gate/lane-progress.js";
import {
  createHostedHandleFixture,
  createHostedTerminalAttemptFixture,
} from "../fixtures/hosted-review.js";

const roots: string[] = [];
const digest = (value: string): string => canonicalDigest({ value });

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "arc-review-operations-"));
  roots.push(root);
  const commonDir = join(root, "common.git");
  await mkdir(commonDir, { recursive: true });
  const exec: GitExec = async () => ({ stdout: `${commonDir}\n` });
  const store = new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(exec, root));
  const state = {
    schemaVersion: 1 as const,
    semanticsVersion: "review-operation/v1" as const,
    operationId: "frontline-target-source-0",
    updatedAt: "2026-07-20T20:00:00Z",
    kind: "frontline-run" as const,
    repositoryId: "repo-1",
    targetId: digest("target"),
    sourceIdentity: "local-frontline",
    lineage: { kind: "candidate" as const, candidateId: digest("candidate") },
    logicalPass: 1,
    retryGeneration: 0,
    outcome: "findings" as const,
    policyVersion: digest("policy"),
    sourceBindingId: digest("source-binding"),
  };
  return { root, commonDir, exec, store, state };
}

async function acknowledgedHostedFixture() {
  const records = await fixture();
  const handle = createHostedHandleFixture();
  const decision = await recordHostedRequestAdmission(records.store, {
    repositoryId: handle.admission.repositoryId,
    lineage: handle.admission.lineage,
    request: {
      schemaVersion: 1,
      target: handle.target,
      provider: handle.provider,
      coverage: handle.requestedCoverage,
    },
    reviewTarget: handle.admission.reviewTarget,
    requirement: handle.admission.requirement,
    actorIdentity: handle.admission.actorIdentity,
    authorizeCapacity: async () => undefined,
    now: "2026-08-15T11:59:00Z",
  });
  if (decision.state !== "admitted") throw new Error("expected hosted admission");
  const progress = await acknowledgeHostedRequest(records.store, {
    admission: decision.admission,
    handle,
    now: "2026-08-15T11:59:30Z",
  });
  return { ...records, handle, progress };
}

async function sealedHostedFixture() {
  const records = await acknowledgedHostedFixture();
  const state = await recordHostedAwaitAttempt(records.store, {
    repositoryId: records.handle.admission.repositoryId,
    result: {
      schemaVersion: 1,
      mode: "review-hosted-await",
      handle: records.handle,
      state: "clean",
      nextAction: "complete",
      reviewUrl: "https://example.invalid/review",
    },
    now: "2026-08-15T12:00:00Z",
  });
  return { ...records, state };
}

async function boundHostedFindingsFixture() {
  const records = await acknowledgedHostedFixture();
  const finding = {
    findingId: "body-1",
    origin: "review-body" as const,
    reviewId: "review-1",
    fingerprint: "body-fingerprint",
    settlement: "not-applicable" as const,
    severity: "minor" as const,
    locus: "pull-request review body",
    url: "https://example.invalid/review-1",
    body: "Body finding",
    sourceOrdinal: 1,
  };
  const sealed = await recordHostedAwaitAttempt(records.store, {
    repositoryId: records.handle.admission.repositoryId,
    result: {
      schemaVersion: 1,
      mode: "review-hosted-await",
      handle: records.handle,
      state: "findings",
      nextAction: "triage",
      reviewUrl: "https://example.invalid/review",
      findings: [finding],
    },
    now: "2026-08-15T12:00:00Z",
  });
  const dispositionSetId = digest("disposition");
  const bound = await bindHostedAttemptDisposition(records.store, {
    operationId: sealed.operationId,
    attemptId: hostedLaneAttemptId(records.handle),
    dispositionSetId,
    findingDispositions: [{
      findingId: finding.findingId,
      disposition: "reject",
      channelAction: "record-only",
    }],
    now: "2026-08-15T12:01:00Z",
  });
  return { ...records, finding, dispositionSetId, bound };
}

describe("local review operation state authority", () => {
  it("serializes identical sibling replay into one repository-shared version", async () => {
    const records = await fixture();
    const sibling = new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(
      records.exec,
      join(records.root, "sibling-worktree"),
    ));

    await expect(Promise.all([
      records.store.publishOperation(records.state, 0),
      sibling.publishOperation(records.state, 0),
    ])).resolves.toEqual([{ version: 1 }, { version: 1 }]);
    await expect(sibling.readOperation(records.state.operationId)).resolves.toEqual({
      version: 1,
      state: records.state,
    });
  });

  it("returns one complete locked snapshot of strictly parsed operation records", async () => {
    const records = await fixture();
    await records.store.publishOperation(records.state, 0);

    await expect(records.store.readOperationSnapshot()).resolves.toEqual({
      status: "complete",
      records: [{ version: 1, state: records.state }],
    });
  });

  it("returns an empty namespace as a complete snapshot rather than inferred review absence", async () => {
    const records = await fixture();
    await expect(records.store.readOperationSnapshot()).resolves.toEqual({ status: "complete", records: [] });
  });

  it("marks malformed, misnamed, and non-file namespace entries incomplete", async () => {
    const malformed = await fixture();
    const malformedDirectory = join(malformed.commonDir, "arc", "review-gate", "operations");
    await mkdir(malformedDirectory, { recursive: true });
    await writeFile(join(malformedDirectory, `operation-${"0".repeat(64)}.json`), "not-json\n", "utf8");
    await expect(malformed.store.readOperationSnapshot()).resolves.toEqual({
      status: "incomplete",
      reason: "malformed-operation-state",
    });

    const misnamed = await fixture();
    await misnamed.store.publishOperation(misnamed.state, 0);
    const misnamedDirectory = join(misnamed.commonDir, "arc", "review-gate", "operations");
    const digestName = canonicalDigest({ operationId: misnamed.state.operationId }).slice("sha256:".length);
    const content = await readFile(join(misnamedDirectory, `operation-${digestName}.json`), "utf8");
    await writeFile(join(misnamedDirectory, "unexpected.json"), content, "utf8");
    await expect(misnamed.store.readOperationSnapshot()).resolves.toEqual({
      status: "incomplete",
      reason: "operation-record-name-mismatch",
    });

    const nonFile = await fixture();
    await mkdir(join(nonFile.commonDir, "arc", "review-gate", "operations", "unexpected.json"), {
      recursive: true,
    });
    await expect(nonFile.store.readOperationSnapshot()).resolves.toEqual({
      status: "incomplete",
      reason: "unexpected-operation-state-entry",
    });
  });

  it("types snapshot failure as unavailable and performs no operation mutation", async () => {
    let mutations = 0;
    const publisher = {
      snapshot: async () => { throw new Error("snapshot-lock-failed"); },
      read: async () => null,
      list: async () => [],
      update: async () => { mutations += 1; throw new Error("unexpected mutation"); },
    } as GitCommonStatePublisher;
    const store = new LocalReviewOperationStateStore(publisher);

    await expect(store.readOperationSnapshot()).resolves.toEqual({
      status: "unavailable",
      reason: "snapshot-lock-failed",
    });
    expect(mutations).toBe(0);
  });

  it("rejects stale conflicting publication without overwriting recoverable state", async () => {
    const records = await fixture();
    await records.store.publishOperation(records.state, 0);
    const before = await records.store.readOperation(records.state.operationId);

    await expect(records.store.publishOperation({
      ...records.state,
      updatedAt: "2026-07-20T20:01:00Z",
      outcome: "clean",
    }, 0)).rejects.toThrow(/version-conflict/u);
    await expect(records.store.readOperation(records.state.operationId)).resolves.toEqual(before);
  });

  it("rejects a schema-valid rewrite that removes sealed hosted evidence", async () => {
    const records = await sealedHostedFixture();
    const current = await records.store.readOperation(records.state.operationId);

    await expect(records.store.publishOperation({
      ...records.state,
      updatedAt: "2026-08-15T12:01:00Z",
      completedPasses: 0,
      attempts: [],
    }, current.version)).rejects.toThrow(/immutable-hosted-transition/u);
    await expect(records.store.readOperation(records.state.operationId)).resolves.toEqual(current);
  });

  it("rejects a schema-valid rewrite that replaces sealed hosted content", async () => {
    const records = await sealedHostedFixture();
    const current = await records.store.readOperation(records.state.operationId);
    const attempt = records.state.attempts[0];
    if (attempt?.hosted === undefined) throw new Error("expected hosted terminal attempt");

    await expect(records.store.publishOperation({
      ...records.state,
      updatedAt: "2026-08-15T12:01:00Z",
      attempts: [{
        ...attempt,
        hosted: createHostedTerminalAttemptFixture({
          admission: attempt.hosted.admission,
          outcome: "clean",
          reviewUrl: "https://example.invalid/replaced-review",
        }).hosted,
      }],
    }, current.version)).rejects.toThrow(/immutable-hosted-transition/u);
    await expect(records.store.readOperation(records.state.operationId)).resolves.toEqual(current);
  });

  it("rejects a schema-valid replacement of an approved hosted disposition lineage", async () => {
    const records = await boundHostedFindingsFixture();
    const current = await records.store.readOperation(records.bound.operationId);
    const attempt = records.bound.attempts[0];
    if (attempt?.hosted === undefined) throw new Error("expected hosted findings attempt");
    const replacementDispositionSetId = digest("replacement-disposition");

    await expect(records.store.publishOperation({
      ...records.bound,
      updatedAt: "2026-08-15T12:02:00Z",
      attempts: [{
        ...attempt,
        hosted: {
          ...attempt.hosted,
          dispositionSetId: replacementDispositionSetId,
          dispositionSetLineage: [{
            ...attempt.hosted.dispositionSetLineage[0]!,
            dispositionSetId: replacementDispositionSetId,
          }],
          settlementEvidence: attempt.hosted.settlementEvidence.map((evidence) => ({
            ...evidence,
            dispositionSetId: replacementDispositionSetId,
          })),
        },
      }],
    }, current.version)).rejects.toThrow(/immutable-hosted-transition/u);
    await expect(records.store.readOperation(records.bound.operationId)).resolves.toEqual(current);
  });

  it("appends one exact hosted successor and rejects later historical settlement rewrites", async () => {
    const records = await boundHostedFindingsFixture();
    const successorDispositionSetId = digest("successor-disposition");
    const superseded = await supersedeHostedAttemptDisposition(records.store, {
      operationId: records.bound.operationId,
      attemptId: hostedLaneAttemptId(records.handle),
      predecessorDispositionSetId: records.dispositionSetId,
      successorDispositionSetId,
      findingDispositions: [{
        findingId: records.finding.findingId,
        disposition: "reject",
        channelAction: "record-only",
      }],
      now: "2026-08-15T12:02:00Z",
    });
    expect(superseded.carriedFindingIds).toEqual([records.finding.findingId]);
    const current = await records.store.readOperation(records.bound.operationId);
    const attempt = superseded.progress.attempts[0];
    if (attempt?.hosted === undefined) throw new Error("expected superseded hosted findings attempt");

    await expect(records.store.publishOperation({
      ...superseded.progress,
      updatedAt: "2026-08-15T12:03:00Z",
      attempts: [{
        ...attempt,
        hosted: {
          ...attempt.hosted,
          settlementEvidence: attempt.hosted.settlementEvidence.map((evidence, index) => index === 0
            ? { ...evidence, performedAt: "2026-08-15T12:02:30Z" }
            : evidence),
        },
      }],
    }, current.version)).rejects.toThrow(/immutable-hosted-transition/u);
    await expect(records.store.readOperation(records.bound.operationId)).resolves.toEqual(current);
  });

  it("replays concurrent equal hosted evidence despite different progress timestamps", async () => {
    const records = await acknowledgedHostedFixture();
    const result = {
      schemaVersion: 1 as const,
      mode: "review-hosted-await" as const,
      handle: records.handle,
      state: "clean" as const,
      nextAction: "complete" as const,
      reviewUrl: "https://example.invalid/review",
    };

    const [first, second] = await Promise.all([
      recordHostedAwaitAttempt(records.store, {
        repositoryId: records.handle.admission.repositoryId,
        result,
        now: "2026-08-15T12:00:00Z",
      }),
      recordHostedAwaitAttempt(records.store, {
        repositoryId: records.handle.admission.repositoryId,
        result,
        now: "2026-08-15T12:00:01Z",
      }),
    ]);

    expect(second).toEqual(first);
    expect(first.attempts[0]?.hosted?.sealedResult?.hostedResultId)
      .toMatch(/^sha256:[0-9a-f]{64}$/u);
    await expect(records.store.readOperation(first.operationId)).resolves.toEqual({
      version: 3,
      state: first,
    });
  });

  it("replays equal sealed evidence without replacing later settlement progress", async () => {
    const records = await acknowledgedHostedFixture();
    const finding = {
      findingId: "body-1",
      origin: "review-body" as const,
      reviewId: "review-1",
      fingerprint: "body-fingerprint",
      settlement: "not-applicable" as const,
      severity: "minor" as const,
      locus: "pull-request review body",
      url: "https://example.invalid/review-1",
      body: "Body finding",
      sourceOrdinal: 1,
    };
    const result = {
      schemaVersion: 1 as const,
      mode: "review-hosted-await" as const,
      handle: records.handle,
      state: "findings" as const,
      nextAction: "triage" as const,
      reviewUrl: "https://example.invalid/review",
      findings: [finding],
    };
    const sealed = await recordHostedAwaitAttempt(records.store, {
      repositoryId: records.handle.admission.repositoryId,
      result,
      now: "2026-08-15T12:00:00Z",
    });
    const settled = await bindHostedAttemptDisposition(records.store, {
      operationId: sealed.operationId,
      attemptId: hostedLaneAttemptId(records.handle),
      dispositionSetId: digest("disposition"),
      findingDispositions: [{
        findingId: finding.findingId,
        disposition: "reject",
        channelAction: "record-only",
      }],
      now: "2026-08-15T12:01:00Z",
    });

    await expect(recordHostedAwaitAttempt(records.store, {
      repositoryId: records.handle.admission.repositoryId,
      result,
      now: "2026-08-15T12:02:00Z",
    })).resolves.toEqual(settled);
    await expect(records.store.readOperation(settled.operationId)).resolves.toEqual({
      version: 4,
      state: settled,
    });
    await expect(readHostedAwaitReplay(records.store, records.handle)).resolves.toEqual({
      progress: settled,
      hostedResultId: settled.attempts[0]?.hosted?.sealedResult?.hostedResultId,
      result,
    });
    let observations = 0;
    await expect(resolveHostedAwaitResult(records.store, {
      repositoryId: records.handle.admission.repositoryId,
      handle: records.handle,
      observe: async () => {
        observations += 1;
        throw new Error("provider observation must not run for sealed replay");
      },
      now: () => "2026-08-15T12:03:00Z",
    })).resolves.toEqual({
      progress: settled,
      hostedResultId: settled.attempts[0]?.hosted?.sealedResult?.hostedResultId,
      result,
    });
    expect(observations).toBe(0);
  });

  it("recovers a durably sealed result after its publication acknowledgment is lost", async () => {
    const records = await acknowledgedHostedFixture();
    const result = {
      schemaVersion: 1 as const,
      mode: "review-hosted-await" as const,
      handle: records.handle,
      state: "clean" as const,
      nextAction: "complete" as const,
      reviewUrl: "https://example.invalid/review",
    };
    let loseAcknowledgment = true;
    const uncertainStore: ReviewOperationStateStore = {
      readOperation: records.store.readOperation.bind(records.store),
      publishOperation: async (state, expectedVersion) => {
        const published = await records.store.publishOperation(state, expectedVersion);
        if (loseAcknowledgment && state.kind === "lane-progress"
          && state.attempts.some((attempt) => attempt.hosted?.sealedResult !== undefined)) {
          loseAcknowledgment = false;
          throw new Error("publication-acknowledgment-lost");
        }
        return published;
      },
    };
    let observations = 0;

    await expect(resolveHostedAwaitResult(uncertainStore, {
      repositoryId: records.handle.admission.repositoryId,
      handle: records.handle,
      observe: async () => {
        observations += 1;
        return result;
      },
      now: () => "2026-08-15T12:00:00Z",
    })).rejects.toThrow(/publication-acknowledgment-lost/u);
    const sealed = await readHostedAwaitReplay(records.store, records.handle);
    if (sealed === null) throw new Error("expected the uncertain write to have sealed its result");

    await expect(resolveHostedAwaitResult(uncertainStore, {
      repositoryId: records.handle.admission.repositoryId,
      handle: records.handle,
      observe: async () => {
        observations += 1;
        throw new Error("provider observation must not run after durable sealing");
      },
      now: () => "2026-08-15T12:01:00Z",
    })).resolves.toEqual(sealed);
    expect(observations).toBe(1);
    expect(sealed.progress.completedPasses).toBe(1);
    expect(sealed.progress.attempts).toHaveLength(1);
  });

  it("retains acknowledged admission for re-observation when terminal publication fails", async () => {
    const records = await acknowledgedHostedFixture();
    const result = {
      schemaVersion: 1 as const,
      mode: "review-hosted-await" as const,
      handle: records.handle,
      state: "clean" as const,
      nextAction: "complete" as const,
      reviewUrl: "https://example.invalid/review",
    };
    let failBeforePublication = true;
    const interruptedStore: ReviewOperationStateStore = {
      readOperation: records.store.readOperation.bind(records.store),
      publishOperation: async (state, expectedVersion) => {
        if (failBeforePublication && state.kind === "lane-progress"
          && state.attempts.some((attempt) => attempt.hosted?.sealedResult !== undefined)) {
          failBeforePublication = false;
          throw new Error("publication-interrupted-before-write");
        }
        return records.store.publishOperation(state, expectedVersion);
      },
    };
    let observations = 0;
    const observe = async () => {
      observations += 1;
      return result;
    };

    await expect(resolveHostedAwaitResult(interruptedStore, {
      repositoryId: records.handle.admission.repositoryId,
      handle: records.handle,
      observe,
      now: () => "2026-08-15T12:00:00Z",
    })).rejects.toThrow(/publication-interrupted-before-write/u);
    await expect(records.store.readOperation(records.progress.operationId)).resolves.toEqual({
      version: 2,
      state: records.progress,
    });
    await expect(readHostedAwaitReplay(records.store, records.handle)).resolves.toBeNull();

    const recovered = await resolveHostedAwaitResult(interruptedStore, {
      repositoryId: records.handle.admission.repositoryId,
      handle: records.handle,
      observe,
      now: () => "2026-08-15T12:01:00Z",
    });
    expect(observations).toBe(2);
    expect(recovered.progress.completedPasses).toBe(1);
    expect(recovered.progress.attempts).toHaveLength(1);
    expect(recovered.progress.attempts[0]).toMatchObject({
      attemptId: hostedLaneAttemptId(records.handle),
      logicalPass: records.handle.admission.logicalPass,
      hosted: { handle: records.handle },
    });
  });

  it("rejects a same-record operation identity mismatch without overwriting it", async () => {
    const records = await fixture();
    const directory = join(records.commonDir, "arc", "review-gate", "operations");
    const fileDigest = canonicalDigest({ operationId: records.state.operationId }).slice("sha256:".length);
    const path = join(directory, `operation-${fileDigest}.json`);
    const mismatched = JSON.stringify({
      schemaVersion: 1,
      semanticsVersion: "review-operation-store/v1",
      operationId: records.state.operationId,
      version: 1,
      state: { ...records.state, operationId: "different-operation" },
    });
    await mkdir(directory, { recursive: true });
    await writeFile(path, `${mismatched}\n`, "utf8");

    await expect(records.store.publishOperation(records.state, 1)).rejects.toThrow(/operation-id-mismatch/u);
    await expect(readFile(path, "utf8")).resolves.toBe(`${mismatched}\n`);
  });

  it("cannot parse operation variants as receipts or gate evidence", async () => {
    const records = await fixture();
    await records.store.publishOperation(records.state, 0);
    const stored = await records.store.readOperation(records.state.operationId);

    expect(() => ReviewReceiptV2Schema.parse(stored.state)).toThrow();
    expect(() => parseEvidence(stored.state)).toThrow();
    const evidencePath = join(records.commonDir, "arc", "review-gate", "evidence");
    await expect(readFile(evidencePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
