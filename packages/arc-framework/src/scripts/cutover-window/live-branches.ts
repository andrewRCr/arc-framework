/** Derive the window's live branch membership from import composition and acquired identity records. */
import { z } from "zod";
import type { ProjectReadinessRecord } from "../../lib/status/project-view.js";
import type { InFlightBranchProvenance } from "../../lib/git/in-flight-derivation.js";
import type { ComposedLifecycleSlugQuality } from "../../lib/work-unit/composed-lifecycle-index.js";
import type { RegisteredWorktree } from "../../lib/git/worktree-roster.js";
import type { WindowTransientRecord } from "./transients.js";
import { TransientIdentityRecordSchema } from "../../lib/errand/identity-record.js";

const oid = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
/** Recorded local and fetched coordinates, retaining why the branch belongs to the window. */
export const WindowLiveBranchSchema = z.strictObject({ local: oid.nullable(), origin: oid.nullable(), reasons: z.array(z.string().min(1)).min(1) });
/** One live branch's immutable check-time observations. */
export type WindowLiveBranch = z.infer<typeof WindowLiveBranchSchema>;
/** The public composition fields membership consumes, without requiring unused enrichment. */
export interface WindowLiveComposition {
  recordsBySlug: ReadonlyMap<string, { selected: Pick<ProjectReadinessRecord, "location"> }>;
  provenanceBySlug?: ReadonlyMap<string, readonly Pick<InFlightBranchProvenance, "branch" | "ref">[]>;
  qualityFacts: { bySlug: ReadonlyMap<string, Pick<ComposedLifecycleSlugQuality, "warnings">> };
}
/** One acquired observation basis for branch membership. */
export interface WindowLiveBranchInput {
  composition: WindowLiveComposition; checkouts: readonly Pick<RegisteredWorktree, "path" | "branch">[];
  identities: readonly { side: "local" | "origin"; records: readonly WindowTransientRecord[] }[];
  local: Readonly<Record<string, string>>; origin: Readonly<Record<string, string>>;
}

/** Retain every registered, composed live-unit, and ordinary Errand branch with both observed tips. */
export function deriveWindowLiveBranches(input: WindowLiveBranchInput): Record<string, WindowLiveBranch> {
  const reasons = new Map<string, Set<string>>();
  for (const checkout of input.checkouts) {
    if (checkout.branch !== null) addReason(reasons, checkout.branch, `Checkout ${checkout.path}`);
  }
  for (const [slug, record] of input.composition.recordsBySlug) {
    if (record.selected.location !== "completed") addUnitReasons(reasons, input.composition, slug);
  }
  addErrandReasons(reasons, input.identities);
  return Object.fromEntries([...reasons].sort(([left], [right]) => left === right ? 0 : left < right ? -1 : 1)
    .map(([branch, causes]) => [branch, { local: branchTip(input.local, branch), origin: branchTip(input.origin, branch), reasons: [...causes].sort() }]));
}

function branchTip(tips: Readonly<Record<string, string>>, branch: string): string | null {
  return Object.hasOwn(tips, branch) ? tips[branch] ?? null : null;
}

function addErrandReasons(reasons: Map<string, Set<string>>, identities: WindowLiveBranchInput["identities"]): void {
  for (const input of identities) {
    for (const entry of input.records) {
      if (entry.reference.kind !== "work-item/record") continue;
      const value: unknown = JSON.parse(entry.content);
      const record = TransientIdentityRecordSchema.parse(value);
      if (record.kind !== "errand" || record.purpose !== "errand") continue;
      addReason(reasons, record.branch, `Errand ${record.slug} (${input.side} ${entry.ref})`);
    }
  }
}

function addUnitReasons(reasons: Map<string, Set<string>>, composition: WindowLiveComposition, slug: string): void {
  const copies = composition.provenanceBySlug?.get(slug) ?? [];
  if (copies.length > 0) {
    for (const copy of copies) addReason(reasons, copy.branch, `Work unit ${slug}: ${copy.ref}`);
    return;
  }
  for (const warning of composition.qualityFacts.bySlug.get(slug)?.warnings ?? []) {
    if (warning.branch !== undefined && (warning.code === "stale-location-dropped" || warning.code === "stale-location-shadow")) {
      addReason(reasons, warning.branch, `Work unit ${slug}: stale branch copy`);
    }
  }
}

function addReason(reasons: Map<string, Set<string>>, branch: string, reason: string): void {
  const causes = reasons.get(branch) ?? new Set<string>();
  causes.add(reason); reasons.set(branch, causes);
}
