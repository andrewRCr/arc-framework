/** Registry locking covers indirect retirement and lineage arriving after write resolution. */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { fixtureGit } from "../helpers/store/ref-fixture-git.js";
import { seed, success, update, testProvenance } from "../helpers/store/suite-tools.js";

const registry = "refs/arc/project/registry";

async function pendingRetirement(layout: "default" | "separate", withLineage: boolean) {
  const f = await createRefFixture({}, layout), git = fixtureGit(f);
  const identity = await seed(f, f.reference("project-registry/identity"));
  const primary = await seed(f, f.reference("work-item/meta"));
  const companion = await seed(f, f.reference("work-item/companion"), "base\n");
  success(await f.store.write(update(f, companion, "current\n")));
  const stale = success(await f.store.write(update(f, companion, "incoming\n"))), conflict = stale.conflicts[0];
  if (!conflict || primary.reference.owner.type !== "work-item" || !primary.reference.owner.uid) throw new Error("Expected a live origin conflict");
  const live = `refs/arc/work/${primary.reference.owner.uid}`, history = live.replace("refs/arc/", "refs/arc/history/");
  const full = (await git("git", ["rev-parse", live])).stdout.trim();
  success(await f.store.write({ action: "remove", reference: primary.reference, expected: primary.version, provenance: testProvenance }));
  const primaryFree = (await git("git", ["rev-parse", live])).stdout.trim();
  await git("git", ["update-ref", live, full]);
  const beforeLineage = (await git("git", ["rev-parse", registry])).stdout.trim();
  const lineage = RecordReferenceSchema.parse({ owner: primary.reference.owner, kind: "lineage/transition" });
  await seed(f, lineage);
  const afterLineage = (await git("git", ["rev-parse", registry])).stdout.trim();
  // Both tips come from ordinary Store writes; place their independently completed facts together.
  await git("git", ["update-ref", live, primaryFree]);
  if (!withLineage) await git("git", ["update-ref", registry, beforeLineage]);
  const inbox = await seed(f, f.reference("project-inbox/inbox"));
  const mutation = { ...update(f, inbox), resolves: [conflict] };
  return { f, git, identity, primary, companion, conflict, lineage, live, history, beforeLineage, afterLineage, inbox, mutation };
}

describe.each(["default", "separate"] as const)("registry prediction for retirement in %s", layout => {
  it("refuses another owner's resolving write while registry is held, then retires atomically after release", async () => {
    const h = await pendingRetirement(layout, true), { f, git } = h;
    const before = (await git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    await f.hold(h.identity.reference, true);
    try {
      expect(await f.store.write(h.mutation)).toMatchObject({ status: "refused", refusal: { code: "lock-held",
        lock: expect.stringContaining(join("refs", "arc", "project", "registry.lock")) } });
      expect((await git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
    } finally { await f.hold(h.identity.reference, false); }
    success(await f.store.write(h.mutation));
    expect((await git("git", ["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
    expect((await git("git", ["ls-tree", "-r", h.history])).stdout).toBe("");
    expect(success(await f.store.read({ reference: h.inbox.reference })).content).toBe(h.mutation.content);
    expect(success(await f.store.history({ reference: h.conflict }))[0]).toMatchObject({ content: null, version: null });
  });

  it("keeps an ordinary work write independent of a held registry lock", async () => {
    const f = await createRefFixture({}, layout);
    const identity = await seed(f, f.reference("project-registry/identity"));
    await seed(f, f.reference("work-item/meta"));
    const companion = await seed(f, f.reference("work-item/companion"));
    const mutation = update(f, companion);
    await f.hold(identity.reference, true);
    try {
      success(await f.store.write(mutation));
      expect(success(await f.store.read({ reference: companion.reference })).content).toBe(mutation.content);
    } finally { await f.hold(identity.reference, false); }
  });

  it("re-resolves when lineage lands after taking the target lock and refuses the still-held registry", async () => {
    const h = await pendingRetirement(layout, false), { f, git } = h;
    let landed = false;
    const store = createRefStore({ ...f.ports, lock: async (name, waitMs) => {
      const release = await f.ports.lock(name, waitMs);
      if (!landed && name === h.live) {
        landed = true;
        await git("git", ["update-ref", registry, h.afterLineage, h.beforeLineage]);
      }
      return release;
    } });
    await f.hold(h.identity.reference, true);
    try {
      expect(await store.write(h.mutation)).toMatchObject({ status: "refused", refusal: { code: "lock-held",
        lock: expect.stringContaining(join("refs", "arc", "project", "registry.lock")) } });
      expect(landed).toBe(true);
      expect((await git("git", ["rev-parse", registry])).stdout.trim()).toBe(h.afterLineage);
      expect((await git("git", ["for-each-ref", "--format=%(refname)", h.live])).stdout.trim()).toBe(h.live);
      expect(success(await f.store.read({ reference: h.inbox.reference })).content).toBe(h.inbox.content);
      expect(success(await f.store.read({ reference: h.conflict })).content).not.toBe("");
    } finally { await f.hold(h.identity.reference, false); }
    success(await store.write(h.mutation));
    expect((await git("git", ["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
    expect((await git("git", ["ls-tree", "-r", h.history])).stdout).toBe("");
    expect(success(await f.store.read({ reference: h.inbox.reference })).content).toBe(h.mutation.content);
  });
});
