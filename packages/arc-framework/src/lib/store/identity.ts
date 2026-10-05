/** Opaque owner identities, record references, and version values. */

import { z } from "zod";
import { SlugSchema, validateManagedPath } from "../kernel/index.js";
import { KIND_SHAPES, type KindId, type KeyedKindId, type SingletonKindId } from "./catalog.js";

/** Owner identity without presentation paths or former names. */
export const OwnerIdentitySchema = z.union([
  z.strictObject({ type: z.enum(["work-item", "cohort", "project"]), name: SlugSchema, uid: z.uuid().optional() }),
  z.strictObject({ type: z.literal("person"), name: SlugSchema }),
]).brand<"StoreOwnerIdentity">();
/** A validated owner handle, opaque in construction. */
export type OwnerIdentity = z.infer<typeof OwnerIdentitySchema>;
/** An opaque compare-and-swap basis; callers compare it only for equality. */
export const RecordVersionSchema = z.string().min(1).brand<"StoreRecordVersion">();
/** An opaque record version. */
export type RecordVersion = z.infer<typeof RecordVersionSchema>;
/** An opaque saved state of the whole store. */
export const StateVersionSchema = z.string().min(1).brand<"StoreStateVersion">();
/** An opaque state version. */
export type StateVersion = z.infer<typeof StateVersionSchema>;
/** Ordered format version; records without stored metadata use the initial format. */
export const FormatVersionSchema = z.number().int().positive().default(1);
/** Parsed entry identity in the managed descriptor grammar. */
export const EntryIdSchema = z.string().regex(/^[0-9a-f]{8}$/u);
/** Family-qualified role authority. */
export const KindIdSchema = z.enum(Object.keys(KIND_SHAPES) as [KindId, ...KindId[]]);

const keySchemas = {
  name: SlugSchema,
  slug: SlugSchema,
  id: z.string().min(1),
  pass: z.strictObject({ activity: z.string().min(1), number: z.number().int().positive() }),
  path: z.string().min(1).refine((value) => {
    try { validateManagedPath(value); return true; } catch { return false; }
  }, "Expected a managed relative path"),
};
/** Within-owner key; its exact shape is selected by the kind registry. */
export const RecordKeySchema = z.union([z.string().min(1), keySchemas.pass]);
/** A validated record key. */
export type RecordKey = z.infer<typeof RecordKeySchema>;

/** A reference can only name the cardinality and owner namespace its kind declares. */
export const RecordReferenceSchema = z.strictObject({
  owner: OwnerIdentitySchema,
  kind: KindIdSchema,
  key: RecordKeySchema.optional(),
}).superRefine((value, context) => {
  const shape = KIND_SHAPES[value.kind];
  if (value.owner.type !== shape.owner) context.addIssue({ code: "custom", message: "Owner namespace disagrees with kind" });
  if (shape.key === null) {
    if (value.key !== undefined) context.addIssue({ code: "custom", message: "Singleton records take no key" });
  } else if (!keySchemas[shape.key].safeParse(value.key).success) {
    context.addIssue({ code: "custom", message: "Expected the kind's declared key shape" });
  }
}).brand<"StoreRecordReference">();
/** A record reference opaque in construction, with read-only accessors. */
export type RecordReference = z.infer<typeof RecordReferenceSchema>;
/** The key accepted by one kind's constructor. */
export type KeyFor<K extends KeyedKindId> = typeof KIND_SHAPES[K]["key"] extends "pass"
  ? { activity: string; number: number } : string;
/** Per-kind reference constructor signatures. */
export type ReferenceConstructors = {
  [K in KindId]: K extends KeyedKindId
    ? (owner: OwnerIdentity, key: KeyFor<K>) => RecordReference
    : (owner: OwnerIdentity) => RecordReference;
};

/** Constructors indexed by registered role, so singleton calls cannot carry keys. */
export const recordReferences = Object.fromEntries(Object.keys(KIND_SHAPES).map((kind) => [
  kind, (owner: OwnerIdentity, key?: RecordKey) => RecordReferenceSchema.parse({ owner, kind, ...(key === undefined ? {} : { key }) }),
])) as ReferenceConstructors;

/** Build a singleton reference through its registered constructor.
 * @param owner - Validated owner identity.
 * @param kind - A single-record role.
 * @returns The validated reference.
 */
export function singletonReference(owner: OwnerIdentity, kind: SingletonKindId): RecordReference {
  return recordReferences[kind](owner);
}
/** Build a keyed reference through its declared shape.
 * @param owner - Validated owner identity.
 * @param kind - A multi-record role.
 * @param key - The role's within-owner key.
 * @returns The validated reference.
 */
export function keyedReference<K extends KeyedKindId>(owner: OwnerIdentity, kind: K, key: KeyFor<K>): RecordReference {
  return RecordReferenceSchema.parse({ owner, kind, key });
}
/** Read a reference's owner.
 * @param reference - Validated reference.
 * @returns Its owner identity.
 */
export function referenceOwner(reference: RecordReference): OwnerIdentity { return reference.owner; }
/** Read a reference's qualified role.
 * @param reference - Validated reference.
 * @returns Its kind.
 */
export function referenceKind(reference: RecordReference): KindId { return reference.kind; }
/** Read a reference's within-owner key.
 * @param reference - Validated reference.
 * @returns Its key, absent for a singleton.
 */
export function referenceKey(reference: RecordReference): RecordKey | undefined { return reference.key; }
/** Compare owner generations independently of current display names.
 * @param left - First owner.
 * @param right - Second owner.
 * @returns Whether both handles identify the same generation.
 */
export function sameOwner(left: OwnerIdentity, right: OwnerIdentity): boolean {
  if (left.type !== right.type) return false;
  if (left.type === "person" || right.type === "person") return left.name === right.name;
  return left.uid === undefined && right.uid === undefined ? left.name === right.name : left.uid === right.uid;
}

/** Compare logical references independently of owner display names.
 * @param left - First reference.
 * @param right - Second reference.
 * @returns Whether both name the same record in the same owner generation.
 */
export function sameReference(left: RecordReference, right: RecordReference): boolean {
  if (!sameOwner(left.owner, right.owner)) return false;
  const primaryRoles = ["work-item/meta", "work-item/record"];
  const uidPrimary = left.owner.type === "work-item" && left.owner.uid !== undefined
    && primaryRoles.includes(left.kind) && primaryRoles.includes(right.kind);
  if (left.kind !== right.kind && !uidPrimary) return false;
  if (typeof left.key === "object" && typeof right.key === "object") {
    return left.key.activity === right.key.activity && left.key.number === right.key.number;
  }
  return left.key === right.key;
}
