import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { plantRef } from "../helpers/store/ref-plant.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { SlugSchema, ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ConflictRecordSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";

const personal = (key: string) => RecordReferenceSchema.parse({ kind: "personal/document", key,
  owner: { type: "person", name: "andrew" } });
const provenance = { verb: "user", lifecycleAction: "save" };
const ref = "refs/arc/user/andrew/personal";

describe.each(["default", "separate"] as const)("pull merging in the %s layout", (layout) => {
  it("fast-forwards another clone's writes into the local ref", async () => {
    const h = await refSyncFixture(layout), reference = personal("draft.md");
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "first\n", provenance }));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference })).content).toBe("first\n");
    const initial = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: initial.version, content: "second\n", provenance }));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    expect((await h.b.git(["rev-parse", ref])).stdout).toBe((await h.a.git(["rev-parse", ref])).stdout);
    expect(success(await h.b.store.read({ reference })).content).toBe("second\n");
  });
  it("keeps an unpublished locally ended work item out of the live ref set", async () => {
    const h = await refSyncFixture(layout);
    const requested = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } });
    const item = success(await h.a.store.write({ action: "put", reference: requested, expected: null,
      content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
    const uid = "uid" in item.reference.owner ? item.reference.owner.uid : undefined;
    const live = `refs/arc/work/${uid}`, history = `refs/arc/history/work/${uid}`;
    await h.a.git(["push", h.remoteName, `${live}:${live}`]);
    success(await h.b.store.pull());
    const before = success(await h.b.store.read({ reference: item.reference }));
    success(await h.b.store.write({ action: "put", reference: before.reference, expected: before.version,
      content: before.content, placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
      provenance: { verb: "archive", lifecycleAction: "archive" } }));
    const ended = (await h.b.git(["rev-parse", history])).stdout;
    success(await h.b.store.pull());
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
    expect((await h.b.git(["rev-parse", history])).stdout).toBe(ended);
    expect(success(await h.b.store.read({ reference: item.reference })).placement).toMatchObject({ kind: "completed" });
  });

  it("merges independent new records into one commit with local then incoming parents", async () => {
    const h = await refSyncFixture(layout), shared = personal("shared.md"), left = personal("left.md"), right = personal("right.md");
    success(await h.a.store.write({ action: "put", reference: shared, expected: null, content: "common\n", provenance }));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    success(await h.a.store.write({ action: "put", reference: left, expected: null, content: "from a\n", provenance }));
    success(await h.b.store.write({ action: "put", reference: right, expected: null, content: "from b\n", provenance }));
    const incoming = (await h.a.git(["rev-parse", ref])).stdout, local = (await h.b.git(["rev-parse", ref])).stdout;
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: left })).content).toBe("from a\n");
    expect(success(await h.b.store.read({ reference: right })).content).toBe("from b\n");
    expect((await h.b.git(["rev-list", "--parents", "-n", "1", ref])).stdout.split(" ").slice(1)).toEqual([local, incoming]);
    const message = (await h.b.git(["show", "-s", "--format=%B", ref])).stdout;
    expect(message).toContain("sync andrew");
    expect(message).toContain("Arc-Lifecycle-Action: merge");
    expect(message).toMatch(/Arc-Batch: [0-9a-f-]{36}/u);
  });

  it("preserves a changed single-writer record and files both accepted values as a whole-record conflict", async () => {
    const h = await refSyncFixture(layout), reference = RecordReferenceSchema.parse({ kind: "claims/groom", key: "draft",
      owner: { type: "person", name: "andrew" } });
    const claims = "refs/arc/user/andrew/claims";
    success(await h.a.store.write({ action: "put", reference, expected: null, content: '{"step":0}', provenance }));
    await h.a.git(["push", h.remoteName, `${claims}:${claims}`]);
    success(await h.b.store.pull());
    const base = success(await h.a.store.read({ reference })), before = success(await h.b.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: base.version, content: '{"step":1}', provenance }));
    success(await h.b.store.write({ action: "put", reference, expected: before.version, content: '{"step":2}', provenance }));
    const local = success(await h.b.store.read({ reference })), incoming = success(await h.a.store.read({ reference }));
    const localActor = await h.b.ports.actor(SlugSchema.parse("andrew")), remoteActor = await h.a.ports.actor(SlugSchema.parse("andrew"));
    for (const [client, key, actor] of [[h.a, "a-noise", "andrew@00000000-0000-4000-8000-000000000002"],
      [h.b, "b-noise", "andrew@00000000-0000-4000-8000-000000000003"]] as const) {
      const writer = createRefStore({ ...client.ports, actor: async () => actor });
      success(await writer.write({ action: "put", expected: null, content: "{}", provenance,
        reference: RecordReferenceSchema.parse({ kind: "claims/groom", key, owner: { type: "person", name: "andrew" } }) }));
    }
    await h.a.git(["push", h.remoteName, `${claims}:${claims}`]);
    success(await h.b.store.pull());
    const merged = success(await h.b.store.read({ reference }));
    expect(merged.content).toBe(incoming.content);
    expect(merged.conflicts).toHaveLength(1);
    const conflict = merged.conflicts[0];
    if (!conflict) throw new Error("Expected the stored whole-record clash");
    const clash = ConflictRecordSchema.parse(JSON.parse(success(await h.b.store.read({ reference: conflict })).content));
    expect(clash).toMatchObject({ location: { kind: "record" }, record: merged.reference,
      base: { content: base.content, version: base.version },
      current: { value: { content: incoming.content, version: incoming.version }, label: { actor: remoteActor } },
      incoming: { value: { content: local.content, version: local.version }, label: { actor: localActor } } });
  });

  it("merges competing prose with the merge base's record version on its hunk", async () => {
    const h = await refSyncFixture(layout), reference = personal("clash.md");
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "base\n", provenance }));
    const base = success(await h.a.store.read({ reference }));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    success(await h.a.store.write({ action: "put", reference, expected: base.version, content: "remote\n", provenance }));
    success(await h.b.store.write({ action: "put", reference, expected: base.version, content: "local\n", provenance }));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    const merged = success(await h.b.store.read({ reference }));
    expect(merged.content).toBe("remote\n");
    expect(merged.conflicts).toHaveLength(1);
    const conflict = merged.conflicts[0];
    if (!conflict) throw new Error("Expected the stored prose clash");
    const clash = ConflictRecordSchema.parse(JSON.parse(success(await h.b.store.read({ reference: conflict })).content));
    expect(clash).toMatchObject({ location: { kind: "hunk" }, baseVersion: base.version, base: "base",
      current: { content: "remote" }, incoming: { content: "local" } });
    const late = success(await h.a.store.write({ action: "put", reference, expected: base.version, content: "late\n", provenance }));
    const writeConflict = late.conflicts[0];
    if (!writeConflict) throw new Error("Expected the stale write to clash against the same base");
    expect(JSON.parse(success(await h.a.store.read({ reference: writeConflict })).content)).toMatchObject({
      baseVersion: base.version, base: "base", current: { content: "remote" }, incoming: { content: "late" },
    });
  });

  it.each(["base", "local", "incoming"] as const)("preserves a whole-record clash for repeated entry IDs in %s", async (badSide) => {
    const h = await refSyncFixture(layout), reference = RecordReferenceSchema.parse({ kind: "personal/inbox",
      owner: { type: "person", name: "andrew" } });
    const text = (body: string) => `# User Inbox\n\n## Errand\n\n### First\n\n- _Id:_ \`11111111\`\n\n${body}\n\n### Second\n\n- _Id:_ \`22222222\`\n\nRetained.\n`;
    const damage = async (client: typeof h.a, content: string) => {
      const tip = (await client.git(["rev-parse", ref])).stdout;
      const metadata = (await client.git(["rev-parse", `${ref}:andrew/metadata-andrew.json`])).stdout;
      await plantRef(client.root, ref, [{ path: "andrew/metadata-andrew.json", oid: metadata, mode: "100644" },
        { path: "andrew/USER-INBOX.md", content: content.replace("22222222", "11111111") }],
      { parents: [tip], ...client.gitDir ? { gitDir: client.gitDir } : {} });
    };
    success(await h.a.store.write({ action: "put", reference, expected: null, content: text("base"), provenance }));
    if (badSide === "base") await damage(h.a, text("base"));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    const base = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: base.version, content: text("remote"), provenance }));
    success(await h.b.store.write({ action: "put", reference, expected: base.version, content: text("local"), provenance }));
    if (badSide === "local") await damage(h.b, text("local"));
    if (badSide === "incoming") await damage(h.a, text("remote"));
    const before = success(await h.a.store.read({ reference }));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    const merged = success(await h.b.store.read({ reference }));
    expect(merged.content).toBe(before.content);
    expect(merged.conflicts).toHaveLength(1);
    const conflict = merged.conflicts[0];
    if (!conflict) throw new Error("Expected a preserved entry-frame conflict");
    expect(JSON.parse(success(await h.b.store.read({ reference: conflict })).content)).toMatchObject({
      location: { kind: "record" }, current: { value: { content: before.content } },
    });
  });

  it("files a whole primary-record conflict when both sides change the same link field", async () => {
    const h = await refSyncFixture(layout), reference = RecordReferenceSchema.parse({ kind: "work-item/meta",
      owner: { type: "work-item", name: "linked" } });
    const created = success(await h.a.store.write({ action: "put", reference, expected: null, content: makeMetaFixture("linked"),
      placement: { kind: "active" }, provenance }));
    const uid = "uid" in created.reference.owner ? created.reference.owner.uid : undefined, live = `refs/arc/work/${uid}`;
    const base = success(await h.a.store.read({ reference: created.reference }));
    await h.a.git(["push", h.remoteName, `${live}:${live}`]);
    success(await h.b.store.pull());
    for (const [client, number] of [[h.a, 1], [h.b, 2]] as const) {
      success(await client.store.write({ action: "put", reference: created.reference, expected: base.version, content: base.content,
        placement: { kind: "active" }, links: { changeRequest: { repository: "origin", number },
          ...number === 1 ? { branches: [{ repository: "origin", ref: "refs/heads/work", linkedAs: "created", excluded: [] }] } : {} }, provenance }));
    }
    const current = success(await h.b.store.read({ reference: created.reference }));
    const incoming = success(await h.a.store.read({ reference: created.reference }));
    await h.a.git(["push", h.remoteName, `${live}:${live}`]);
    success(await h.b.store.pull());
    const merged = success(await h.b.store.read({ reference: created.reference }));
    expect(merged.links).toEqual(incoming.links);
    expect(merged.conflicts).toHaveLength(1);
    const conflict = merged.conflicts[0];
    if (!conflict) throw new Error("Expected the competing metadata values to be preserved");
    expect(JSON.parse(success(await h.b.store.read({ reference: conflict })).content)).toMatchObject({
      record: merged.reference, location: { kind: "record" }, base: { version: base.version },
      current: { value: { links: incoming.links, version: incoming.version } },
      incoming: { value: { links: current.links, version: current.version } },
    });
  });

  it("merges independent metadata fields without filing a record conflict", async () => {
    const h = await refSyncFixture(layout), reference = RecordReferenceSchema.parse({ kind: "work-item/meta",
      owner: { type: "work-item", name: "fields" } });
    const created = success(await h.a.store.write({ action: "put", reference, expected: null, content: makeMetaFixture("fields"),
      placement: { kind: "active" }, provenance }));
    const uid = "uid" in created.reference.owner ? created.reference.owner.uid : undefined, live = `refs/arc/work/${uid}`;
    const base = success(await h.a.store.read({ reference: created.reference }));
    await h.a.git(["push", h.remoteName, `${live}:${live}`]);
    success(await h.b.store.pull());
    const branches = [{ repository: "origin", ref: "refs/heads/work", linkedAs: "created" as const, excluded: [] }];
    success(await h.a.store.write({ action: "put", reference: created.reference, expected: base.version, content: base.content,
      placement: { kind: "active" }, links: { branches }, provenance }));
    const changeRequest = { repository: "origin", number: 12 };
    success(await h.b.store.write({ action: "put", reference: created.reference, expected: base.version, content: base.content,
      placement: { kind: "active" }, links: { changeRequest }, provenance }));
    await h.a.git(["push", h.remoteName, `${live}:${live}`]);
    success(await h.b.store.pull());
    const merged = success(await h.b.store.read({ reference: created.reference }));
    expect(merged.links).toEqual({ branches, changeRequest });
    expect(merged.conflicts).toEqual([]);
  });

  it.each(["shared group", "unrelated tips"])("uses a null base version when both sides create a record from %s", async (basis) => {
    const h = await refSyncFixture(layout), reference = personal("created.md");
    if (basis === "shared group") {
      success(await h.a.store.write({ action: "put", reference: personal("other.md"), expected: null, content: "common\n", provenance }));
      await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
      success(await h.b.store.pull());
    }
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "remote\n", provenance }));
    success(await h.b.store.write({ action: "put", reference, expected: null, content: "local\n", provenance }));
    const current = (await h.b.git(["rev-parse", ref])).stdout, incoming = (await h.a.git(["rev-parse", ref])).stdout;
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    const merged = success(await h.b.store.read({ reference })), conflict = merged.conflicts[0];
    expect(merged.content).toBe("remote\n");
    expect(merged.conflicts).toHaveLength(1);
    if (!conflict) throw new Error("Expected the competing creations to clash");
    expect(JSON.parse(success(await h.b.store.read({ reference: conflict })).content)).toMatchObject({
      location: { kind: "hunk" }, baseVersion: null, base: "", current: { content: "remote" }, incoming: { content: "local" },
    });
    expect((await h.b.git(["rev-list", "--parents", "-n", "1", ref])).stdout.split(" ").slice(1)).toEqual([current, incoming]);
  });

  it.each(["unchanged", "changed"])("merges a local deletion against the remote's %s record", async (state) => {
    const h = await refSyncFixture(layout), reference = personal("removed.md");
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "base\n", provenance }));
    const base = success(await h.a.store.read({ reference }));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    success(await h.b.store.write({ action: "remove", reference, expected: base.version, provenance }));
    if (state === "changed") success(await h.a.store.write({ action: "put", reference, expected: base.version, content: "remote\n", provenance }));
    success(await h.a.store.write({ action: "put", reference: personal("peer.md"), expected: null, content: "peer\n", provenance }));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    if (state === "unchanged") expect(await h.b.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    else expect(success(await h.b.store.read({ reference })).content).toBe("remote\n");
    expect(success(await h.b.store.read({ reference: personal("peer.md") })).content).toBe("peer\n");
    const listed = success(await h.b.store.list({ family: "personal", kind: "personal/conflict-record" }));
    expect("records" in listed ? listed.records : []).toHaveLength(state === "changed" ? 1 : 0);
    if (state === "unchanged") return;
    const conflict = "records" in listed ? listed.records[0]?.reference : undefined;
    if (!conflict) throw new Error("Expected the removed-versus-changed conflict");
    expect(JSON.parse(success(await h.b.store.read({ reference: conflict })).content)).toMatchObject({
      location: { kind: "record" }, base: { content: base.content, version: base.version },
      current: { value: { content: "remote\n" } }, incoming: { value: null },
    });
    success(await h.b.store.write({ action: "put", reference, expected: success(await h.b.store.read({ reference })).version, content: "resolved\n", resolves: [conflict], provenance }));
    expect(success(await h.b.store.read({ reference })).content).toBe("resolved\n");
    expect(success(await h.b.store.list({ family: "personal", kind: "personal/conflict-record" })).status).toBe("absent");
  });

  it("retains earlier ref merges when a layout lock times out and retries after release", async () => {
    const h = await refSyncFixture(layout), claim = (key: string) => RecordReferenceSchema.parse({ kind: "claims/groom", key,
      owner: { type: "person", name: "andrew" } });
    const claims = "refs/arc/user/andrew/claims";
    success(await h.a.store.write({ action: "put", reference: claim("base"), expected: null, content: "{}", provenance }));
    success(await h.a.store.write({ action: "put", reference: personal("base.md"), expected: null, content: "base\n", provenance }));
    await h.a.git(["push", h.remoteName, `${claims}:${claims}`, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    for (const [client, side] of [[h.a, "remote"], [h.b, "local"]] as const) {
      success(await client.store.write({ action: "put", reference: claim(side), expected: null, content: "{}", provenance }));
      success(await client.store.write({ action: "put", reference: personal(`${side}.md`), expected: null, content: `${side}\n`, provenance }));
    }
    const first = (await h.b.git(["rev-parse", claims])).stdout, second = (await h.b.git(["rev-parse", ref])).stdout;
    await h.a.git(["push", h.remoteName, `${claims}:${claims}`, `${ref}:${ref}`]);
    let held: (() => Promise<void>) | undefined, arm = true;
    const store = createRefStore({ ...h.b.ports, lock: async (name) => {
      const release = await h.b.ports.lock(name, 20);
      return async () => {
        await release();
        if (name === "layout" && arm) { arm = false; held = await h.b.ports.lock("layout", 100); }
      };
    } });
    try {
      expect(await store.pull()).toMatchObject({ status: "refused", refusal: {
        code: "lock-held", class: "recoverable", lock: join(h.b.root, ".git", "arc", "locks", "layout.lock"),
      } });
      expect((await h.b.git(["rev-parse", claims])).stdout).not.toBe(first);
      expect((await h.b.git(["rev-parse", ref])).stdout).toBe(second);
      expect(success(await store.read({ reference: claim("remote") })).content).toBe("{}");
    } finally { await held?.(); }
    success(await store.pull());
    expect((await h.b.git(["rev-parse", ref])).stdout).not.toBe(second);
    expect(success(await store.read({ reference: personal("remote.md") })).content).toBe("remote\n");
    expect(success(await store.read({ reference: personal("local.md") })).content).toBe("local\n");
  });

  it("keeps a complete placement value when concurrent changes select different placement shapes", async () => {
    const h = await refSyncFixture(layout), reference = RecordReferenceSchema.parse({ kind: "work-item/meta",
      owner: { type: "work-item", name: "placement" } });
    const created = success(await h.a.store.write({ action: "put", reference, expected: null, content: makeMetaFixture("placement"),
      placement: { kind: "backlog", commitment: "planned" }, provenance }));
    const uid = "uid" in created.reference.owner ? created.reference.owner.uid : undefined, live = `refs/arc/work/${uid}`;
    const base = success(await h.a.store.read({ reference: created.reference }));
    await h.a.git(["push", h.remoteName, `${live}:${live}`]);
    success(await h.b.store.pull());
    success(await h.a.store.write({ action: "put", reference: created.reference, expected: base.version, content: base.content,
      placement: { kind: "active" }, provenance }));
    success(await h.b.store.write({ action: "put", reference: created.reference, expected: base.version, content: base.content,
      placement: { kind: "backlog", commitment: "provisional" }, provenance }));
    await h.a.git(["push", h.remoteName, `${live}:${live}`]);
    success(await h.b.store.pull());
    const merged = success(await h.b.store.read({ reference: created.reference })), conflict = merged.conflicts[0];
    expect(merged.placement).toEqual({ kind: "active" });
    expect(merged.conflicts).toHaveLength(1);
    if (!conflict) throw new Error("Expected the placement conflict");
    expect(JSON.parse(success(await h.b.store.read({ reference: conflict })).content)).toMatchObject({
      location: { kind: "record" }, current: { value: { placement: { kind: "active" } } },
      incoming: { value: { placement: { kind: "backlog", commitment: "provisional" } } },
    });
  });

});
