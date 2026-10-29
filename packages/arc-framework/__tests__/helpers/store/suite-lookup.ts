/** every logical lookup, including repository-qualified exact-SHA precedence. */

import { expect } from "vitest";
import { LinksSchema, OwnerIdentitySchema, RecordReferenceSchema, singletonReference, type Links } from "../../../src/lib/store/index.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { assertion, seed, success, testProvenance, update, type SuiteContext } from "./suite-tools.js";
import type { ConformanceFixture } from "./fixture-contract.js";

async function retireRenamed(fixture: ConformanceFixture, name: string, withDraft = false) {
  const work = await seed(fixture, fixture.reference("work-item/meta"));
  const renamed = RecordReferenceSchema.parse({ ...work.reference, owner: { ...work.reference.owner, name } });
  success(await fixture.store.write({ ...update(fixture, work), reference: renamed }));
  const current = success(await fixture.store.read({ reference: renamed }));
  const draft = withDraft ? await seed(fixture, singletonReference(current.reference.owner, "work-item/draft")) : undefined;
  const lineage = await seed(fixture, singletonReference(current.reference.owner, "lineage/transition"));
  success(await fixture.store.write({ action: "remove", reference: current.reference, expected: current.version, provenance: testProvenance }));
  return { work, lineage, draft };
}

async function checkDirectAliasBoundary(fixture: ConformanceFixture, operation: "read" | "list" | "write" | "saved-read", synced: boolean) {
  const { work, lineage, draft } = await retireRenamed(fixture, "renamed-terminal", true);
  if (draft === undefined) throw Error("Expected associated draft.");
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: work.reference.owner.name });
  const reference = singletonReference(owner, "work-item/draft");
  const store = synced ? fixture.remote(true) : fixture.store;
  if (store === undefined) throw Error("Expected a remote fixture.");
  if (synced) success(await fixture.store.push());
  const saved = success(await store.version());
  if (operation === "read") expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  else if (operation === "list") expect(success(await store.list({ family: "work-item", owner })).status).toBe("absent");
  else if (operation === "saved-read") expect(await store.read({ reference: singletonReference(owner, "lineage/transition"), asOf: saved }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  else {
    const original = await store.read({ reference: draft.reference });
    if (original.status === "refused") expect(original.refusal.code).toBe("not-found");
    expect(await store.write({ ...update(fixture, draft), reference })).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
    expect(await store.read({ reference: draft.reference })).toEqual(original);
  }
  expect(success(await store.version())).toBe(saved);
  expect(success(await store.lookup({ kind: "lineage", origin: work.reference.owner.name })).reference).toEqual(lineage.reference);
}

/** Register slug, origin, claim, commit and ref resolution through caller-written links.
 * @param context - Backend registration context.
 */
export function registerLookupAssertions(context: SuiteContext): void {
  for (const synced of [false, true]) for (const operation of ["read", "list", "write", "saved-read"] as const) assertion(context, "lineage",
    `terminal-alias-lookup-only:${operation}:${synced ? "synced" : "local"}`, fixture => checkDirectAliasBoundary(fixture, operation, synced));
  assertion(context, "lineage", "terminal-origin-former-slug-lookup", async fixture => {
    const { work, lineage } = await retireRenamed(fixture, "renamed-terminal");
    expect(success(await fixture.reopen().lookup({ kind: "lineage", origin: work.reference.owner.name })).reference).toEqual(lineage.reference);
  });
  assertion(context, "lineage", "terminal-origin-former-slug-ambiguity", async fixture => {
    const first = await retireRenamed(fixture, "first-terminal");
    const second = await retireRenamed(fixture, "second-terminal");
    expect(await fixture.store.lookup({ kind: "lineage", origin: first.work.reference.owner.name })).toMatchObject({
      status: "refused", refusal: { code: "ambiguous-match", candidates: expect.arrayContaining([first.lineage.reference, second.lineage.reference]) },
    });
  });
  for (const identity of ["current-name", "UID"] as const) assertion(context, "lineage", `terminal-origin-${identity}-after-name-reuse`, async fixture => {
    const first = await retireRenamed(fixture, "first-terminal");
    const current = await seed(fixture, fixture.reference("work-item/meta"));
    const latest = await seed(fixture, singletonReference(current.reference.owner, "lineage/transition"));
    success(await fixture.store.write({ action: "remove", reference: current.reference, expected: current.version, provenance: testProvenance }));
    const owner = first.work.reference.owner;
    if (owner.type !== "work-item" || owner.uid === undefined) throw Error("Expected a stored generation.");
    const origin = identity === "UID" ? owner.uid : owner.name;
    expect(success(await fixture.store.lookup({ kind: "lineage", origin })).reference)
      .toEqual(identity === "UID" ? first.lineage.reference : latest.reference);
  });
  assertion(context, "work-item", "current-slug", async (fixture) => {
    const record = await seed(fixture, fixture.reference("work-item/meta"));
    expect(success(await fixture.store.lookup({ kind: "slug", slug: record.reference.owner.name })).reference).toEqual(record.reference);
  });
  assertion(context, "work-item", "former-slug-after-rename", async (fixture) => {
    const record = await seed(fixture, fixture.reference("work-item/meta"));
    const renamed = RecordReferenceSchema.parse({ ...record.reference, owner: OwnerIdentitySchema.parse({ ...record.reference.owner, name: "renamed-item" }) });
    success(await fixture.store.write({ ...update(fixture, record), reference: renamed }));
    for (const slug of [record.reference.owner.name, renamed.owner.name]) expect(success(await fixture.store.lookup({ kind: "slug", slug })).reference).toEqual(renamed);
  });
  assertion(context, "work-item", "slug-held-only-by-a-cohort-not-found", async (fixture) => {
    const cohort = await seed(fixture, fixture.reference("cohort/document"));
    expect(await fixture.store.lookup({ kind: "slug", slug: cohort.reference.owner.name }))
      .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }, context.registration.declarations.families.includes("cohort") ? undefined : "No cohort is served to hold the name.");
  assertion(context, "lineage", "terminal-transition-after-primary-removal", async (fixture) => {
    const work = await seed(fixture, fixture.reference("work-item/meta"));
    const reference = singletonReference(work.reference.owner, "lineage/transition");
    const transition = await seed(fixture, reference);
    success(await fixture.store.write({ action: "remove", reference: work.reference, expected: work.version, provenance: testProvenance }));
    expect(await fixture.store.read({ reference: work.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await fixture.store.read({ reference: transition.reference })).placement).toBeUndefined();

  });
  for (const identity of ["slug", "UID"] as const) assertion(context, "lineage", `terminal-origin-${identity}-lookup`, async (fixture) => {
    const work = await seed(fixture, fixture.reference("work-item/meta"));
    const transition = await seed(fixture, singletonReference(work.reference.owner, "lineage/transition"));
    success(await fixture.store.write({ action: "remove", reference: work.reference, expected: work.version, provenance: testProvenance }));
    if (work.reference.owner.type === "person") throw new Error("Expected work-item origin");
    const origin = identity === "slug" ? work.reference.owner.name : work.reference.owner.uid;
    if (!origin) throw new Error("Expected minted origin UID");
    expect(success(await fixture.store.lookup({ kind: "lineage", origin })).reference).toEqual(transition.reference);
  });
  assertion(context, "work-item", "held-here-unsupported-remedy", async (fixture) => {
    await seed(fixture, fixture.reference("work-item/meta"));
    expect(await fixture.store.list({ family: "work-item", filter: { heldHere: true } })).toMatchObject({ status: "refused", refusal: {
      code: "unsupported", case: "held-here", class: "recoverable", remedy: { text: expect.stringMatching(/lookup|without/u) },
    } });
    expect(success(await fixture.store.list({ family: "work-item", kind: "work-item/meta" })).status).toBe("complete");
  });
  assertion(context, "work-item", "checkout-work-unit-claim", async (fixture) => {
    const record = await seed(fixture, fixture.reference("work-item/meta"));
    expect(success(await fixture.store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: record.reference.owner.name, ...("uid" in record.reference.owner && record.reference.owner.uid !== undefined ? { uid: record.reference.owner.uid } : {}) } })).reference).toEqual(record.reference);
  });
  for (const kind of ["work-item/record", "claims/groom", "claims/housekeep"] as const) assertion(context, kind.startsWith("claims/") ? "claims" : "work-item", `checkout-claim:${kind}`, async (fixture) => {
    const record = await seed(fixture, fixture.reference(kind));
    const claimKind = kind === "work-item/record" ? "errand" : kind === "claims/groom" ? "groom" : "housekeep";
    const slug = SlugSchema.parse(claimKind === "errand" ? record.reference.owner.name : String(record.reference.key));
    expect(success(await fixture.store.lookup({ kind: "claim", claim: { kind: claimKind, slug, claimId: "1".repeat(32) } })).reference).toEqual(record.reference);
  });
  assertion(context, "work-item", "commit-exact-SHA-before-copy-key-and-all-task-captures", async (fixture) => {
    const repository = "repo";
    const sha = "a".repeat(40), reapplied = "b".repeat(40), copyKey = `v1:${"c".repeat(64)}:${"f".repeat(64)}`, landing = "d".repeat(40);
    const record = await seed(fixture, fixture.reference("work-item/meta"), undefined, { kind: "active" }, {
      branches: [{ repository, ref: "feat/example", linkedAs: "created", excluded: [] }], landingCommit: { repository, sha: landing },
      taskCaptures: { "1.1": [{ repository, sha, copyKey }], "1.2": [{ repository, sha, copyKey }], "1.3": [{ repository, sha: reapplied, copyKey }] },
    });
    expect(success(await fixture.store.lookup({ kind: "commit", repository, sha, copyKey }))).toEqual({ reference: record.reference, taskIds: ["1.1", "1.2"] });
    expect(success(await fixture.store.lookup({ kind: "commit", repository, sha: reapplied, copyKey }))).toEqual({ reference: record.reference, taskIds: ["1.3"] });
    expect(success(await fixture.store.lookup({ kind: "commit", repository, sha: "e".repeat(40), copyKey }))).toEqual({ reference: record.reference, taskIds: ["1.1", "1.2", "1.3"] });
    expect(success(await fixture.store.lookup({ kind: "commit", repository, sha: landing }))).toEqual({ reference: record.reference, taskIds: [] });
    expect(await fixture.store.lookup({ kind: "commit", repository, sha: "e".repeat(40),
      copyKey: `v1:${"0".repeat(64)}:${"1".repeat(64)}` })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await fixture.store.lookup({ kind: "ref", repository, ref: "feat/example" })).reference).toEqual(record.reference);
    expect(await fixture.store.lookup({ kind: "commit", repository: "wrong-repo", sha })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
  assertion(context, "work-item", "commit-captures-independent-repository-and-optional-link-removal", async (fixture) => {
    const repository = "repo", other = "other-repo";
    const sha = "a".repeat(40), copyKey = `v1:${"b".repeat(64)}:${"f".repeat(64)}`, landing = "c".repeat(40), missing = "d".repeat(40);
    const links = LinksSchema.parse({ landingCommit: { repository, sha: landing }, taskCaptures: {
      "1.1": [{ repository, sha, copyKey }], "1.2": [{ repository, sha: missing, copyKey }],
      "2.1": [{ repository: other, sha, copyKey }],
    } });
    let record = await seed(fixture, fixture.reference("work-item/meta"), undefined, { kind: "active" }, links);
    const check = async () => {
      expect(success(await fixture.store.lookup({ kind: "commit", repository, sha, copyKey })))
        .toEqual({ reference: record.reference, taskIds: ["1.1"] });
      expect(success(await fixture.store.lookup({ kind: "commit", repository: other, sha, copyKey })))
        .toEqual({ reference: record.reference, taskIds: ["2.1"] });
      expect(success(await fixture.store.lookup({ kind: "commit", repository, sha: "e".repeat(40), copyKey })))
        .toEqual({ reference: record.reference, taskIds: ["1.1", "1.2"] });
      expect(success(await fixture.store.lookup({ kind: "commit", repository, sha: landing })))
        .toEqual({ reference: record.reference, taskIds: [] });
      expect(await fixture.store.lookup({ kind: "commit", repository: "wrong-repo", sha, copyKey }))
        .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    };
    await check();
    success(await fixture.store.write({ ...update(fixture, record), links: { ...links,
      branches: [{ repository: "unrelated-repo", ref: "feat/optional", linkedAs: "created" as const, excluded: [] }], changeRequest: { repository: "unrelated-repo", number: 1 } } }));
    record = success(await fixture.store.read({ reference: record.reference }));
    await check();
    success(await fixture.store.write({ ...update(fixture, record), links }));
    record = success(await fixture.reopen().read({ reference: record.reference }));
    expect(record.links).toEqual(links);
    await check();
    expect(await fixture.store.lookup({ kind: "ref", repository: "unrelated-repo", ref: "feat/optional" }))
      .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
  assertion(context, "work-item", "commit-unqualified-capture-non-mutating-refusal-and-repair", async (fixture) => {
    const record = await seed(fixture, fixture.reference("work-item/meta"));
    const sha = "a".repeat(40), repository = "repo";
    const before = await fixture.settle();
    const history = success(await fixture.store.history({ reference: record.reference }));
    for (const links of [{ landingCommit: { sha } }, { taskCaptures: { "1.1": [{ sha }] } }]) {
      expect(await fixture.store.write({ ...update(fixture, record), links: links as unknown as Links }))
        .toMatchObject({ status: "refused", refusal: { code: "record-malformed", class: "recoverable", remedy: { text: expect.any(String) } } });
      expect(await fixture.settle()).toBe(before);
      expect(success(await fixture.store.read({ reference: record.reference }))).toEqual(record);
      expect(success(await fixture.store.history({ reference: record.reference }))).toEqual(history);
    }
    const repaired = LinksSchema.parse({ landingCommit: { repository, sha }, taskCaptures: { "1.1": [{ repository, sha }] } });
    success(await fixture.store.write({ ...update(fixture, record), links: repaired }));
    expect(success(await fixture.store.lookup({ kind: "commit", repository, sha })))
      .toEqual({ reference: record.reference, taskIds: ["1.1"] });
  });
  assertion(context, "work-item", "missing-lookup-names-request", async (fixture) => {
    const lookup = { kind: "slug" as const, slug: SlugSchema.parse("missing-name") };
    expect(await fixture.store.lookup(lookup)).toMatchObject({ status: "refused", refusal: { code: "not-found", lookup, remedy: { text: expect.stringContaining("lookup") } } });
    expect(await fixture.store.lookup({ kind: "claim", claim: { kind: "partial-errand", slug: SlugSchema.parse("partial"), claimId: null } }))
      .toMatchObject({ status: "refused", refusal: { code: "not-found", condition: expect.stringMatching(/no stored record|no tracked record|keeps no record/iu) } });
  });
}
