/** Strict migration-ledger contracts and class-aware proof digests. */

import { z } from "zod";

import { digestBytes, sortByCanonicalBytes } from "../canonical/canonical-json.js";
import { canonicalJson, digestCanonicalJson } from "./canonical.js";
import { CouplingAuditValidationError } from "./contracts.js";
import type { CouplingClassInventory } from "./types.js";

/** Frozen digest of the historical coupling-audit result that selected the migration classes. */
export const HISTORICAL_LAYOUT_RESULT_DIGEST =
  "8ff94473a49cb4a55ba79626d27c9e420770cf6a329e63ac95b332f47cc9956c";

/** Fixed layout-class universe certified by the migration ledger. */
export const LAYOUT_MIGRATION_CLASS_IDS = [
  "arc-root",
  "active-placement",
  "planned-placement",
  "completed-placement",
  "meta-prefix",
  "draft-prefix",
  "spec-prefix",
  "tasks-prefix",
  "notes-prefix",
  "method-root",
  "workflow-root",
  "roadmap-name",
  "session-notes-name",
  "working-memory-name",
  "template-suffix",
] as const;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const NonBlankStringSchema = z.string().refine((value) => value.trim() !== "", "expected a non-blank string");
const KebabIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);

/** Closed selected-class identity. */
export const LayoutMigrationClassIdSchema = z.enum(LAYOUT_MIGRATION_CLASS_IDS);
export type LayoutMigrationClassId = z.infer<typeof LayoutMigrationClassIdSchema>;

/** Closed residual disposition vocabulary. */
export const LayoutMigrationDispositionSchema = z.enum([
  "layout-definition",
  "root-only-owner",
  "pre-resolved-path",
  "semantic-policy-owner",
  "scanner-false-positive",
  "independent-evidence",
  "external-owner",
]);
export type LayoutMigrationDisposition = z.infer<typeof LayoutMigrationDispositionSchema>;

export const LayoutMigrationPredicateSchema = z.strictObject({
  field: z.enum(["classId", "path", "token", "surfaceKind", "locus", "idiom", "vectorId"]),
  operator: z.enum(["equals", "in", "prefix"]),
  values: z.array(NonBlankStringSchema).min(1),
}).superRefine((predicate, context) => {
  if (new Set(predicate.values).size !== predicate.values.length) {
    context.addIssue({ code: "custom", path: ["values"], message: "duplicate values are not canonical" });
  }
  if (predicate.operator === "equals" && predicate.values.length !== 1) {
    context.addIssue({ code: "custom", path: ["values"], message: "equals requires exactly one value" });
  }
});

export const LayoutMigrationExactDispositionSchema = z.strictObject({
  classId: LayoutMigrationClassIdSchema,
  evidenceDigest: Sha256Schema,
  disposition: LayoutMigrationDispositionSchema,
  owner: NonBlankStringSchema,
  reason: NonBlankStringSchema,
});

export const LayoutMigrationBulkDispositionSchema = z.strictObject({
  id: KebabIdSchema,
  predicate: LayoutMigrationPredicateSchema,
  memberSetDigest: Sha256Schema,
  disposition: LayoutMigrationDispositionSchema,
  owner: NonBlankStringSchema,
  reason: NonBlankStringSchema,
});

const SelectedClassIdsSchema = z.tuple(LAYOUT_MIGRATION_CLASS_IDS.map((classId) => z.literal(classId)) as [
  z.ZodLiteral<"arc-root">,
  z.ZodLiteral<"active-placement">,
  z.ZodLiteral<"planned-placement">,
  z.ZodLiteral<"completed-placement">,
  z.ZodLiteral<"meta-prefix">,
  z.ZodLiteral<"draft-prefix">,
  z.ZodLiteral<"spec-prefix">,
  z.ZodLiteral<"tasks-prefix">,
  z.ZodLiteral<"notes-prefix">,
  z.ZodLiteral<"method-root">,
  z.ZodLiteral<"workflow-root">,
  z.ZodLiteral<"roadmap-name">,
  z.ZodLiteral<"session-notes-name">,
  z.ZodLiteral<"working-memory-name">,
  z.ZodLiteral<"template-suffix">,
]);

/** Source digests and selected-hit evidence bound by a version-1 ledger. */
export const LayoutMigrationLedgerSourceV1Schema = z.strictObject({
  historicalResultDigest: Sha256Schema,
  manifestDigest: Sha256Schema,
  corpusFilesDigest: Sha256Schema,
  classInventoryDigest: Sha256Schema,
  selectedClassIds: SelectedClassIdsSchema,
  selectedHitCount: z.number().int().nonnegative(),
  selectedHitSetDigest: Sha256Schema,
});

/** Strict version-1 layout migration ledger. */
export const LayoutMigrationLedgerV1Schema = z.strictObject({
  version: z.literal(1),
  source: LayoutMigrationLedgerSourceV1Schema,
  exact: z.array(LayoutMigrationExactDispositionSchema),
  bulk: z.array(LayoutMigrationBulkDispositionSchema),
}).superRefine((ledger, context) => {
  const exact = new Set<string>();
  ledger.exact.forEach((entry, index) => {
    const key = JSON.stringify([entry.classId, entry.evidenceDigest]);
    if (exact.has(key)) {
      context.addIssue({ code: "custom", path: ["exact", index], message: "duplicate exact hit key" });
    }
    exact.add(key);
  });
  const bulkIds = new Set<string>();
  ledger.bulk.forEach((entry, index) => {
    if (bulkIds.has(entry.id)) {
      context.addIssue({ code: "custom", path: ["bulk", index, "id"], message: "duplicate bulk ID" });
    }
    bulkIds.add(entry.id);
  });
});

export type LayoutMigrationLedgerV1 = z.infer<typeof LayoutMigrationLedgerV1Schema>;
export type LayoutMigrationExactDisposition = z.infer<typeof LayoutMigrationExactDispositionSchema>;
export type LayoutMigrationBulkDisposition = z.infer<typeof LayoutMigrationBulkDispositionSchema>;
export type LayoutMigrationPredicate = z.infer<typeof LayoutMigrationPredicateSchema>;
export type LayoutHitKey = readonly [LayoutMigrationClassId, string];

export interface LayoutMigrationAssertionResult {
  selectedHitCount: number;
  selectedHitSetDigest: string;
  classes: Array<{ classId: LayoutMigrationClassId; hitCount: number; owners: Array<{ owner: string; count: number }> }>;
}

/** Hash canonical class-inventory artifact bytes, including their trailing LF. */
export function digestLayoutClassInventory(inventory: CouplingClassInventory): string {
  return digestBytes(Buffer.from(canonicalJson(inventory), "utf8")).slice("sha256:".length);
}

/**
 * Hash a non-empty set of class-aware hit keys without implicit deduplication.
 *
 * @param keys - Class ID and evidence digest tuples.
 * @returns Lowercase SHA-256 over the canonical byte-sorted tuple array.
 */
export function digestLayoutHitSet(keys: unknown): string {
  const parsed = z.array(z.tuple([LayoutMigrationClassIdSchema, Sha256Schema])).min(1).safeParse(keys);
  if (!parsed.success) {
    throw new CouplingAuditValidationError("layoutHitSet", parsed.error.issues[0]?.message ?? "invalid hit set");
  }
  const seen = new Set<string>();
  for (const key of parsed.data) {
    const identity = JSON.stringify(key);
    if (seen.has(identity)) throw new CouplingAuditValidationError("layoutHitSet", `duplicate hit key: ${identity}`);
    seen.add(identity);
  }
  return digestCanonicalJson(sortByCanonicalBytes(parsed.data));
}

function fail(path: string, detail: string): never {
  throw new CouplingAuditValidationError(`layoutMigration.${path}`, detail);
}

function predicateMatches(
  classId: LayoutMigrationClassId,
  hit: CouplingClassInventory["classes"][number]["hits"][number],
  predicate: LayoutMigrationPredicate,
): boolean {
  const value = predicate.field === "classId" ? classId : hit[predicate.field];
  if (predicate.operator === "equals") return value === predicate.values[0];
  if (predicate.operator === "in") return predicate.values.includes(value);
  return predicate.values.some((prefix) => value.startsWith(prefix));
}

/**
 * Verify source receipts and exactly-once disposition coverage for a class inventory.
 *
 * @param inventory - Canonical class inventory recomputed from the asserted corpus.
 * @param ledger - Validated migration ledger bound to the selected class universe.
 * @returns Verified hit totals and deterministic per-class owner summaries.
 */
export function assertLayoutMigrationEvidence(
  inventory: CouplingClassInventory,
  ledger: LayoutMigrationLedgerV1,
): LayoutMigrationAssertionResult {
  if (ledger.source.historicalResultDigest !== HISTORICAL_LAYOUT_RESULT_DIGEST) {
    fail("source.historicalResultDigest", "does not match the frozen historical result");
  }
  const expectedSources: Array<[string, string, string]> = [
    ["manifestDigest", ledger.source.manifestDigest, inventory.manifestDigest],
    ["corpusFilesDigest", ledger.source.corpusFilesDigest, inventory.corpus.filesDigest],
    ["classInventoryDigest", ledger.source.classInventoryDigest, digestLayoutClassInventory(inventory)],
  ];
  for (const [field, actual, expected] of expectedSources) {
    if (actual !== expected) fail(`source.${field}`, `expected ${expected}, received ${actual}`);
  }

  const selected = new Map<LayoutMigrationClassId, CouplingClassInventory["classes"][number]["hits"]>();
  for (const classId of LAYOUT_MIGRATION_CLASS_IDS) {
    const record = inventory.classes.find((entry) => entry.classId === classId);
    if (record === undefined) fail("source.selectedClassIds", `inventory is missing class ${classId}`);
    selected.set(classId, record.hits);
  }
  const hitKeys = [...selected].flatMap(([classId, hits]) => hits.map((hit) => [classId, hit.evidenceDigest] as const));
  if (ledger.source.selectedHitCount !== hitKeys.length) {
    fail("source.selectedHitCount", `expected ${hitKeys.length}, received ${ledger.source.selectedHitCount}`);
  }
  const selectedHitSetDigest = digestLayoutHitSet(hitKeys);
  if (ledger.source.selectedHitSetDigest !== selectedHitSetDigest) {
    fail("source.selectedHitSetDigest", `expected ${selectedHitSetDigest}, received ${ledger.source.selectedHitSetDigest}`);
  }

  const hitsByKey = new Map<string, { classId: LayoutMigrationClassId; hit: CouplingClassInventory["classes"][number]["hits"][number] }>();
  for (const [classId, hits] of selected) {
    for (const hit of hits) {
      const key = JSON.stringify([classId, hit.evidenceDigest]);
      if (hitsByKey.has(key)) fail("inventory", `duplicate hit key ${key}`);
      hitsByKey.set(key, { classId, hit });
    }
  }
  const owners = new Map<string, string[]>();
  const assign = (key: string, owner: string, source: string): void => {
    if (!hitsByKey.has(key)) fail(source, `does not match a selected hit: ${key}`);
    const assignments = owners.get(key) ?? [];
    assignments.push(owner);
    owners.set(key, assignments);
  };
  ledger.exact.forEach((entry, index) => {
    assign(JSON.stringify([entry.classId, entry.evidenceDigest]), entry.owner, `exact[${index}]`);
  });
  ledger.bulk.forEach((entry, index) => {
    const members = [...hitsByKey.entries()].filter(([, value]) => predicateMatches(value.classId, value.hit, entry.predicate));
    if (members.length === 0) fail(`bulk[${index}]`, "predicate matched zero selected hits");
    const memberDigest = digestLayoutHitSet(members.map(([, value]) => [value.classId, value.hit.evidenceDigest] as const));
    if (memberDigest !== entry.memberSetDigest) {
      fail(`bulk[${index}].memberSetDigest`, `expected ${memberDigest}, received ${entry.memberSetDigest}`);
    }
    for (const [key] of members) assign(key, entry.owner, `bulk[${index}]`);
  });
  for (const key of hitsByKey.keys()) {
    const assignments = owners.get(key) ?? [];
    if (assignments.length === 0) fail("coverage", `unmatched selected hit: ${key}`);
    if (assignments.length > 1) fail("coverage", `overlapping dispositions for selected hit: ${key}`);
  }

  return {
    selectedHitCount: hitKeys.length,
    selectedHitSetDigest,
    classes: LAYOUT_MIGRATION_CLASS_IDS.map((classId) => {
      const hits = selected.get(classId) ?? [];
      const counts = new Map<string, number>();
      for (const hit of hits) {
        const owner = owners.get(JSON.stringify([classId, hit.evidenceDigest]))?.[0];
        if (owner !== undefined) counts.set(owner, (counts.get(owner) ?? 0) + 1);
      }
      return {
        classId,
        hitCount: hits.length,
        owners: sortByCanonicalBytes([...counts].map(([owner, count]) => ({ owner, count }))),
      };
    }),
  };
}
