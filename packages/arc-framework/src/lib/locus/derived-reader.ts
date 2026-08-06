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
  readonly metaRoots: readonly (
    { readonly kind: "listed"; readonly path: string }
    | { readonly kind: "error"; readonly path: string; readonly message: string }
  )[];
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

/** Compose future derived rows from one injected topology and evidence snapshot. */
export async function readDerivedLocusRoster(options: {
  identity: string;
  identityGlobalUserDir?: string | null;
  activeExtensions?: readonly string[];
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
    if (row.kind === "work-unit" && activeMeta.kind === "present" && activeMeta.location === "active") {
      const context = await projectCheckoutSubjectMeta({
        cwd: item.original.path,
        subjectKey: activeMeta.subject.key,
        identity: options.identity,
        identityGlobalUserDir: options.identityGlobalUserDir,
        metaRoot: activeMeta.metaRoot,
        candidates: activeMeta.candidates,
        activeExtensions: options.activeExtensions ?? [],
        io: options.subjectMetaIO,
      });
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
