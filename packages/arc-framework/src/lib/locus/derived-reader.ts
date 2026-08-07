/** Dormant worktree-first reader over one fully injected evidence snapshot. */

import type {
  IdentitySnapshotDiagnostic,
  TransientIdentitySnapshot,
} from "../errand/identity-snapshot.js";
import type {
  RegisteredWorktree,
  RegisteredWorktreeScanResult,
} from "../git/worktree-roster.js";
import type { CompletedEvidenceRead } from "../work-unit/completed-index.js";
import {
  projectActiveMetaEvidence,
  type ActiveMetaEvidence,
  type DormantMetaEvidence,
  type DormantMarkerGenerationEvidence,
  type MetaRootEvidence,
} from "./derived-lifecycle-evidence.js";
import {
  projectDerivedCheckoutRow,
  type DerivedCheckoutRow,
} from "./derived-roster.js";
import type { PrimarySafetyProjection } from "./role-derivation.js";
import type { LocusIdentityV1 } from "./schema/identity.js";
import {
  projectCheckoutSubjectMeta,
  type SubjectMetaIO,
} from "./subject-meta.js";

/** Already-read marker and active-meta evidence for one registered checkout. */
export interface DormantCheckoutReadEvidence {
  readonly checkoutPath: string;
  readonly marker: DormantMarkerGenerationEvidence;
  readonly metaRoots: readonly MetaRootEvidence[];
  readonly metas: readonly DormantMetaEvidence[];
}

/** Identity entries that do not fabricate checkout rows. */
export type DerivedIdentityDiscovery =
  | { readonly kind: "absent" }
  | { readonly kind: "error"; readonly stage: "tip" | "tree"; readonly message: string }
  | {
      readonly kind: "complete";
      readonly identities: readonly LocusIdentityV1[];
      readonly diagnostics: readonly IdentitySnapshotDiagnostic[];
    };

/** Complete dormant reader result; no selected public envelope or record fallback. */
export interface DerivedLocusRoster {
  readonly rows: readonly DerivedCheckoutRow[];
  readonly identityDiscovery: DerivedIdentityDiscovery;
}

/** Current-checkout selection over one worktree-derived roster. */
export type DerivedEnteringCheckout =
  | { readonly kind: "selected"; readonly row: DerivedCheckoutRow }
  | {
      readonly kind: "unresolved";
      readonly checkoutPath: string;
      readonly diagnostics: readonly { readonly code: string; readonly message: string }[];
    };

/** Primary allocation facts derived only from the primary checkout row. */
export type DerivedPrimaryAvailability =
  | { readonly kind: "free"; readonly checkoutPath: string }
  | {
      readonly kind: "occupied";
      readonly checkoutPath: string;
      readonly subject: Exclude<DerivedCheckoutRow["subject"], null>;
    }
  | { readonly kind: "unsafe"; readonly checkoutPath: string | null; readonly reasons: readonly string[] };

/** Build-order migration frame selected beside the retiring record-backed state. */
export interface DerivedLocusFrame {
  readonly roster: readonly DerivedCheckoutRow[];
  readonly entering: DerivedEnteringCheckout;
  readonly primaryAvailability: DerivedPrimaryAvailability;
  readonly identityDiscovery: DerivedIdentityDiscovery;
  readonly active: {
    readonly checkoutPath: string;
    readonly subject: Extract<DerivedCheckoutRow["subject"], { kind: "work-unit" }>;
    readonly context: NonNullable<DerivedCheckoutRow["context"]>;
  } | null;
}

/** Select the canonical entering checkout from one worktree-derived evidence snapshot. */
export async function readDerivedLocusFrame(
  options: Parameters<typeof readDerivedLocusRoster>[0] & { readonly enteringCheckoutPath: string },
): Promise<DerivedLocusFrame> {
  const { enteringCheckoutPath, ...rosterOptions } = options;
  const canonical = new Map<string, Promise<string>>();
  const canonicalizePath = (path: string): Promise<string> => {
    const existing = canonical.get(path);
    if (existing !== undefined) return existing;
    const pending = options.canonicalizePath(path);
    canonical.set(path, pending);
    return pending;
  };
  const enteringPath = await canonicalizePath(enteringCheckoutPath);
  const roster = await readDerivedLocusRoster({
    ...rosterOptions,
    canonicalizePath,
    strictCheckoutPath: enteringPath,
  });
  const matches = roster.rows.filter((row) => row.checkout.path === enteringPath);
  const selected = matches.length === 1 ? matches[0] : undefined;
  const entering: DerivedEnteringCheckout = selected === undefined
    ? {
        kind: "unresolved",
        checkoutPath: enteringPath,
        diagnostics: [{
          code: "entering-checkout-unavailable",
          message: `Expected one registered entering checkout; found ${matches.length}`,
        }],
      }
    : { kind: "selected", row: selected };
  const active = selected?.kind === "work-unit"
    && selected.subject.kind === "work-unit"
    && selected.context !== null
    ? {
        checkoutPath: selected.checkout.path,
        subject: selected.subject,
        context: selected.context,
      }
    : null;
  return {
    roster: roster.rows,
    entering,
    primaryAvailability: projectPrimaryAvailability(roster.rows),
    identityDiscovery: roster.identityDiscovery,
    active,
  };
}

/** Compose future derived rows from one injected topology and evidence snapshot. */
export async function readDerivedLocusRoster(options: {
  identity: string;
  identityGlobalUserDir?: string | null;
  activeExtensions?: readonly string[];
  /** Checkout whose context projection failures must remain operation-blocking. */
  strictCheckoutPath?: string;
  topology: Extract<RegisteredWorktreeScanResult, { ok: true }>;
  checkouts: readonly DormantCheckoutReadEvidence[];
  completed: CompletedEvidenceRead;
  identities: TransientIdentitySnapshot;
  primarySafety: PrimarySafetyProjection;
  canonicalizePath(path: string): Promise<string>;
  subjectMetaIO: SubjectMetaIO;
}): Promise<DerivedLocusRoster> {
  const canonicalized: Array<{
    original: RegisteredWorktree;
    checkout: RegisteredWorktree | null;
    error: string | null;
  }> = [];
  for (const checkout of options.topology.worktrees) {
    try {
      const path = await options.canonicalizePath(checkout.path);
      canonicalized.push({ original: checkout, checkout: { ...checkout, path }, error: null });
    } catch (error) {
      canonicalized.push({
        original: checkout,
        checkout: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const canonicalCounts = new Map<string, number>();
  for (const item of canonicalized) {
    if (item.checkout === null) continue;
    canonicalCounts.set(item.checkout.path, (canonicalCounts.get(item.checkout.path) ?? 0) + 1);
  }

  const rows: DerivedCheckoutRow[] = [];
  for (const item of canonicalized) {
    if (item.checkout === null) {
      rows.push(unresolvedRow(item.original, "canonical-path-unavailable", item.error ?? "Canonical path unavailable"));
      continue;
    }
    if ((canonicalCounts.get(item.checkout.path) ?? 0) > 1) {
      rows.push(unresolvedRow(item.checkout, "duplicate-checkout", "Multiple registered paths resolve to one checkout"));
      continue;
    }
    const matches = options.checkouts.filter((entry) => entry.checkoutPath === item.original.path);
    const evidence = matches[0];
    if (matches.length !== 1 || evidence === undefined) {
      rows.push(unresolvedRow(
        item.checkout,
        "checkout-evidence-unavailable",
        `Expected one injected checkout evidence entry; found ${matches.length}`,
      ));
      continue;
    }
    const expectedSubjectKey = evidence.marker.kind === "present"
      && evidence.marker.marker.createdFor.kind === "work-unit"
      ? evidence.marker.marker.createdFor.name
      : undefined;
    const activeMeta: ActiveMetaEvidence = evidence.marker.kind === "present"
      && evidence.marker.marker.createdFor.kind !== "work-unit"
      ? { kind: "absent" }
      : projectActiveMetaEvidence({
          cwd: item.original.path,
          identity: options.identity,
          candidates: evidence.metas,
          metaRoots: evidence.metaRoots,
          ...(expectedSubjectKey === undefined ? {} : { expectedSubjectKey }),
        });
    let row = projectDerivedCheckoutRow({
      checkout: item.checkout,
      marker: evidence.marker,
      activeMeta,
      completed: options.completed,
      identities: options.identities,
      primarySafety: item.checkout.primary
        ? options.primarySafety
        : { kind: "error", message: "Primary safety does not apply to linked checkouts" },
    });
    if (row.kind === "work-unit" && activeMeta.kind === "present") {
      let context: Awaited<ReturnType<typeof projectCheckoutSubjectMeta>>;
      try {
        context = await projectCheckoutSubjectMeta({
          cwd: item.original.path,
          subjectKey: activeMeta.subject.key,
          identity: options.identity,
          identityGlobalUserDir: options.identityGlobalUserDir,
          metaRoot: activeMeta.metaRoot,
          candidates: activeMeta.candidates,
          activeExtensions: options.activeExtensions ?? [],
          io: options.subjectMetaIO,
        });
      } catch (error) {
        if (options.strictCheckoutPath === undefined
          || item.checkout.path === options.strictCheckoutPath) throw error;
        rows.push({
          ...row,
          kind: "unresolved-checkout",
          context: null,
          diagnostics: [...row.diagnostics, {
            code: "subject-context-unavailable",
            message: error instanceof Error ? error.message : String(error),
          }],
        });
        continue;
      }
      row = context.kind === "resolved"
        ? { ...row, context }
        : {
            ...row,
            kind: "unresolved-checkout",
            context: null,
            diagnostics: [...row.diagnostics, { code: context.code, message: context.message }],
          };
    }
    rows.push(row);
  }
  rows.sort((left, right) => Buffer.compare(
    Buffer.from(left.checkout.path),
    Buffer.from(right.checkout.path),
  ));
  return {
    rows,
    identityDiscovery: projectIdentityDiscovery(options.identities, rows),
  };
}

function projectIdentityDiscovery(
  snapshot: TransientIdentitySnapshot,
  rows: readonly DerivedCheckoutRow[],
): DerivedIdentityDiscovery {
  if (snapshot.kind !== "complete") return snapshot;
  const consumed = new Set(rows.flatMap((row) => row.identity === null ? [] : [row.identity.key]));
  return {
    kind: "complete",
    identities: [...snapshot.projections.entries()]
      .filter(([key]) => !consumed.has(key))
      .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
      .map(([, identity]) => identity),
    diagnostics: [...snapshot.diagnostics],
  };
}

function unresolvedRow(
  checkout: RegisteredWorktree,
  code: string,
  message: string,
): DerivedCheckoutRow {
  return {
    kind: "unresolved-checkout",
    checkout: { ...checkout },
    subject: null,
    markerGeneration: null,
    parentCheckoutPath: null,
    origin: null,
    identity: null,
    context: null,
    lifecycleLocation: null,
    diagnostics: [{ code, message }],
  };
}

function projectPrimaryAvailability(rows: readonly DerivedCheckoutRow[]): DerivedPrimaryAvailability {
  const primaryRows = rows.filter((row) => row.checkout.primary);
  const primary = primaryRows.length === 1 ? primaryRows[0] : undefined;
  if (primary === undefined) {
    return {
      kind: "unsafe",
      checkoutPath: primaryRows[0]?.checkout.path ?? null,
      reasons: [`Expected one registered primary checkout; found ${primaryRows.length}`],
    };
  }
  if (primary.kind === "free-primary") {
    return { kind: "free", checkoutPath: primary.checkout.path };
  }
  if (primary.kind === "work-unit" || primary.kind === "transient" || primary.kind === "retired") {
    return { kind: "occupied", checkoutPath: primary.checkout.path, subject: primary.subject };
  }
  return {
    kind: "unsafe",
    checkoutPath: primary.checkout.path,
    reasons: primary.diagnostics.length === 0
      ? [`Primary checkout resolved as ${primary.kind}`]
      : primary.diagnostics.map((diagnostic) => diagnostic.code),
  };
}
