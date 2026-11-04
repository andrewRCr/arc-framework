/** Backend-neutral comparison of a pending projection view and the landed write. */
import { expect } from "vitest";
import { KIND_MECHANISMS, familyOf, RecordReferenceSchema, sameReference, type KindDefinition, type KindId, type LookupInput, type RecordReference, type StoreRecord } from "../../../src/lib/store/index.js";
import { createWriteBackAfterView } from "../../../src/lib/store/projection/after-view.js";
import { everyKind, seed, success, update, type SuiteContext } from "./suite-tools.js";

const unprojected: readonly KindId[] = ["personal/errand-queue", "project-machinery/prose", "constitution/prose"];
const projects = (kind: KindId) => KIND_MECHANISMS[kind].projection !== "never" && !unprojected.includes(kind);
const entryIds = /^[ \t]*(?:- )?_Id:_ `[0-9a-f]{8}`[ \t]*(?:\r?\n|$)/gmu;

/** Register each projecting kind's pre-write read/list/lookup agreement with its backend. */
export function registerAfterViewAssertions(context: SuiteContext): void {
  const parsers: Partial<Record<KindId, Partial<KindDefinition>>> = Object.fromEntries((Object.keys(KIND_MECHANISMS) as KindId[]).filter(projects)
    .map(kind => [kind, { parser: (content: string) => ({ success: true as const, data: { content } }) }]));
  const checked: SuiteContext = { ...context, registration: { ...context.registration,
    create: () => context.registration.create(parsers),
  } };
  everyKind(checked, "pending-view-agrees-with-landed-write", async (fixture, reference) => {
    const prior = await seed(fixture, reference);
    const other = await seed(fixture, fixture.reference("work-item/meta", "lookup"), undefined, { kind: "active" }, {
      branches: [{ repository: "repo", ref: "feat/pending-view", linkedAs: "created", excluded: [] }],
    });
    await seed(fixture, fixture.reference("lineage/transition", "lookup"));
    const content = fixture.content(prior.reference, "changed").replace(entryIds, "");
    const next = { content, fields: { content } };
    const after = createWriteBackAfterView({ before: fixture.store, reference: prior.reference, prior, next });
    const queries: LookupInput[] = [
      { kind: "slug", slug: other.reference.owner.name },
      { kind: "lineage", origin: other.reference.owner.name },
      { kind: "claim", claim: { kind: "work-unit", slug: other.reference.owner.name } },
      { kind: "ref", repository: "repo", ref: "feat/pending-view" },
    ];
    const pending = [await after.read({ reference: prior.reference }), await after.read({ reference: other.reference }),
      await after.list({ family: familyOf(prior.reference.kind) }),
      ...await Promise.all(queries.map(query => after.lookup(query)))];
    success(await fixture.store.write({ ...update(fixture, prior, content), provenance: { verb: "write-back", lifecycleAction: "edit" } }));
    const landed = [await fixture.store.read({ reference: prior.reference }), await fixture.store.read({ reference: other.reference }),
      await fixture.store.list({ family: familyOf(prior.reference.kind) }),
      ...await Promise.all(queries.map(query => fixture.store.lookup(query)))];
    expect(normalize(pending, prior.reference)).toEqual(normalize(landed, prior.reference));
  }, projects, context.registration.declarations.runsWriteChecks ? undefined : "This fixture runs no write checks.");
}

function normalize(value: unknown, written: RecordReference): unknown {
  if (typeof value === "string") return value.replace(entryIds, "");
  if (Array.isArray(value)) return value.map(each => normalize(each, written));
  if (typeof value !== "object" || value === null) return value;
  const object = value as Record<string, unknown>;
  const reference = RecordReferenceSchema.safeParse(object.reference);
  return Object.fromEntries(Object.entries(object).filter(([key]) => key !== "version" && key !== "asOf"
    && !(key === "conflicts" && reference.success && sameReference(reference.data, written)))
    .map(([key, each]) => [key, key === "records" && Array.isArray(each)
      ? (each as StoreRecord[]).filter(record => !String(record.reference.kind).endsWith("/conflict-record"))
        .sort((left, right) => JSON.stringify(left.reference).localeCompare(JSON.stringify(right.reference)))
        .map(record => normalize(record, written)) : normalize(each, written)]));
}
