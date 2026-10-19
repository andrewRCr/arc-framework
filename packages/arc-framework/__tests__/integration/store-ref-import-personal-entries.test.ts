/** Personal import removes notes deletion markers while retaining live entry identities and prose. */
import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { importComparisonFixture } from "../helpers/store/import-comparison.js";
import { success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { parseEntryList } from "../../src/lib/store/kinds/entry-list.js";
import { ENTRY_CONFIGS, type EntryKind } from "../../src/lib/store/kinds/entry-configs.js";
import { importFixture } from "../helpers/store/import-fixture.js";
import { createRefStore } from "../../src/lib/store/index.js";
import { hashBlob, writeTreeCommit } from "../../src/lib/errand/ref-tree.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";

const removed = "## Removed: **Old**\n\n- _Section:_ Memories\n- _Removed:_ 2026-01-01T00:00:00.000Z\n\n";
const personal = "# Inbox\n\n## Errand\n\n### **Live**\n\nKeep this capture.\n\n";
const memory = "# Working Memory\n\n## Memories\n\n**Remember:**\n_Remove when: imported._\n\nKeep this memory.\n\n";

describe.each(["default", "separate"] as const)("personal entry import in %s", layout => {
  it("stamps every missing entry identity and retains the queue's existing capture identity", async () => {
    const h = await importFixture(layout);
    await mkdir(join(h.root, ".arc/user/andrew"), { recursive: true });
    const queued = "### **Queued**\n\n- _Disposition:_ `execute-bound`\n\n- _Id:_ `12345678`\n\nQueued prose.\n\n";
    await writeFile(join(h.root, ".arc/user/andrew/USER-INBOX.md"), personal.replace("### **Live**", queued + "### **Live**"));
    await writeFile(join(h.root, ".arc/user/andrew/WORKING-MEMORY.md"), memory);
    await writeFile(join(h.root, ".arc/active/draft-alpha.md"), "# Draft\n\n## Inbound Buffer — Pending Integration\n\n### **Buffered**\n\n- _Routed from:_ drain, 2026-01-02.\n\nBuffered prose.\n");
    await h.git("git", ["add", ".arc/active/draft-alpha.md"]);
    await h.git("git", ["commit", "-m", "Seed unstamped entries"]);
    const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    await h.git("git", ["update-ref", "refs/heads/feat/alpha", head]);
    await h.git("git", ["branch", "chore/example"]);
    const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", claimId: "1".repeat(32),
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", slug: "example", branch: "chore/example",
      intent: "Keep this description.", origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null });
    const io = { exec: h.ports.exec, execInput: h.ports.execInput, identity: "andrew" };
    await writeTreeCommit(io, new Map([["example", await hashBlob(io.execInput, serializeTransientIdentityRecord(record))]]), "Seed Errand", [], null);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const store = createRefStore(h.ports);
    const expected = { "personal/inbox": 2, "personal/working-memory": 1, "project-inbox/inbox": 2,
      "work-item/description": 1, "work-item/inbound": 1, "personal/errand-queue": 1 } satisfies Record<EntryKind, number>;
    const observed: Record<string, { count: number; stamped: boolean }> = {};
    for (const kind of Object.keys(ENTRY_CONFIGS) as EntryKind[]) {
      const owner = kind.startsWith("personal/") ? { type: "person", name: "andrew" }
        : kind.startsWith("project-inbox/") ? { type: "project", name: "project" }
        : { type: "work-item", name: kind === "work-item/description" ? "example" : "alpha" };
      const imported = success(await store.read({ reference: RecordReferenceSchema.parse({ kind, owner }) }));
      const parsed = parseEntryList(imported.content, kind);
      if (!parsed.success) throw new Error(parsed.error);
      observed[kind] = { count: parsed.data.entries.length, stamped: parsed.data.entries.every(entry => /^[0-9a-f]{8}$/u.test(entry.id ?? "")) };
      if (kind === "personal/errand-queue") expect(parsed.data.entries[0]?.id).toBe("12345678");
    }
    expect(observed).toEqual(Object.fromEntries(Object.entries(expected).map(([kind, count]) => [kind, { count, stamped: true }])));
  }, 30_000);

  it("drops inbox and memory tombstones and compares every remaining source byte", async () => {
    const h = await importComparisonFixture(layout, async fixture => {
      await mkdir(join(fixture.root, ".arc/user/andrew"), { recursive: true });
      await writeFile(join(fixture.root, ".arc/user/andrew/USER-INBOX.md"), personal + removed + "## Work Unit\n\n### **Later**\n\nKeep this later capture.\n");
      await writeFile(join(fixture.root, ".arc/user/andrew/WORKING-MEMORY.md"), memory + removed + "---\n\nKeep this appendix.\n");
    });
    for (const kind of ["personal/inbox", "personal/working-memory"] as const) {
      h.comparators.set(kind, { normalize: (expected, actual) => {
        const content = expected.content.replace(removed, "");
        const parsed = parseEntryList(content, kind);
        if (!parsed.success) throw new Error(parsed.error);
        return { expected: { ...expected, content, fields: parsed.data }, actual };
      } });
    }
    expect(await h.target.migrate()).toMatchObject({ status: "ok" });
    const markers: Record<string, boolean> = {};
    for (const kind of ["personal/inbox", "personal/working-memory"] as const) {
      const reference = RecordReferenceSchema.parse({ kind, owner: { type: "person", name: "andrew" } });
      const record = success(await h.store.read({ reference }));
      markers[kind] = record.content.includes("## Removed:");
    }
    expect(markers).toEqual({ "personal/inbox": false, "personal/working-memory": false });
    expect(await h.compare()).toEqual([]);
  }, 30_000);
});
