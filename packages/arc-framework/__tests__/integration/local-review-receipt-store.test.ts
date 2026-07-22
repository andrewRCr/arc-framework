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
} from "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import {
  importLocalReviewReceipt,
  LocalForwardReviewReceiptStore,
} from "../../src/scripts/review-gate/hosts/local/receipt-store.js";
import { INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY } from "../../src/scripts/review-gate/policy/independent-analysis.js";
import { attestLocalReviewResult } from "../../src/scripts/review-gate/runtime/local-attestation.js";
import { projectForwardReviewContract } from "../../src/scripts/review-gate/runtime/forward-contract.js";

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
      rubricVersion: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.version,
      rubricDigest: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.digest,
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: [{ sourceKind: "agent", qualifier: "independent-analysis/v1" }],
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

  it("reports the current ledger version on an idempotent replay", async () => {
    const records = await fixture();
    await records.store.appendReceipt(records.receipt, 0);
    await records.store.appendReceipt({ ...records.receipt, reviewRunId: "run-2" }, 1);
    const path = join(records.commonDir, "arc", "review-gate", "evidence", "receipts-v2.json");
    const before = await readFile(path, "utf8");

    await expect(records.store.appendReceipt(records.receipt, 2))
      .resolves.toMatchObject({ ledgerVersion: 2 });
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
    }, 1))
      .rejects.toThrow(/conflicting-replay/u);
    await expect(records.store.appendReceipt({ ...records.receipt, reviewRunId: "run-2" }, 0))
      .rejects.toThrow(/version-conflict/u);
    await expect(readFile(path, "utf8")).resolves.toBe(before);
  });

  it("fails closed on a partial ledger without overwriting it", async () => {
    const records = await fixture();
    const directory = join(records.commonDir, "arc", "review-gate", "evidence");
    const path = join(directory, "receipts-v2.json");
    await mkdir(directory, { recursive: true });
    await writeFile(path, '{"schemaVersion":2', "utf8");

    await expect(records.store.appendReceipt(records.receipt, 0)).rejects.toThrow(/malformed-ledger/u);
    await expect(readFile(path, "utf8")).resolves.toBe('{"schemaVersion":2');
  });

  it("keeps evidence and operational publication namespaces separate", async () => {
    const records = await fixture();
    await records.publisher.update("operations", "state-v1.json", () => ({
      content: '{"kind":"suspension"}\n',
      result: undefined,
    }));
    await records.store.appendReceipt(records.receipt, 0);

    await expect(records.publisher.read("operations", "state-v1.json"))
      .resolves.toBe('{"kind":"suspension"}\n');
    await expect(records.publisher.read("evidence", "state-v1.json")).resolves.toBeNull();
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

  it.each(["clean", "findings"] as const)(
    "carries a normalized %s result from local request through durable check projection",
    async (result) => {
      const records = await fixture();
      const receipt = await attestLocalReviewResult({
        target: records.target,
        requirement: records.requirement,
        carrier: records.carrier,
        result: {
          status: "complete",
          result,
          targetId: records.target.targetId,
          headSha: records.target.headSha,
          headTree: records.target.headTree,
          rubricVersion: records.requirement.rubricVersion,
          rubricDigest: records.requirement.rubricDigest,
          evaluatorIdentity: records.request.evaluatorIdentity,
          reviewRunId: "run-integration",
          applicabilityId: null,
          findings: result === "findings" ? [{
            findingId: "finding-1",
            severity: "blocker",
            locus: "src/index.ts:1",
            evidenceUrlOrId: "local:finding-1",
          }] : [],
        },
        currentTarget: async () => records.target,
        runtimeIdentity: records.carrier.attestation.runtimeIdentity,
        attestationMechanism: records.carrier.attestation.mechanism,
        store: records.store,
        expectedLedgerVersion: 0,
      });
      const durable = await records.store.readReceipts(records.target.targetId);
      const projection = projectForwardReviewContract({
        channel: "local",
        target: records.target,
        requirement: records.requirement,
        request: records.request,
        receipt: durable.receipts[0],
      });

      expect(receipt).toEqual(durable.receipts[0]);
      expect(projection.projection.conclusion).toBe(result === "clean" ? "success" : "failure");
      expect(projection.checkOutput.summary).toContain(records.target.targetId);
    },
  );

  it("rejects a stale head before persistence and leaves another machine without evidence", async () => {
    const records = await fixture();
    const otherCommon = join(records.root, "other-machine.git");
    await mkdir(otherCommon, { recursive: true });
    const otherExec: GitExec = async () => ({ stdout: `${otherCommon}\n` });
    const otherStore = new LocalForwardReviewReceiptStore(
      new RepositoryGitCommonStatePublisher(otherExec, records.root),
      records.target.repositoryId,
    );
    const staleTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
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
        findings: [],
        targetId: records.target.targetId,
        headSha: records.target.headSha,
        headTree: records.target.headTree,
        rubricVersion: records.requirement.rubricVersion,
        rubricDigest: records.requirement.rubricDigest,
        evaluatorIdentity: records.request.evaluatorIdentity,
        reviewRunId: "run-stale",
        applicabilityId: null,
      },
      currentTarget: async () => staleTarget,
      runtimeIdentity: records.carrier.attestation.runtimeIdentity,
      attestationMechanism: records.carrier.attestation.mechanism,
      store: records.store,
      expectedLedgerVersion: 0,
    })).rejects.toThrow(/current target/iu);
    await expect(records.store.readReceipts(records.target.targetId)).resolves.toEqual({
      ledgerVersion: 0,
      receipts: [],
    });
    await expect(otherStore.readReceipts(records.target.targetId)).resolves.toEqual({
      ledgerVersion: 0,
      receipts: [],
    });
  });
});
