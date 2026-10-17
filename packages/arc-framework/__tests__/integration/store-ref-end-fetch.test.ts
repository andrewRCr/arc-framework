import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, createKindRegistry, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), provenance = { verb: "archive", lifecycleAction: "archive" };

async function pendingFixture(layout: "default" | "separate") {
  const h = await refSyncFixture(layout);
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("fetch-end"),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "fetch-end" } }),
    placement: { kind: "active" }, provenance }));
  const personal = RecordReferenceSchema.parse({ kind: "personal/document", key: "notice.md", owner: { type: "person", name: "andrew" } });
  success(await h.a.store.write({ action: "put", reference: personal, expected: null, content: "left\nseparator\nright\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const before = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version,
    content: before.content, placement: { kind: "completed", quarter }, provenance }));
  success(await h.a.store.push());
  if (!("uid" in made.reference.owner)) throw new Error("The item needs a UID");
  const live = `refs/arc/work/${made.reference.owner.uid}`, history = live.replace("refs/arc/", "refs/arc/history/");
  return { ...h, reference: made.reference, personal, live, history };
}

describe.each(["default", "separate"] as const)("pending-end fetch repair in the %s layout", (layout) => {
  it("reports a missing history on every pull, suppresses its live push, and continues after restoration", async () => {
    const h = await pendingFixture(layout);
    const retained = (await h.remote("git", ["rev-parse", h.history])).stdout;
    await h.remote("git", ["update-ref", "-d", h.history]);
    for (let n = 0; n < 2; n++) {
      expect(success(await h.b.store.pull()).pulls).toContainEqual(expect.objectContaining({
        notices: expect.arrayContaining([expect.objectContaining({ kind: "end-pending", ref: h.history,
          item: h.reference.owner, remedy: { text: expect.stringMatching(/clone.*push/iu) } })]),
      }));
    }
    success(await h.b.store.push());
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
    await h.a.git(["push", h.remoteName, `${retained}:${h.history}`]);
    success(await h.b.store.pull());
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
    expect(success(await h.b.store.read({ reference: h.reference })).placement?.kind).toBe("completed");
  });

  it.each(["pull", "push"] as const)("keeps the end pending after a failed by-name fetch during %s and applies it on retry", async (operation) => {
    const h = await pendingFixture(layout);
    const remote = success(await h.a.store.read({ reference: h.personal })), local = success(await h.b.store.read({ reference: h.personal }));
    success(await h.a.store.write({ action: "put", reference: remote.reference, expected: remote.version,
      content: "LEFT\nseparator\nright\n", provenance }));
    success(await h.b.store.write({ action: "put", reference: local.reference, expected: local.version,
      content: "left\nseparator\nRIGHT\n", provenance }));
    success(await h.a.store.push());
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const failing = createRefStore({ ...h.b.ports, registry: { ...registry,
      "personal/document": { ...registry["personal/document"], check: async () => [{ rule: "personal.combined",
        condition: "Review the merged personal record.", remedy: { text: "Read and save the record." } }] },
    }, exec: async (command, args, options) => {
      if (args.includes("fetch") && args.some((arg) => arg.startsWith(`${h.history}*:`))) {
        return h.b.ports.exec("git", ["fetch", `${h.origin}/missing-origin`], options);
      }
      return h.b.ports.exec(command, args, options);
    } });
    const result = success(await failing[operation]());
    expect(result.pulls).toContainEqual(expect.objectContaining({ status: "failed", role: "state",
      failure: expect.objectContaining({ code: "unreachable", cause: "error" }),
      notices: expect.arrayContaining([expect.objectContaining({ kind: "rule-broken", rule: "personal.combined" })]) }));
    expect(success(await h.b.store.read({ reference: h.personal })).content).toBe("LEFT\nseparator\nRIGHT\n");
    if ("publishes" in result) expect(result.publishes).toEqual([expect.objectContaining({ status: "failed",
      families: expect.arrayContaining(["work-item", "cohort", "lineage", "personal"]) })]);
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe(h.live);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
    success(await h.b.store.pull());
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
    expect(success(await h.b.store.read({ reference: h.reference })).placement?.kind).toBe("completed");
  });
});
