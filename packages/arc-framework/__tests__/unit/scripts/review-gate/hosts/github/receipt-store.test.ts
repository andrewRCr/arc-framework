import { describe, expect, it } from "vitest";

import type { ReviewReceipt, ReviewRequest } from "../../../../../../src/scripts/review-gate/core/execution.js";
import { createReceipt } from "../../../../../../src/scripts/review-gate/core/request-key.js";
import {
  GitHubCommentReceiptStore,
  type GitHubIssueCommentApi,
  type GitHubIssueComment,
  type ReceiptWriteState,
} from "../../../../../../src/scripts/review-gate/hosts/github/receipt-store.js";
import {
  serializeLedgerAnchor,
  type LedgerAnchorPayload,
} from "../../../../../../src/scripts/review-gate/hosts/github/receipt-anchor.js";
import { serializeReceiptComment } from "../../../../../../src/scripts/review-gate/hosts/github/receipt-comment.js";

const AUTHORITY = { expectedAppId: "4268856", expectedBotId: "302312524" };
const CREATED = "2026-07-11T10:00:00Z";

function request(overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    schemaVersion: 1,
    repositoryId: "100",
    changeRequestId: "PR_node",
    changeSetId: "a".repeat(64),
    policyVersion: "b".repeat(64),
    semanticsVersion: "review-gate/v1",
    rubricVersion: "independent-analysis/v1",
    requirementId: "analysis",
    sourceIdentity: "coderabbit",
    coverage: "full",
    coverageFromSha: "0".repeat(40),
    coverageThroughSha: "f".repeat(40),
    generation: 0,
    actorIdentity: "7",
    requestMechanism: "automatic",
    requiredActorIdentity: "7",
    requestCommand: null,
    ...overrides,
  };
}

function receipt(previousLedgerVersion = 0, overrides: Partial<ReviewReceipt> = {}): ReviewReceipt {
  return {
    ...createReceipt({
      eventId: `evt-${previousLedgerVersion + 1}`,
      previousLedgerVersion,
      action: "reserved",
      request: request({ generation: previousLedgerVersion }),
      result: null,
      evidenceUrlOrId: null,
      findingIds: [],
      payload: { kind: "reservation", reservedAt: null, pendingProjectionRef: null },
    }),
    ...overrides,
  };
}

function appComment(id: number, body: string, overrides: Record<string, unknown> = {}): GitHubIssueComment {
  return {
    id,
    node_id: `IC_${id}`,
    body,
    created_at: CREATED,
    updated_at: CREATED,
    user: { id: 302312524, login: "arc-review-gate[bot]", type: "Bot" },
    performed_via_github_app: { id: 4268856, slug: "arc-review-gate" },
    ...overrides,
  } as GitHubIssueComment;
}

class MemoryComments implements GitHubIssueCommentApi {
  readonly comments: GitHubIssueComment[];
  createMode: "ok" | "ambiguous-applied" | "ambiguous-missing" = "ok";
  failList = false;
  private nextId = 10;

  constructor(comments: GitHubIssueComment[] = []) {
    this.comments = comments;
  }

  async list(): Promise<GitHubIssueComment[]> {
    if (this.failList) throw new Error("enumeration-cap");
    return this.comments;
  }

  async create(body: string): Promise<{ kind: "created"; comment: GitHubIssueComment } | { kind: "ambiguous" }> {
    if (this.createMode === "ambiguous-missing") return { kind: "ambiguous" };
    const comment = appComment(this.nextId, body);
    this.nextId += 1;
    this.comments.push(comment);
    return this.createMode === "ambiguous-applied" ? { kind: "ambiguous" } : { kind: "created", comment };
  }

  async update(id: number, body: string): Promise<GitHubIssueComment> {
    const index = this.comments.findIndex((comment) => comment.id === id);
    const prior = this.comments[index];
    if (prior === undefined) throw new Error("missing-comment");
    const updated = appComment(id, body, { created_at: prior.created_at, updated_at: "2026-07-11T10:01:00Z" });
    this.comments[index] = updated;
    return updated;
  }
}

function anchor(version: number, count = version): LedgerAnchorPayload {
  return { schemaVersion: 1, repositoryId: "100", changeRequestId: "PR_node", ledgerVersion: version, receiptCount: count };
}

function writeState(overrides: Partial<ReceiptWriteState> = {}): ReceiptWriteState {
  return {
    repositoryId: "100",
    changeRequestId: "PR_node",
    changeSetId: "a".repeat(64),
    policyVersion: "b".repeat(64),
    actorIdentity: "7",
    authorized: true,
    ...overrides,
  };
}

function store(
  api: MemoryComments,
  revalidate = async () => writeState(),
  stateExpected = async () => false,
  initializeAnchor = true,
) {
  return new GitHubCommentReceiptStore({
    api,
    authority: AUTHORITY,
    repositoryId: "100",
    changeRequestId: "PR_node",
    revalidate,
    stateExpected,
    initializeAnchor,
  });
}

describe("GitHub comment receipt append", () => {
  it("rejects a malformed or identity-incongruent receipt before writing", async () => {
    const api = new MemoryComments([appComment(1, serializeLedgerAnchor(anchor(0)))]);
    const malformed = { ...receipt(), receiptHash: "f".repeat(64) };

    await expect(store(api).appendReceipt(malformed, 0)).rejects.toMatchObject({ code: "invalid-receipt" });
    expect(api.comments).toHaveLength(1);
  });

  it("revalidates current actor and change-set state immediately before appending", async () => {
    const api = new MemoryComments([appComment(1, serializeLedgerAnchor(anchor(0)))]);
    let current = writeState({ changeSetId: "c".repeat(64) });
    const target = store(api, async () => current);
    await expect(target.appendReceipt(receipt(), 0)).rejects.toMatchObject({ code: "stale-write" });
    expect(api.comments).toHaveLength(1);

    current = writeState({ authorized: false });
    await expect(target.appendReceipt(receipt(), 0)).rejects.toMatchObject({ code: "unauthorized-write" });
    expect(api.comments).toHaveLength(1);
  });

  it("returns the existing logical receipt for a byte-equivalent idempotent replay", async () => {
    const first = receipt();
    const api = new MemoryComments([
      appComment(1, serializeLedgerAnchor(anchor(1))),
      appComment(2, serializeReceiptComment({ ledgerVersion: 1, receipt: first })),
    ]);
    await expect(store(api).appendReceipt(first, 0)).resolves.toEqual({
      ledgerVersion: 1,
      durableEvidenceRef: "IC_2",
    });
    expect(api.comments).toHaveLength(2);
  });

  it("reconciles an ambiguous create only when a canonical matching receipt is observable", async () => {
    const applied = new MemoryComments([appComment(1, serializeLedgerAnchor(anchor(0)))]);
    applied.createMode = "ambiguous-applied";
    await expect(store(applied).appendReceipt(receipt(), 0)).resolves.toMatchObject({ ledgerVersion: 1 });

    const missing = new MemoryComments([appComment(1, serializeLedgerAnchor(anchor(0)))]);
    missing.createMode = "ambiguous-missing";
    await expect(store(missing).appendReceipt(receipt(), 0)).rejects.toMatchObject({ code: "ambiguous-write" });
  });
});

describe("GitHub comment receipt reconstruction", () => {
  it("reconstructs the same canonical ledger from out-of-order comments", async () => {
    const first = receipt();
    const second = receipt(1);
    const api = new MemoryComments([
      appComment(3, serializeReceiptComment({ ledgerVersion: 2, receipt: second })),
      appComment(1, serializeLedgerAnchor(anchor(2))),
      appComment(2, serializeReceiptComment({ ledgerVersion: 1, receipt: first })),
    ]);
    await expect(store(api).readLedger("PR_node")).resolves.toMatchObject({
      ledgerVersion: 2,
      receipts: [{ ledgerVersion: 1 }, { ledgerVersion: 2 }],
    });
  });

  it("fails closed on incomplete enumeration instead of returning a partial ledger", async () => {
    const api = new MemoryComments();
    api.failList = true;
    await expect(store(api).readLedger("PR_node")).resolves.toEqual({
      kind: "degraded",
      diagnostics: ["ledger-unavailable"],
      observedLedgerVersion: null,
      receipts: [],
    });
  });

  it("classifies divergent, edited, forked, and missing records as degraded", async () => {
    const first = receipt();
    const divergent = createReceipt({
      eventId: "evt-divergent",
      previousLedgerVersion: 0,
      action: "waived",
      request: request(),
      result: null,
      reason: "accepted risk",
      evidenceUrlOrId: "https://github.test/pull/7#issuecomment-9",
      findingIds: [],
      payload: { kind: "decision", decidedAt: null },
    });
    const obsolete = serializeReceiptComment({ ledgerVersion: 1, receipt: first })
      .replace('"semanticsVersion":"review-gate/v1",', "");
    const cases: Array<[string, GitHubIssueComment[]]> = [
      ["ledger-fork", [appComment(1, serializeLedgerAnchor(anchor(1))), appComment(2, serializeReceiptComment({ ledgerVersion: 1, receipt: first })), appComment(3, serializeReceiptComment({ ledgerVersion: 1, receipt: divergent }))]],
      ["malformed-receipt", [appComment(1, serializeLedgerAnchor(anchor(1))), appComment(2, serializeReceiptComment({ ledgerVersion: 1, receipt: first }), { updated_at: "2026-07-11T11:00:00Z" })]],
      ["ledger-fork", [appComment(1, serializeLedgerAnchor(anchor(2))), appComment(2, serializeReceiptComment({ ledgerVersion: 1, receipt: first })), appComment(3, serializeReceiptComment({ ledgerVersion: 2, receipt: receipt(0) }))]],
      ["ledger-regression", [appComment(1, serializeLedgerAnchor(anchor(2))), appComment(3, serializeReceiptComment({ ledgerVersion: 2, receipt: receipt(1) }))]],
      ["malformed-receipt", [appComment(1, serializeLedgerAnchor(anchor(1))), appComment(2, obsolete)]],
    ];
    for (const [diagnostic, comments] of cases) {
      await expect(store(new MemoryComments(comments)).readLedger("PR_node")).resolves.toMatchObject({
        kind: "degraded",
        diagnostics: expect.arrayContaining([diagnostic]),
        receipts: [],
      });
    }
  });

  it("returns a degraded ledger without trusting malformed receipt records", async () => {
    const first = receipt();
    const api = new MemoryComments([
      appComment(1, serializeLedgerAnchor(anchor(1))),
      appComment(2, serializeReceiptComment({ ledgerVersion: 1, receipt: first }), {
        updated_at: "2026-07-11T11:00:00Z",
      }),
    ]);

    await expect(store(api).readLedger("PR_node")).resolves.toEqual({
      kind: "degraded",
      diagnostics: ["malformed-receipt"],
      observedLedgerVersion: 1,
      receipts: [],
    });
  });

  it("refuses writes while degraded and resumes only after a repaired ledger", async () => {
    const api = new MemoryComments([
      appComment(1, serializeLedgerAnchor(anchor(1))),
      appComment(2, serializeReceiptComment({ ledgerVersion: 1, receipt: receipt() }), {
        updated_at: "2026-07-11T11:00:00Z",
      }),
    ]);
    const target = store(api);

    await expect(target.appendReceipt(receipt(), 1)).rejects.toMatchObject({ code: "degraded-ledger" });
    expect(api.comments).toHaveLength(2);

    api.comments.splice(0, api.comments.length, appComment(1, serializeLedgerAnchor(anchor(0))));
    await expect(target.readLedger("PR_node")).resolves.toEqual({ kind: "valid", ledgerVersion: 0, receipts: [] });
    await expect(target.appendReceipt(receipt(), 0)).resolves.toMatchObject({ ledgerVersion: 1 });
  });
});

describe("stable ledger anchor recovery", () => {
  it("keeps repeated non-initializing reads free of writes", async () => {
    const api = new MemoryComments();
    const target = store(api, async () => writeState(), async () => false, false);

    await expect(target.readLedger("PR_node")).resolves.toEqual({
      kind: "valid", ledgerVersion: 0, receipts: [],
    });
    await expect(target.readLedger("PR_node")).resolves.toEqual({
      kind: "valid", ledgerVersion: 0, receipts: [],
    });
    expect(api.comments).toEqual([]);
  });

  it("bootstraps one anchor and repairs only a unique canonical receipt extension", async () => {
    const fresh = new MemoryComments();
    await expect(store(fresh).readLedger("PR_node")).resolves.toMatchObject({
      kind: "valid", ledgerVersion: 0, receipts: [],
    });
    expect(fresh.comments).toHaveLength(1);

    const first = receipt();
    const interrupted = new MemoryComments([
      appComment(1, serializeLedgerAnchor(anchor(0))),
      appComment(2, serializeReceiptComment({ ledgerVersion: 1, receipt: first })),
    ]);
    await expect(store(interrupted).readLedger("PR_node")).resolves.toMatchObject({ kind: "valid", ledgerVersion: 1 });
    expect(interrupted.comments).toHaveLength(2);
    expect(interrupted.comments[0]?.updated_at).not.toBe(CREATED);
  });

  it("fails closed for missing, regressed, duplicate, or receipt-mismatched anchors", async () => {
    const first = receipt();
    const extendedAnchor = serializeLedgerAnchor(anchor(1))
      .replace('"ledgerVersion":1', '"legacyVersion":1,"ledgerVersion":1');
    const cases = [
      [appComment(2, serializeReceiptComment({ ledgerVersion: 1, receipt: first }))],
      [appComment(1, serializeLedgerAnchor(anchor(2))), appComment(2, serializeReceiptComment({ ledgerVersion: 1, receipt: first }))],
      [appComment(1, serializeLedgerAnchor(anchor(1))), appComment(2, serializeLedgerAnchor(anchor(1))), appComment(3, serializeReceiptComment({ ledgerVersion: 1, receipt: first }))],
      [appComment(1, serializeLedgerAnchor(anchor(1, 2))), appComment(2, serializeReceiptComment({ ledgerVersion: 1, receipt: first }))],
      [appComment(1, extendedAnchor), appComment(2, serializeReceiptComment({ ledgerVersion: 1, receipt: first }))],
    ];
    for (const comments of cases) {
      await expect(store(new MemoryComments(comments)).readLedger("PR_node")).resolves.toMatchObject({
        kind: "degraded",
        diagnostics: ["ledger-anchor-mismatch"],
        receipts: [],
      });
    }
  });

  it("enters break-glass when prior controller state existed but receipts, anchor, and checks vanished", async () => {
    const target = store(new MemoryComments(), async () => writeState(), async () => true);
    await expect(target.readLedger("PR_node")).resolves.toEqual({
      kind: "degraded",
      diagnostics: ["ledger-disappeared"],
      observedLedgerVersion: null,
      receipts: [],
    });
  });
});
