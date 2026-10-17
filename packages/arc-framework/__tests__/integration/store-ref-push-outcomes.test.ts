import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema, PushResultSchema, FAMILY_IDS, FAMILY_REGISTRY } from "../../src/lib/store/index.js";

const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "draft.md", owner: { type: "person", name: "andrew" } });
const claim = RecordReferenceSchema.parse({ kind: "claims/groom", key: "draft", owner: { type: "person", name: "andrew" } });
const provenance = { verb: "user", lifecycleAction: "save" };
const scope = FAMILY_IDS.filter((family) => family !== "constitution" && family !== "project-machinery");

describe.each(["default", "separate"] as const)("push outcomes in the %s layout", (layout) => {
  it("groups reconciled, pushed, and unchanged families once in status order", async () => {
    const h = await refSyncFixture(layout);
    success(await h.b.store.write({ action: "put", reference, expected: null, content: "remote\n", provenance }));
    success(await h.b.store.push());
    success(await h.a.store.write({ action: "put", reference: claim, expected: null, content: "{}", provenance }));
    const result = PushResultSchema.parse(success(await h.a.store.push()));
    expect(result.publishes).toEqual([
      { status: "reconciled", families: ["personal"], retryCount: 0, waitedMs: 0 },
      { status: "pushed", families: ["claims"], retryCount: 0, waitedMs: 0 },
      { status: "noop", families: scope.filter((family) => family !== "personal" && family !== "claims"), retryCount: 0, waitedMs: 0 },
    ]);
    expect(result.publishes.flatMap(({ families }) => families)).toHaveLength(scope.length);
    const again = PushResultSchema.parse(success(await h.a.store.push()));
    expect(again.publishes).toEqual([{ status: "noop", families: scope, retryCount: 0, waitedMs: 0 }]);
  });
  it("names identity families in a no-identity state and leaves their publication unreported", async () => {
    const h = await refSyncFixture(layout);
    const store = createRefStore({ ...h.a.ports, identity: async () => null });
    const result = PushResultSchema.parse(success(await store.push()));
    const identityFamilies = scope.filter((family) => FAMILY_REGISTRY[family].scope === "identity");
    expect(result.states).toEqual([{ status: "no-identity", families: identityFamilies, remedy: expect.any(Object) }]);
    expect(result.publishes).toEqual([{ status: "noop", families: scope.filter((family) => FAMILY_REGISTRY[family].scope === "project"),
      retryCount: 0, waitedMs: 0 }]);
  });
  it("ends before publication when its state pull fails and succeeds after repairing the remote", async () => {
    const h = await refSyncFixture(layout);
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "pending\n", provenance }));
    await h.a.git(["remote", "set-url", h.remoteName, join(h.origin, "missing.git")]);
    const result = PushResultSchema.parse(success(await h.a.store.push()));
    expect(result.pulls).toHaveLength(1);
    expect(result.pulls[0]).toMatchObject({ status: "failed", role: "state", notices: [], failure: { code: "unreachable" } });
    const failed = result.pulls[0];
    if (failed?.status !== "failed") throw new Error("Expected a failed state pull");
    expect(result.publishes).toEqual([{ status: "failed", families: scope, failure: failed.failure, retryCount: 0, waitedMs: 0 }]);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
    expect(success(await h.a.store.read({ reference })).content).toBe("pending\n");
    await h.a.git(["remote", "set-url", h.remoteName, h.origin]);
    success(await h.a.store.push()); success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference })).content).toBe("pending\n");
  });
  it("reports no publication under no-remote and publishes its saved writes after designation is restored", async () => {
    const h = await refSyncFixture(layout);
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "pending\n", provenance }));
    await h.a.git(["config", `remote.${h.remoteName}.arc-state`, "off"]);
    const result = PushResultSchema.parse(success(await h.a.store.push()));
    expect(result.states).toEqual([{ status: "no-remote" }]);
    expect(result.publishes).toEqual([]);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
    await h.a.git(["config", `remote.${h.remoteName}.arc-state`, "push"]);
    success(await h.a.store.push()); success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference })).content).toBe("pending\n");
  });
});

it("keeps a failed read source in pulls while publishing to its available state receiver", async () => {
  const h = await refSyncFixture();
  await h.a.exec("git", ["remote", "add", "unavailable", join(h.origin, "missing.git")]);
  await h.a.exec("git", ["config", "remote.unavailable.arc-state", "read"]);
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "pending\n", provenance }));
  const result = PushResultSchema.parse(success(await h.a.store.push()));
  expect(result.pulls).toContainEqual(expect.objectContaining({ remote: "unavailable", role: "read", status: "failed" }));
  expect(result.publishes).toContainEqual({ status: "pushed", families: ["personal"], retryCount: 0, waitedMs: 0 });
  expect((await h.remote("git", ["rev-parse", "refs/arc/user/andrew/personal"])).stdout)
    .toBe((await h.a.git(["rev-parse", "refs/arc/user/andrew/personal"])).stdout);
});
