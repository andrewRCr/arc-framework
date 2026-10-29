/** Root metadata companion names cannot change archive ownership through writes. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { mutationOf, seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");
const candidates = ["metadata-00000000-0000-4000-8000-000000000000.json", "metadata-ffffffff-ffff-4fff-bfff-ffffffffffff.json"];
const contents = ["ordinary companion text\n", JSON.stringify({ formatVersion: 1, slug: "foreign-owner", formats: {},
  primary: { role: "work-item/meta", placement: { kind: "completed", quarter } } })];

describe.each(["default", "separate"] as const)("archive metadata name admission in %s", layout => {
  for (const [order, name] of candidates.entries()) for (const [format, content] of contents.entries()) {
    it.each(["create", "archive", "completed-refresh"] as const)(`refuses lexical ${order}, content ${format} during %s before refs change and admits a renamed retry`, async phase => {
      const f = await createRefFixture({}, layout);
      const primary = await seed(f, f.reference("work-item/meta"));
      if (phase === "completed-refresh") success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
      const current = success(await f.store.read({ reference: primary.reference }));
      const reference = RecordReferenceSchema.parse({ owner: current.reference.owner, kind: "work-item/companion", key: name });
      const companion = { action: "put" as const, reference, content, expected: null, provenance: testProvenance };
      const before = success(await f.store.version());
      const scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
      const refs = () => f.ports.exec("git", [...scope, "for-each-ref", "--format=%(refname) %(objectname)",
        "refs/arc/work/", "refs/arc/history/", "refs/arc/archive/"]);
      const beforeRefs = (await refs()).stdout;
      const write = (key: string) => phase === "create" ? f.store.write({ ...companion, reference: { ...reference, key } })
        : f.store.batch({ writes: [mutationOf({ ...update(f, current), placement: { kind: "completed", quarter } }),
          mutationOf({ ...companion, reference: { ...reference, key } })], provenance: { ...testProvenance, verb: "archive" } });
      expect(await write(name)).toMatchObject({ status: "refused", refusal: { code: "unsupported",
        condition: expect.stringMatching(/reserved.*metadata|metadata.*reserved/iu), remedy: { text: expect.stringMatching(/key.*retry/iu) } } });
      expect(success(await f.store.version())).toBe(before);
      expect((await refs()).stdout).toBe(beforeRefs);
      const allowed = `evidence/${name}`;
      success<unknown>(await write(allowed));
      expect(success(await f.store.read({ reference: { ...reference, key: allowed } })).content).toBe(content);
      expect(success(await f.store.read({ reference: primary.reference })).placement?.kind).toBe(phase === "create" ? "active" : "completed");
    }, 60_000);
  }

  it.each([`${candidates[0]}/evidence.txt`, `metadata-${"-".repeat(36)}.json`])("reserves root storage at %s before refs change", async key => {
    const f = await createRefFixture({}, layout), primary = await seed(f, f.reference("work-item/meta"));
    const companion = (key: string) => ({ action: "put" as const,
      reference: RecordReferenceSchema.parse({ owner: primary.reference.owner, kind: "work-item/companion", key }),
      content: "retained companion bytes\n", expected: null, provenance: testProvenance });
    const before = success(await f.store.version());
    expect(await f.store.write(companion(key))).toMatchObject({ status: "refused", refusal: { code: "unsupported",
      condition: expect.stringMatching(/reserved.*metadata|metadata.*reserved/iu) } });
    expect(success(await f.store.version())).toBe(before);
  }, 60_000);

  it.each([`nested/${candidates[0]}`, "metadata-short.json", `metadata-${"a".repeat(35)}.json`,
    `metadata-${"a".repeat(37)}.json`, `metadata-${"A".repeat(36)}.json`, `metadata-${"g".repeat(36)}.json`])("retains admission and archive readability for %s", async key => {
    const f = await createRefFixture({}, layout), primary = await seed(f, f.reference("work-item/meta"));
    const reference = RecordReferenceSchema.parse({ owner: primary.reference.owner, kind: "work-item/companion", key });
    const content = "retained companion bytes\n";
    success(await f.store.write({ action: "put", reference, content, expected: null, provenance: testProvenance }));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    expect(success(await f.store.read({ reference })).content).toBe(content);
    expect(success(await f.store.list({ family: "work-item" }))).toMatchObject({ status: "complete", missed: false, diagnostics: [] });
  }, 60_000);
});
