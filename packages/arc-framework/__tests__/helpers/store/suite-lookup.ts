/** every logical lookup, including repository-qualified exact-SHA precedence. */

import { expect } from "vitest";
import { LinksSchema, OwnerIdentitySchema, RecordReferenceSchema, singletonReference, type Links } from "../../../src/lib/store/index.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { assertion, seed, success, testProvenance, update, type SuiteContext } from "./suite-tools.js";

/** Register slug, origin, claim, commit and ref resolution through caller-written links.
 * @param context - Backend registration context.
 */
export function registerLookupAssertions(context: SuiteContext): void {
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
    expect(success(await fixture.store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: record.reference.owner.name } })).reference).toEqual(record.reference);
  });
  for (const kind of ["work-item/record", "claims/groom", "claims/housekeep"] as const) assertion(context, kind.startsWith("claims/") ? "claims" : "work-item", `checkout-claim:${kind}`, async (fixture) => {
    const record = await seed(fixture, fixture.reference(kind));
    const claimKind = kind === "work-item/record" ? "errand" : kind === "claims/groom" ? "groom" : "housekeep";
    const slug = SlugSchema.parse(claimKind === "errand" ? record.reference.owner.name : String(record.reference.key));
    expect(success(await fixture.store.lookup({ kind: "claim", claim: { kind: claimKind, slug, claimId: "1".repeat(32) } })).reference).toEqual(record.reference);
  });
  assertion(context, "work-item", "commit-exact-SHA-before-patch-ID-and-all-task-captures", async (fixture) => {
    const repository = "repo";
    const sha = "a".repeat(40), reapplied = "b".repeat(40), patchId = "c".repeat(40), landing = "d".repeat(40);
    const record = await seed(fixture, fixture.reference("work-item/meta"), undefined, { kind: "active" }, {
      branches: [{ repository, ref: "feat/example" }], landingCommit: { repository, sha: landing },
      taskCaptures: { "1.1": [{ repository, sha, patchId }], "1.2": [{ repository, sha, patchId }], "1.3": [{ repository, sha: reapplied, patchId }] },
    });
    expect(success(await fixture.store.lookup({ kind: "commit", repository, sha, patchId }))).toEqual({ reference: record.reference, taskIds: ["1.1", "1.2"] });
    expect(success(await fixture.store.lookup({ kind: "commit", repository, sha: reapplied, patchId }))).toEqual({ reference: record.reference, taskIds: ["1.3"] });
    expect(success(await fixture.store.lookup({ kind: "commit", repository, sha: "e".repeat(40), patchId }))).toEqual({ reference: record.reference, taskIds: ["1.1", "1.2", "1.3"] });
    expect(success(await fixture.store.lookup({ kind: "commit", repository, sha: landing }))).toEqual({ reference: record.reference, taskIds: [] });
    expect(success(await fixture.store.lookup({ kind: "ref", repository, ref: "feat/example" })).reference).toEqual(record.reference);
    expect(await fixture.store.lookup({ kind: "commit", repository: "wrong-repo", sha })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
  assertion(context, "work-item", "commit-captures-independent-repository-and-optional-link-removal", async (fixture) => {
    const repository = "repo", other = "other-repo";
    const sha = "a".repeat(40), patchId = "b".repeat(40), landing = "c".repeat(40), missing = "d".repeat(40);
    const links = LinksSchema.parse({ landingCommit: { repository, sha: landing }, taskCaptures: {
      "1.1": [{ repository, sha, patchId }], "1.2": [{ repository, sha: missing, patchId }],
      "2.1": [{ repository: other, sha, patchId }],
    } });
    let record = await seed(fixture, fixture.reference("work-item/meta"), undefined, { kind: "active" }, links);
    const check = async () => {
      expect(success(await fixture.store.lookup({ kind: "commit", repository, sha, patchId })))
        .toEqual({ reference: record.reference, taskIds: ["1.1"] });
      expect(success(await fixture.store.lookup({ kind: "commit", repository: other, sha, patchId })))
        .toEqual({ reference: record.reference, taskIds: ["2.1"] });
      expect(success(await fixture.store.lookup({ kind: "commit", repository, sha: "e".repeat(40), patchId })))
        .toEqual({ reference: record.reference, taskIds: ["1.1", "1.2"] });
      expect(success(await fixture.store.lookup({ kind: "commit", repository, sha: landing })))
        .toEqual({ reference: record.reference, taskIds: [] });
      expect(await fixture.store.lookup({ kind: "commit", repository: "wrong-repo", sha, patchId }))
        .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    };
    await check();
    success(await fixture.store.write({ ...update(fixture, record), links: { ...links,
      branches: [{ repository: "unrelated-repo", ref: "feat/optional" }], changeRequest: { repository: "unrelated-repo", number: 1 } } }));
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
