/** Reference lookup ranks cohort and work-item holders in one namespace. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { recordPut, batchLifecycleWrites } from "../../../../src/lib/store/lifecycle-write.js";
import { recordKey } from "../../../helpers/store/model.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";
import { seed, success, testProvenance } from "../../../helpers/store/suite-tools.js";

async function archive(h: ReturnType<typeof createLifecycleHarness>, record: StoreRecord, quarter = "2026-q4") {
  lifecycleSuccess(await h.store.write({ ...recordPut(record, { placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse(quarter) } }),
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  return lifecycleSuccess(await h.store.read({ reference: record.reference }));
}

async function errand(h: ReturnType<typeof createLifecycleHarness>, name: string, completed = true) {
  return h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name })),
    JSON.stringify({ version: 3, slug: name, claimId: "a".repeat(32), createdAt: "2026-10-19T00:00:00Z",
      updatedAt: "2026-10-19T00:00:00Z", owner: "test-user", kind: "errand", purpose: "errand", intent: "Useful work",
      branch: `chore/${name}`, origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null }),
    completed ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" });
}

async function cohort(h: ReturnType<typeof createLifecycleHarness>, name: string, completed = false) {
  const record = await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name })),
    `# Cohort: ${name}\n\n**Purpose:** Rank holders.\n`);
  if (completed) {
    const member = await h.seedMeta(`${name}-member`, { cohort: name });
    const placement = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
    lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(record, { placement }), recordPut(member, { placement })],
      { verb: "archive", lifecycleAction: "archive" }));
  }
  return record.reference;
}

it("resolves a live cohort's name to its document", async () => {
  const fixture = createReferenceFixture();
  const reference = fixture.reference("cohort/document");
  const written = lifecycleSuccess(await fixture.store.write({ action: "put", reference, expected: null,
    content: fixture.content(reference),
    provenance: { verb: "seed", lifecycleAction: "create" } }));
  expect(await fixture.store.lookup({ kind: "slug", slug: SlugSchema.parse(reference.owner.name) }))
    .toEqual({ status: "ok", result: { reference: written.reference } });
});

it("ranks a live cohort's former name above a completed work unit's current name", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("shared", {}, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const reference = await cohort(h, "renamed");
  h.store.state.records.get(recordKey(reference))!.formerSlugs.push("shared");
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") })).reference).toEqual(reference);
});

it.each([false, true])("ranks a work unit's current name above a cohort's former name (completed: %s)", async completed => {
  const h = createLifecycleHarness();
  const reference = await cohort(h, "renamed", completed);
  const meta = await h.seedMeta("shared", {}, completed
    ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" });
  h.store.state.records.get(recordKey(reference))!.formerSlugs.push("shared");
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") })).reference).toEqual(meta.reference);
});

it("ranks a live work unit above a closed cohort under the same name", async () => {
  const h = createLifecycleHarness();
  await cohort(h, "shared", true);
  const meta = await h.seedMeta("shared");
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") })).reference).toEqual(meta.reference);
});

it("refuses a live cohort and work unit under one name with both references", async () => {
  const h = createLifecycleHarness();
  const reference = await cohort(h, "shared");
  const meta = await h.seedMeta("shared");
  expect(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") })).toMatchObject({ status: "refused",
    refusal: { code: "ambiguous-match", tie: { liveness: "live", name: "current" }, candidates: expect.arrayContaining([reference, meta.reference]) } });
});

it.each(["quarter", "sequence"] as const)("selects the latest completed work unit by %s", async order => {
  const h = createLifecycleHarness();
  const first = await archive(h, await h.seedMeta("shared"));
  const second = await archive(h, await h.seedMeta("shared"), order === "quarter" ? "2026-q3" : "2026-q4");
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") })).reference)
    .toEqual(order === "quarter" ? first.reference : second.reference);
});

it("creates and resolves three completed generations under the same slug", async () => {
  const h = createLifecycleHarness();
  let latest: StoreRecord | undefined;
  for (let generation = 0; generation < 3; generation++) latest = await archive(h, await h.seedMeta("shared"));
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") })).reference).toEqual(latest?.reference);
});

it("prefers a completed work unit to a completed Errand without a sequence", async () => {
  const h = createLifecycleHarness();
  const meta = await archive(h, await h.seedMeta("shared"));
  await errand(h, "shared");
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") })).reference).toEqual(meta.reference);
});

it("selects the latest completed work unit under a shared former name", async () => {
  const h = createLifecycleHarness();
  const first = await archive(h, await h.seedMeta("first"));
  const second = await archive(h, await h.seedMeta("second"));
  for (const record of [first, second]) h.store.state.records.get(recordKey(record.reference))!.formerSlugs.push("former");
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("former") })).reference).toEqual(second.reference);
});

it("keeps completed cohort and Errand-only ties ambiguous", async () => {
  const h = createLifecycleHarness();
  const meta = await archive(h, await h.seedMeta("shared"));
  const document = await cohort(h, "shared", true);
  const first = await errand(h, "errands"), second = await errand(h, "errands");
  for (const [slug, candidates] of [["shared", [meta.reference, document]], ["errands", [first.reference, second.reference]]] as const) {
    expect(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse(slug) })).toMatchObject({ status: "refused",
      refusal: { code: "ambiguous-match", tie: { liveness: "completed", name: "current" }, candidates: expect.arrayContaining([...candidates]) } });
  }
});

const branchLinks = { branches: [{ repository: "project", ref: "topic/shared", linkedAs: "created" as const, excluded: [] }] };
const branchLookup = { kind: "ref" as const, repository: "project", ref: "topic/shared" };

it("resolves a reused branch to its live holder and retains live ambiguity", async () => {
  const h = createLifecycleHarness();
  await archive(h, await h.seedMeta("shared", {}, { kind: "active" }, branchLinks));
  const current = await h.seedMeta("shared", {}, { kind: "active" }, branchLinks);
  expect(lifecycleSuccess(await h.store.lookup(branchLookup)).reference).toEqual(current.reference);
  const other = await h.seedMeta("other", {}, { kind: "active" }, branchLinks);
  expect(await h.store.lookup(branchLookup)).toMatchObject({ status: "refused", refusal: {
    code: "ambiguous-match", tie: { liveness: "live" }, candidates: expect.arrayContaining([current.reference, other.reference]),
  } });
});

it("selects the latest completed branch holder but leaves Errand-only ties ambiguous", async () => {
  const h = createLifecycleHarness();
  await archive(h, await h.seedMeta("shared", {}, { kind: "active" }, branchLinks));
  const latest = await archive(h, await h.seedMeta("shared", {}, { kind: "active" }, branchLinks));
  expect(lifecycleSuccess(await h.store.lookup(branchLookup)).reference).toEqual(latest.reference);
  const errands = createLifecycleHarness();
  const references = [];
  for (const name of ["first", "second"]) {
    const record = await errand(errands, name);
    lifecycleSuccess(await errands.store.write({ ...recordPut(record, { links: branchLinks }), provenance: { verb: "link", lifecycleAction: "link" } }));
    references.push(record.reference);
  }
  expect(await errands.store.lookup(branchLookup)).toMatchObject({ status: "refused", refusal: {
    code: "ambiguous-match", tie: { liveness: "completed" }, candidates: expect.arrayContaining(references),
  } });
});

it.each([false, true])("names the former-name tier on a tie (completed: %s)", async completed => {
  const h = createLifecycleHarness();
  for (const name of ["first", "second"]) {
    const record = completed ? await errand(h, name) : await h.seedMeta(name);
    h.store.state.records.get(recordKey(record.reference))!.formerSlugs.push("former");
  }
  expect(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("former") })).toMatchObject({ status: "refused",
    refusal: { code: "ambiguous-match", tie: { liveness: completed ? "completed" : "live", name: "former" } } });
});

it("leaves claim, commit, and lineage ambiguity without ranked tier facts", async () => {
  const h = createLifecycleHarness();
  const links = { landingCommit: { repository: "project", sha: "a".repeat(40) } };
  await archive(h, await h.seedMeta("shared", {}, { kind: "active" }, links));
  await h.seedMeta("shared", {}, { kind: "active" }, links);
  const errands = createLifecycleHarness();
  await errand(errands, "shared"); await errand(errands, "shared");
  for (const result of await Promise.all([
    h.store.lookup({ kind: "commit", repository: "project", sha: "a".repeat(40) }),
    errands.store.lookup({ kind: "claim", claim: { kind: "errand", slug: SlugSchema.parse("shared"), claimId: "a".repeat(32) } }),
  ])) {
    expect(result).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match" } });
    if (result.status === "refused") expect(result.refusal).not.toHaveProperty("tie");
  }
  const f = createReferenceFixture();
  for (const name of ["first", "second"]) {
    const record = await seed(f, f.reference("work-item/meta"));
    const reference = { ...record.reference, owner: { ...record.reference.owner, name: SlugSchema.parse(name) } };
    success(await f.store.write({ action: "put", reference, expected: record.version, content: record.content,
      placement: { kind: "active" }, provenance: testProvenance }));
    await seed(f, recordReferences["lineage/transition"](reference.owner));
    success(await f.store.write({ action: "remove", reference, expected: success(await f.store.read({ reference })).version,
      provenance: testProvenance }));
  }
  const result = await f.store.lookup({ kind: "lineage", origin: "work-item-one" });
  expect(result).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match" } });
  if (result.status === "refused") expect(result.refusal).not.toHaveProperty("tie");
});
