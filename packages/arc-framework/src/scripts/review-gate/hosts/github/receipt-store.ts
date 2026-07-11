/** GitHub App-comment implementation of the neutral receipt-store port. */

import type { ReceiptEnvelope, ReviewReceipt } from "../../core/execution.js";
import type {
  ReceiptAppendResult,
  ReceiptLedger,
  ReviewReceiptStore,
} from "../../core/ports.js";
import { validateReceiptLedger } from "../../core/receipt-ledger.js";
import { integerAt, objectAt } from "../../core/validation.js";
import type { GitHubRestClient } from "./api/rest.js";
import {
  LEDGER_ANCHOR_MARKER,
  parseLedgerAnchor,
  serializeLedgerAnchor,
  type LedgerAnchorPayload,
} from "./receipt-anchor.js";
import {
  authenticateAppComment,
  type ReceiptCommentAuthority,
} from "./receipt-auth.js";
import {
  parseReceiptComment,
  RECEIPT_MARKER,
  serializeReceiptComment,
} from "./receipt-comment.js";

/** Minimal validated shape retained from a GitHub issue-comment response. */
export interface GitHubIssueComment extends Record<string, unknown> {
  id: number;
  node_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

/** Injected issue-comment boundary used by the receipt store. */
export interface GitHubIssueCommentApi {
  list(): Promise<GitHubIssueComment[]>;
  create(body: string): Promise<{ kind: "created"; comment: GitHubIssueComment } | { kind: "ambiguous" }>;
  update(id: number, body: string): Promise<GitHubIssueComment>;
}

/** Canonical state re-read immediately before an authoritative write. */
export interface ReceiptWriteState {
  repositoryId: string;
  changeRequestId: string;
  changeSetId: string;
  policyVersion: string;
  actorIdentity: string;
  authorized: boolean;
}

/** Stable machine-readable failure from fail-closed store operations. */
export class ReceiptStoreError extends Error {
  readonly code: string;

  constructor(code: string, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = "ReceiptStoreError";
    this.code = code;
  }
}

/** Dependencies and immutable scope for one PR-scoped receipt store. */
export interface GitHubCommentReceiptStoreOptions {
  api: GitHubIssueCommentApi;
  authority: ReceiptCommentAuthority;
  repositoryId: string;
  changeRequestId: string;
  revalidate: (receipt: ReviewReceipt) => Promise<ReceiptWriteState>;
  /** Reports whether prior controller state existed outside the comment store. */
  stateExpected: () => Promise<boolean>;
}

interface AnchorRecord {
  id: number;
  payload: LedgerAnchorPayload;
}

interface ScannedState {
  envelopes: ReceiptEnvelope[];
  anchor: AnchorRecord | null;
}

function anchorPayload(options: GitHubCommentReceiptStoreOptions, version: number): LedgerAnchorPayload {
  return {
    schemaVersion: 1,
    repositoryId: options.repositoryId,
    changeRequestId: options.changeRequestId,
    ledgerVersion: version,
    receiptCount: version,
  };
}

function logicalTip(envelopes: ReceiptEnvelope[]): number {
  return envelopes.reduce((maximum, envelope) => Math.max(maximum, envelope.ledgerVersion), 0);
}

/** Version-checked, idempotent GitHub comment receipt store. */
export class GitHubCommentReceiptStore implements ReviewReceiptStore {
  private readonly options: GitHubCommentReceiptStoreOptions;

  constructor(options: GitHubCommentReceiptStoreOptions) {
    this.options = options;
  }

  async readLedger(changeRequestId: string): Promise<ReceiptLedger> {
    if (changeRequestId !== this.options.changeRequestId) throw new ReceiptStoreError("scope-mismatch");
    const state = await this.scan();
    if (state.anchor === null) {
      if (state.envelopes.length > 0) throw new ReceiptStoreError("inconsistent-anchor", "missing");
      if (await this.options.stateExpected()) throw new ReceiptStoreError("break-glass", "controller state disappeared");
      const created = await this.options.api.create(serializeLedgerAnchor(anchorPayload(this.options, 0)));
      if (created.kind === "ambiguous") throw new ReceiptStoreError("ambiguous-write", "anchor bootstrap");
      return { ledgerVersion: 0, receipts: [] };
    }

    const tip = logicalTip(state.envelopes);
    const ledger = validateReceiptLedger({
      envelopes: state.envelopes,
      anchorVersion: tip,
      anchorCount: tip,
    });
    if (!ledger.valid) throw new ReceiptStoreError("inconsistent-ledger", ledger.errors.join(","));

    const anchor = state.anchor.payload;
    if (anchor.ledgerVersion === ledger.ledgerVersion && anchor.receiptCount === ledger.receipts.length) {
      return { ledgerVersion: ledger.ledgerVersion, receipts: orderedEnvelopes(state.envelopes) };
    }

    const uniqueExtension = anchor.ledgerVersion + 1 === ledger.ledgerVersion
      && anchor.receiptCount + 1 === ledger.receipts.length;
    if (!uniqueExtension) throw new ReceiptStoreError("inconsistent-anchor", "version/count mismatch");

    await this.options.api.update(
      state.anchor.id,
      serializeLedgerAnchor(anchorPayload(this.options, ledger.ledgerVersion)),
    );
    return { ledgerVersion: ledger.ledgerVersion, receipts: orderedEnvelopes(state.envelopes) };
  }

  async appendReceipt(receipt: ReviewReceipt, expectedLedgerVersion: number): Promise<ReceiptAppendResult> {
    const current = await this.readLedger(this.options.changeRequestId);
    const replay = current.receipts.find((envelope) => envelope.receipt.idempotencyKey === receipt.idempotencyKey);
    if (replay !== undefined) {
      if (
        replay.receipt.receiptHash === receipt.receiptHash
        && replay.receipt.previousLedgerVersion === receipt.previousLedgerVersion
      ) {
        return { ledgerVersion: replay.ledgerVersion, durableEvidenceRef: replay.durableRecordId };
      }
      throw new ReceiptStoreError("inconsistent-ledger", "divergent idempotency replay");
    }
    if (current.ledgerVersion !== expectedLedgerVersion || receipt.previousLedgerVersion !== expectedLedgerVersion) {
      throw new ReceiptStoreError("version-conflict");
    }

    const guard = await this.options.revalidate(receipt);
    if (!guard.authorized || guard.actorIdentity !== receipt.request.actorIdentity) {
      throw new ReceiptStoreError("unauthorized-write");
    }
    if (
      guard.repositoryId !== receipt.request.repositoryId
      || guard.changeRequestId !== receipt.request.changeRequestId
      || guard.changeSetId !== receipt.request.changeSetId
      || guard.policyVersion !== receipt.request.policyVersion
    ) {
      throw new ReceiptStoreError("stale-write");
    }

    const nextVersion = expectedLedgerVersion + 1;
    const body = serializeReceiptComment({ ledgerVersion: nextVersion, receipt });
    const write = await this.options.api.create(body);
    const confirmed = await this.readLedger(this.options.changeRequestId).catch((error: unknown) => {
      if (write.kind === "ambiguous") return null;
      throw error;
    });
    if (confirmed === null) throw new ReceiptStoreError("ambiguous-write");
    const appended = confirmed.receipts.find((envelope) =>
      envelope.ledgerVersion === nextVersion
      && envelope.receipt.idempotencyKey === receipt.idempotencyKey
      && envelope.receipt.receiptHash === receipt.receiptHash);
    if (appended === undefined) {
      throw new ReceiptStoreError(write.kind === "ambiguous" ? "ambiguous-write" : "inconsistent-ledger");
    }
    return { ledgerVersion: appended.ledgerVersion, durableEvidenceRef: appended.durableRecordId };
  }

  private async scan(): Promise<ScannedState> {
    let comments: GitHubIssueComment[];
    try {
      comments = await this.options.api.list();
    } catch (error) {
      throw new ReceiptStoreError("unavailable", error instanceof Error ? error.message : String(error));
    }
    const envelopes: ReceiptEnvelope[] = [];
    const anchors: AnchorRecord[] = [];
    const ledgerErrors: string[] = [];
    const anchorErrors: string[] = [];

    for (const raw of comments) {
      const body = typeof raw.body === "string" ? raw.body : "";
      if (body.includes(`<!-- ${RECEIPT_MARKER}`)) {
        const auth = authenticateAppComment(raw, this.options.authority);
        if (auth.kind === "rejected") {
          if (auth.reason === "edited") ledgerErrors.push(`edited-record:${raw.node_id}`);
          continue;
        }
        const parsed = parseReceiptComment({
          body: auth.comment.body,
          commentNodeId: auth.comment.commentNodeId,
          createdAt: auth.comment.createdAt,
          updatedAt: auth.comment.updatedAt,
          expectedRepositoryId: this.options.repositoryId,
          expectedChangeRequestId: this.options.changeRequestId,
        });
        if (parsed.kind === "receipt") envelopes.push(parsed.envelope);
        else if (parsed.kind === "invalid") ledgerErrors.push(parsed.reason);
      }
      if (body.includes(`<!-- ${LEDGER_ANCHOR_MARKER}`)) {
        const auth = authenticateAppComment(raw, this.options.authority, { allowEdits: true });
        if (auth.kind !== "authentic") continue;
        try {
          anchors.push({
            id: raw.id,
            payload: parseLedgerAnchor(
              auth.comment.body,
              this.options.repositoryId,
              this.options.changeRequestId,
            ),
          });
        } catch (error) {
          anchorErrors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }
    if (ledgerErrors.length > 0) throw new ReceiptStoreError("inconsistent-ledger", ledgerErrors.join(","));
    if (anchorErrors.length > 0 || anchors.length > 1) {
      throw new ReceiptStoreError("inconsistent-anchor", [...anchorErrors, "duplicate"].join(","));
    }
    return { envelopes, anchor: anchors[0] ?? null };
  }
}

function orderedEnvelopes(envelopes: ReceiptEnvelope[]): ReceiptEnvelope[] {
  const byVersion = new Map<number, ReceiptEnvelope>();
  for (const envelope of envelopes) if (!byVersion.has(envelope.ledgerVersion)) byVersion.set(envelope.ledgerVersion, envelope);
  return [...byVersion.values()].sort((left, right) => left.ledgerVersion - right.ledgerVersion);
}

function parseIssueComment(input: unknown): GitHubIssueComment {
  const record = objectAt(input, "comment");
  integerAt(record.id, "comment.id", 1);
  return record as GitHubIssueComment;
}

/** REST-backed issue-comment boundary for a single pull request. */
export class GitHubRestIssueCommentApi implements GitHubIssueCommentApi {
  private readonly rest: GitHubRestClient;
  private readonly path: string;

  constructor(rest: GitHubRestClient, owner: string, repo: string, number: number) {
    this.rest = rest;
    this.path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}/comments`;
  }

  async list(): Promise<GitHubIssueComment[]> {
    const outcome = await this.rest.getPaginated(this.path, {
      query: { per_page: 100 },
      parsePage: (value) => {
        if (!Array.isArray(value)) throw new Error("comments: expected an array");
        return value.map(parseIssueComment);
      },
    });
    if (outcome.kind !== "ok") throw new ReceiptStoreError("unavailable", outcome.kind);
    return outcome.value;
  }

  async create(body: string): Promise<{ kind: "created"; comment: GitHubIssueComment } | { kind: "ambiguous" }> {
    const outcome = await this.rest.write("POST", this.path, { body: { body }, parse: parseIssueComment });
    if (outcome.kind === "ambiguous") return { kind: "ambiguous" };
    if (outcome.kind !== "ok") throw new ReceiptStoreError("write-failed", outcome.kind);
    return { kind: "created", comment: outcome.value };
  }

  async update(id: number, body: string): Promise<GitHubIssueComment> {
    const outcome = await this.rest.write("PATCH", `${this.path}/${id}`, { body: { body }, parse: parseIssueComment });
    if (outcome.kind !== "ok") throw new ReceiptStoreError("write-failed", outcome.kind);
    return outcome.value;
  }
}
