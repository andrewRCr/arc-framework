import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";
import { KIND_REGISTRY } from "../../src/lib/store/index.js";

describe("real ref fixture faults", () => {
  it("removes a unique target blob without damaging a sibling with identical initial bytes", async () => {
    const fixture = await createRefFixture();
    const bad = await seed(fixture, fixture.reference("project-registry/counter"));
    const good = await seed(fixture, fixture.reference("project-registry/counter", "two"));
    const git = makeGitExec(fixture.root);
    const before = (await git("git", ["rev-parse", "refs/arc/project/registry"])).stdout;
    await fixture.plant(bad.reference, "unreadable");
    expect((await git("git", ["rev-parse", "refs/arc/project/registry^"])).stdout).toBe(before);
    expect(success(await fixture.store.read({ reference: good.reference }))).toEqual(good);
    expect(success(await fixture.store.list({ family: "project-registry" }))).toMatchObject({ status: "complete",
      records: [good], missed: true, diagnostics: [{ kind: "unreadable" }] });
  });
  it("plants an oversized projected record with an actionable diagnostic", async () => {
    const fixture = await createRefFixture();
    const record = await seed(fixture, fixture.reference("personal/document"));
    await fixture.plant(record.reference, "oversized");
    expect(success(await fixture.store.list({ family: "personal" }))).toMatchObject({ status: "complete",
      records: [], missed: true, diagnostics: [{ kind: "oversized", remedy: { text: expect.any(String) } }] });
  });
  it.each(["project-registry/counter", "work-item/meta", "work-item/companion", "personal/document"] as const)("plants malformed %s using its content or an unmapped entry", async (kind) => {
    const fixture = await createRefFixture();
    const record = await seed(fixture, fixture.reference(kind));
    await fixture.plant(record.reference, "malformed");
    expect(success(await fixture.store.list({ family: KIND_REGISTRY[kind].family, kind }))).toMatchObject({ status: "complete",
      records: [], missed: true, diagnostics: [{ kind: "malformed", key: expect.any(String), remedy: { text: expect.any(String) } }] });
  });
  it("advances only the target record's format metadata", async () => {
    const fixture = await createRefFixture();
    const bad = await seed(fixture, fixture.reference("project-registry/counter"));
    const good = await seed(fixture, fixture.reference("project-registry/counter", "two"));
    await fixture.plant(bad.reference, "unknown-format-version");
    expect(success(await fixture.store.read({ reference: good.reference }))).toEqual(good);
    expect(success(await fixture.store.list({ family: "project-registry" }))).toMatchObject({ status: "complete",
      records: [good], missed: true, diagnostics: [{ kind: "unknown-format-version" }] });
  });
  it.each(["review/candidate", "personal/document", "project-registry/conflict-record"] as const)("plants an owner mismatch for %s", async (kind) => {
    const fixture = await createRefFixture();
    const record = await seed(fixture, fixture.reference(kind));
    await fixture.plant(record.reference, "key-mismatch");
    expect(success(await fixture.store.list({ family: KIND_REGISTRY[kind].family, kind }))).toMatchObject({ status: "complete",
      records: [], missed: true, diagnostics: [{ kind: "key-mismatch" }] });
  });
  it("makes every ref in the target family unreadable while another family remains readable", async () => {
    const fixture = await createRefFixture();
    const first = await seed(fixture, fixture.reference("work-item/meta"));
    await seed(fixture, fixture.reference("work-item/meta", "two"));
    const other = await seed(fixture, fixture.reference("project-registry/counter"));
    await fixture.plant(first.reference, "family-unreadable");
    expect(success(await fixture.store.list({ family: "work-item", kind: "work-item/meta" }))).toMatchObject({ status: "unreadable",
      condition: expect.any(String), remedy: { text: expect.any(String) } });
    expect(success(await fixture.store.read({ reference: other.reference }))).toEqual(other);
  });
  it("retains one diagnostic per bad personal entry while later fault commits preserve missing blobs", async () => {
    const fixture = await createRefFixture();
    const good = await seed(fixture, fixture.reference("personal/document"));
    const kinds = ["malformed", "oversized", "unreadable", "unknown-format-version", "key-mismatch"] as const;
    const records = [];
    for (const [index] of kinds.entries()) records.push(await seed(fixture, fixture.reference("personal/document", `bad-${index}`)));
    for (const [index, kind] of kinds.entries()) {
      const record = records[index];
      if (!record) throw new Error("Missing seeded fault entry");
      await fixture.plant(record.reference, kind);
    }
    const listing = success(await fixture.store.list({ family: "personal", kind: "personal/document" }));
    expect(listing.status).toBe("complete");
    if (listing.status !== "complete") throw new Error("No complete listing");
    expect(listing.records).toEqual([good]);
    expect(listing.diagnostics.map((diagnostic) => diagnostic.kind).sort()).toEqual([...kinds].sort());
    expect(new Set(listing.diagnostics.map((diagnostic) => diagnostic.key)).size).toBe(kinds.length);
  });
});
