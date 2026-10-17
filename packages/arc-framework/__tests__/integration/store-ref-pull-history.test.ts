import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { renderStoreCommitMessage } from "../../src/lib/store/commit-provenance.js";
import { ConflictRecordSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";

import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";

const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "ordered.md", owner: { type: "person", name: "andrew" } });
const ref = "refs/arc/user/andrew/personal", provenance = { verb: "user", lifecycleAction: "save" };
const text = (first: string, last = "end") => `${first}\nseparator\n${last}\n`;

describe.each(["default", "separate"] as const)("pulled history in the %s layout", (layout) => {
  it.each(["remote", "local"] as const)("keeps every side in order when the accepted merge retains the %s version", async (kept) => {
    const h = await refSyncFixture(layout);
    success(await h.a.store.write({ action: "put", reference, expected: null, content: text("base"), provenance }));
    const base = success(await h.a.store.read({ reference }));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    success(await h.a.store.write({ action: "put", reference, expected: base.version, content: text("remote"), provenance }));
    success(await h.b.store.write({ action: "put", reference, expected: base.version, content: text("local"), provenance }));
    const local = success(await h.b.store.read({ reference })), from = success(await h.b.store.version());
    if (kept === "local") {
      const localTip = (await h.b.git(["rev-parse", ref])).stdout, remoteTip = (await h.a.git(["rev-parse", ref])).stdout;
      await h.a.git(["fetch", "--no-tags", h.b.gitDir ?? h.b.root, `${ref}:refs/merge-fixture/local`]);
      const metadata = (await h.a.git(["rev-parse", `${ref}:andrew/metadata-andrew.json`])).stdout;
      await plantRef(h.a.root, ref, [{ path: "andrew/metadata-andrew.json", oid: metadata, mode: "100644" },
        { path: "andrew/ordered.md", content: text("local") }], { parents: [localTip, remoteTip],
        ...h.a.gitDir ? { gitDir: h.a.gitDir } : {},
        message: renderStoreCommitMessage({ verb: "sync", lifecycleAction: "merge" }, reference, randomUUID()),
      });
    }
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    const history = success(await h.b.store.history({ reference }));
    expect(history.map(({ content }) => content)).toEqual((kept === "remote" ? ["remote", "local", "base"] : ["local", "remote", "local", "base"]).map((part) => text(part)));
    expect(history[0]?.version).toBe(success(await h.b.store.read({ reference })).version);
    const changes = success(await h.b.store.changes({ from, to: success(await h.b.store.version()), references: [reference] }));
    expect(changes.map(({ content }) => content)).toEqual((kept === "remote" ? ["remote"] : ["remote", "local"]).map((part) => text(part)));
    if (kept === "remote") {
      success(await h.b.store.write({ action: "put", reference, expected: local.version, content: text("local", "later"), provenance }));
      expect(success(await h.b.store.read({ reference })).content).toBe(text("remote", "later"));
    }
  });
  it("orders nested pull merges and restricted changes while retaining distinct machine labels", async () => {
    const h = await refSyncFixture(layout);
    success(await h.a.store.write({ action: "put", reference, expected: null, content: text("base"), provenance }));
    const base = success(await h.a.store.read({ reference }));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    success(await h.a.store.write({ action: "put", reference, expected: base.version, content: text("a1"), provenance }));
    success(await h.b.store.write({ action: "put", reference, expected: base.version, content: text("b1"), provenance }));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    await h.b.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.a.store.pull());
    for (const [client, side] of [[h.a, "a2"], [h.b, "b2"]] as const) {
      const before = success(await client.store.read({ reference }));
      success(await client.store.write({ action: "put", reference, expected: before.version, content: text(side),
        resolves: before.conflicts, provenance }));
    }
    const from = success(await h.b.store.version());
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    const merged = success(await h.b.store.read({ reference }));
    const history = success(await h.b.store.history({ reference }));
    expect(history.map(({ content }) => content)).toEqual(["a2", "b2", "a1", "b1", "base"].map((part) => text(part)));
    expect(history[0]?.version).toBe(merged.version);
    const changes = success(await h.b.store.changes({ from, to: success(await h.b.store.version()), references: [reference] }));
    expect(changes.map(({ content }) => content)).toEqual([text("a2")]);
    expect(merged.conflicts).toHaveLength(1);
    const conflict = merged.conflicts[0];
    if (!conflict) throw new Error("Expected the second pull's clash");
    const clash = ConflictRecordSchema.parse(JSON.parse(success(await h.b.store.read({ reference: conflict })).content));
    expect(clash.current.label.actor).toBe(await h.a.ports.actor(SlugSchema.parse("andrew")));
    expect(clash.incoming.label.actor).toBe(await h.b.ports.actor(SlugSchema.parse("andrew")));
    expect(clash.current.label.actor).not.toBe(clash.incoming.label.actor);
  });

  it("receives a traveling anchor on its first pull without fetching ended-item history", async () => {
    const h = await refSyncFixture(layout);
    success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("ended-before-pull"), provenance,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "ended-before-pull" } }),
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "old\n", provenance }));
    const old = success(await h.a.store.read({ reference })), saved = success(await h.a.store.version());
    const anchored = success(await h.a.store.write({ action: "put", expected: null, placement: { kind: "active" }, provenance,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "anchored" } }),
      content: makeMetaFixture("anchored", { stateAtHandoff: saved }) }));
    success(await h.a.store.write({ action: "put", reference, expected: old.version, content: "new\n", provenance }));
    const refs = (await h.a.git(["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.split("\n").filter(Boolean);
    await h.a.git(["push", "--atomic", h.remoteName, ...refs.map((ref) => `${ref}:${ref}`)]);
    success(await h.b.store.pull());
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", "refs/arc/history/"])).stdout).toBe("");
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", `refs/arc-remotes/${h.remoteName}/history/`])).stdout).toBe("");
    expect(success(await h.b.store.read({ reference: anchored.reference })).fields).toMatchObject({ stateAtHandoff: saved });
    const snapshot = success(await h.b.store.read({ reference, asOf: saved }));
    expect((await h.b.git(["cat-file", "-t", saved])).stdout).toBe("tree");
    expect(snapshot.content).toBe(old.content);
    expect(snapshot.version).toBe(old.version);
    expect(success(await h.b.store.read({ reference })).content).toBe("new\n");
  });

});
