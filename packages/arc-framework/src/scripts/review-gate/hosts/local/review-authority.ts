/** Trusted actor, vehicle, and runtime binding for local review preparation. */

import {
  ReviewIdentifierSchema,
} from "../../core/gate-contract-v2-schema.js";
import type { LocalReviewAuthority } from "../../core/local-review-authority.js";

export type { LocalReviewAuthority } from "../../core/local-review-authority.js";

export interface LocalReviewLiveContext {
  activeIdentity: string | null;
  workUnit: { identity: string; owner: string } | null;
  errand: { identity: string } | null;
}

export interface LocalReviewRuntimeBinding {
  kind: string;
  identity: string;
}

export interface LocalReviewAuthorityDependencies {
  readLiveContext(): Promise<LocalReviewLiveContext>;
  resolveRuntimeBinding(): Promise<LocalReviewRuntimeBinding>;
}

/** Stable invalid-input failure at the local actor authority boundary. */
export class LocalReviewAuthorityError extends Error {
  readonly code = "invalid-input" as const;

  constructor(public readonly reason: string) {
    super(reason);
    this.name = "LocalReviewAuthorityError";
  }
}

/**
 * Resolves review authority from live ARC state and the installed runtime.
 *
 * The evaluator is the only caller-selected actor. Vehicle, author, and
 * attesting runtime are read through trusted dependencies.
 *
 * @param input - Explicit evaluator selection.
 * @param dependencies - Live ARC-state and installed-runtime readers.
 * @returns The actor-separated local review authority.
 */
export async function resolveLocalReviewAuthority(
  input: { evaluatorIdentity: string },
  dependencies: LocalReviewAuthorityDependencies,
): Promise<LocalReviewAuthority> {
  const evaluatorIdentity = ReviewIdentifierSchema.parse(input.evaluatorIdentity);
  const context = await dependencies.readLiveContext();
  if (context.activeIdentity === null) {
    throw new LocalReviewAuthorityError("active-identity-missing");
  }
  const activeIdentity = ReviewIdentifierSchema.parse(context.activeIdentity);
  if ((context.workUnit === null) === (context.errand === null)) {
    throw new LocalReviewAuthorityError("vehicle-unresolved");
  }

  let vehicle: LocalReviewAuthority["vehicle"];
  let authorIdentity: string;
  if (context.workUnit !== null) {
    const owner = ReviewIdentifierSchema.parse(context.workUnit.owner);
    if (owner !== activeIdentity) {
      throw new LocalReviewAuthorityError("active-identity-owner-mismatch");
    }
    vehicle = {
      kind: "work-unit",
      identity: ReviewIdentifierSchema.parse(context.workUnit.identity),
    };
    authorIdentity = owner;
  } else {
    vehicle = {
      kind: "errand",
      identity: ReviewIdentifierSchema.parse(context.errand?.identity),
    };
    authorIdentity = activeIdentity;
  }

  if (authorIdentity === evaluatorIdentity) {
    throw new LocalReviewAuthorityError("author-evaluator-must-differ");
  }

  const runtime = await dependencies.resolveRuntimeBinding();
  const attestationRuntimeKind = ReviewIdentifierSchema.parse(runtime.kind);
  const runtimeIdentity = ReviewIdentifierSchema.parse(runtime.identity);
  if (runtimeIdentity === authorIdentity || runtimeIdentity === evaluatorIdentity) {
    throw new LocalReviewAuthorityError("runtime-actor-must-differ");
  }

  return {
    vehicle,
    authorIdentity,
    evaluatorIdentity,
    attestationRuntimeKind,
    runtimeIdentity,
    attestationMechanism: "local-attestation",
  };
}
