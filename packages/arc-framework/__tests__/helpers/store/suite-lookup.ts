/** every logical lookup, including repository-qualified exact-SHA precedence. */

import { expect } from "vitest";
import { OwnerIdentitySchema, RecordReferenceSchema, singletonReference } from "../../../src/lib/store/index.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { assertion, seed, success, testProvenance, update, type SuiteContext } from "./suite-tools.js";

/** Register slug, origin, claim, commit and ref resolution through caller-written links.
 * @param context - item 12 context.
 */
export function registerLookupAssertions(context: SuiteContext): void {
  assertion(context, "work-item", "slug-and-former-slug", async (fixture) => {
    const record = await seed(fixture, fixture.reference("work-item/meta"));
    expect(success(await fixture.store.lookup({ kind: "slug", slug: record.reference.owner.name })).reference).toEqual(record.reference);
    const renamed = RecordReferenceSchema.parse({ ...record.reference, owner: OwnerIdentitySchema.parse({ ...record.reference.owner, name: "renamed-item" }) });
    success(await fixture.store.write({ ...update(fixture, record), reference: renamed }));
    for (const slug of [record.reference.owner.name, renamed.owner.name]) expect(success(await fixture.store.lookup({ kind: "slug", slug })).reference).toEqual(renamed);
  });
  assertion(context, "lineage", "terminal-origin", async (fixture) => {
    const work = await seed(fixture, fixture.reference("work-item/meta"));
    if (work.reference.owner.type === "person" || work.reference.owner.uid === undefined) throw new Error("Expected minted origin");
    const reference = singletonReference(work.reference.owner, "lineage/transition");
    const transition = await seed(fixture, reference);
    success(await fixture.store.write({ action: "remove", reference: work.reference, expected: work.version, provenance: testProvenance }));
    expect(await fixture.store.read({ reference: work.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await fixture.store.read({ reference: transition.reference })).placement).toBeUndefined();
    expect(success(await fixture.store.lookup({ kind: "lineage", origin: work.reference.owner.uid })).reference).toEqual(transition.reference);
  });
  assertion(context, "work-item", "checkout-work-unit-and-held-here-remedy", async (fixture) => {
    const record = await seed(fixture, fixture.reference("work-item/meta"));
    expect(await fixture.store.list({ family: "work-item", filter: { heldHere: true } })).toMatchObject({ status: "refused", refusal: {
      code: "unsupported", case: "held-here", class: "recoverable", remedy: { text: expect.stringMatching(/lookup|without/u) },
    } });
    expect(success(await fixture.store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: record.reference.owner.name } })).reference).toEqual(record.reference);
    expect(success(await fixture.store.list({ family: "work-item" })).status).toBe("complete");
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
      branch: { repository, ref: "feat/example" }, landingCommit: { sha: landing },
      taskCaptures: { "1.1": [{ sha, patchId }], "1.2": [{ sha, patchId }], "1.3": [{ sha: reapplied, patchId }] },
    });
    expect(success(await fixture.store.lookup({ kind: "commit", repository, sha, patchId }))).toEqual({ reference: record.reference, taskIds: ["1.1", "1.2"] });
    expect(success(await fixture.store.lookup({ kind: "commit", repository, sha: reapplied, patchId }))).toEqual({ reference: record.reference, taskIds: ["1.3"] });
    expect(success(await fixture.store.lookup({ kind: "commit", repository, sha: "e".repeat(40), patchId }))).toEqual({ reference: record.reference, taskIds: ["1.1", "1.2", "1.3"] });
    expect(success(await fixture.store.lookup({ kind: "commit", repository, sha: landing }))).toEqual({ reference: record.reference, taskIds: [] });
    expect(success(await fixture.store.lookup({ kind: "ref", repository, ref: "feat/example" })).reference).toEqual(record.reference);
    expect(await fixture.store.lookup({ kind: "commit", repository: "wrong-repo", sha })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
  assertion(context, "work-item", "missing-lookup-names-request", async (fixture) => {
    const lookup = { kind: "slug" as const, slug: SlugSchema.parse("missing-name") };
    expect(await fixture.store.lookup(lookup)).toMatchObject({ status: "refused", refusal: { code: "not-found", lookup, remedy: { text: expect.stringContaining("lookup") } } });
    expect(await fixture.store.lookup({ kind: "claim", claim: { kind: "partial-errand", slug: SlugSchema.parse("partial"), claimId: null } }))
      .toMatchObject({ status: "refused", refusal: { code: "not-found", condition: expect.stringContaining("no stored record") } });
  });
}
