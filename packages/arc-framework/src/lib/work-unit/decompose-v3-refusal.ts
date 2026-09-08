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

/** Map one stable decomposition refusal to its command-boundary remedy. */
export function v3DecomposeRemedy(input: V3DecomposeRemedyInput): SpineRemedy {
  switch (innermostReason(input.reason)) {
    case "unexpected-error":
      return spineRemedy(
        "The selected decomposition mode must complete without an unexpected runtime failure.",
        "Retry the selected mode",
        invocationArgv(input.invocation),
      );
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
