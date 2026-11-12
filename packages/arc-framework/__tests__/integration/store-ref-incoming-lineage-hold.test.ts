/** Unreadable published lineage holds potentially retired live refs through repeated pulls and pushes. */
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "edit", lifecycleAction: "save" };

describe.each(["default", "separate"] as const)("incoming lineage evidence in %s", layout => {
  it("holds repeated damaged attempts, permits independent work and converges after forward repair", async () => {
    const h = await refSyncFixture(layout);
    const identity = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
    success(await h.a.store.write({ action: "put", reference: identity, expected: null,
      content: '{"projectId":"34567890-1234-4234-8234-123456789abc"}', provenance }));
    const made = [];
    for (const name of ["lineage-pending", "unrelated-live"]) made.push(success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
      content: makeMetaFixture(name), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } })));
    const [ended, unrelated] = made;
    if (!ended || !unrelated || ended.reference.owner.type !== "work-item" || !ended.reference.owner.uid) throw new Error("Expected created owners");
    success(await h.a.store.push()); success(await h.b.store.pull());
    const owner = ended.reference.owner;
    const pending = RecordReferenceSchema.parse({ kind: "work-item/companion", key: "pending", owner });
    success(await h.b.store.write({ action: "put", reference: pending, expected: null, content: "Pending local content.\n", provenance }));
    const primary = success(await h.a.store.read({ reference: ended.reference }));
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: RecordReferenceSchema.parse({ kind: "lineage/transition", owner }), expected: null,
        content: JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid },
          kind: "abandon", successors: [], incoming: [] })) },
      { action: "remove", reference: primary.reference, expected: primary.version },
    ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    const other = success(await h.a.store.read({ reference: unrelated.reference }));
    success(await h.a.store.write({ action: "put", reference: other.reference, expected: other.version,
      content: `${other.content}\nIndependent remote update.\n`, placement: other.placement, provenance }));
    success(await h.a.store.push());
    const registry = "refs/arc/project/registry", healthy = (await h.a.git(["rev-parse", registry])).stdout.trim();
    const rows = (await h.a.git(["ls-tree", "-r", "--format=%(objectname) %(path)", healthy])).stdout.split("\n").filter(Boolean);
    const entries: PlantTreeEntry[] = rows.map(row => { const at = row.indexOf(" ");
      return { oid: row.slice(0, at), path: row.slice(at + 1), mode: "100644" }; });
    const damaged = await plantRef(h.a.root, registry, entries.map(entry => entry.path === "metadata-registry.json"
      ? { path: entry.path, content: "{ invalid metadata\n" } : entry), { parents: [healthy], gitDir: h.a.gitDir });
    await h.a.git(["push", h.remoteName, `${registry}:${registry}`]);
    const live = expandStoredPath(ended.reference).ref, history = live.replace("refs/arc/", "refs/arc/history/");
    const kept = (await h.b.git(["rev-parse", live])).stdout.trim();
    const independent = RecordReferenceSchema.parse({ kind: "personal/document", key: "independent.md", owner: { type: "person", name: "andrew" } });
    for (let attempt = 0; attempt < 2; attempt++) {
      const prior = await h.b.store.read({ reference: independent });
      success(await h.b.store.write({ action: "put", reference: independent, expected: prior.status === "ok" ? prior.result.version : null,
        content: `Independent local work ${attempt}.\n`, provenance }));
      const pulled = success(await h.b.store.pull());
      expect.soft(pulled.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: live }));
      expect(success(await h.b.store.read({ reference: unrelated.reference })).content).toContain("Independent remote update.");
      const pushed = success(await h.b.store.push());
      expect.soft(pushed.publishes.find(({ families }) => families.includes("work-item"))).toMatchObject({ status: "failed", failure: { code: "refused" } });
      expect(pushed.publishes.find(({ families }) => families.includes("personal"))).toMatchObject({ status: "pushed" });
      expect((await h.b.git(["rev-parse", live])).stdout.trim()).toBe(kept);
      expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
    }
    const repaired = await plantRef(h.a.root, registry, entries, { parents: [damaged.tip], gitDir: h.a.gitDir });
    await h.a.git(["push", h.remoteName, `${repaired.tip}:${registry}`]);
    const retry = success(await h.b.store.push());
    expect(retry.publishes.every(({ status }) => status !== "failed"), JSON.stringify(retry)).toBe(true);
    expect(await h.b.store.read({ reference: ended.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect((await h.b.git(["show", `${history}:${expandStoredPath(pending).path}`])).stdout.trim()).toBe("Pending local content.");
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
    expect(success(await h.b.store.read({ reference: independent })).content).toBe("Independent local work 1.\n");
  }, 60_000);
});
