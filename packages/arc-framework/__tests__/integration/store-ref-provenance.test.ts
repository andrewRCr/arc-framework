import { describe, expect, it } from "vitest";
import { createRefStore } from "../../src/lib/store/create.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { parseStoreCommitProvenance } from "../../src/lib/store/commit-provenance.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

const provenance = { verb: "capture", lifecycleAction: "update", codeHead: "a".repeat(40) };
const counter = RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "project-registry/counter", key: "capture" });

describe.each(["files", "reftable"] as const)("ref commit provenance (%s)", (format) => {
  it("records one batch ID across refs with the configured Git author and clone actor", async () => {
    const f = await createRefReadFixture(format);
    await f.exec("git", ["config", "user.name", "Storage Author"]);
    await f.exec("git", ["config", "user.email", "storage@example.test"]);
    const store = createRefStore({ ...f.ports, actor: async () => "andrew@machine-id" });
    const primary = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha" }, kind: "work-item/meta" });
    const result = await store.batch({ provenance, writes: [
      { action: "put", reference: primary, expected: null, content: makeMetaFixture("alpha"), placement: { kind: "active" } },
      { action: "put", reference: counter, expected: null, content: "{}" },
    ] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("No committed batch");
    const first = result.result.writes[0]?.reference;
    if (!first || !("uid" in first.owner)) throw new Error("No work-item UID");
    for (const [ref, reference] of [[`refs/arc/work/${first.owner.uid}`, first], ["refs/arc/project/registry", counter]] as const) {
      const message = (await f.exec("git", ["show", "-s", "--format=%B", ref])).stdout;
      expect(parseStoreCommitProvenance(message, reference)).toEqual({ ...provenance, reference,
        ...("uid" in reference.owner ? { ownerUid: reference.owner.uid } : {}), batchId: result.result.batchId });
      expect(message).toContain("Arc-Actor: andrew@machine-id");
      expect((await f.exec("git", ["show", "-s", "--format=%an <%ae>", ref])).stdout).toBe("Storage Author <storage@example.test>");
    }
  });
  it("names the first lineage owner on a shared registry commit, while reading each record's own provenance", async () => {
    const f = await createRefReadFixture(format);
    const primary = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha" }, kind: "work-item/meta" });
    const seeded = await f.store.write({ action: "put", reference: primary, expected: null,
      content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance });
    if (seeded.status !== "ok" || !seeded.result.version || !("uid" in seeded.result.reference.owner)) throw new Error("No seeded owner");
    const owner = seeded.result.reference.owner;
    const lineage = RecordReferenceSchema.parse({ owner, kind: "lineage/transition" });
    const result = await f.store.batch({ provenance, writes: [
      { action: "put", reference: lineage, expected: null, content: JSON.stringify({ schemaVersion: 2,
        origin: { name: owner.name, uid: owner.uid }, kind: "abandon", successors: [], incoming: [] }) },
      { action: "put", reference: counter, expected: null, content: "{}" },
      { action: "remove", reference: seeded.result.reference, expected: seeded.result.version },
    ] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("No committed retirement");
    const message = (await f.exec("git", ["show", "-s", "--format=%B", "refs/arc/project/registry"])).stdout;
    expect(message.split("\n")[0]).toBe("capture alpha");
    expect(message).toContain(`Arc-Owner: ${owner.uid}`);
    expect(parseStoreCommitProvenance(message, counter)).toEqual({ ...provenance, reference: counter, batchId: result.result.batchId });
    expect(parseStoreCommitProvenance(message, lineage)).toEqual({ ...provenance, reference: lineage, ownerUid: owner.uid, batchId: result.result.batchId });
  });
  it("writes without ARC identity or actor and without an owner UID before a project identity exists", async () => {
    const f = await createRefReadFixture(format);
    const store = createRefStore({ ...f.ports, identity: async () => null,
      actor: async () => { throw new Error("An unconfigured clone has no actor"); } });
    expect(await store.write({ action: "put", reference: counter, expected: null, content: "{}", provenance })).toMatchObject({ status: "ok" });
    const message = (await f.exec("git", ["show", "-s", "--format=%B", "refs/arc/project/registry"])).stdout;
    expect(message.split("\n")[0]).toBe("capture project");
    expect(message).not.toContain("Arc-Actor:");
    expect(message).not.toContain("Arc-Owner:");
  });
  it("persists quoted verbs and newline-bearing actions without splitting their values", async () => {
    const f = await createRefReadFixture(format);
    const caller = { verb: '"capture', lifecycleAction: "update\nArc-Batch: forged" };
    const result = await f.store.batch({ provenance: caller, writes: [{ action: "put", reference: counter, expected: null, content: "{}" }] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("No committed batch");
    const message = (await f.exec("git", ["show", "-s", "--format=%B", "refs/arc/project/registry"])).stdout;
    expect(message.split("\n")[0]).toBe(`${JSON.stringify(caller.verb)} project`);
    expect(message.split("\n").filter((line) => line.startsWith("Arc-Batch:"))).toEqual([`Arc-Batch: ${result.result.batchId}`]);
    expect(parseStoreCommitProvenance(message, counter)).toEqual({ ...caller, reference: counter, batchId: result.result.batchId });
  });
});
