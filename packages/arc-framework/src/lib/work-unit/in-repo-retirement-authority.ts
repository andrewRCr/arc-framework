/**
 * In-repository implementation of the retirement-authority port.
 *
 * The adapter composes the Git/filesystem snapshot, committed-evidence
 * authorization and decomposition finalization while keeping their I/O seams
 * injectable.
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
import {
  finalizeV3DecomposeRetirement,
  type V3DecomposeFinalizationContext,
} from "./decompose-finalization.js";
import type { V3DecomposeReceipt } from "./decompose-v3-receipt.js";
import type {
  RetirementAuthorityPort,
  RetirementAuthorityScope,
  TeardownAuthorizationDecision,
  TeardownAuthorizationRequest,
} from "./retirement-authority.js";

/** Injected in-repo boundaries used by the authority port. */
export interface InRepoRetirementAuthorityContext {
  snapshot: RetirementSnapshotContext;
  authorization: RetirementAuthorizationContext;
  v3DecomposeFinalization: V3DecomposeFinalizationContext;
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

  async finalizeV3Decompose(
    receipt: V3DecomposeReceipt,
    expectedAuthorityVersion: string,
  ) {
    return await finalizeV3DecomposeRetirement(
      this.#ctx.v3DecomposeFinalization,
      receipt,
      expectedAuthorityVersion,
    );
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
