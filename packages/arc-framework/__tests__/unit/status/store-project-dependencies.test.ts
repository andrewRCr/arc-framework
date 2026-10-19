/** Unlisted dependencies resolve against exact generations before the project view classifies them. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import type { Store } from "../../../src/lib/store/contract.js";
import { OwnerIdentitySchema, RecordReferenceSchema, recordReferences } from "../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../src/lib/kernel/index.js";
import { batchLifecycleWrites } from "../../../src/lib/store/lifecycle-write.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/writer.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { testProvenance } from "../../helpers/store/suite-tools.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordV3Schema } from "../../../src/lib/errand/identity-record.js";
import { LookupInputSchema } from "../../../src/lib/store/lookup.js";
import { readLifecycleView } from "../../../src/lib/store/lifecycle-view.js";
import { selectStandingLifecycleEntries } from "../../../src/lib/status/store-project-standing.js";
import { readStoreProjectRecords } from "../../../src/lib/status/store-project-records.js";
import { resolveStoreProjectDependencies } from "../../../src/lib/status/store-project-dependencies.js";
import { composeProjectReadinessViewResult } from "../../../src/lib/status/project-view.js";

async function project(store: Store) {
  const view = lifecycleSuccess(await readLifecycleView(store));
  const selected = selectStandingLifecycleEntries(view.entries,
    view.listing.status === "complete" ? view.listing.diagnostics : []);
  const records = await readStoreProjectRecords(store, selected.entries);
  const dependencyResolutions = await resolveStoreProjectDependencies({ store, entries: view.entries,
    standingEntries: selected.entries, failClosedNames: selected.failClosedNames });
  return composeProjectReadinessViewResult({ title: "Project", records: records.records, dependencyResolutions });
}

async function lineageRenameChain(terminal: string, secondDependent = false) {
  const h = createLifecycleHarness();
  await h.seedMeta("root");
  if (terminal === "current") await h.seedMeta("current", {
    state: "Planning", currentWorkflow: "draft-design", dependsOn: ["root"],
  }, { kind: "backlog", commitment: "planned" });
  const origin = await h.seedMeta("former");
  await h.seedMeta("dependent", { state: "Planning", currentWorkflow: "draft-design", dependsOn: ["former"] },
    { kind: "backlog", commitment: "planned" });
  if (secondDependent) await h.seedMeta("other-dependent", { state: "Planning", currentWorkflow: "draft-design", dependsOn: ["former"] },
    { kind: "backlog", commitment: "planned" });
  lifecycleSuccess(await batchLifecycleWrites(h.store, [
    { action: "remove", reference: origin.reference, expected: origin.version },
    { action: "put", reference: recordReferences["lineage/transition"](origin.reference.owner), expected: null,
      content: writeLineageRecord({ schemaVersion: 2, origin: { name: SlugSchema.parse("former") }, kind: "rename",
        successors: [{ name: SlugSchema.parse("middle") }], incoming: [] }) },
  ], { verb: "rename", lifecycleAction: "rename" }));
  await h.seed(recordReferences["lineage/transition"](OwnerIdentitySchema.parse({ type: "work-item", name: "middle" })),
    writeLineageRecord({ schemaVersion: 2, origin: { name: SlugSchema.parse("middle") }, kind: "rename",
      successors: [{ name: SlugSchema.parse(terminal) }], incoming: [] }));
  return h;
}

async function retiredOriginFixture(disposition: "replace" | "drop" | "unmapped" | "abandoned" = "replace", formerAlias = false) {
  const h = createLifecycleHarness();
  let origin = await h.seedMeta(formerAlias ? "former-origin" : "origin");
  await h.seedMeta("member");
  const dependent = await h.seedMeta("dependent", { state: "Planning", currentWorkflow: "draft-design", dependsOn: [origin.reference.owner.name] },
    { kind: "backlog", commitment: "planned" });
  if (formerAlias) {
    const reference = RecordReferenceSchema.parse({ ...origin.reference, owner: { ...origin.reference.owner, name: "origin" } });
    lifecycleSuccess(await h.store.write({ action: "put", reference, expected: origin.version,
      content: origin.content.replaceAll("former-origin", "origin"), placement: { kind: "active" },
      provenance: { verb: "rename", lifecycleAction: "rename" } }));
    origin = lifecycleSuccess(await h.store.read({ reference }));
  }
  const owner = dependent.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected minted dependent");
  lifecycleSuccess(await batchLifecycleWrites(h.store, [
    { action: "remove", reference: origin.reference, expected: origin.version },
    { action: "put", reference: recordReferences["lineage/transition"](origin.reference.owner), expected: null,
      content: writeLineageRecord(disposition === "abandoned"
        ? { schemaVersion: 2, origin: { name: SlugSchema.parse("origin") }, kind: "abandon", successors: [], incoming: [] }
        : { schemaVersion: 2, origin: { name: SlugSchema.parse("origin") }, kind: "decompose",
        successors: [{ name: SlugSchema.parse("member") }], outgoing: [], incoming: disposition === "unmapped" ? [] : [{ dependent: { name: owner.name, uid: owner.uid },
          disposition: disposition === "replace" ? { kind: "replace", replacementTargets: [{ name: SlugSchema.parse("member") }] }
            : { kind: "drop", reason: "No longer needed." } }] }) },
  ], { verb: disposition === "abandoned" ? "abandon" : "decompose",
    lifecycleAction: disposition === "abandoned" ? "abandon" : "decompose" }));
  return h;
}

it("classifies a former slug against its renamed standing work unit", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("root");
  const former = await h.seedMeta("former", { state: "Planning", currentWorkflow: "draft-design", dependsOn: ["root"] },
    { kind: "backlog", commitment: "planned" });
  await h.seedMeta("dependent", { state: "Planning", currentWorkflow: "draft-design", dependsOn: ["former"] },
    { kind: "backlog", commitment: "planned" });
  const current = RecordReferenceSchema.parse({ ...former.reference, owner: { ...former.reference.owner, name: "current" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference: current, expected: former.version,
    content: former.content.replaceAll("former", "current"), placement: { kind: "backlog", commitment: "planned" },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));

  const result = await project(h.store);
  expect(result.facts.find(fact => fact.slug === "dependent")).toMatchObject({ readiness: "blocked",
    dependencySatisfaction: "unsatisfied", unsatisfiedDependencies: ["former"] });
  expect(result.markdown.split("### Depth 2")[1]).toContain("dependent");
  expect(result.markdown.split("### Depth 2")[1]).toContain("former");
  expect(result.warnings).toEqual([]);
});

it("names the Depends On edit for a dependent omitted from a cut", async () => {
  const h = await retiredOriginFixture("unmapped");
  const result = await project(h.store);
  expect(result.warnings[0]).toMatchObject({ code: "dependency-retired", workUnit: "dependent", dependency: "origin" });
  expect(result.warnings[0]?.rendered).toMatch(/no.*disposition.*dependent/iu);
  expect(result.warnings[0]?.rendered).toMatch(/edit.*Depends On/iu);
});

it("reports why a decomposed edge drops while leaving it unsatisfied until reconciliation", async () => {
  const h = await retiredOriginFixture("drop");
  const result = await project(h.store);
  expect(result.facts.find(fact => fact.slug === "dependent")).toMatchObject({ readiness: "blocked",
    dependencySatisfaction: "unsatisfied", unsatisfiedDependencies: ["origin"] });
  expect(result.warnings[0]).toMatchObject({ code: "dependency-retired", dependency: "origin" });
  expect(result.warnings[0]?.rendered).toMatch(/drop.*No longer needed/iu);
  expect(result.warnings[0]?.rendered).toContain("arc wu reconcile --apply");
});

it("reports a decomposed origin's replacements and the dependent's reconciliation route", async () => {
  const h = await retiredOriginFixture();
  const result = await project(h.store);
  expect(result.facts.find(fact => fact.slug === "dependent")).toMatchObject({ readiness: "blocked",
    dependencySatisfaction: "unsatisfied", unsatisfiedDependencies: ["origin"] });
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0]).toMatchObject({ code: "dependency-retired", workUnit: "dependent", dependency: "origin" });
  expect(result.warnings[0]?.rendered).toMatch(/decompos.*origin.*member/iu);
  expect(result.warnings[0]?.rendered).toContain("arc wu reconcile --apply");
  expect(result.warnings[0]?.rendered).toMatch(/checkout.*activat/iu);
});

it("satisfies a completed generation's former slug independently of its live namesake", async () => {
  const h = createLifecycleHarness();
  const former = await h.seedMeta("former", { state: "Shipped", currentWorkflow: null });
  const current = RecordReferenceSchema.parse({ ...former.reference, owner: { ...former.reference.owner, name: "current" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference: current, expected: former.version,
    content: former.content.replaceAll("former", "current"), placement: { kind: "active" },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const renamed = lifecycleSuccess(await h.store.read({ reference: current }));
  lifecycleSuccess(await h.store.write({ action: "put", reference: current, expected: renamed.version,
    content: renamed.content, placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  await h.seedMeta("current");
  await h.seedMeta("dependent", { state: "Planning", currentWorkflow: "draft-design", dependsOn: ["former"] },
    { kind: "backlog", commitment: "planned" });

  const result = await project(h.store);
  expect(result.facts.find(fact => fact.slug === "current")?.state).toBe("active");
  expect(result.facts.find(fact => fact.slug === "dependent")).toMatchObject({ readiness: "ready",
    dependencySatisfaction: "satisfied", unsatisfiedDependencies: [] });
  expect(result.warnings).toEqual([]);
});

it("follows a multi-hop lineage rename for classification and depth while preserving the written edge", async () => {
  const h = await lineageRenameChain("current");
  const result = await project(h.store);
  expect(result.markdown.split("### Depth 2")[1]).toContain("dependent");
  expect(result.markdown.split("### Depth 2")[1]).toContain("former");
  expect(result.facts.find(fact => fact.slug === "dependent")).toMatchObject({ readiness: "blocked",
    dependencySatisfaction: "unsatisfied", unsatisfiedDependencies: ["former"] });
  expect(result.warnings).toEqual([]);
});

it("reports a lineage rename chain with an absent terminal as dangling", async () => {
  const h = await lineageRenameChain("missing");
  const result = await project(h.store);
  expect(result.facts.find(fact => fact.slug === "dependent")).toMatchObject({ readiness: "blocked",
    dependencySatisfaction: "unsatisfied", unsatisfiedDependencies: ["former"] });
  expect(result.warnings).toMatchObject([{ code: "dangling-dependency", workUnit: "dependent", dependency: "former" }]);
});

it("terminates a lineage rename cycle with its condition and remedy in the composed view", async () => {
  const h = await lineageRenameChain("former");
  const result = await project(h.store);
  expect(result.facts.find(fact => fact.slug === "dependent")).toMatchObject({ readiness: "blocked",
    dependencySatisfaction: "unsatisfied", unsatisfiedDependencies: ["former"] });
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0]).toMatchObject({ code: "store-read-failed", workUnit: "dependent", dependency: "former" });
  const warning = result.warnings[0]?.rendered ?? "";
  expect(warning).toMatch(/rename cycle/iu);
  expect(warning).toMatch(/repair.*lineage.*retry/iu);
});

it("keeps a stub blocked on an abandoned origin and names its reconciliation", async () => {
  const h = await retiredOriginFixture("abandoned");
  const result = await project(h.store);
  expect(result.facts.find(fact => fact.slug === "dependent")).toMatchObject({ readiness: "blocked",
    dependencySatisfaction: "unsatisfied", unsatisfiedDependencies: ["origin"] });
  expect(result.warnings[0]).toMatchObject({ code: "dependency-retired", workUnit: "dependent", dependency: "origin" });
  expect(result.warnings[0]?.rendered).toMatch(/abandon.*origin/iu);
  expect(result.warnings[0]?.rendered).toContain("arc wu reconcile --apply");
});

it("authenticates a retired origin's former slug through its primary history", async () => {
  const h = await retiredOriginFixture("abandoned", true);
  const result = await project(h.store);
  expect(result.warnings[0]).toMatchObject({ code: "dependency-retired", workUnit: "dependent", dependency: "former-origin" });
  expect(result.warnings[0]?.rendered).toContain("Abandoned origin origin");
  expect(result.facts.find(fact => fact.slug === "dependent")).toMatchObject({ readiness: "blocked",
    unsatisfiedDependencies: ["former-origin"] });
});

it("retains a refused slug lookup's condition and remedy instead of calling it missing", async () => {
  const h = await lineageRenameChain("current");
  const store = Object.create(h.store) as Store;
  store.lookup = async input => input.kind === "slug" && input.slug === "former"
    ? { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "work-item",
      condition: "Slug inventory unavailable.", remedy: { text: "Restore the slug index and retry." } } }
    : h.store.lookup(input);
  const result = await project(store);
  expect(result.warnings).toEqual([{ code: "store-read-failed", workUnit: "dependent", dependency: "former",
    rendered: "Slug inventory unavailable. Restore the slug index and retry." }]);
  expect(result.facts.find(fact => fact.slug === "dependent")?.readiness).toBe("blocked");
});

it("retains a refused terminal-history read's condition and remedy", async () => {
  const h = await retiredOriginFixture("abandoned", true);
  const store = Object.create(h.store) as Store;
  store.history = async () => ({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "history",
    condition: "Terminal history unavailable.", remedy: { text: "Restore the history and retry." } } });
  const result = await project(store);
  expect(result.warnings).toEqual([{ code: "store-read-failed", workUnit: "dependent", dependency: "former-origin",
    rendered: "Terminal history unavailable. Restore the history and retry." }]);
});

it("shares one incomplete lineage observation and warns for every dependent reaching it", async () => {
  const h = await lineageRenameChain("current", true);
  const store = Object.create(h.store) as Store;
  let lineageObserved = false;
  store.list = async input => {
    if (input.family === "lineage" && !lineageObserved) {
      lineageObserved = true;
      return { status: "ok", result: { status: "unreadable", condition: "Lineage unavailable.", remedy: { text: "Restore the lineage index." } } };
    }
    return h.store.list(input);
  };
  const result = await project(store);
  expect(result.warnings.map(warning => warning.code)).toEqual(["store-read-failed", "store-read-failed"]);
  expect(result.warnings.map(warning => warning.workUnit)).toEqual(["dependent", "other-dependent"]);
  for (const warning of result.warnings) expect(warning.rendered).toMatch(/lineage.*repair.*retry/iu);
  for (const slug of ["dependent", "other-dependent"]) {
    expect(result.facts.find(fact => fact.slug === slug)?.readiness).toBe("blocked");
  }
});

it.each([false, true])("keeps a withheld meta unsatisfied without a dangling warning, former alias=%s", async alias => {
  const fixture = createReferenceFixture();
  const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "withheld" }));
  const fields = parseMetaRecord(makeMetaFixture("withheld"));
  const written = lifecycleSuccess(await fixture.store.write({ action: "put", reference, expected: null,
    content: JSON.stringify(fields), placement: { kind: "active" }, provenance: testProvenance }));
  const primary = lifecycleSuccess(await fixture.store.read({ reference: written.reference }));
  lifecycleSuccess(await fixture.store.write({ action: "put",
    reference: recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "dependent" })),
    expected: null, content: JSON.stringify({ ...parseMetaRecord(makeMetaFixture("dependent")), state: "Planning", dependsOn: ["withheld"] }),
    placement: { kind: "backlog", commitment: "planned" }, provenance: testProvenance }));
  const renamed = RecordReferenceSchema.parse({ ...primary.reference,
    owner: { ...primary.reference.owner, name: alias ? "current" : "withheld" } });
  lifecycleSuccess(await fixture.store.write({ action: "put", reference: renamed, expected: primary.version,
    content: JSON.stringify({ ...fields, state: "Unknown" }), placement: { kind: "active" }, provenance: testProvenance }));

  const result = await project(fixture.store);
  expect(result.facts.find(fact => fact.slug === "dependent")).toMatchObject({ readiness: "blocked",
    dependencySatisfaction: "unsatisfied", unsatisfiedDependencies: ["withheld"] });
  expect(result.warnings).toEqual([]);
});

it("treats an Errand slug as a dangling work-unit dependency", async () => {
  const h = createLifecycleHarness();
  const errand = TransientIdentityRecordV3Schema.parse({ version: 3, slug: "fix-it", claimId: "a".repeat(32),
    createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z", kind: "errand", purpose: "errand",
    owner: "andrew", intent: "Fix", branch: "chore/fix-it", state: "open", savedHead: null, changeRequest: null,
    origin: "description", originEntry: null });
  await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "fix-it" })),
    serializeTransientIdentityRecord(errand), { kind: "active" });
  await h.seedMeta("dependent", { state: "Planning", currentWorkflow: "draft-design", dependsOn: ["fix-it"] },
    { kind: "backlog", commitment: "planned" });
  const result = await project(h.store);
  expect(result.warnings).toMatchObject([{ code: "dangling-dependency", workUnit: "dependent", dependency: "fix-it" }]);
  expect(result.facts.find(fact => fact.slug === "dependent")?.readiness).toBe("blocked");
});

it.each(["not a slug", "missing"])("reports %s as dangling without an invalid store request", async edge => {
  const fixture = createReferenceFixture();
  lifecycleSuccess(await fixture.store.write({ action: "put", expected: null,
    reference: recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "dependent" })),
    content: JSON.stringify({ ...parseMetaRecord(makeMetaFixture("dependent")), state: "Planning", dependsOn: [edge] }),
    placement: { kind: "backlog", commitment: "planned" }, provenance: testProvenance }));
  const store = Object.create(fixture.store) as Store;
  store.lookup = input => fixture.store.lookup(LookupInputSchema.parse(input));
  const result = await project(store);
  expect(result.warnings).toMatchObject([{ code: "dangling-dependency", workUnit: "dependent", dependency: edge }]);
  expect(result.facts[0]?.readiness).toBe("blocked");
});

it("keeps a clashed slug unsatisfied with the lookup's ambiguous-match repair", async () => {
  const h = createLifecycleHarness();
  const first = await h.seedMeta("clashed");
  const other = await h.seedMeta("other");
  await h.seedMeta("dependent", { state: "Planning", currentWorkflow: "draft-design", dependsOn: ["clashed"] },
    { kind: "backlog", commitment: "planned" });
  const collided = RecordReferenceSchema.parse({ ...other.reference, owner: { ...other.reference.owner, name: "clashed" } });
  const store = Object.create(h.store) as Store;
  store.list = async input => {
    const result = await h.store.list(input);
    if (input.kind !== "work-item/meta" || result.status !== "ok" || result.result.status !== "complete") return result;
    return { status: "ok", result: { ...result.result, records: result.result.records.map(record =>
      record.reference.owner.name === "other" ? { ...record, reference: collided,
        content: record.content.replaceAll("other", "clashed") } : record) } };
  };
  store.lookup = async input => input.kind === "slug" && input.slug === "clashed"
    ? { status: "refused", refusal: { code: "ambiguous-match", class: "recoverable", candidates: [first.reference, collided],
      condition: "Two current holders match clashed.", remedy: { text: "Disambiguate the holders and retry." } } }
    : h.store.lookup(input);
  const result = await project(store);
  expect(result.warnings).toEqual([{ code: "store-read-failed", workUnit: "dependent", dependency: "clashed",
    rendered: "Two current holders match clashed. Disambiguate the holders and retry." }]);
  expect(result.facts.find(fact => fact.slug === "dependent")?.readiness).toBe("blocked");
});

it("refuses to choose between authenticated terminal holders of the same former name", async () => {
  const h = await retiredOriginFixture("abandoned", true);
  const second = await h.seedMeta("former-origin");
  const renamed = RecordReferenceSchema.parse({ ...second.reference, owner: { ...second.reference.owner, name: "second-origin" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference: renamed, expected: second.version,
    content: second.content.replaceAll("former-origin", "second-origin"), placement: { kind: "active" },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const current = lifecycleSuccess(await h.store.read({ reference: renamed }));
  lifecycleSuccess(await batchLifecycleWrites(h.store, [
    { action: "remove", reference: current.reference, expected: current.version },
    { action: "put", reference: recordReferences["lineage/transition"](current.reference.owner), expected: null,
      content: writeLineageRecord({ schemaVersion: 2, origin: { name: SlugSchema.parse("second-origin") }, kind: "abandon",
        successors: [], incoming: [], retiredBranches: [] }) },
  ], { verb: "abandon", lifecycleAction: "abandon" }));

  const result = await project(h.store);
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0]).toMatchObject({ code: "store-read-failed", workUnit: "dependent", dependency: "former-origin" });
  expect(result.warnings[0]?.rendered).toMatch(/lineage.*ambiguous.*repair.*retry/iu);
  expect(result.facts.find(fact => fact.slug === "dependent")?.readiness).toBe("blocked");
});
