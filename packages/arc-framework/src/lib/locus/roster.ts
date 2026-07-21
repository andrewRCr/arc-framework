/** Pure subject joins and deterministic provisional projection for the locus roster. */

import type { TransientIdentitySnapshot } from "../errand/identity-snapshot.js";
import type { RegisteredWorktree } from "../git/worktree-roster.js";
import {
  classifyTransientWorktreeProvenance,
  type TransientWorktreeSubject,
  type WorktreeMarkerReadResult,
} from "../git/worktree-marker.js";
import type {
  CheckoutEvidence,
  LocusEvidenceResult,
  RecordEntryEvidence,
} from "./evidence.js";
import type {
  LocusDiagnosticV1,
  LocusAnchor,
  LocusIdentityV1,
  LocusRecordV1,
  LocusRowV1,
} from "./schema/index.js";
import type { SubjectMetaProjection } from "./subject-meta.js";

export type ManagedSubjectProjection =
  | {
      kind: "resolved";
      authority: "work-unit" | "transient" | "partial-transient";
      identity: LocusIdentityV1 | null;
      meta: Extract<SubjectMetaProjection, { kind: "resolved" }> | null;
    }
  | {
      kind: "unresolved";
      reasons: readonly ("subject-unresolved" | "cross-identity" | "marker-missing")[];
    };

export interface ProvisionalRoster {
  readonly rows: readonly ProvisionalLocusRow[];
  readonly diagnostics: readonly LocusDiagnosticV1[];
}

export type ProvisionalLocusRow = LocusRowV1 & { readonly leaseAnchor: LocusAnchor | null };

/** Classify complete evidence into deterministic provisional rows and diagnostics. */
export function projectProvisionalRoster(options: {
  evidence: Extract<LocusEvidenceResult, { kind: "complete" }>;
  subjects: ReadonlyMap<string, ManagedSubjectProjection>;
}): ProvisionalRoster {
  const rows: ProvisionalLocusRow[] = [];
  const diagnostics: LocusDiagnosticV1[] = [];
  const consumedRecords = new Set<RecordEntryEvidence>();
  const consumedIdentities = new Set<string>();
  const duplicateCheckoutKeys = duplicateCanonicalKeys(options.evidence.checkouts);
  const duplicateRecordKeys = duplicateRecordCanonicalKeys(options.evidence.records);

  for (const checkout of options.evidence.checkouts) {
    const checkoutDiagnostics = checkoutEvidenceDiagnostics(checkout);
    const canonical = checkout.canonical.kind === "resolved" ? checkout.canonical.path : null;
    const matches = canonical === null
      ? []
      : options.evidence.records.filter((entry) =>
          entry.canonical?.kind === "resolved" && entry.canonical.path === canonical);
    const duplicate = canonical !== null
      && (duplicateCheckoutKeys.has(canonical) || duplicateRecordKeys.has(canonical));

    if (duplicate) {
      const duplicateDiagnostic = diagnostic(
        "duplicate-locus",
        "checkout",
        checkout.worktree.path,
        "Multiple persisted spellings resolve to one physical checkout",
      );
      if (matches.length === 0) {
        rows.push(emptyCheckoutRow("duplicate-locus", checkout, [...checkoutDiagnostics, duplicateDiagnostic]));
      } else {
        for (const entry of matches) {
          consumedRecords.add(entry);
          rows.push(recordRow("duplicate-locus", checkout, entry, null, [
            ...checkoutDiagnostics,
            duplicateDiagnostic,
          ]));
        }
      }
      continue;
    }
    const entry = matches[0];
    if (entry === undefined) {
      const kind = checkout.worktree.primary ? "free-primary" : "unmanaged-checkout";
      const unmanagedDiagnostic = kind === "unmanaged-checkout"
        ? [diagnostic("worktree-without-role", "checkout", checkout.worktree.path, "Checkout has no locus role")]
        : [];
      rows.push(emptyCheckoutRow(kind, checkout, [...checkoutDiagnostics, ...unmanagedDiagnostic]));
      continue;
    }
    consumedRecords.add(entry);
    if (entry.result.kind !== "valid") {
      rows.push(recordRow("malformed-record", checkout, entry, null, checkoutDiagnostics));
      continue;
    }
    const subject = options.subjects.get(entry.result.record.recordId) ?? null;
    if (subject?.kind === "resolved" && subject.identity !== null) {
      consumedIdentities.add(identityKey(subject.identity));
    }
    const subjectDiagnostics = subject?.kind === "unresolved"
      ? subject.reasons.map((reason) => diagnostic(reason, "record", entry.name, `Record subject is ${reason}`))
      : [];
    rows.push(recordRow("managed-role", checkout, entry, subject, [
      ...checkoutDiagnostics,
      ...subjectDiagnostics,
      ...recordDiagnostics(entry),
    ]));
  }

  for (const entry of options.evidence.recordEntries) {
    if (consumedRecords.has(entry)) continue;
    if (entry.kind === "unexpected") {
      const rowDiagnostic = diagnostic("record-malformed", "record", entry.name, "Unexpected locus record entry");
      rows.push(bareRow("malformed-record", null, null, [rowDiagnostic]));
      continue;
    }
    if (entry.canonical?.kind === "resolved" && duplicateRecordKeys.has(entry.canonical.path)) {
      const rowDiagnostic = diagnostic(
        "duplicate-locus",
        "record",
        entry.name,
        "Multiple records resolve to one physical checkout",
      );
      rows.push(recordRow("duplicate-locus", null, entry, null, [rowDiagnostic]));
      continue;
    }
    const kind = entry.result.kind === "valid" ? "stale-record" : "malformed-record";
    rows.push(recordRow(kind, null, entry, null, recordDiagnostics(entry)));
  }

  if (options.evidence.identities.kind === "complete") {
    for (const identity of options.evidence.identities.projections.values()) {
      if (!consumedIdentities.has(identityKey(identity))) {
        rows.push(bareRow("identity-only", null, identity, []));
      }
    }
    for (const item of options.evidence.identities.diagnostics) {
      diagnostics.push(diagnostic("identity-malformed", "identity", item.key, identityDiagnosticMessage(item)));
    }
  }
  for (const lock of options.evidence.lockEntries) {
    if (lock.kind === "unexpected") {
      diagnostics.push(diagnostic("lock-unknown", "lock", lock.name, "Unexpected locus lock entry"));
      continue;
    }
    if (!options.evidence.records.some((record) => record.digest === lock.digest)) {
      diagnostics.push(diagnostic("lock-without-record", "lock", lock.name, "Lock has no matching locus record"));
    }
    if (lock.liveness === "dead") diagnostics.push(diagnostic("lock-dead", "lock", lock.name, "Lock holder is dead"));
    else if (lock.liveness === "unknown" || lock.result.kind !== "valid") {
      diagnostics.push(diagnostic("lock-unknown", "lock", lock.name, "Lock holder cannot be verified"));
    }
  }
  diagnostics.push(...rows.flatMap((row) => row.diagnostics));
  rows.sort(compareRows);
  return { rows, diagnostics: uniqueSortedDiagnostics(diagnostics) };
}

/** Join a valid record to exact checkout, marker, identity, owner, branch, and meta authority. */
export function projectManagedSubject(options: {
  identity: string;
  checkout: RegisteredWorktree;
  record: LocusRecordV1;
  marker: WorktreeMarkerReadResult | { kind: "error"; message: string };
  identities: TransientIdentitySnapshot;
  meta: SubjectMetaProjection | null;
}): ManagedSubjectProjection {
  const reasons = new Set<"subject-unresolved" | "cross-identity" | "marker-missing">();
  if (options.record.checkoutPath !== options.checkout.path) reasons.add("subject-unresolved");
  const role = options.record.role;
  const pair = `${role.kind}/${role.subject.kind}`;

  if (pair === "work-unit/work-unit") {
    const meta = options.meta;
    if (meta?.kind !== "resolved") reasons.add("subject-unresolved");
    if (meta?.kind === "resolved" && meta.owner !== options.identity) reasons.add("cross-identity");
    if (meta?.kind === "resolved" && meta.branch !== options.checkout.branch) reasons.add("subject-unresolved");
    if (markerMustAgree(options.checkout, options.marker)
      && !markerMatches(options.marker, options.identity, { kind: "work-unit", key: role.subject.key })) {
      addMarkerReason(reasons, options.marker, options.identity);
    }
    return reasons.size === 0 && meta?.kind === "resolved"
      ? { kind: "resolved", authority: "work-unit", identity: null, meta }
      : { kind: "unresolved", reasons: [...reasons] };
  }

  if (pair === "errand/partial-errand" || pair === "housekeep/housekeep") {
    if (role.subject.claimId !== null) reasons.add("subject-unresolved");
    if (!options.checkout.primary
      && !markerMatches(options.marker, options.identity, { kind: "branch", key: options.checkout.branch ?? "" })) {
      addMarkerReason(reasons, options.marker, options.identity);
    }
    return reasons.size === 0
      ? { kind: "resolved", authority: "partial-transient", identity: null, meta: null }
      : { kind: "unresolved", reasons: [...reasons] };
  }

  const identity = exactIdentity(options.identities, role.subject.kind, role.subject.key, role.subject.claimId);
  if (identity === null) reasons.add("subject-unresolved");
  if (identity !== null && !identityMatchesRole(identity, role.kind)) reasons.add("subject-unresolved");
  if (identity !== null && identityBranch(identity) !== options.checkout.branch) reasons.add("subject-unresolved");
  if (markerMustAgree(options.checkout, options.marker)
    && !markerMatches(options.marker, options.identity, transientMarker(identity, role.subject.key))) {
    addMarkerReason(reasons, options.marker, options.identity);
  }
  return reasons.size === 0 && identity !== null
    ? { kind: "resolved", authority: "transient", identity, meta: null }
    : { kind: "unresolved", reasons: [...reasons] };
}

function exactIdentity(
  snapshot: TransientIdentitySnapshot,
  kind: string,
  key: string,
  claimId: string | null,
): LocusIdentityV1 | null {
  if (snapshot.kind !== "complete" || claimId === null) return null;
  const identity = snapshot.projections.get(key);
  return identity !== undefined
    && identity.kind === kind
    && identity.key === key
    && identity.claimId === claimId
    ? identity
    : null;
}

function identityBranch(identity: LocusIdentityV1): string | null {
  return "branch" in identity ? identity.branch : null;
}

function identityMatchesRole(identity: LocusIdentityV1, roleKind: string): boolean {
  if (roleKind === "groom") return identity.kind === "groom";
  if (identity.kind !== "errand") return false;
  if (roleKind === "errand") return identity.purpose === "errand";
  return roleKind === "housekeep" && identity.purpose === "housekeep-routing";
}

function markerMustAgree(
  checkout: RegisteredWorktree,
  marker: WorktreeMarkerReadResult | { kind: "error"; message: string },
): boolean {
  return !checkout.primary || marker.kind !== "absent";
}

function transientMarker(
  identity: LocusIdentityV1 | null,
  key: string,
): TransientWorktreeSubject | { kind: "branch"; key: string } {
  if (identity === null) return { kind: "branch", key: "" };
  if (identity.kind === "groom") {
    return { kind: "groom", slug: key, claimId: identity.claimId };
  }
  return {
    kind: identity.purpose === "housekeep-routing" ? "housekeep" : "errand",
    slug: key,
    claimId: identity.claimId,
  };
}

function markerMatches(
  result: WorktreeMarkerReadResult | { kind: "error"; message: string },
  identity: string,
  expected:
    | { kind: "work-unit" | "branch"; key: string }
    | TransientWorktreeSubject,
): boolean {
  if (result.kind !== "present" || result.marker.spawningIdentity !== identity) return false;
  if (expected.kind === "errand" || expected.kind === "groom" || expected.kind === "housekeep") {
    return classifyTransientWorktreeProvenance(result, expected)?.kind === "ready";
  }
  const subject = result.marker.createdFor
    ?? (result.marker.wuName === undefined ? undefined : { kind: "work-unit" as const, name: result.marker.wuName });
  if (subject === undefined || subject.kind !== expected.kind) return false;
  if (subject.kind === "work-unit") return subject.name === expected.key;
  return subject.ref === expected.key;
}

function addMarkerReason(
  reasons: Set<"subject-unresolved" | "cross-identity" | "marker-missing">,
  marker: WorktreeMarkerReadResult | { kind: "error"; message: string },
  identity: string,
): void {
  if (marker.kind === "absent") reasons.add("marker-missing");
  else if (marker.kind === "present" && marker.marker.spawningIdentity !== identity) reasons.add("cross-identity");
  else reasons.add("subject-unresolved");
}

function duplicateCanonicalKeys(checkouts: readonly CheckoutEvidence[]): ReadonlySet<string> {
  return duplicateKeys(checkouts.flatMap((checkout) =>
    checkout.canonical.kind === "resolved" ? [checkout.canonical.path] : []));
}

function duplicateRecordCanonicalKeys(records: readonly Extract<RecordEntryEvidence, { kind: "record" }>[]): ReadonlySet<string> {
  return duplicateKeys(records.flatMap((record) =>
    record.canonical?.kind === "resolved" ? [record.canonical.path] : []));
}

function duplicateKeys(keys: readonly string[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) duplicates.add(key);
    else seen.add(key);
  }
  return duplicates;
}

function checkoutEvidenceDiagnostics(checkout: CheckoutEvidence): LocusDiagnosticV1[] {
  const output: LocusDiagnosticV1[] = [];
  if (checkout.canonical.kind === "error") {
    output.push(diagnostic("path-unavailable", "checkout", checkout.worktree.path, checkout.canonical.message));
  }
  if (checkout.marker.kind === "malformed" || checkout.marker.kind === "error") {
    output.push(diagnostic("subject-unresolved", "checkout", checkout.worktree.path, checkout.marker.message));
  }
  for (const root of checkout.metaRoots) {
    if (root.kind === "error") {
      output.push(diagnostic("subject-unresolved", "checkout", root.path, root.message));
    }
  }
  for (const meta of checkout.metas) {
    if (meta.kind === "error") output.push(diagnostic("subject-unresolved", "checkout", meta.path, meta.message));
  }
  return output;
}

function emptyCheckoutRow(
  kind: "free-primary" | "unmanaged-checkout" | "duplicate-locus",
  checkout: CheckoutEvidence,
  diagnostics: readonly LocusDiagnosticV1[],
): ProvisionalLocusRow {
  return {
    ...bareRow(kind, checkout.worktree.path, null, diagnostics),
    primary: checkout.worktree.primary,
  };
}

function recordRow(
  kind: "managed-role" | "stale-record" | "malformed-record" | "duplicate-locus",
  checkout: CheckoutEvidence | null,
  entry: Extract<RecordEntryEvidence, { kind: "record" }>,
  subject: ManagedSubjectProjection | null,
  diagnostics: readonly LocusDiagnosticV1[],
): ProvisionalLocusRow {
  if (entry.result.kind !== "valid") {
    return {
      ...bareRow(kind, checkout?.worktree.path ?? null, null, diagnostics),
      primary: checkout?.worktree.primary ?? null,
      recordId: `sha256:${entry.digest}`,
    };
  }
  const record = entry.result.record;
  const resolved = subject?.kind === "resolved" ? subject : null;
  return {
    kind,
    checkoutPath: record.checkoutPath,
    primary: checkout?.worktree.primary ?? null,
    recordId: record.recordId,
    role: {
      kind: record.role.kind,
      subject: record.role.subject,
      parentCheckoutPath: record.role.parentCheckoutPath,
      dispatchId: record.role.dispatchId,
      originEntry: record.role.originEntry,
      routingPlanDigest: record.role.routingPlanDigest,
    },
    identity: resolved?.identity ?? null,
    lease: record.lease === null ? null : {
      leaseId: record.lease.leaseId,
      state: entry.liveness ?? "unknown",
      sessionHomePath: record.lease.sessionHomePath,
      attachedAt: record.lease.attachedAt,
      heartbeatAt: record.lease.heartbeatAt,
    },
    leaseAnchor: record.lease?.anchor ?? null,
    frame: null,
    derived: resolved?.meta === null || resolved?.meta === undefined ? null : {
      workflow: resolved.meta.workflow,
      stage: resolved.meta.stage,
      sessionType: resolved.meta.sessionType,
      taskCursor: resolved.meta.taskCursor,
      loadSet: resolved.meta.loadSet,
    },
    diagnostics: [...diagnostics],
  };
}

function bareRow(
  kind: LocusRowV1["kind"],
  checkoutPath: string | null,
  identity: LocusIdentityV1 | null,
  diagnostics: readonly LocusDiagnosticV1[],
): ProvisionalLocusRow {
  return {
    kind,
    checkoutPath,
    primary: null,
    recordId: null,
    role: null,
    identity,
    lease: null,
    leaseAnchor: null,
    frame: null,
    derived: null,
    diagnostics: [...diagnostics],
  };
}

function recordDiagnostics(
  entry: Extract<RecordEntryEvidence, { kind: "record" }>,
): LocusDiagnosticV1[] {
  const output: LocusDiagnosticV1[] = [];
  if (entry.canonical?.kind === "error") {
    output.push(diagnostic("path-unavailable", "record", entry.name, entry.canonical.message));
  }
  if (entry.result.kind === "valid") {
    if (entry.liveness === "dead") {
      output.push(diagnostic("lease-dead", "record", entry.name, "Record lease is dead"));
    } else if (entry.liveness === "unknown") {
      output.push(diagnostic("lease-unknown", "record", entry.name, "Record lease cannot be verified"));
    }
    return output;
  }
  if (entry.result.kind === "unsupported") {
    output.push(diagnostic("unsupported-version", "record", entry.name, "Record schema version is unsupported"));
    return output;
  }
  const message = "message" in entry.result ? entry.result.message : `Record is ${entry.result.kind}`;
  output.push(diagnostic("record-malformed", "record", entry.name, message));
  return output;
}

function identityKey(identity: LocusIdentityV1): string {
  return `${identity.kind}\0${identity.key}\0${identity.claimId}`;
}

function identityDiagnosticMessage(
  value: Extract<TransientIdentitySnapshot, { kind: "complete" }>["diagnostics"][number],
): string {
  if ("message" in value) return value.message;
  if (value.kind === "oversized") return `Identity entry declares ${value.declaredBytes} bytes`;
  if (value.kind === "unknown-version") return `Identity entry has unknown version: ${String(value.version)}`;
  return `Identity key does not match slug: ${value.slug}`;
}

function diagnostic(
  code: LocusDiagnosticV1["code"],
  kind: LocusDiagnosticV1["source"]["kind"],
  key: string,
  message: string,
): LocusDiagnosticV1 {
  return { code, source: { kind, key }, message: message.slice(0, 4096) || code };
}

function compareRows(left: ProvisionalLocusRow, right: ProvisionalLocusRow): number {
  const leftIdentityOnly = left.kind === "identity-only";
  const rightIdentityOnly = right.kind === "identity-only";
  if (leftIdentityOnly !== rightIdentityOnly) return leftIdentityOnly ? 1 : -1;
  if (leftIdentityOnly && rightIdentityOnly) {
    return compareUtf8(
      `${left.identity?.kind ?? ""}\0${left.identity?.key ?? ""}`,
      `${right.identity?.kind ?? ""}\0${right.identity?.key ?? ""}`,
    );
  }
  return compareUtf8(rowSortKey(left), rowSortKey(right));
}

function rowSortKey(row: ProvisionalLocusRow): string {
  return row.checkoutPath ?? row.recordId ?? row.diagnostics[0]?.source.key ?? "";
}

function uniqueSortedDiagnostics(values: readonly LocusDiagnosticV1[]): LocusDiagnosticV1[] {
  const unique = new Map<string, LocusDiagnosticV1>();
  for (const value of values) {
    const key = `${value.code}\0${value.source.kind}\0${value.source.key}`;
    if (!unique.has(key)) unique.set(key, value);
  }
  return [...unique.values()].sort((left, right) =>
    compareUtf8(left.code, right.code)
    || compareUtf8(left.source.kind, right.source.kind)
    || compareUtf8(left.source.key, right.source.key));
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
