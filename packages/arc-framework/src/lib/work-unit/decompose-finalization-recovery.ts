/**
 * Closed recovery policy for version-3 decomposition finalization failures.
 *
 * Commands are emitted only from provenance-tagged invocation and driver facts.
 * Validator loci remain diagnostics and never become command operands.
 */

import type { CanonicalDigest } from "../canonical/canonical-json.js";
import type {
  V3DecompositionMismatch,
  V3DecompositionMismatchKind,
} from "./validate-v3-decomposition.js";

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
  candidate?: {
    provenance: "candidate-driver";
    branch: string;
    generation: number;
  };
}

export type V3DecomposeFinalizationRecoveryCause =
  | { kind: "canonical-mismatch"; mismatch: V3DecompositionMismatch }
  | { kind: "transient-finalization" }
  | { kind: "discardable-candidate" }
  | { kind: "semantic-reauthorization" }
  | { kind: "mechanical-repreflight" }
  | { kind: "committed-candidate" }
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
      provenance: "finalize-command";
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
  const invocation = facts.finalizeInvocation;
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
      return guidance(
        "The candidate parent already contains decomposition evidence; inspect the committed state "
        + "instead of retrying or discarding it.",
      );
    case "manual-guidance":
      return guidance(input.cause.message);
  }
}

function shellArgument(value: string): string {
  return /^[A-Za-z0-9_./:@+-]+$/u.test(value)
    ? value
    : `'${value.replaceAll("'", "'\"'\"'")}'`;
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
      return `Retry: arc decompose ${shellArgument(recovery.establishedFacts.origin)} `
        + `--finalize ${recovery.establishedFacts.receiptId} `
        + `--continuation ${shellArgument(recovery.establishedFacts.continuationPath)}`;
    case "discard":
      return `Discard: arc decompose ${shellArgument(recovery.establishedFacts.origin)} `
        + `--discard ${shellArgument(recovery.establishedFacts.cutMapPath)}`;
    case "re-preflight":
      return `Re-preflight: arc decompose ${
        shellArgument(recovery.establishedFacts.origin)
      } --preflight`;
    case "reauthor":
      return `Re-author the candidate, then finalize receipt ${
        recovery.establishedFacts.receiptId
      } with continuation ${shellArgument(recovery.establishedFacts.continuationPath)}.`;
    case "guidance":
      return recovery.message;
  }
}
