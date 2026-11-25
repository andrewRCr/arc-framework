import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef, removeLooseObject, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("incoming archive evidence in %s", layout => {
  it.each(["healthy", "unparseable", "misplaced", "missing"] as const)("contains pending live publication beside %s incoming archive evidence", async damage => {
    const damaged = damage !== "healthy";
    const h = await refSyncFixture(layout), provenance = { verb: "edit", lifecycleAction: "save" };
    const made = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "incoming-quarter" } }),
      content: makeMetaFixture("incoming-quarter"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const pending = success(await h.b.store.read({ reference: made.reference }));
    success(await h.b.store.write({ action: "put", reference: pending.reference, expected: pending.version,
      content: `${pending.content}\nPending local content.\n`, placement: pending.placement, provenance }));
    const before = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version, content: before.content,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    const home = expandStoredPath(made.reference), live = home.ref, history = live.replace("refs/arc/", "refs/arc/history/");
    const archive = "refs/arc/archive/2026-q4", healthy = (await h.a.git(["rev-parse", archive])).stdout.trim();
    const rows = (await h.a.git(["ls-tree", "-r", "--format=%(objectname) %(path)", archive])).stdout.split("\n").filter(Boolean);
    const entries: PlantTreeEntry[] = rows.map(row => {
      const at = row.indexOf(" "); return { oid: row.slice(0, at), path: row.slice(at + 1), mode: "100644" };
    });
    const metadata = entries.find(({ path }) => path.endsWith(`/${home.metadataPath}`));
    if (!metadata || !("oid" in metadata)) throw new Error("Expected archived metadata");
    const metadataOid = metadata.oid;
    const scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
    const metadataBytes = (await h.a.ports.rawExec([...scope, "cat-file", "blob", metadataOid])).stdout;
    const metadataValue = JSON.parse(new TextDecoder().decode(metadataBytes));
    const brokenContent = damage === "unparseable" ? "{ invalid\n" : JSON.stringify({ ...metadataValue,
      primary: { ...metadataValue.primary, placement: { kind: "active" } } });
    const corrupt = damage === "unparseable" || damage === "misplaced" ? await plantRef(h.a.root, archive, entries.map(entry => entry === metadata
      ? { path: entry.path, content: brokenContent } : entry), { parents: [healthy], gitDir: h.a.gitDir }) : undefined;
    await h.a.git(["push", "--atomic", h.remoteName, `${archive}:${archive}`, `${history}:${history}`, `:${live}`]);
    await h.b.git(["config", "fetch.unpackLimit", "100000"]);
    let removeMetadata = damage === "missing";
    const local = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
      const result = await h.b.ports.exec(command, args, options);
      if (removeMetadata && args.includes("fetch") && options?.input?.includes("refs/arc/")) {
        removeMetadata = false;
        await removeLooseObject(h.b.root, metadataOid, h.b.gitDir);
      }
      return result;
    } });
    const other = RecordReferenceSchema.parse({ kind: "project-inbox/inbox", owner: { type: "project", name: "project" } });
    const otherContent = "# Atomic Inbox\n\n## Inbox\n\nIndependent local work.\n";
    success(await local.write({ action: "put", reference: other, expected: null, content: otherContent, provenance }));
    const kept = (await h.b.git(["rev-parse", live])).stdout.trim();
    const result = success(await local.push());
    if (damage === "missing") expect(removeMetadata).toBe(false);
    expect(result.publishes.find(({ families }) => families.includes("project-inbox"))).toMatchObject({ status: "pushed" });
    if (damaged) {
      expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: archive }));
      if (damage === "missing" || damage === "misplaced") expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({
        kind: "namespace-corrupt", ref: live,
        condition: expect.stringContaining(damage === "missing" ? "unavailable" : "placement is active"),
        remedy: { text: damage === "missing" ? expect.stringMatching(/restore|fetch/iu) : expect.stringContaining("completed placement") },
      }));
      expect.soft(result.publishes.find(({ families }) => families.includes("work-item"))).toMatchObject({ status: "failed", failure: { code: "refused" } });
      expect.soft((await h.b.git(["rev-parse", live])).stdout.trim()).toBe(kept);
      expect.soft((await h.remote("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
      for (let attempt = 0; attempt < 2; attempt++) {
        const pulled = success(await local.pull());
        expect(pulled.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: live }));
        const retried = success(await local.push());
        expect(retried.publishes.find(({ families }) => families.includes("work-item"))).toMatchObject({ status: "failed", failure: { code: "refused" } });
        expect((await h.b.git(["rev-parse", live])).stdout.trim()).toBe(kept);
        expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
      }
      if (damage === "missing") {
        const restored = await h.b.ports.rawExec([...h.b.gitDir ? [`--git-dir=${h.b.gitDir}`] : [], "hash-object", "-w", "--stdin"], { input: metadataBytes });
        expect(Buffer.from(restored.stdout).toString().trim()).toBe(metadataOid);
      } else {
        if (!corrupt) throw new Error("Expected a malformed archive commit");
        const repaired = await plantRef(h.a.root, archive, entries, { parents: [corrupt.tip], gitDir: h.a.gitDir });
        await h.a.git(["push", h.remoteName, `${repaired.tip}:${archive}`]);
      }
      const retry = success(await local.push());
      expect(retry.publishes.every(({ status }) => status !== "failed"), JSON.stringify(retry)).toBe(true);
    }
    expect(success(await local.read({ reference: made.reference }))).toMatchObject({ placement: { kind: "completed" }, content: expect.stringContaining("Pending local content.") });
    expect(success(await local.read({ reference: other })).content).toBe(otherContent);
  }, 90_000);
});
