import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { GitExec } from "../../src/lib/git/exec.js";
import {
  createReviewReceipt,
  createReviewRequirement,
  createReviewTarget,
} from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createLocalChangeSetCarrier } from "../../src/scripts/review-gate/core/local-carrier.js";
import type { ForwardReviewReceiptStore } from "../../src/scripts/review-gate/core/ports.js";
import {
  RepositoryGitCommonStatePublisher,
} from "../../src/lib/git-common-state.js";
import {
  importLocalReviewReceipt,
  LocalForwardReviewReceiptStore,
} from "../../src/scripts/review-gate/hosts/local/receipt-store.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "../../src/scripts/review-gate/policy/standard-review.js";
import { attestLocalReviewResult } from "../../src/scripts/review-gate/runtime/local-attestation.js";

const roots: string[] = [];
const objectId = (character: string): string => character.repeat(40);

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "arc-local-receipts-"));
  roots.push(root);
  const commonDir = join(root, "common.git");
  await mkdir(commonDir, { recursive: true });
  const exec: GitExec = async () => ({ stdout: `${commonDir}\n` });
  const publisher = new RepositoryGitCommonStatePublisher(exec, root);
  const store = new LocalForwardReviewReceiptStore(publisher, "repo-1");
  const target = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: objectId("c"),
    headTree: objectId("d"),
  });
  const requirement = createReviewRequirement({
    target,
    projection: {
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
      rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected requirement");
  const carrier = createLocalChangeSetCarrier({
    target,
    requirementId: requirement.requirementId,
    snapshot: {
      state: "exact",
      repositoryId: target.repositoryId,
      baseRef: target.baseRef,
      diffBaseSha: target.diffBaseSha,
      diffBaseTree: target.diffBaseTree,
      headSha: target.headSha,
      headTree: target.headTree,
    },
    authorIdentity: "author-1",
    evaluatorIdentity: "evaluator-1",
    attestation: {
      evaluatorIdentity: "evaluator-1",
      runtimeIdentity: "local-attestor-1",
      mechanism: "local-runtime",
    },
    lineage: { kind: "candidate" as const, candidateId: "sha256:7777777777777777777777777777777777777777777777777777777777777777" },
    logicalPass: 1,
    generation: 0,
    requestMechanism: "automatic",
  });
  const request = carrier.request;
  const receipt = createReviewReceipt({
    target,
    requirement,
    request,
    applicabilityId: null,
    reviewRunId: "run-1",
    evaluatorIdentity: request.evaluatorIdentity,
    attestingRuntimeIdentity: "local-attestor-1",
    attestationMechanism: "local-runtime",
    providerEventIdentity: null,
    result: "clean",
    findings: [],
  });
  return { root, commonDir, exec, publisher, store, target, requirement, carrier, request, receipt };
}

describe("local forward receipt authority", () => {
  it("serializes identical sibling replay and publishes one repository-shared receipt", async () => {
    const records = await fixture();
    const siblingStore = new LocalForwardReviewReceiptStore(
      new RepositoryGitCommonStatePublisher(records.exec, join(records.root, "sibling-worktree")),
      records.target.repositoryId,
    );

    const results = await Promise.all([
      records.store.appendReceipt(records.receipt, 0),
      siblingStore.appendReceipt(records.receipt, 0),
    ]);

    expect(results).toEqual([
      expect.objectContaining({ ledgerVersion: 1 }),
      expect.objectContaining({ ledgerVersion: 1 }),
    ]);
    await expect(records.store.readReceipts(records.target.targetId)).resolves.toEqual({
      ledgerVersion: 1,
      receipts: [records.receipt],
    });
  });

  it("returns the current version and stable reference for an idempotent replay", async () => {
    const records = await fixture();
    const first = await records.store.appendReceipt(records.receipt, 0);
    await records.store.appendReceipt({ ...records.receipt, reviewRunId: "run-2" }, 1);
    const path = join(records.commonDir, "arc", "review-gate", "evidence", "receipts-v2.json");
    const before = await readFile(path, "utf8");

    await expect(records.store.appendReceipt(records.receipt, 2)).resolves.toEqual({
      ledgerVersion: 2,
      durableEvidenceRef: first.durableEvidenceRef,
    });
    await expect(readFile(path, "utf8")).resolves.toBe(before);
  });

  it("refuses conflicting replay and stale versions without changing durable state", async () => {
    const records = await fixture();
    await records.store.appendReceipt(records.receipt, 0);
    const path = join(records.commonDir, "arc", "review-gate", "evidence", "receipts-v2.json");
    const before = await readFile(path, "utf8");

    await expect(records.store.appendReceipt({
      ...records.receipt,
      result: "findings",
      findings: [{
        findingId: "finding-1",
        severity: "major",
        locus: "src/index.ts:1",
        evidenceUrlOrId: "local:finding-1",
      }],
    }, 1)).rejects.toThrow(/conflicting-replay/u);
    await expect(records.store.appendReceipt({ ...records.receipt, reviewRunId: "run-2" }, 0))
      .rejects.toThrow(/version-conflict/u);
    await expect(readFile(path, "utf8")).resolves.toBe(before);
  });

  it("fails closed on malformed and cross-repository ledgers", async () => {
    const records = await fixture();
    const directory = join(records.commonDir, "arc", "review-gate", "evidence");
    const path = join(directory, "receipts-v2.json");
    await mkdir(directory, { recursive: true });
    await writeFile(path, '{"schemaVersion":2', "utf8");

    await expect(records.store.appendReceipt(records.receipt, 0)).rejects.toThrow(/malformed-ledger/u);
    await expect(readFile(path, "utf8")).resolves.toBe('{"schemaVersion":2');

    await writeFile(path, `${JSON.stringify({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      repositoryId: "repo-2",
      ledgerVersion: 0,
      receipts: [],
    })}\n`, "utf8");
    await expect(records.store.readReceipts(records.target.targetId)).rejects.toThrow(/repository-mismatch/u);
  });

  it("resolves durable references without crossing target boundaries", async () => {
    const records = await fixture();
    const first = await records.store.appendReceipt(records.receipt, 0);
    const secondReceipt = { ...records.receipt, reviewRunId: "run-2" };
    const second = await records.store.appendReceipt(secondReceipt, 1);

    await expect(records.store.readReceiptEntries(records.target.targetId)).resolves.toEqual([
      { receipt: records.receipt, durableEvidenceRef: first.durableEvidenceRef },
      { receipt: secondReceipt, durableEvidenceRef: second.durableEvidenceRef },
    ]);
    await expect(records.store.readReceiptReference(first.durableEvidenceRef)).resolves.toEqual(records.receipt);
    await expect(records.store.readReceiptReference(second.durableEvidenceRef)).resolves.toEqual(secondReceipt);
    await expect(records.store.readReceiptReference(`${second.durableEvidenceRef}0`)).resolves.toBeNull();
    await expect(records.store.readReceiptReference("other:receipt-1"))
      .rejects.toThrow(/invalid-receipt-reference/u);
    await expect(records.store.readReceipts(`sha256:${"f".repeat(64)}`)).resolves.toEqual({
      ledgerVersion: 2,
      receipts: [],
    });
  });

  it("keeps evidence and operational publication namespaces separate", async () => {
    const records = await fixture();
    await records.publisher.update({ root: "review-gate", namespace: "operations" }, "state-v1.json", () => ({
      kind: "write",
      content: '{"kind":"suspension"}\n',
      result: undefined,
    }));
    await records.store.appendReceipt(records.receipt, 0);

    await expect(records.publisher.read(
      { root: "review-gate", namespace: "operations" },
      "state-v1.json",
    ))
      .resolves.toBe('{"kind":"suspension"}\n');
    await expect(records.publisher.read(
      { root: "review-gate", namespace: "evidence" },
      "state-v1.json",
    )).resolves.toBeNull();
  });

  it("revalidates an explicit import before appending through the destination authority", async () => {
    const records = await fixture();
    const appended: unknown[] = [];
    const destination: ForwardReviewReceiptStore = {
      readReceipts: async () => ({ ledgerVersion: 0, receipts: [] }),
      appendReceipt: async (receipt) => {
        appended.push(receipt);
        return { ledgerVersion: 1, durableEvidenceRef: "hosted:receipt-1" };
      },
    };
    await expect(importLocalReviewReceipt({
      ...records,
      destination,
      expectedLedgerVersion: 0,
    })).resolves.toEqual({ ledgerVersion: 1, durableEvidenceRef: "hosted:receipt-1" });
    expect(appended).toEqual([records.receipt]);

    await expect(importLocalReviewReceipt({
      ...records,
      receipt: { ...records.receipt, evaluatorIdentity: "evaluator-2" },
      destination,
      expectedLedgerVersion: 1,
    })).rejects.toThrow(/evaluator/u);
    expect(appended).toHaveLength(1);
  });

  it("rejects a stale head before persistence", async () => {
    const records = await fixture();
    const staleTarget = createReviewTarget({
      schemaVersion: records.target.schemaVersion,
      semanticsVersion: records.target.semanticsVersion,
      kind: records.target.kind,
      repositoryId: records.target.repositoryId,
      baseRef: records.target.baseRef,
      diffBaseSha: records.target.diffBaseSha,
      diffBaseTree: records.target.diffBaseTree,
      headSha: objectId("e"),
      headTree: objectId("f"),
    });

    await expect(attestLocalReviewResult({
      target: records.target,
      requirement: records.requirement,
      carrier: records.carrier,
      result: {
        status: "complete",
        result: "clean",
        repositoryId: records.target.repositoryId,
        targetId: records.target.targetId,
        headSha: records.target.headSha,
        headTree: records.target.headTree,
        rubricVersion: records.requirement.rubricVersion,
        rubricDigest: records.requirement.rubricDigest,
        sourceDigest: `sha256:${"1".repeat(64)}`,
        guidanceDigest: `sha256:${"2".repeat(64)}`,
        evaluatorIdentity: records.request.evaluatorIdentity,
        reviewRunId: "run-stale",
        applicabilityId: null,
        findings: [],
      },
      currentTarget: async () => staleTarget,
      runtimeIdentity: records.carrier.attestation.runtimeIdentity,
      attestationMechanism: records.carrier.attestation.mechanism,
      sourceDigest: `sha256:${"1".repeat(64)}`,
      guidanceDigest: `sha256:${"2".repeat(64)}`,
      store: records.store,
      expectedLedgerVersion: 0,
    })).rejects.toThrow(/current target/iu);
    await expect(records.store.readReceipts(records.target.targetId)).resolves.toEqual({
      ledgerVersion: 0,
      receipts: [],
    });
  });
});
