/** Archive roots belong to one cohort generation even when a member lends its sequence. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update, mutationOf, testProvenance } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), prior = ArchiveQuarterSchema.parse("2026-q3");

describe.each(["default", "separate"] as const)("cohort destination ownership in %s", layout => {
  it.each(["archive", "transfer", "rename"] as const)("refuses %s into another generation's complete root atomically and admits a new-name retry", async phase => {
    const f = await createRefFixture({}, layout), original = await seed(f, f.reference("cohort/document", "shared"));
    const memberRef = f.reference("work-item/meta", "member");
    let member = await seed(f, memberRef, JSON.stringify({ ...JSON.parse(f.content(memberRef)), cohort: original.reference.owner.name }));
    const end = (record: typeof original, at = quarter) => mutationOf({ ...update(f, record, record.content), placement: { kind: "completed", quarter: at } });
    success(await f.store.batch({ writes: [end(member), end(original)], provenance: testProvenance }));
    const kept = success(await f.store.read({ reference: original.reference }));
    member = success(await f.store.read({ reference: member.reference }));
    let other = await seed(f, f.reference("cohort/document", phase === "rename" ? "other" : "shared"));
    if (phase !== "archive") {
      const content = JSON.stringify({ ...JSON.parse(member.content), cohort: other.reference.owner.name });
      success(await f.store.batch({ writes: [mutationOf(update(f, member, content)), end(other, phase === "transfer" ? prior : quarter)], provenance: testProvenance }));
      member = success(await f.store.read({ reference: member.reference }));
      other = success(await f.store.read({ reference: other.reference }));
    }
    other = success(await f.store.read({ reference: other.reference }));
    const scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const refs = async () => (await f.ports.exec("git", [...scope, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    const before = await refs();
    const attempt = (name: string) => {
      const reference = RecordReferenceSchema.parse({ ...other.reference, owner: { ...other.reference.owner, name } });
      const content = JSON.stringify({ ...JSON.parse(member.content), cohort: name });
      return f.store.batch({ writes: [mutationOf(update(f, member, content)),
        { ...end(other), reference }], provenance: testProvenance });
    };
    expect(await attempt(kept.reference.owner.name)).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", condition: expect.stringMatching(/root|folder|destination/iu),
      remedy: { text: expect.stringMatching(/rename|name|placement|reopen/iu) },
    } });
    expect(await refs()).toBe(before);
    expect(success(await f.store.read({ reference: kept.reference }))).toMatchObject({ content: kept.content, placement: kept.placement });
    expect(success(await f.store.read({ reference: other.reference }))).toEqual(other);
    success(await attempt("cohort-repaired"));
    expect(success(await f.store.read({ reference: other.reference }))).toMatchObject({ reference: { owner: { name: "cohort-repaired" } }, placement: { kind: "completed", quarter } });
    expect(success(await f.store.read({ reference: kept.reference }))).toMatchObject({ content: kept.content, placement: kept.placement });
  }, 90_000);
});
