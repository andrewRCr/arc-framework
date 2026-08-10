/**
 * In-repository implementation of the retirement-authority port.
 *
 * The adapter composes the Git/filesystem snapshot, committed-evidence
 * authorization while keeping their I/O seams
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
