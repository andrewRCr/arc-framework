/** Strict machine-readable refusal contracts for decomposition command boundaries. */

import { z } from "zod";

import {
  digestBytes,
  sortByCanonicalBytes,
} from "../canonical/canonical-json.js";
import {
  spineRemedy,
  SpineRemedySchema,
  type SpineRemedy,
} from "../../scripts/integration/spine-refusal.js";
import {
  v3DecomposeAdvanceBaseArgv,
  v3DecomposeExecuteArgv,
  v3DecomposeExtractArgv,
  v3DecomposeFinishApplyArgv,
  v3DecomposeFinishPreviewArgv,
  v3DecomposePreflightArgv,
} from "./decompose-command-renderer.js";
import type { V3DecomposeOperationRecovery } from "./decompose-v3-operation.js";

const V3DecomposeEvidenceValueSchema = z.json();
export type V3DecomposeEvidenceValue = z.infer<typeof V3DecomposeEvidenceValueSchema>;

/** Two bounded JSON operands that differ at a refusal-producing comparison. */
export const V3DecomposeRefusalEvidenceSchema = z.strictObject({
  expected: V3DecomposeEvidenceValueSchema,
  actual: V3DecomposeEvidenceValueSchema,
});
export type V3DecomposeRefusalEvidence = z.infer<typeof V3DecomposeRefusalEvidenceSchema>;

/** Project bytes into the bounded fact carried by comparison evidence. */
export function v3DecomposeByteEvidence(bytes: Uint8Array): {
  contentDigest: ReturnType<typeof digestBytes>;
  byteLength: number;
} {
  return { contentDigest: digestBytes(bytes), byteLength: bytes.byteLength };
}

/** Project a missing comparison operand without using an undefined JSON value. */
export function v3DecomposeAbsentEvidence(): { kind: "absent" } {
  return { kind: "absent" };
}

/** Project an unordered collection into canonical JSON byte order. */
export function v3DecomposeSetEvidence(
  values: Iterable<V3DecomposeEvidenceValue>,
): V3DecomposeEvidenceValue[] {
  return sortByCanonicalBytes([...values]);
}

/** The core refusal emitted by every selected decomposition command mode. */
export const V3DecomposeCoreRefusalSchema = z.strictObject({
  status: z.literal("refused"),
  reason: z.string().min(1),
  locus: z.string().min(1).optional(),
  evidence: V3DecomposeRefusalEvidenceSchema.optional(),
  remedy: SpineRemedySchema,
});
export type V3DecomposeCoreRefusal = z.infer<typeof V3DecomposeCoreRefusalSchema>;

/** The first strict operation refusal carried end to end through retirement execution. */
export const V3UncoveredRetirementContentRefusalSchema = z.strictObject({
  status: z.literal("refused"),
  stage: z.literal("repository-plan"),
  reason: z.string().regex(/(?:^|:)uncovered-retirement-content$/u),
  locus: z.string().min(1),
  evidence: V3DecomposeRefusalEvidenceSchema.optional(),
  recovery: z.strictObject({ kind: z.literal("none") }),
  remedy: SpineRemedySchema,
});
export type V3UncoveredRetirementContentRefusal = z.infer<
  typeof V3UncoveredRetirementContentRefusalSchema
>;

/** The exact selected command mode whose boundary composes a refusal remedy. */
export type V3DecomposeInvocation =
  | { mode: "preflight"; origin: string }
  | { mode: "execute"; origin: string; cutMapPath: string }
  | { mode: "extract"; origin: string; cutMapPath: string }
  | { mode: "finish-preview"; origin: string; cutMapPath: string }
  | { mode: "finish-apply"; origin: string; cutMapPath: string; applyAuthority: string }
  | { mode: "advance-base"; origin: string; cutMapPath: string };

/** Stable refusal facts and operation recovery available at a command boundary. */
export interface V3DecomposeRemedyInput {
  invocation: V3DecomposeInvocation;
  reason: string;
  locus?: string;
  recovery?: V3DecomposeOperationRecovery;
}

function invocationArgv(invocation: V3DecomposeInvocation): readonly string[] {
  switch (invocation.mode) {
    case "preflight":
      return v3DecomposePreflightArgv(invocation.origin);
    case "execute":
      return v3DecomposeExecuteArgv(invocation.origin, invocation.cutMapPath);
    case "extract":
      return v3DecomposeExtractArgv(invocation.origin, invocation.cutMapPath);
    case "finish-preview":
      return v3DecomposeFinishPreviewArgv(invocation.origin, invocation.cutMapPath);
    case "finish-apply":
      return v3DecomposeFinishApplyArgv(
        invocation.origin,
        invocation.cutMapPath,
        invocation.applyAuthority,
      );
    case "advance-base":
      return v3DecomposeAdvanceBaseArgv(invocation.origin, invocation.cutMapPath);
  }
}

function innermostReason(reason: string): string {
  return reason.split(":").at(-1) ?? reason;
}

interface V3PreflightRemedyDefinition {
  invariant: string;
  correction: string;
}

const V3_PREFLIGHT_REMEDIES: Readonly<Record<string, V3PreflightRemedyDefinition>> = {
  "source-base-ref": {
    invariant: "The configured source base must resolve through one local branch ref.",
    correction: "Correct the source base ref, then re-run preflight",
  },
  "result-base-ref": {
    invariant: "The decomposition result base must resolve through one local branch ref.",
    correction: "Correct the result base ref, then re-run preflight",
  },
  "source-candidate-ref": {
    invariant: "Every source candidate must use a distinct local branch ref outside the base ref.",
    correction: "Correct the reported candidate ref, then re-run preflight",
  },
  "source-candidate-duplicate": {
    invariant: "Each local source-candidate ref may appear only once.",
    correction: "Remove the duplicate candidate ref, then re-run preflight",
  },
  "source-origin-duplicate": {
    invariant: "One committed tree may contain only one metadata record for the source origin.",
    correction: "Remove the duplicate source metadata record, then re-run preflight",
  },
  "source-self-identity": {
    invariant: "A started source metadata record must name the branch whose tree contains it.",
    correction: "Correct the source branch identity, then re-run preflight",
  },
  "source-ambiguous": {
    invariant: "Exactly one local branch may qualify as the decomposition source.",
    correction: "Resolve the competing source branches, then re-run preflight",
  },
  "source-predecessor": {
    invariant: "The origin must have one qualifying started source or configured-base predecessor.",
    correction: "Restore a qualifying source predecessor, then re-run preflight",
  },
  "source-artifact-duplicate": {
    invariant: "Each source artifact path may appear only once in the pinned inventory.",
    correction: "Remove the duplicate source artifact path, then re-run preflight",
  },
  "source-artifact-mode": {
    invariant: "Every source artifact must use a supported regular-file mode.",
    correction: "Correct the reported source artifact mode, then re-run preflight",
  },
  "planning-profile": {
    invariant: "Source metadata and stored artifacts must define one sanctioned planning profile.",
    correction: "Correct the reported planning-profile field or artifact, then re-run preflight",
  },
  "source-unit-duplicate": {
    invariant: "Every scanned source unit must have one unique canonical identity.",
    correction: "Resolve the duplicate source unit, then re-run preflight",
  },
  "incoming-edge": {
    invariant: "Every incoming dependency must carry unique canonical current targets.",
    correction: "Correct the reported incoming dependency, then re-run preflight",
  },
  "incoming-edge-duplicate": {
    invariant: "Each incoming dependency identity may appear only once.",
    correction: "Remove the duplicate incoming dependency, then re-run preflight",
  },
  "outgoing-edge-duplicate": {
    invariant: "Each outgoing dependency identity may appear only once.",
    correction: "Remove the duplicate outgoing dependency, then re-run preflight",
  },
  "machine-envelope": {
    invariant: "Preflight must produce one canonical self-authenticating machine envelope.",
    correction: "Correct the reported source facts, then re-run preflight",
  },
  "starter-map": {
    invariant: "The recorded starter map must remain canonical and machine-authenticating.",
    correction: "Replace it with a fresh preflight map and reauthor the cut",
  },
  "source-logical-branch": {
    invariant: "The authored map must remain bound to the preflight source branch.",
    correction: "The source branch changed; re-run preflight and reauthor the cut map",
  },
  "source-ref": {
    invariant: "The authored map must remain bound to the exact source ref.",
    correction: "The source ref changed; re-run preflight and reauthor the cut map",
  },
  "source-head": {
    invariant: "The authored map must remain bound to the exact source commit.",
    correction: "The source commit changed; re-run preflight and reauthor the cut map",
  },
  "result-ref": {
    invariant: "The authored map must remain bound to the exact result-base ref.",
    correction: "The result-base ref changed; re-run preflight and reauthor the cut map",
  },
  "result-head": {
    invariant: "The authored map must remain bound to the exact result-base commit.",
    correction: "The result-base commit changed; re-run preflight and reauthor the cut map",
  },
  "source-artifact-inventory": {
    invariant: "The authored map must remain bound to the complete pinned source-artifact inventory.",
    correction: "The source artifact inventory changed; re-run preflight and reauthor the cut map",
  },
  "source-units": {
    invariant: "The authored map must remain bound to the scanned source units.",
    correction: "The source units changed; re-run preflight and reauthor the cut map",
  },
  "incoming-edges": {
    invariant: "The authored map must remain bound to the pinned incoming dependencies.",
    correction: "The incoming dependencies changed; re-run preflight and reauthor the cut map",
  },
  "outgoing-edges": {
    invariant: "The authored map must remain bound to the pinned outgoing dependencies.",
    correction: "The outgoing dependencies changed; re-run preflight and reauthor the cut map",
  },
  "preflight-id": {
    invariant: "The authored map must retain the preflight identity derived from all machine facts.",
    correction: "Replace it with a fresh preflight map and reauthor the cut",
  },
  "completed-map": {
    invariant: "Execution requires one canonical completed map bound to the selected origin.",
    correction: "Generate a fresh preflight map and reauthor the completed map",
  },
  "source-identity": {
    invariant: "An extraction map must retain the source origin, logical branch, and ref together.",
    correction: "The source identity changed; re-run preflight and reauthor the extraction map",
  },
  "result-base": {
    invariant: "An extraction map must retain the exact result-base ref and commit.",
    correction: "The result base changed; re-run preflight and reauthor the extraction map",
  },
  "source-unit-ambiguous": {
    invariant: "Changed bytes under a repeated heading must be reauthored without guessing their allocation.",
    correction: "Re-run preflight and reauthor the repeated-heading source allocation",
  },
};

const V3_GIT_PREFLIGHT_REMEDIES: Readonly<Record<string, V3PreflightRemedyDefinition>> = {
  "missing-base": {
    invariant: "The configured local base branch must exist before source discovery.",
    correction: "Restore the configured local base branch, then re-run preflight",
  },
  "malformed-ref-list": {
    invariant: "Git must enumerate local refs as complete ref-and-object pairs.",
    correction: "Repair the reported local ref enumeration, then re-run preflight",
  },
  "malformed-tree-entry": {
    invariant: "Git must enumerate each committed source-tree entry in the requested canonical shape.",
    correction: "Repair the reported committed-tree entry, then re-run preflight",
  },
  "missing-blob": {
    invariant: "Every enumerated source blob must be readable from its pinned commit.",
    correction: "Restore the reported Git object, then re-run preflight",
  },
  "invalid-meta-encoding": {
    invariant: "Every source metadata artifact must be valid UTF-8.",
    correction: "Convert the reported metadata artifact to UTF-8, then re-run preflight",
  },
  "invalid-origin-meta": {
    invariant: "The selected origin metadata must carry a valid lifecycle state.",
    correction: "Correct the reported origin metadata, then re-run preflight",
  },
  "unsupported-artifact": {
    invariant: "Every source artifact must be a supported regular-file Git blob.",
    correction: "Replace the reported source artifact with a supported regular file, then re-run preflight",
  },
};

function gitPreflightCode(reason: string): string | null {
  return /(?:^|:)git-preflight:([^:]+)$/u.exec(reason)?.[1] ?? null;
}

function preflightRemedyDefinition(reason: string): V3PreflightRemedyDefinition | undefined {
  const gitCode = gitPreflightCode(reason);
  return gitCode === null
    ? V3_PREFLIGHT_REMEDIES[innermostReason(reason)]
    : V3_GIT_PREFLIGHT_REMEDIES[gitCode];
}

/** Whether the current incremental registry owns a stable refusal code. */
export function isV3DecomposeMappedReason(reason: string): boolean {
  const code = innermostReason(reason);
  return preflightRemedyDefinition(reason) !== undefined
    || code === "scaffold-source-meta-incomplete"
    || code === "scaffold-source-missing"
    || code === "scaffold-source-invalid-encoding"
    || code === "scaffold-title-missing"
    || code === "existing-home-unresolvable"
    || code === "target-artifact-absent"
    || code === "target-locator-unresolved"
    || code === "source-scan"
    || code === "uncovered-retirement-content"
    || code === "unexpected-error";
}

/** Map one stable decomposition refusal to its command-boundary remedy. */
export function v3DecomposeRemedy(input: V3DecomposeRemedyInput): SpineRemedy {
  const code = innermostReason(input.reason);
  const preflightDefinition = preflightRemedyDefinition(input.reason);
  if (preflightDefinition !== undefined) {
    return spineRemedy(
      preflightDefinition.invariant,
      preflightDefinition.correction,
      v3DecomposePreflightArgv(input.invocation.origin),
    );
  }
  switch (code) {
    case "scaffold-source-meta-incomplete": {
      const source = input.locus ?? "the reported member and source metadata";
      return spineRemedy(
        "Every new-member scaffold requires complete source metadata.",
        `Set the owner, priority, and origin fields at ${source}, then re-run preflight`,
        v3DecomposePreflightArgv(input.invocation.origin),
      );
    }
    case "scaffold-source-missing": {
      const source = input.locus ?? "the reported member and source artifact";
      return spineRemedy(
        "Every requested member scaffold must have a regular-file source artifact.",
        `Restore the scaffold source at ${source}, then re-run preflight`,
        v3DecomposePreflightArgv(input.invocation.origin),
      );
    }
    case "scaffold-source-invalid-encoding": {
      const source = input.locus ?? "the reported member and source artifact";
      return spineRemedy(
        "Every scaffold source artifact must be valid UTF-8.",
        `Convert ${source} to UTF-8, then re-run preflight`,
        v3DecomposePreflightArgv(input.invocation.origin),
      );
    }
    case "scaffold-title-missing": {
      const source = input.locus ?? "the reported member and source artifact";
      return spineRemedy(
        "Every scaffold source artifact must open with a title line.",
        `Add a title line at ${source}, then re-run preflight`,
        v3DecomposePreflightArgv(input.invocation.origin),
      );
    }
    case "existing-home-unresolvable": {
      const target = input.locus ?? "the reported existing home";
      return spineRemedy(
        "Every existing-home destination must resolve to a regular file.",
        `Restore the regular-file existing home at ${target}, then re-run preflight`,
        v3DecomposePreflightArgv(input.invocation.origin),
      );
    }
    case "target-artifact-absent": {
      const target = input.locus ?? "the reported destination and target artifact";
      return spineRemedy(
        "Every target artifact must exist in the projected destination tree.",
        `Correct the map allocation for ${target}, then retry the selected mode`,
        invocationArgv(input.invocation),
      );
    }
    case "target-locator-unresolved": {
      const target = input.locus ?? "the reported destination and target artifact";
      return spineRemedy(
        "Every authored target locator must resolve exactly once in the projected artifact.",
        `Correct the target locator for ${target}, then retry the selected mode`,
        invocationArgv(input.invocation),
      );
    }
    case "unexpected-error":
      return spineRemedy(
        "The selected decomposition mode must complete without an unexpected runtime failure.",
        "Retry the selected mode",
        invocationArgv(input.invocation),
      );
    case "source-scan": {
      const sourcePath = input.locus ?? "the reported source artifact";
      return spineRemedy(
        "Every scanned Markdown source artifact must be valid UTF-8.",
        `Convert ${sourcePath} to UTF-8, then re-run preflight`,
        v3DecomposePreflightArgv(input.invocation.origin),
      );
    }
    case "uncovered-retirement-content": {
      const companion = input.locus ?? "the reported companion";
      return spineRemedy(
        "Retirement cannot delete nonempty companion content outside the conservation proof.",
        `Move the content at ${companion} into a scanned artifact or delete the file, then re-run preflight`,
        v3DecomposePreflightArgv(input.invocation.origin),
      );
    }
    default:
      throw new Error(`No decomposition remedy is registered for ${input.reason}.`);
  }
}
