import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";

const provenance = { verb: "edit", lifecycleAction: "save" };

async function corruptFixture(layout: "default" | "separate", damage: "missing" | "malformed", publish = true) {
  const h = await refSyncFixture(layout);
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("alpha"),
    reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha" }, kind: "work-item/meta" }),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const home = expandStoredPath(made.reference);
  const before = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
  const rows = (await h.a.git(["ls-tree", "-r", "--format=%(objectname) %(path)", home.ref])).stdout.split("\n").filter(Boolean);
  const entries: PlantTreeEntry[] = rows.flatMap((row): PlantTreeEntry[] => {
    const at = row.indexOf(" "), path = row.slice(at + 1);
    return path === home.metadataPath ? damage === "missing" ? [] : [{ path, content: "{ invalid metadata\n" }]
      : [{ path, oid: row.slice(0, at), mode: "100644" }];
  });
  const broken = await plantRef(h.a.root, home.ref, entries, { parents: [before], gitDir: h.a.gitDir });
  const other = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "independent.md" });
  const otherContent = "Independent published update.\n";
  success(await h.a.store.write({ action: "put", reference: other, expected: null, content: otherContent, provenance }));
  if (publish) await h.a.git(["push", h.remoteName, `${home.ref}:${home.ref}`, "refs/arc/user/andrew/personal:refs/arc/user/andrew/personal"]);
  return { ...h, made, home, before, broken, other, otherContent };
}

describe.each(["default", "separate"] as const)("damaged sync refs in the %s layout", (layout) => {
  it.each(["missing", "malformed"] as const)("keeps a live ref with %s metadata while applying other refs", async (damage) => {
    const h = await corruptFixture(layout, damage);
    const result = success(await h.b.store.pull());
    expect(result.pulls.flatMap(({ notices }) => notices)).toEqual([expect.objectContaining({ kind: "namespace-corrupt", ref: h.home.ref })]);
    expect((await h.b.git(["rev-parse", h.home.ref])).stdout.trim()).toBe(h.before);
    expect((await h.b.git(["rev-parse", h.home.ref.replace("refs/arc/", `refs/arc-remotes/${h.remoteName}/`)])).stdout.trim()).toBe(h.broken.tip);
    expect(success(await h.b.store.read({ reference: h.made.reference })).content).toBe(makeMetaFixture("alpha"));
    expect(success(await h.b.store.read({ reference: h.other })).content).toBe(h.otherContent);
  });

  it("leaves an unpublished broken ref local and publishes independent families", async () => {
    const h = await corruptFixture(layout, "malformed", false);
    const incoming = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "remote-independent.md" });
    success(await h.b.store.write({ action: "put", reference: incoming, expected: null, content: "Merged before publication.\n", provenance }));
    success(await h.b.store.push());
    const result = success(await h.a.store.push());
    expect(result.publishes.find(({ families }) => families.includes("work-item")))
      .toMatchObject({ status: "failed", failure: { code: "refused", class: "terminal", condition: expect.stringContaining(h.home.ref) } });
    expect(result.publishes.find(({ families }) => families.includes("personal"))?.status).toBe("reconciled");
    expect((await h.remote("git", ["rev-parse", h.home.ref])).stdout.trim()).toBe(h.before);
    expect((await h.a.git(["rev-parse", h.home.ref])).stdout.trim()).toBe(h.broken.tip);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: h.other })).content).toBe(h.otherContent);
    expect(success(await h.a.store.read({ reference: incoming })).content).toBe("Merged before publication.\n");
    expect(success(await h.b.store.read({ reference: incoming })).content).toBe("Merged before publication.\n");
    expect(success(await h.b.store.read({ reference: h.made.reference })).content).toBe(makeMetaFixture("alpha"));
  });

  it.each([false, true])("excludes a remote damaged ref and fails its family only with own writes: %s", async (ownWrite) => {
    const h = await corruptFixture(layout, "malformed");
    if (ownWrite) {
      const before = success(await h.b.store.read({ reference: h.made.reference }));
      success(await h.b.store.write({ action: "put", reference: before.reference, expected: before.version,
        content: `${before.content}\nOwn pending work.\n`, placement: before.placement, provenance }));
    }
    const other = RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "project-inbox/inbox" });
    const content = "# Atomic Inbox\n\n## Inbox\n\nIndependent local work.\n";
    success(await h.b.store.write({ action: "put", reference: other, expected: null, content, provenance }));
    const kept = (await h.b.git(["rev-parse", h.home.ref])).stdout.trim();
    const clock = createRefClock(new Date(0), 0);
    const store = createRefStore({ ...h.b.ports, ...clock, sleep: { ...clock.sleep, wait: async () => { clock.advance(120_000); } } });
    const result = success(await store.push());
    expect(result.publishes.find(({ families }) => families.includes("work-item")))
      .toMatchObject(ownWrite ? { status: "failed", failure: { code: "refused", class: "terminal" } } : { status: "noop" });
    expect(result.publishes.find(({ families }) => families.includes("project-inbox"))?.status).toBe("pushed");
    expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: h.home.ref }));
    expect((await h.remote("git", ["rev-parse", h.home.ref])).stdout.trim()).toBe(h.broken.tip);
    expect((await h.b.git(["rev-parse", h.home.ref])).stdout.trim()).toBe(kept);
    expect(success(await h.b.store.read({ reference: h.other })).content).toBe(h.otherContent);
    expect((await h.remote("git", ["show", `${expandStoredPath(other).ref}:${expandStoredPath(other).path}`])).stdout.trimEnd()).toBe(content.trimEnd());
  });

  it.each(["local", "remote"] as const)("contains damaged archive metadata on the %s side and admits forward repair", async (side) => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("quarter-damage"),
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "quarter-damage" }, kind: "work-item/meta" }),
      placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const before = success(await h.a.store.read({ reference: made.reference }));
    const other = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "quarter.md" });
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: before.reference, expected: before.version, content: before.content,
        placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } },
      { action: "put", reference: other, expected: null, content: "The archive batch's personal write.\n" },
    ], provenance: { verb: "archive", lifecycleAction: "archive" } }));
    const archive = "refs/arc/archive/2026-q4", live = expandStoredPath(made.reference).ref, history = live.replace("refs/arc/", "refs/arc/history/");
    const healthy = (await h.a.git(["rev-parse", archive])).stdout.trim();
    const rows = (await h.a.git(["ls-tree", "-r", "--format=%(objectname) %(path)", archive])).stdout.split("\n").filter(Boolean);
    const entries: PlantTreeEntry[] = rows.map((row) => {
      const at = row.indexOf(" "); return { path: row.slice(at + 1), oid: row.slice(0, at), mode: "100644" };
    });
    const metadata = entries.find(({ path }) => path.endsWith(`/${expandStoredPath(made.reference).metadataPath}`));
    if (!metadata) throw new Error("The archive must contain the item's metadata");
    const damaged = await plantRef(h.a.root, archive, entries.map((entry) => entry === metadata ? { path: entry.path, content: "{ invalid\n" } : entry),
      { parents: [healthy], gitDir: h.a.gitDir });
    if (side === "local") {
      const result = success(await h.a.store.push());
      for (const family of ["work-item", "personal"] as const) expect(result.publishes.find(({ families }) => families.includes(family)))
        .toMatchObject({ status: "failed", failure: { code: "refused" } });
      expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", archive, history])).stdout).toBe("");
      expect((await h.remote("git", ["rev-parse", live])).stdout.trim()).toBe((await h.b.git(["rev-parse", live])).stdout.trim());
    } else {
      await h.a.git(["push", "--atomic", h.remoteName, `${archive}:${archive}`, `${history}:${history}`, `:${live}`,
        `${expandStoredPath(other).ref}:${expandStoredPath(other).ref}`]);
      const result = success(await h.b.store.pull());
      expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: archive }));
      expect((await h.b.git(["for-each-ref", "--format=%(refname)", archive])).stdout).toBe("");
      expect(success(await h.b.store.read({ reference: other })).content).toBe("The archive batch's personal write.\n");
    }
    const repairer = side === "local" ? h.a : h.b;
    const repaired = await plantRef(repairer.root, archive, entries, { parents: [damaged.tip], gitDir: repairer.gitDir });
    const repairedPush = success(await repairer.store.push());
    expect(repairedPush.publishes.every(({ status }) => status !== "failed"), JSON.stringify(repairedPush)).toBe(true);
    success(await h.a.store.pull()); success(await h.b.store.pull());
    expect((await h.remote("git", ["rev-parse", archive])).stdout.trim()).toBe(repaired.tip);
    for (const checkout of [h.a, h.b]) {
      expect(success(await checkout.store.read({ reference: made.reference })).placement?.kind).toBe("completed");
      expect(success(await checkout.store.read({ reference: other })).content).toBe("The archive batch's personal write.\n");
    }
  });

  it("contains malformed historical metadata while constructing merge labels and applies other refs", async () => {
    const h = await corruptFixture(layout, "malformed", false);
    const local = success(await h.b.store.read({ reference: h.made.reference }));
    success(await h.b.store.write({ action: "put", reference: local.reference, expected: local.version,
      content: `${local.content}\nLocal competing content.\n`, placement: local.placement, provenance }));
    const kept = (await h.b.git(["rev-parse", h.home.ref])).stdout.trim();
    const rows = (await h.a.git(["ls-tree", "-r", "--format=%(objectname) %(path)", h.before])).stdout.split("\n").filter(Boolean);
    const entries: PlantTreeEntry[] = rows.map((row) => {
      const at = row.indexOf(" "), path = row.slice(at + 1);
      return path === h.home.path ? { path, content: `${local.content}\nRemote competing content.\n` }
        : { path, oid: row.slice(0, at), mode: "100644" };
    });
    await plantRef(h.a.root, h.home.ref, entries, { parents: [h.broken.tip], gitDir: h.a.gitDir });
    await h.a.git(["push", h.remoteName, `${h.home.ref}:${h.home.ref}`, `${expandStoredPath(h.other).ref}:${expandStoredPath(h.other).ref}`]);
    const result = success(await h.b.store.pull());
    expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: h.home.ref,
      condition: expect.stringMatching(/historical metadata/iu), remedy: { text: expect.stringMatching(/ancestor/iu) } }));
    expect((await h.b.git(["rev-parse", h.home.ref])).stdout.trim()).toBe(kept);
    expect(success(await h.b.store.read({ reference: h.made.reference })).content).toBe(`${local.content}\nLocal competing content.\n`);
    expect(success(await h.b.store.read({ reference: h.other })).content).toBe(h.otherContent);
  });

  it("keeps metadata refusals separate when independent publication exhausts its retry budget", async () => {
    const h = await corruptFixture(layout, "malformed", false), clock = createRefClock(new Date(0), 0);
    const incoming = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "race.md" });
    let raced = false;
    const publisher = createRefStore({ ...h.a.ports, ...clock, random: () => 0.5, exec: async (command, args, options) => {
      if (raced || !args.includes("push")) return h.a.ports.exec(command, args, options);
      raced = true;
      success(await h.b.store.write({ action: "put", reference: incoming, expected: null, content: "Receiver advanced.\n", provenance }));
      await h.b.git(["push", h.remoteName, `${expandStoredPath(incoming).ref}:${expandStoredPath(incoming).ref}`]);
      try { return await h.a.ports.exec(command, args, options); }
      finally { clock.advance(119_999); }
    } });
    const result = success(await publisher.push());
    expect(raced).toBe(true);
    expect(result.publishes).toHaveLength(2);
    expect(result.publishes.find(({ families }) => families.includes("work-item")))
      .toMatchObject({ status: "failed", failure: { code: "refused", class: "terminal" }, retryCount: 1, waitedMs: 1 });
    expect(result.publishes.find(({ families }) => families.includes("personal")))
      .toMatchObject({ status: "failed", failure: { code: "retries-exhausted" }, retryCount: 1, waitedMs: 1 });
    const families = result.publishes.flatMap(({ families }) => families);
    expect(new Set(families).size).toBe(families.length);
    expect((await h.a.git(["rev-parse", h.home.ref])).stdout.trim()).toBe(h.broken.tip);
    expect(success(await h.a.store.read({ reference: h.other })).content).toBe(h.otherContent);
    const retry = success(await publisher.push());
    expect(retry.publishes.find(({ families }) => families.includes("personal"))?.status).toBe("reconciled");
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: h.other })).content).toBe(h.otherContent);
  });
});
