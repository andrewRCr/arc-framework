/**
 * Closed recovery policy for version-3 decomposition finalization failures.
 *
 * Commands are emitted only from provenance-tagged invocation and driver facts.
 * Validator loci remain diagnostics and never become command operands.
 */

import { isCanonicalDigest, type CanonicalDigest } from "../canonical/canonical-json.js";
import type {
  V3DecompositionMismatch,
  V3DecompositionMismatchKind,
} from "./validate-v3-decomposition.js";
import {
  renderV3DecomposeCommandArgument,
  renderV3DecomposeAdvanceBaseCommand,
  renderV3DecomposeDiscardCommand,
  renderV3DecomposeFinalizeCommand,
  renderV3DecomposePreflightCommand,
} from "./decompose-command-renderer.js";

export interface V3DecomposeRecoveryFacts {
  finalizeInvocation?: {
    provenance: "finalize-command";
    origin: string;
    receiptId: CanonicalDigest;
    continuationPath: string;
  };
  executeInvocation?: {
    provenance: "execute-command";
    origin: string;
    cutMapPath: string;
  };
  advanceBaseInvocation?: {
    provenance: "advance-base-command";
    origin: string;
    receiptId: CanonicalDigest;
  };
  candidate?: {
    provenance: "candidate-driver";
    branch: string;
    generation: number;
  };
}

/**
 * Build the provenance-tagged fact arm shared by finalization adapters.
 *
 * @param origin - Origin work-unit slug from the finalization invocation.
 * @param receiptId - Receipt identity from the finalization invocation.
 * @param continuationPath - Continuation-input path from the finalization invocation.
 * @returns Canonical finalization facts, or no facts for a non-canonical receipt identity.
 */
export function createV3DecomposeFinalizationRecoveryFacts(
  origin: string,
  receiptId: string,
  continuationPath: string,
): V3DecomposeRecoveryFacts {
  return isCanonicalDigest(receiptId)
    ? {
        finalizeInvocation: {
          provenance: "finalize-command",
          origin,
          receiptId,
          continuationPath,
        },
      }
    : {};
}

/**
 * Build the provenance-tagged facts established by one base-advancement invocation.
 *
 * @param origin - Origin work-unit slug from the advancement invocation.
 * @param receiptId - Receipt identity from the advancement invocation.
 * @returns Canonical advancement facts, or no facts for a non-canonical receipt identity.
 */
export function createV3DecomposeBaseAdvancementRecoveryFacts(
  origin: string,
  receiptId: string,
): V3DecomposeRecoveryFacts {
  return isCanonicalDigest(receiptId)
    ? {
        advanceBaseInvocation: {
          provenance: "advance-base-command",
          origin,
          receiptId,
        },
      }
    : {};
}

export type V3DecomposeFinalizationRecoveryCause =
  | { kind: "canonical-mismatch"; mismatch: V3DecompositionMismatch }
  | { kind: "transient-finalization" }
  | { kind: "discardable-candidate" }
  | { kind: "semantic-reauthorization" }
  | { kind: "mechanical-repreflight" }
  | { kind: "binding-unavailable" }
  | { kind: "committed-candidate"; recordKind: "preparation" | "receipt" | "invalid" }
  | { kind: "manual-guidance"; message: string };

export type V3DecomposeFinalizationRecovery =
  | {
    action: "retry";
    establishedFacts: NonNullable<V3DecomposeRecoveryFacts["finalizeInvocation"]>;
  }
  | {
    action: "discard";
    establishedFacts: {
      provenance: "execute-command+candidate-driver";
      origin: string;
      cutMapPath: string;
      candidateBranch: string;
      candidateGeneration: number;
    };
  }
  | {
    action: "re-preflight";
    establishedFacts: {
      provenance: "finalize-command" | "advance-base-command";
      origin: string;
    };
  }
  | {
    action: "reauthor";
    establishedFacts: NonNullable<V3DecomposeRecoveryFacts["finalizeInvocation"]>;
  }
  | {
    action: "guidance";
    establishedFacts: { provenance: "none" };
    message: string;
  }
  | {
    action: "advance-base";
    establishedFacts: {
      provenance: "finalize-command" | "advance-base-command";
      origin: string;
      receiptId: CanonicalDigest;
    };
  };

const MISMATCH_ACTIONS: Record<V3DecompositionMismatchKind, "re-preflight" | "reauthor"> = {
  preparation: "re-preflight",
  receipt: "re-preflight",
  source: "re-preflight",
  allocation: "re-preflight",
  base: "re-preflight",
  ownership: "re-preflight",
  target: "reauthor",
  dependency: "reauthor",
  path: "reauthor",
  mode: "reauthor",
  patch: "reauthor",
  topology: "reauthor",
  publication: "reauthor",
};

function guidance(message: string): V3DecomposeFinalizationRecovery {
  return { action: "guidance", establishedFacts: { provenance: "none" }, message };
}

function rePreflight(facts: V3DecomposeRecoveryFacts): V3DecomposeFinalizationRecovery {
  const invocation = facts.finalizeInvocation ?? facts.advanceBaseInvocation;
  return invocation === undefined
    ? guidance(
        "Re-run decomposition preflight from the original command context; "
        + "no verified origin is available.",
      )
    : {
        action: "re-preflight",
        establishedFacts: {
          provenance: invocation.provenance,
          origin: invocation.origin,
        },
      };
}

function reauthor(facts: V3DecomposeRecoveryFacts): V3DecomposeFinalizationRecovery {
  const invocation = facts.finalizeInvocation;
  return invocation === undefined
    ? guidance(
        "Return to candidate authoring and finalize with the original receipt; "
        + "no verified receipt invocation is available.",
      )
    : { action: "reauthor", establishedFacts: invocation };
}

function advanceBase(facts: V3DecomposeRecoveryFacts): V3DecomposeFinalizationRecovery {
  const invocation = facts.finalizeInvocation ?? facts.advanceBaseInvocation;
  return invocation === undefined
    ? guidance(
        "Advance the committed candidate only from its original finalize invocation; "
        + "the verified origin and receipt are unavailable.",
      )
    : {
        action: "advance-base",
        establishedFacts: {
          provenance: invocation.provenance,
          origin: invocation.origin,
          receiptId: invocation.receiptId,
        },
      };
}

/**
 * Map one typed failure and separately proven operands to a closed recovery action.
 *
 * @param input - Typed failure plus provenance-tagged command and driver facts
 * @returns One action carrying only the facts that authorize that action
 */
export function mapV3DecomposeFinalizationRecovery(input: {
  cause: V3DecomposeFinalizationRecoveryCause;
  facts: V3DecomposeRecoveryFacts;
}): V3DecomposeFinalizationRecovery {
  switch (input.cause.kind) {
    case "canonical-mismatch":
      return MISMATCH_ACTIONS[input.cause.mismatch.kind] === "reauthor"
        ? reauthor(input.facts)
        : rePreflight(input.facts);
    case "semantic-reauthorization":
      return reauthor(input.facts);
    case "mechanical-repreflight":
      return rePreflight(input.facts);
    case "binding-unavailable":
      return advanceBase(input.facts);
    case "transient-finalization": {
      const invocation = input.facts.finalizeInvocation;
      return invocation === undefined
        ? guidance(
            "Retry finalization only from the original finalize invocation; "
            + "its exact receipt and continuation operands are unavailable.",
          )
        : { action: "retry", establishedFacts: invocation };
    }
    case "discardable-candidate": {
      const invocation = input.facts.executeInvocation;
      const candidate = input.facts.candidate;
      return invocation === undefined || candidate === undefined
        ? guidance(
            "Discard only the exact uncommitted candidate from its original cut-map invocation; "
            + "the required candidate or cut-map facts are unavailable.",
          )
        : {
            action: "discard",
            establishedFacts: {
              provenance: "execute-command+candidate-driver",
              origin: invocation.origin,
              cutMapPath: invocation.cutMapPath,
              candidateBranch: candidate.branch,
              candidateGeneration: candidate.generation,
            },
          };
    }
    case "committed-candidate":
      return input.cause.recordKind === "receipt"
        ? advanceBase(input.facts)
        : guidance(
            "The candidate parent already contains decomposition evidence; inspect the committed state "
            + "instead of retrying or discarding it.",
          );
    case "manual-guidance":
      return guidance(input.cause.message);
  }
}

/**
 * Render one already-decided recovery result without reconstructing policy.
 *
 * @param recovery - Closed recovery result from the mapper
 * @returns Exact command or prose-only guidance
 */
export function renderV3DecomposeFinalizationRecovery(
  recovery: V3DecomposeFinalizationRecovery,
): string {
  switch (recovery.action) {
    case "retry":
      return `Retry: ${renderV3DecomposeFinalizeCommand(
        recovery.establishedFacts.origin,
        recovery.establishedFacts.receiptId,
        recovery.establishedFacts.continuationPath,
      )}`;
    case "discard":
      return `Discard: ${renderV3DecomposeDiscardCommand(
        recovery.establishedFacts.origin,
        recovery.establishedFacts.cutMapPath,
      )}`;
    case "re-preflight":
      return `Re-preflight: ${
        renderV3DecomposePreflightCommand(recovery.establishedFacts.origin)
      }`;
    case "reauthor":
      return `Re-author the candidate, then finalize receipt ${
        recovery.establishedFacts.receiptId
      } with continuation ${
        renderV3DecomposeCommandArgument(recovery.establishedFacts.continuationPath)
      }.`;
    case "advance-base":
      return `Advance base: ${renderV3DecomposeAdvanceBaseCommand(
        recovery.establishedFacts.origin,
        recovery.establishedFacts.receiptId,
      )}`;
    case "guidance":
      return recovery.message;
  }
}
