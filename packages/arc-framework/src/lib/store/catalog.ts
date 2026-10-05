/** Role-based record identities shared by every store implementation. */

/** Storage grouping identifiers, independent of projected filenames. */
export const FAMILY_IDS = [
  "work-item", "cohort", "project-inbox", "review", "project-registry", "lineage", "personal", "claims",
  "project-vector", "user-vector", "user-configuration", "project-machinery", "constitution",
] as const;
/** One registered storage grouping. */
export type FamilyId = typeof FAMILY_IDS[number];

/** The owner namespace a record belongs to. */
export type OwnerType = "work-item" | "cohort" | "project" | "person";
/** The shape of a record's within-owner key. */
export type KeyShape = "name" | "path" | "slug" | "id" | "pass";

const singleton = <T extends OwnerType>(owner: T) => ({ owner, key: null });
const keyed = <T extends OwnerType, K extends KeyShape>(owner: T, key: K) => ({ owner, key });

/** Record cardinality and ownership; all reference constructors derive from this data. */
export const KIND_SHAPES = {
  "work-item/meta": singleton("work-item"),
  "work-item/task-list": singleton("work-item"),
  "work-item/record": singleton("work-item"),
  "work-item/draft": singleton("work-item"),
  "work-item/spec": singleton("work-item"),
  "work-item/notes": singleton("work-item"),
  "work-item/companion": keyed("work-item", "name"),
  "work-item/description": singleton("work-item"),
  "work-item/inbound": singleton("work-item"),
  "cohort/document": singleton("cohort"),
  "project-inbox/inbox": singleton("project"),
  "review/candidate": singleton("work-item"),
  "review/integration-boundary": singleton("work-item"),
  "review/evidence": keyed("work-item", "id"),
  "review/outcome": keyed("work-item", "id"),
  "review/terminus": keyed("work-item", "id"),
  "review/adversarial-pass": keyed("work-item", "pass"),
  "project-registry/identity": singleton("project"),
  "project-registry/counter": keyed("project", "name"),
  "lineage/transition": singleton("work-item"),
  "personal/inbox": singleton("person"),
  "personal/working-memory": singleton("person"),
  "personal/document": keyed("person", "path"),
  "personal/errand-queue": singleton("person"),
  "personal/session-context": keyed("person", "slug"),
  "claims/groom": keyed("person", "slug"),
  "claims/housekeep": keyed("person", "slug"),
  "project-machinery/prose": keyed("project", "path"),
  "constitution/prose": keyed("project", "path"),
  "work-item/conflict-record": keyed("work-item", "id"),
  "cohort/conflict-record": keyed("cohort", "id"),
  "project-inbox/conflict-record": keyed("project", "id"),
  "review/conflict-record": keyed("work-item", "id"),
  "project-registry/conflict-record": keyed("project", "id"),
  "lineage/conflict-record": keyed("work-item", "id"),
  "personal/conflict-record": keyed("person", "id"),
  "claims/conflict-record": keyed("person", "id"),
  "project-machinery/conflict-record": keyed("project", "id"),
  "constitution/conflict-record": keyed("project", "id"),
  "project-inbox/routing-receipt": keyed("project", "id"),
  "personal/routing-receipt": keyed("person", "id"),
} as const;
/** A family-qualified record role. */
export type KindId = keyof typeof KIND_SHAPES;
/** A kind storing several records per owner. */
export type KeyedKindId = { [K in KindId]: typeof KIND_SHAPES[K]["key"] extends null ? never : K }[KindId];
/** A kind storing exactly one record per owner. */
export type SingletonKindId = Exclude<KindId, KeyedKindId>;

/** Return the storage grouping of a qualified role.
 * @param kind - Registered record role.
 * @returns Its owning storage family.
 */
export function familyOf(kind: KindId): FamilyId {
  return kind.split("/")[0] as FamilyId;
}
