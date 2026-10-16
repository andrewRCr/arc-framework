import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, type RecordReference } from "../../src/lib/store/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { makeGitExec } from "../helpers/integration.js";
import { seed, success, testProvenance } from "../helpers/store/suite-tools.js";

const document = (key: string) => RecordReferenceSchema.parse({ owner: { type: "person", name: "test-user" }, kind: "personal/document", key });
const counter = (key: string) => RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "project-registry/counter", key });
const put = (reference: RecordReference, content: string) => ({ action: "put" as const, reference, content, expected: null });
const cases = [
  { rule: "store.text-only", reference: document("binary.md"), content: "a\0b", repaired: document("binary.md"), fixed: "text" },
  { rule: "store.size-cap", reference: document("large.md"), content: "é".repeat(524_289), repaired: document("large.md"), fixed: "text" },
  { rule: "store.env-file", reference: document("scratch/.env"), content: "example", repaired: document("scratch/.env.example"), fixed: "example" },
  { rule: "store.private-key", reference: document("scratch/id_rsa"), content: "text", repaired: document("scratch/public.md"), fixed: "text" },
  { rule: "store.private-key", reference: document("key.md"), content: "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----",
    repaired: document("key.md"), fixed: "-----BEGIN PRIVATE KEY-----\nunmatched header" },
  { rule: "store.git-path", reference: document("scratch/.git/config"), content: "text", repaired: document("scratch/.github/config"), fixed: "text" },
  { rule: "store.json", reference: counter("json"), content: "not JSON", repaired: counter("json"), fixed: ' { "value": "e\\u0301" }\n' },
];

describe("ref serialization admission", () => {
  for (const [index, scenario] of cases.entries()) {
    for (const operation of ["write", "batch"] as const) it(`refuses ${scenario.rule} through ${operation} before mutation, and admits a repaired retry (${index})`, async () => {
      const fixture = await createRefFixture();
      const git = makeGitExec(fixture.root);
      const before = (await git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
      const mutation = put(scenario.reference, scenario.content);
      const expected = { status: "refused", refusal: { code: "record-malformed", reference: scenario.reference, rule: scenario.rule } };
      const sibling = counter("sibling");
      const result = operation === "write" ? await fixture.store.write({ ...mutation, provenance: testProvenance })
        : await fixture.store.batch({ writes: [put(sibling, "{}"), mutation], provenance: testProvenance });
      expect(result).toMatchObject(expected);
      expect((await git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
      expect(await fixture.store.read({ reference: sibling })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      success(await fixture.store.batch({ writes: [put(sibling, "{}"), put(scenario.repaired, scenario.fixed)], provenance: testProvenance }));
      expect(await fixture.store.read({ reference: scenario.repaired })).toMatchObject({ status: "ok",
        result: { content: scenario.rule === "store.json" ? '{"value":"é"}' : scenario.fixed } });
    });
  }

  it("reports serialization defects before requiring personal identity", async () => {
    const fixture = await createRefFixture();
    fixture.identity(undefined);
    expect(await fixture.store.write({ ...put(document(".env"), "example"), provenance: testProvenance }))
      .toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "store.env-file" } });
    fixture.identity("test-user");
    success(await fixture.store.write({ ...put(document(".env.example"), "example"), provenance: testProvenance }));
  });

  it("writes and lists a Candidate larger than the projection cap", async () => {
    const fixture = await createRefFixture();
    const reference = fixture.reference("review/candidate");
    const content = JSON.stringify({ value: "x".repeat(1_048_577) });
    const record = await seed(fixture, reference, content);
    expect(record.content).toBe(content);
    const listed = success(await fixture.store.list({ family: "review", kind: "review/candidate" }));
    expect(listed.status).toBe("complete");
    if (listed.status !== "complete") throw new Error("The Candidate listing is incomplete");
    expect(listed.records).toHaveLength(1);
    expect(listed.records[0]?.reference).toEqual(record.reference);
    expect(listed.records[0]?.content === content).toBe(true);
  });
});
