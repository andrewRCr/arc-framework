/** One authority predicate over roster rows, shared by every state-touching locus consumer. */

import {
  LocusDiagnosticCodeSchema,
  LocusStopReasonSchema,
  type LocusDiagnosticV1,
  type LocusRefusalReason,
  type LocusRowV1,
  type LocusStopReason,
} from "./schema/index.js";

/**
 * A roster row whose authority is established, narrowed to the coordinates a mutation needs.
 *
 * The reader emits structurally valid records as `managed-role` while attaching authority
 * diagnostics, so the row kind proves structure rather than trust. This projection proves trust.
 */
export interface TrustedLocusRow {
  readonly row: LocusRowV1;
  readonly recordId: string;
  readonly checkoutPath: string;
  readonly role: NonNullable<LocusRowV1["role"]>;
}

export type TrustedLocusRowResult =
  | { readonly kind: "trusted"; readonly value: TrustedLocusRow }
  | { readonly kind: "untrusted"; readonly reasons: readonly LocusStopReason[] };

/**
 * Diagnostic codes that also name a stop reason, derived from the intersection of the two
 * published enums rather than restated — so a code added to either side cannot silently escape.
 *
 * The intersection deliberately includes `lease-unknown` and `lock-unknown`: unverifiable liveness
 * is a stop condition in the model's own vocabulary, and `attachLocusLease` already refuses it.
 * Requiring it here makes that refusal uniform across every consumer rather than reachable only on
 * the one path that happens to check.
 *
 * Codes outside the intersection (`lease-dead`, `lock-dead`, `lock-without-record`,
 * `worktree-without-role`, `record-without-checkout`) leave authority established. A dead lease or
 * lock is the ordinary thing replacement and break exist to act on, so neither suppresses trust.
 */
const AUTHORITY_FATAL_CODES: ReadonlySet<string> = new Set(
  LocusDiagnosticCodeSchema.options.filter((code) =>
    (LocusStopReasonSchema.options as readonly string[]).includes(code)),
);

/** Reason a non-`managed-role` row can never carry established authority. */
const ROW_KIND_REASON: Readonly<Record<Exclude<LocusRowV1["kind"], "managed-role">, LocusStopReason>> = {
  "stale-record": "record-malformed",
  "malformed-record": "record-malformed",
  "duplicate-locus": "duplicate-locus",
  "free-primary": "role-conflict",
  "unmanaged-checkout": "role-conflict",
  "identity-only": "role-conflict",
};

function isAuthorityFatal(
  code: LocusDiagnosticV1["code"],
): code is LocusDiagnosticV1["code"] & LocusStopReason {
  return AUTHORITY_FATAL_CODES.has(code);
}

/**
 * Project one roster row into its trusted form, or report every reason it is untrusted.
 *
 * @param row - Roster row as published by the locus reader.
 * @returns The narrowed row when its authority is established, else the deduplicated stop reasons
 *   in published-enum order.
 */
export function projectTrustedLocusRow(row: LocusRowV1): TrustedLocusRowResult {
  const reasons = locusRowAuthorityReasons(row);
  if (reasons.length > 0) return { kind: "untrusted", reasons };

  const { recordId, checkoutPath, role } = row;
  if (recordId === null || checkoutPath === null || role === null) {
    return { kind: "untrusted", reasons: [ROW_KIND_REASON["stale-record"]] };
  }
  return { kind: "trusted", value: { row, recordId, checkoutPath, role } };
}

/**
 * The authority inputs a row carries, which are the same before and after publication.
 *
 * Trust reads a row's kind, coordinates, and diagnostics and never its lease, so the predicate is
 * expressed over that subset — letting frame derivation consult it on a pre-publication row without
 * a cast, and keeping one implementation rather than a second that could disagree.
 */
export type LocusRowAuthorityInputs =
  Pick<LocusRowV1, "kind" | "recordId" | "checkoutPath" | "role" | "diagnostics">;

/**
 * Report every reason a row's authority is unestablished.
 *
 * @param row - Any row carrying the authority inputs, published or provisional.
 * @returns Deduplicated stop reasons in published-enum order; empty when authority is established.
 */
export function locusRowAuthorityReasons(row: LocusRowAuthorityInputs): readonly LocusStopReason[] {
  const reasons = new Set<LocusStopReason>();

  if (row.kind !== "managed-role") reasons.add(ROW_KIND_REASON[row.kind]);
  for (const diagnostic of row.diagnostics) {
    if (isAuthorityFatal(diagnostic.code)) reasons.add(diagnostic.code);
  }
  if (row.recordId === null || row.checkoutPath === null || row.role === null) {
    reasons.add("record-malformed");
  }
  return sortedReasons(reasons);
}

/**
 * Narrow a row set to the rows whose authority is established.
 *
 * @param rows - Roster rows as published by the locus reader.
 * @returns Trusted projections, in the order the reader published them.
 */
export function trustedLocusRows(rows: readonly LocusRowV1[]): readonly TrustedLocusRow[] {
  const output: TrustedLocusRow[] = [];
  for (const row of rows) {
    const projected = projectTrustedLocusRow(row);
    if (projected.kind === "trusted") output.push(projected.value);
  }
  return output;
}

/**
 * Stop reason to the single refusal reason a mutation result can carry.
 *
 * The stop vocabulary is finer than the refusal vocabulary, so several authority failures collapse
 * onto `role-conflict` and the version/identity malformations onto `record-malformed`. Lock
 * liveness follows the existing lock-refusal precedent and reports as lease liveness.
 */
const REFUSAL_BY_STOP_REASON: Readonly<Record<LocusStopReason, LocusRefusalReason>> = {
  "primary-dirty": "primary-dirty",
  "primary-off-base": "primary-off-base",
  "lease-live": "lease-live",
  "lease-unknown": "lease-unknown",
  "lock-live": "lease-live",
  "lock-unknown": "lease-unknown",
  "role-conflict": "role-conflict",
  "record-malformed": "record-malformed",
  "unsupported-version": "record-malformed",
  "identity-malformed": "record-malformed",
  "path-unavailable": "role-conflict",
  "duplicate-locus": "duplicate-locus",
  "cross-identity": "role-conflict",
  "marker-missing": "role-conflict",
  "subject-unresolved": "role-conflict",
};

/**
 * Reduce an untrusted row's reasons to the one refusal reason its mutation result carries.
 *
 * @param reasons - Stop reasons in published-enum order, as `projectTrustedLocusRow` emits them.
 * @returns The refusal reason for the first (most structural) stop reason.
 */
export function untrustedRefusalReason(reasons: readonly LocusStopReason[]): LocusRefusalReason {
  const first = reasons[0];
  return first === undefined ? "role-conflict" : REFUSAL_BY_STOP_REASON[first];
}

function sortedReasons(reasons: ReadonlySet<LocusStopReason>): readonly LocusStopReason[] {
  return LocusStopReasonSchema.options.filter((reason) => reasons.has(reason));
}
