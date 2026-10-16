import { describe, expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";

const provenance = { verb: "test-write", lifecycleAction: "update" };
const reference = (key: string) => RecordReferenceSchema.parse({ owner: { type: "project", name: "project" },
  kind: "project-registry/counter", key });

describe.each(["files", "reftable"] as const)("write expected versions (%s)", (format) => {
  it("reports every expected-null or stale record before applying any part of a batch", async () => {
    const f = await createRefReadFixture(format);
    const first = reference("first");
    const second = reference("second");
    const fresh = reference("fresh");
    const initial = await f.store.batch({ provenance, writes: [first, second].map((reference) => ({
      action: "put", reference, expected: null, content: "{\"value\":1}",
    })) });
    if (initial.status !== "ok" || !initial.result.writes[0]?.version) throw new Error("No initial counter versions");
    const oldVersion = initial.result.writes[0].version;
    const current = await f.store.write({ action: "put", reference: first, expected: oldVersion, content: "{\"value\":2}", provenance });
    expect(current.status).toBe("ok");
    const before = (await f.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    const result = await f.store.batch({ provenance, writes: [
      { action: "put", reference: fresh, expected: null, content: "{\"value\":3}" },
      { action: "put", reference: second, expected: null, content: "{\"value\":4}" },
      { action: "put", reference: first, expected: oldVersion, content: "{\"value\":5}" },
    ] });
    expect(result).toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [second, first] } });
    expect((await f.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
    expect(await f.store.read({ reference: first })).toMatchObject({ status: "ok", result: { content: "{\"value\":2}" } });
    expect(await f.store.read({ reference: second })).toMatchObject({ status: "ok", result: { content: "{\"value\":1}" } });
    expect(await f.store.read({ reference: fresh })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await f.store.write({ action: "remove", reference: first, expected: oldVersion, provenance }))
      .toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [first] } });
  });
});
