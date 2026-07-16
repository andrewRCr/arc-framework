/**
 * In-repository implementation of the retirement-authority port.
 *
 * The adapter composes the Git/filesystem snapshot, committed-evidence
 * authorization, and version-checked record boundaries while keeping their I/O
 * seams injectable. Decompose persistence is activated with its allocation
 * driver; until then those two declared operations fail closed.
 */

import {
  authorizeRetirement,
  revalidateRetirementAuthorization,
  type RetirementAuthorizationContext,
} from "./retirement-authorization.js";
import {
  readRetirementAuthoritySnapshot,
  type RetirementSnapshotContext,
} from "./retirement-authority-snapshot.js";
import { recordRetirementReceipt, type RetirementRecordContext } from "./retirement-record.js";
import {
  prepareDecomposeRetirement,
  type DecomposePreparationContext,
} from "./decompose-preparation.js";
import type {
  DecomposeAllocationMap,
  DecomposePreparationLocator,
  RetirementAuthorityPort,
  RetirementAuthorityScope,
  RetirementReceipt,
  TeardownAuthorizationDecision,
  TeardownAuthorizationRequest,
} from "./retirement-authority.js";

/** Injected in-repo boundaries used by the authority port. */
export interface InRepoRetirementAuthorityContext {
  snapshot: RetirementSnapshotContext;
  record: RetirementRecordContext;
  authorization: RetirementAuthorizationContext;
  decompose: DecomposePreparationContext;
}

/** Current Git/filesystem-backed retirement authority. */
export class InRepoRetirementAuthority implements RetirementAuthorityPort {
  readonly #ctx: InRepoRetirementAuthorityContext;

  constructor(ctx: InRepoRetirementAuthorityContext) {
    this.#ctx = ctx;
  }

  async readSnapshot(scope: RetirementAuthorityScope) {
    return await readRetirementAuthoritySnapshot(this.#ctx.snapshot, scope);
  }

  async record(receipt: RetirementReceipt, expectedAuthorityVersion: string) {
    return await recordRetirementReceipt(this.#ctx.record, receipt, expectedAuthorityVersion);
  }

  async prepareDecompose(
    scope: RetirementAuthorityScope,
    allocation: DecomposeAllocationMap,
    expectedAuthorityVersion: string,
  ) {
    return await prepareDecomposeRetirement(this.#ctx.decompose, scope, allocation, expectedAuthorityVersion);
  }

  async finalizeDecompose(
    locator: DecomposePreparationLocator,
    expectedAuthorityVersion: string,
  ) {
    void locator;
    void expectedAuthorityVersion;
    return await Promise.resolve({ status: "refused" as const, reason: "unsupported-transition" as const });
  }

  async authorize(request: TeardownAuthorizationRequest): Promise<TeardownAuthorizationDecision> {
    return await authorizeRetirement(this.#ctx.authorization, request);
  }

  async revalidate(
    request: TeardownAuthorizationRequest,
    proof: Extract<TeardownAuthorizationDecision, { status: "authorized" }>,
  ) {
    return await revalidateRetirementAuthorization(this.#ctx.authorization, request, proof);
  }
}
